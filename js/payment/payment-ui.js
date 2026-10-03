/**
 * KFC Payment - UI: hộp thoại Thanh toán (thông tin giao hàng, phương thức, xác nhận, đặt hàng thành công).
 *
 * Giao tiếp với module Giỏ hàng qua API/sự kiện công khai (không chạm vào code bên trong):
 *   Nghe:  'cart:checkout' (cancelable)  -> gọi preventDefault() rồi mở hộp thoại này
 *   Dùng:  KFCCart.getState / clear / close / subscribe, KFCOrders.placeOrder / saveToFile
 *   Phát:  'order:placed' { order, instructions } khi đặt hàng thành công
 * Mọi dữ liệu người dùng nhập hay đọc từ DB đều được đưa vào DOM bằng textContent (không innerHTML).
 */
(function () {
  'use strict';

  var Validate = window.KFCPaymentValidate;
  var Config = window.KFCPaymentConfig;
  var Svc = window.KFCPaymentService;
  var Store = window.KFCCartStore;
  if (!Validate || !Config || !Svc || !Store) {
    console.error('[KFC Payment] Thiếu script payment-validate / payment-config / payment-service / cart-store');
    return;
  }

  var $ = function (id) { return document.getElementById(id); };
  var el = { overlay: $('checkout-overlay'), dialog: $('checkout'), close: $('checkout-close'), body: $('checkout-body'), title: $('checkout-title') };
  if (!el.dialog || !el.body || !el.close || !el.overlay) {
    console.error('[KFC Payment] Thiếu markup hộp thoại thanh toán trong index.html');
    return;
  }

  var fmt = Store.formatVND;
  var FIELD_ORDER = ['name', 'phone', 'address', 'note'];
  var BACKGROUND_SELECTORS = ['header.header', 'main', 'footer.footer'];

  var isOpen = false;
  var view = 'form';        // 'form' | 'success' | 'empty'
  var submitting = false;
  var lastFocus = null;
  var shownSignature = '';  // chữ ký giỏ hàng mà khách đang xem
  var draft = freshDraft();
  var touched = {};
  var ui = {};              // tham chiếu các phần tử của form hiện tại
  var service = null;

  function freshDraft() { return { name: '', phone: '', address: '', note: '', method: Config.defaultMethod }; }

  // Luôn gọi API hiện hành của module Giỏ hàng (không giữ tham chiếu cũ)
  function getService() {
    if (service) return service;
    if (!window.KFCCart || !window.KFCOrders) return null;
    service = Svc.createPaymentService({
      getCartState: function () { return window.KFCCart.getState(); },
      clearCart: function () { return window.KFCCart.clear(); },
      placeOrder: function (state, meta) { return window.KFCOrders.placeOrder(state, meta); },
      config: Config
    });
    return service;
  }

  // ---------- Tiện ích DOM ----------
  function make(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function icon(pathD, size) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', size || 20);
    svg.setAttribute('height', size || 20);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', pathD);
    svg.appendChild(p);
    return svg;
  }

  function row(dl, label, value, cls) {
    var r = make('div', 'co-row' + (cls ? ' ' + cls : ''));
    r.appendChild(make('dt', '', label));
    r.appendChild(make('dd', '', value));
    dl.appendChild(r);
    return r;
  }

  function methodLabel(id) {
    var m = Config.methods.filter(function (x) { return x.id === id; })[0];
    return m ? m.label : id;
  }

  // ---------- Tóm tắt đơn hàng ----------
  function renderSummary(container, state) {
    container.textContent = '';
    container.appendChild(make('h3', 'co-summary__title', 'Đơn hàng của bạn'));

    var list = make('ul', 'co-items');
    state.items.forEach(function (it) {
      var li = make('li', 'co-item');
      var info = make('div', 'co-item__info');
      info.appendChild(make('span', 'co-item__name', it.name));
      var meta = make('span', 'co-item__meta', it.qty + ' × ' + fmt(it.unitPrice));
      if (it.discount > 0) meta.appendChild(make('span', 'co-item__sale', '-' + it.discount + '%'));
      info.appendChild(meta);
      li.appendChild(info);
      li.appendChild(make('strong', 'co-item__line', fmt(it.unitPrice * it.qty)));
      list.appendChild(li);
    });
    container.appendChild(list);

    var t = state.totals;
    var dl = make('dl', 'co-totals');
    row(dl, 'Tạm tính (' + t.totalQty + ' món)', fmt(t.subtotal));
    if (t.discountTotal > 0) row(dl, 'Giảm giá', '−' + fmt(t.discountTotal), 'co-row--discount');
    row(dl, 'Tổng cộng', fmt(t.total), 'co-row--total');
    container.appendChild(dl);
  }

  function refreshSummary() {
    var state = window.KFCCart.getState();
    shownSignature = Svc.cartSignature(state);
    if (ui.summary) renderSummary(ui.summary, state);
    return state;
  }

  // ---------- Thông báo trong hộp thoại ----------
  function showAlert(message, kind) {
    if (!ui.alert) return;
    ui.alert.textContent = message;
    ui.alert.className = 'co-alert' + (kind === 'warn' ? ' co-alert--warn' : '');
    ui.alert.hidden = false;
    ui.alert.focus();
  }
  function hideAlert() { if (ui.alert) { ui.alert.hidden = true; ui.alert.textContent = ''; } }

  function setFieldError(key, message) {
    var f = ui.fields[key];
    if (!f) return;
    if (message) {
      f.error.textContent = message;
      f.error.hidden = false;
      f.input.setAttribute('aria-invalid', 'true');
      f.input.setAttribute('aria-describedby', f.error.id);
      f.wrap.classList.add('field--invalid');
    } else {
      f.error.textContent = '';
      f.error.hidden = true;
      f.input.removeAttribute('aria-invalid');
      f.input.removeAttribute('aria-describedby');
      f.wrap.classList.remove('field--invalid');
    }
  }

  function readFields() {
    var out = {};
    FIELD_ORDER.forEach(function (k) { out[k] = ui.fields[k].input.value; });
    return out;
  }

  // ---------- Màn hình: form ----------
  var FIELD_DEFS = [
    { key: 'name', label: 'Họ và tên', required: true, tag: 'input', type: 'text', autocomplete: 'name', placeholder: 'Nguyễn Văn An' },
    { key: 'phone', label: 'Số điện thoại', required: true, tag: 'input', type: 'tel', autocomplete: 'tel', inputmode: 'tel', placeholder: '0912345678' },
    { key: 'address', label: 'Địa chỉ giao hàng', required: true, tag: 'textarea', autocomplete: 'street-address', placeholder: 'Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành' },
    { key: 'note', label: 'Ghi chú cho cửa hàng (không bắt buộc)', required: false, tag: 'textarea', placeholder: 'Ví dụ: ít cay, giao giờ hành chính…' }
  ];

  function buildField(def) {
    var id = 'co-' + def.key;
    var wrap = make('div', 'field');
    var label = make('label', 'field__label', def.label);
    label.htmlFor = id;
    if (def.required) {
      var star = make('span', 'field__req', ' *');
      star.setAttribute('aria-hidden', 'true');
      label.appendChild(star);
    }
    var input = document.createElement(def.tag);
    input.id = id;
    input.name = def.key;
    input.className = 'field__input';
    if (def.type) input.type = def.type;
    if (def.tag === 'textarea') input.rows = def.key === 'address' ? 2 : 2;
    if (def.autocomplete) input.autocomplete = def.autocomplete;
    if (def.inputmode) input.setAttribute('inputmode', def.inputmode);
    if (def.placeholder) input.placeholder = def.placeholder;
    if (def.required) input.required = true;
    input.value = draft[def.key];
    var error = make('p', 'field__error');
    error.id = id + '-error';
    error.hidden = true;

    wrap.appendChild(label);
    wrap.appendChild(input);
    wrap.appendChild(error);
    ui.fields[def.key] = { wrap: wrap, input: input, error: error };

    input.addEventListener('input', function () {
      draft[def.key] = input.value;
      if (touched[def.key]) setFieldError(def.key, Validate.validateField(def.key, input.value).error);
    });
    input.addEventListener('blur', function () {
      touched[def.key] = true;
      var r = Validate.validateField(def.key, input.value);
      setFieldError(def.key, r.error);
      if (!r.error && def.key === 'phone') { input.value = r.value; draft.phone = r.value; }
    });
    return wrap;
  }

  function buildMethods() {
    var fs = make('fieldset', 'co-section');
    var legend = make('legend', 'co-section__title');
    legend.appendChild(make('span', 'co-step', '2'));
    legend.appendChild(document.createTextNode(' Phương thức thanh toán'));
    fs.appendChild(legend);
    var group = make('div', 'pay-options');
    group.setAttribute('role', 'radiogroup');
    Config.methods.forEach(function (m) {
      var lab = make('label', 'pay-option');
      var radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'payment-method';
      radio.value = m.id;
      radio.checked = draft.method === m.id;
      radio.addEventListener('change', function () { if (radio.checked) draft.method = m.id; });
      var box = make('span', 'pay-option__box');
      box.appendChild(make('strong', 'pay-option__label', m.label));
      box.appendChild(make('small', 'pay-option__desc', m.description));
      lab.appendChild(radio);
      lab.appendChild(box);
      group.appendChild(lab);
    });
    fs.appendChild(group);
    return fs;
  }

  function renderForm() {
    view = 'form';
    el.title.textContent = 'Thanh toán';
    el.body.textContent = '';
    ui = { fields: {} };
    touched = {};

    var layout = make('div', 'co-layout');

    var form = make('form', 'co-form');
    form.id = 'checkout-form';
    form.noValidate = true;
    form.setAttribute('aria-label', 'Thông tin thanh toán');

    ui.alert = make('div', 'co-alert');
    ui.alert.setAttribute('role', 'alert');
    ui.alert.tabIndex = -1;
    ui.alert.hidden = true;
    form.appendChild(ui.alert);

    var s1 = make('fieldset', 'co-section');
    var l1 = make('legend', 'co-section__title');
    l1.appendChild(make('span', 'co-step', '1'));
    l1.appendChild(document.createTextNode(' Thông tin giao hàng'));
    s1.appendChild(l1);
    FIELD_DEFS.forEach(function (d) { s1.appendChild(buildField(d)); });
    form.appendChild(s1);
    form.appendChild(buildMethods());
    ui.form = form;
    form.addEventListener('submit', onSubmit);

    var aside = make('aside', 'co-summary');
    aside.setAttribute('aria-label', 'Tóm tắt đơn hàng');
    ui.summary = make('div', 'co-summary__content');
    aside.appendChild(ui.summary);

    ui.submit = make('button', 'btn btn-primary co-submit', 'Xác nhận đặt hàng');
    ui.submit.type = 'submit';
    ui.submit.setAttribute('form', 'checkout-form');
    aside.appendChild(ui.submit);

    var back = make('button', 'cart-link-btn co-edit-cart', 'Chỉnh sửa giỏ hàng');
    back.type = 'button';
    back.addEventListener('click', function () {
      if (submitting) return;
      closeDialog();
      if (window.KFCCart) window.KFCCart.open();
    });
    aside.appendChild(back);
    aside.appendChild(make('p', 'co-demo-note', 'Website demo/học tập: không có thanh toán thật và không thu thập số thẻ.'));

    layout.appendChild(form);
    layout.appendChild(aside);
    el.body.appendChild(layout);
    refreshSummary();
  }

  function setSubmitting(on) {
    submitting = on;
    el.dialog.setAttribute('aria-busy', on ? 'true' : 'false');
    el.close.disabled = on;
    if (ui.form) {
      Array.prototype.forEach.call(ui.form.querySelectorAll('fieldset'), function (fs) { fs.disabled = on; });
    }
    if (ui.submit) {
      ui.submit.disabled = on;
      ui.submit.textContent = on ? 'Đang xử lý đơn hàng…' : 'Xác nhận đặt hàng';
      ui.submit.classList.toggle('is-busy', on);
    }
  }

  function orderErrorMessage(e) {
    var keep = ' Giỏ hàng của bạn vẫn được giữ lại.';
    switch (e && e.code) {
      case 'sqljs_load_failed': return 'Không tải được SQLite. Hãy mở trang qua Live Server (http://) rồi thử lại.' + keep;
      case 'db_corrupt': return 'Tệp dữ liệu đơn hàng đã lưu bị hỏng nên không thể ghi thêm, dữ liệu cũ được giữ nguyên.' + keep;
      case 'schema_mismatch': return 'Tệp dữ liệu đơn hàng đã lưu có cấu trúc không đúng nên không thể ghi thêm.' + keep;
      case 'storage_load_failed':
      case 'storage_save_failed': return 'Không lưu được đơn hàng do lỗi lưu trữ của trình duyệt.' + keep;
      case 'invalid_item':
      case 'duplicate_item':
      case 'total_mismatch':
      case 'invalid_customer': return 'Không thể đặt hàng: ' + e.message + '.' + keep;
      default: return 'Không thể đặt hàng lúc này.' + keep;
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    hideAlert();

    var raw = readFields();
    var res = Validate.validateCustomer(raw);
    FIELD_ORDER.forEach(function (k) { touched[k] = true; setFieldError(k, res.errors[k] || null); });
    if (!res.ok) {
      var firstKey = FIELD_ORDER.filter(function (k) { return res.errors[k]; })[0];
      var n = Object.keys(res.errors).length;
      showAlert('Vui lòng kiểm tra lại ' + n + ' thông tin được đánh dấu.');
      ui.fields[firstKey].input.focus();
      return;
    }
    // hiển thị lại giá trị đã chuẩn hóa
    FIELD_ORDER.forEach(function (k) { ui.fields[k].input.value = res.value[k]; draft[k] = res.value[k]; });

    var svc = getService();
    if (!svc) { showAlert('Không tìm thấy module giỏ hàng hoặc lưu đơn hàng.'); return; }

    setSubmitting(true);
    var result;
    try {
      result = await svc.submit({ customer: raw, method: draft.method, expectedSignature: shownSignature });
    } catch (err) {
      setSubmitting(false);
      handleError(err);
      return;
    }
    setSubmitting(false);
    showSuccess(result);
    window.dispatchEvent(new CustomEvent('order:placed', { detail: { order: result.order, instructions: result.instructions } }));
  }

  function handleError(err) {
    switch (err && err.code) {
      case 'validation_failed':
        Object.keys(err.details.errors).forEach(function (k) { setFieldError(k, err.details.errors[k]); });
        showAlert('Vui lòng kiểm tra lại thông tin được đánh dấu.');
        break;
      case 'empty_cart':
        renderEmpty();
        break;
      case 'cart_changed':
        if (window.KFCCart.getState().items.length === 0) { renderEmpty(); break; }
        refreshSummary();
        showAlert('Giỏ hàng vừa thay đổi nên tổng tiền đã được cập nhật. Vui lòng kiểm tra lại đơn hàng rồi xác nhận.', 'warn');
        break;
      case 'invalid_payment':
        showAlert('Vui lòng chọn phương thức thanh toán.');
        break;
      case 'busy':
        break;
      default:
        console.error('[KFC Payment] Đặt hàng thất bại:', err);
        showAlert(orderErrorMessage(err));
    }
  }

  // ---------- Màn hình: giỏ trống ----------
  function renderEmpty() {
    view = 'empty';
    el.title.textContent = 'Thanh toán';
    el.body.textContent = '';
    ui = {};
    var box = make('div', 'co-empty');
    box.appendChild(make('div', 'co-empty__icon', '🛒'));
    var h = make('h3', 'co-empty__title', 'Giỏ hàng đang trống');
    h.tabIndex = -1;
    box.appendChild(h);
    box.appendChild(make('p', 'co-empty__text', 'Hãy chọn món trước khi thanh toán nhé!'));
    var b = make('button', 'btn btn-primary', 'Xem thực đơn');
    b.type = 'button';
    b.addEventListener('click', goToMenu);
    box.appendChild(b);
    el.body.appendChild(box);
    h.focus();
  }

  // ---------- Màn hình: đặt hàng thành công ----------
  function copyText(text, btn) {
    var original = btn.textContent;
    function flash(msg) {
      btn.textContent = msg;
      setTimeout(function () { btn.textContent = original; }, 1600);
    }
    function legacy() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { flash('Đã chép'); }, function () { flash(legacy() ? 'Đã chép' : 'Không chép được'); });
    } else {
      flash(legacy() ? 'Đã chép' : 'Không chép được');
    }
  }

  function card(title) {
    var c = make('section', 'co-card');
    c.appendChild(make('h4', 'co-card__title', title));
    return c;
  }

  function showSuccess(result) {
    var order = result.order;
    var ins = result.instructions;
    view = 'success';
    el.title.textContent = 'Đặt hàng thành công';
    el.body.textContent = '';
    ui = {};

    var box = make('div', 'co-success');
    var ic = make('div', 'co-success__icon');
    ic.appendChild(icon('M5 13l4 4L19 7', 34));
    box.appendChild(ic);
    var title = make('h3', 'co-success__title', 'Đặt hàng thành công!');
    title.tabIndex = -1;
    box.appendChild(title);
    box.appendChild(make('p', 'co-success__sub', 'Cảm ơn bạn đã chọn KFC. Mã đơn hàng của bạn:'));
    box.appendChild(make('strong', 'co-success__code', order.code));

    var grid = make('div', 'co-success__grid');

    var c1 = card('Thông tin giao hàng');
    var d1 = make('dl', 'co-info');
    row(d1, 'Người nhận', order.customer.name);
    row(d1, 'Điện thoại', order.customer.phone);
    row(d1, 'Địa chỉ', order.customer.address);
    if (order.customer.note) row(d1, 'Ghi chú', order.customer.note);
    c1.appendChild(d1);
    grid.appendChild(c1);

    var c2 = card('Đơn hàng');
    var items = make('ul', 'co-items co-items--compact');
    order.items.forEach(function (it) {
      var li = make('li', 'co-item');
      li.appendChild(make('span', 'co-item__name', it.productName + ' × ' + it.quantity));
      li.appendChild(make('strong', 'co-item__line', fmt(it.lineTotal)));
      items.appendChild(li);
    });
    c2.appendChild(items);
    var d2 = make('dl', 'co-totals');
    if (order.discountTotal > 0) row(d2, 'Đã giảm', '−' + fmt(order.discountTotal), 'co-row--discount');
    row(d2, 'Tổng cộng', fmt(order.total), 'co-row--total');
    c2.appendChild(d2);
    grid.appendChild(c2);
    box.appendChild(grid);

    var pay = card('Thanh toán');
    var d3 = make('dl', 'co-info');
    row(d3, 'Phương thức', methodLabel(order.payment.method));
    pay.appendChild(d3);
    if (ins.type === 'bank_transfer') {
      pay.appendChild(make('p', 'co-pay-note', 'Vui lòng chuyển khoản theo thông tin dưới đây. Ghi đúng mã đơn hàng ở nội dung chuyển khoản để cửa hàng xác nhận nhanh.'));
      if (ins.isDemo) pay.appendChild(make('p', 'co-pay-note co-pay-note--warn', 'Đây là thông tin tài khoản DEMO, vui lòng không chuyển tiền thật.'));
      var d4 = make('dl', 'co-bank');
      [['Ngân hàng', ins.bankName, null], ['Số tài khoản', ins.accountNumber, ins.accountNumber], ['Chủ tài khoản', ins.accountName, null],
        ['Số tiền', fmt(ins.amount), String(ins.amount)], ['Nội dung', ins.memo, ins.memo]].forEach(function (b) {
        var r = make('div', 'co-bank__row');
        r.appendChild(make('dt', '', b[0]));
        var dd = make('dd', '');
        dd.appendChild(make('span', 'co-bank__value', b[1]));
        if (b[2]) {
          var cp = make('button', 'co-copy', 'Chép');
          cp.type = 'button';
          cp.setAttribute('aria-label', 'Sao chép ' + b[0].toLowerCase());
          cp.addEventListener('click', function () { copyText(b[2], cp); });
          dd.appendChild(cp);
        }
        r.appendChild(dd);
        d4.appendChild(r);
      });
      pay.appendChild(d4);
    } else {
      pay.appendChild(make('p', 'co-pay-note', 'Bạn thanh toán ' + fmt(ins.amountDue) + ' bằng tiền mặt cho nhân viên giao hàng khi nhận món.'));
    }
    box.appendChild(pay);

    box.appendChild(make('p', 'co-saved' + (order.persistent ? '' : ' co-saved--warn'),
      order.persistent
        ? '✓ Đơn hàng đã được lưu tự động trong trình duyệt này. Bạn có thể xem lại ở nút "Đơn hàng" trên đầu trang.'
        : 'Trình duyệt không cho lưu lâu dài, nên đơn chỉ được giữ tạm trong phiên này. Hãy lưu ra file orders.db ở bên dưới để giữ lại.'));

    if (window.KFCFileSyncUI) {
      // Lưu ra file orders.db thật (tự động sau khi chọn file một lần); nút tải bản sao nằm trong khung này
      box.appendChild(window.KFCFileSyncUI.create({ downloadClass: 'co-save' }));
    }

    var actions = make('div', 'co-actions');
    if (!window.KFCFileSyncUI) {
      var save = make('button', 'btn btn-outline co-save', 'Tải về bản sao orders.db');
      save.type = 'button';
      save.addEventListener('click', function () { saveDb(save); });
      actions.appendChild(save);
    }
    var cont = make('button', 'btn btn-primary co-continue', 'Tiếp tục mua sắm');
    cont.type = 'button';
    cont.addEventListener('click', goToMenu);
    actions.appendChild(cont);
    box.appendChild(actions);

    var status = make('p', 'co-status');
    status.setAttribute('role', 'status');
    ui.status = status;
    box.appendChild(status);

    el.body.appendChild(box);
    el.body.scrollTop = 0;
    title.focus();
  }

  async function saveDb(btn) {
    if (!window.KFCOrders) return;
    btn.disabled = true;
    try {
      var r = await window.KFCOrders.saveToFile();
      if (ui.status) {
        ui.status.textContent = r.method === 'picker' ? 'Đã lưu file orders.db.' : r.method === 'download' ? 'Đã tải orders.db về máy.' : '';
      }
    } catch (e) {
      console.error('[KFC Payment] Lưu file thất bại:', e);
      if (ui.status) {
        ui.status.textContent = e && e.code === 'sqljs_load_failed'
          ? 'Không thể tạo file orders.db: hãy mở trang qua Live Server (http://).'
          : 'Không thể lưu file orders.db, vui lòng thử lại.';
      }
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- Mở / đóng hộp thoại ----------
  function setBackgroundInert(on) {
    BACKGROUND_SELECTORS.forEach(function (sel) {
      var n = document.querySelector(sel);
      if (!n) return;
      if (on) n.setAttribute('inert', ''); else n.removeAttribute('inert');
    });
  }

  function openDialog() {
    if (isOpen) return;
    if (!window.KFCCart) return;
    if (window.KFCCart.close) window.KFCCart.close();
    lastFocus = document.activeElement;
    isOpen = true;

    // hiện hộp thoại trước rồi mới vẽ nội dung để focus() có tác dụng ngay
    el.overlay.hidden = false;
    el.dialog.hidden = false;
    el.dialog.setAttribute('aria-hidden', 'false');
    document.body.classList.add('checkout-open');
    setBackgroundInert(true);

    var toasts = $('toast-region'); // bỏ các thông báo cũ của giỏ hàng ("Đã thêm...") để không che hộp thoại
    if (toasts) toasts.textContent = '';

    var state = window.KFCCart.getState();
    if (state.items.length === 0) renderEmpty(); else renderForm();
    if (view === 'form' && ui.fields) ui.fields.name.input.focus();
  }

  function closeDialog() {
    if (!isOpen || submitting) return;
    isOpen = false;
    if (view === 'success') { draft = freshDraft(); }
    view = 'form';
    el.dialog.hidden = true;
    el.overlay.hidden = true;
    el.dialog.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('checkout-open');
    setBackgroundInert(false);
    el.body.textContent = '';
    ui = {};
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
  }

  function goToMenu() {
    closeDialog();
    var menu = document.getElementById('menu');
    if (menu) menu.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function trapTab(e) {
    if (e.key !== 'Tab' || !isOpen) return;
    var nodes = el.dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
    var visible = Array.prototype.filter.call(nodes, function (n) { return n.offsetParent !== null; });
    if (!visible.length) { e.preventDefault(); return; }
    var first = visible[0];
    var last = visible[visible.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === el.dialog)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // ---------- Khởi tạo ----------
  // Module Giỏ hàng phát 'cart:checkout' (cancelable): ta nhận xử lý để khách đi qua bước thanh toán
  window.addEventListener('cart:checkout', function (e) {
    e.preventDefault();
    openDialog();
  });

  el.close.addEventListener('click', closeDialog);
  el.overlay.addEventListener('click', function () { if (!submitting) closeDialog(); });
  document.addEventListener('keydown', function (e) {
    if (!isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); if (!submitting) closeDialog(); return; }
    trapTab(e);
  });

  // Giỏ hàng đổi trong lúc đang thanh toán (ví dụ từ tab khác): cập nhật tóm tắt và cảnh báo khách xem lại
  if (window.KFCCart && window.KFCCart.subscribe) {
    window.KFCCart.subscribe(function (state) {
      if (!isOpen || submitting || view !== 'form') return;
      if (state.items.length === 0) { renderEmpty(); return; }
      if (Svc.cartSignature(state) !== shownSignature) {
        refreshSummary();
        showAlert('Giỏ hàng vừa thay đổi nên tổng tiền đã được cập nhật. Vui lòng kiểm tra lại đơn hàng rồi xác nhận.', 'warn');
      }
    });
  }

  window.KFCPayment = {
    open: openDialog,
    close: closeDialog,
    isOpen: function () { return isOpen; }
  };
})();
