/**
 * KFC Order Status - UI: hộp thoại "Đơn hàng" (danh sách, lọc theo trạng thái, chi tiết + dòng thời gian,
 * chuyển trạng thái: Chưa gửi -> Đang gửi -> Đã gửi thành công, hoặc Hủy kèm lý do Tai nạn/Hư hỏng).
 *
 * Dùng API công khai của module Giỏ hàng/Đơn hàng: KFCOrders.listOrders / getOrder / updateOrderStatus.
 * Phát sự kiện 'order:status-changed' { orderId, code, from, to, reason, note } sau mỗi lần đổi thành công.
 * Mọi dữ liệu đọc từ DB đều được đưa vào DOM bằng textContent (không innerHTML).
 */
(function () {
  'use strict';

  var Rules = window.KFCOrderStatus;
  var Store = window.KFCCartStore;
  if (!Rules || !Store) {
    console.error('[KFC Order Status] Thiếu js/orders/order-status.js hoặc js/cart/cart-store.js');
    return;
  }

  var $ = function (id) { return document.getElementById(id); };
  var el = { toggle: $('orders-toggle'), overlay: $('orders-overlay'), dialog: $('orders-dialog'), close: $('orders-close'), body: $('orders-body'), title: $('orders-title') };
  if (!el.toggle || !el.overlay || !el.dialog || !el.close || !el.body) {
    console.error('[KFC Order Status] Thiếu markup hộp thoại đơn hàng trong index.html');
    return;
  }
  el.toggle.hidden = false; // chỉ hiện nút khi module đã sẵn sàng

  var fmt = Store.formatVND;
  var BACKGROUND_SELECTORS = ['header.header', 'main', 'footer.footer'];
  var PAYMENT_METHOD_LABELS = { cod: 'Thanh toán khi nhận hàng (COD)', bank_transfer: 'Chuyển khoản ngân hàng' };
  var PAYMENT_STATUS_LABELS = { unpaid: 'Chưa thanh toán', awaiting_transfer: 'Chờ chuyển khoản' };

  var isOpen = false;
  var view = 'list';          // 'list' | 'detail' | 'loading' | 'error'
  var orders = [];
  var filter = 'all';
  var current = null;         // đơn đang xem (dữ liệu từ getOrder)
  var busy = false;           // đang đổi trạng thái
  var lastFocus = null;
  var token = 0;              // bỏ qua kết quả của lần tải đã cũ
  var flash = null;           // { text, kind } hiển thị ở trang chi tiết
  var ui = {};

  // ---------- Tiện ích ----------
  function make(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function svgIcon(pathD, size) {
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

  function dateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    try {
      return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (e) { return d.toISOString(); }
  }

  function badge(status) {
    var s = Rules.normalize(status);
    return make('span', 'os-badge os-badge--' + s, Rules.label(s));
  }

  function row(dl, label, value) {
    var r = make('div', 'os-row');
    r.appendChild(make('dt', '', label));
    r.appendChild(make('dd', '', value));
    dl.appendChild(r);
  }

  function errorMessage(e) {
    switch (e && e.code) {
      case 'sqljs_load_failed': return 'Không tải được SQLite. Hãy mở trang qua Live Server (http://) rồi thử lại.';
      case 'db_corrupt': return 'Tệp dữ liệu đơn hàng bị hỏng nên không đọc được.';
      case 'schema_mismatch': return 'Tệp dữ liệu đơn hàng có cấu trúc không đúng.';
      case 'storage_load_failed':
      case 'storage_save_failed': return 'Không truy cập được nơi lưu đơn hàng của trình duyệt.';
      case 'order_not_found': return 'Không tìm thấy đơn hàng. Có thể đơn đã bị xóa.';
      case 'invalid_transition':
      case 'cancel_reason_required':
      case 'reason_not_allowed':
      case 'invalid_note':
      case 'invalid_status': return e.message;
      case 'status_conflict': return e.message;
      default: return 'Có lỗi xảy ra, vui lòng thử lại.';
    }
  }

  // ---------- Màn hình: đang tải / lỗi ----------
  function renderLoading() {
    view = 'loading';
    el.body.textContent = '';
    ui = {};
    var box = make('div', 'os-state');
    box.setAttribute('role', 'status');
    box.appendChild(make('div', 'loading-spinner'));
    box.appendChild(make('p', 'os-state__text', 'Đang tải đơn hàng…'));
    el.body.appendChild(box);
  }

  function renderError(e, retry) {
    view = 'error';
    el.body.textContent = '';
    ui = {};
    var box = make('div', 'os-state os-state--error');
    box.appendChild(make('div', 'os-state__icon', '⚠️'));
    var h = make('h3', 'os-state__title', 'Không thể tải đơn hàng');
    h.tabIndex = -1;
    box.appendChild(h);
    var p = make('p', 'os-state__text', errorMessage(e));
    p.setAttribute('role', 'alert');
    box.appendChild(p);
    var b = make('button', 'btn btn-primary', 'Thử lại');
    b.type = 'button';
    b.addEventListener('click', retry);
    box.appendChild(b);
    el.body.appendChild(box);
    h.focus();
  }

  // ---------- Màn hình: danh sách ----------
  async function loadList(focusId) {
    var my = ++token;
    renderLoading();
    try {
      var list = await window.KFCOrders.listOrders();
      if (my !== token || !isOpen) return;
      orders = list;
      renderList(focusId);
    } catch (e) {
      if (my !== token || !isOpen) return;
      console.error('[KFC Order Status] Không tải được danh sách đơn:', e);
      renderError(e, function () { loadList(); });
    }
  }

  function countBy(status) {
    if (status === 'all') return orders.length;
    return orders.filter(function (o) { return Rules.normalize(o.status) === status; }).length;
  }

  function renderList(focusId) {
    view = 'list';
    current = null;
    el.title.textContent = 'Đơn hàng';
    el.body.textContent = '';
    ui = {};

    el.body.appendChild(make('p', 'os-intro', 'Các đơn hàng được lưu tự động trong trình duyệt này. Đây là website demo, không có đăng nhập nên mọi người dùng chung máy đều xem và cập nhật được.'));
    if (window.KFCFileSyncUI) el.body.appendChild(window.KFCFileSyncUI.create({ compact: true }));

    if (orders.length === 0) {
      var empty = make('div', 'os-state');
      empty.appendChild(make('div', 'os-state__icon', '🧾'));
      var h = make('h3', 'os-state__title', 'Chưa có đơn hàng nào');
      h.tabIndex = -1;
      empty.appendChild(h);
      empty.appendChild(make('p', 'os-state__text', 'Các đơn bạn đặt sẽ hiện ở đây cùng trạng thái giao hàng.'));
      var go = make('button', 'btn btn-primary', 'Xem thực đơn');
      go.type = 'button';
      go.addEventListener('click', goToMenu);
      empty.appendChild(go);
      el.body.appendChild(empty);
      h.focus();
      return;
    }

    var chips = make('div', 'os-chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Lọc theo trạng thái');
    ['all'].concat(Rules.IDS).forEach(function (s) {
      var b = make('button', 'os-chip' + (filter === s ? ' is-active' : ''));
      b.type = 'button';
      b.setAttribute('data-filter', s);
      b.setAttribute('aria-pressed', filter === s ? 'true' : 'false');
      b.appendChild(document.createTextNode(s === 'all' ? 'Tất cả' : Rules.label(s)));
      b.appendChild(make('span', 'os-chip__count', String(countBy(s))));
      b.addEventListener('click', function () { filter = s; renderList(); var again = el.body.querySelector('[data-filter="' + s + '"]'); if (again) again.focus(); });
      chips.appendChild(b);
    });
    el.body.appendChild(chips);

    var shown = orders.filter(function (o) { return filter === 'all' || Rules.normalize(o.status) === filter; });
    if (shown.length === 0) {
      var none = make('p', 'os-none', 'Không có đơn hàng nào ở trạng thái "' + Rules.label(filter) + '".');
      none.setAttribute('role', 'status');
      el.body.appendChild(none);
      return;
    }

    var ul = make('ul', 'os-list');
    shown.forEach(function (o) {
      var li = make('li', 'os-list__item');
      var card = make('button', 'os-card');
      card.type = 'button';
      card.setAttribute('data-id', String(o.id));
      card.setAttribute('aria-label', 'Xem chi tiết đơn ' + o.order_code + ', trạng thái ' + Rules.label(o.status));

      var top = make('span', 'os-card__top');
      top.appendChild(make('strong', 'os-card__code', o.order_code));
      top.appendChild(badge(o.status));
      card.appendChild(top);

      var who = o.customer_name ? o.customer_name : 'Khách không để lại thông tin';
      card.appendChild(make('span', 'os-card__meta', dateTime(o.created_at) + ' · ' + who));

      var bottom = make('span', 'os-card__bottom');
      bottom.appendChild(make('span', 'os-card__qty', o.total_qty + ' món'));
      bottom.appendChild(make('strong', 'os-card__total', fmt(o.total)));
      card.appendChild(bottom);

      card.addEventListener('click', function () { openDetail(o.id); });
      li.appendChild(card);
      ul.appendChild(li);
    });
    el.body.appendChild(ul);

    if (focusId) {
      var back = el.body.querySelector('.os-card[data-id="' + focusId + '"]');
      if (back) back.focus();
    }
  }

  // ---------- Màn hình: chi tiết ----------
  async function openDetail(id, opts) {
    opts = opts || {};
    var my = ++token;
    if (!opts.keepFlash) flash = null;
    renderLoading();
    try {
      var o = await window.KFCOrders.getOrder(id);
      if (my !== token || !isOpen) return;
      current = o;
      renderDetail();
    } catch (e) {
      if (my !== token || !isOpen) return;
      console.error('[KFC Order Status] Không tải được đơn hàng:', e);
      renderError(e, function () { if (e && e.code === 'order_not_found') loadList(); else openDetail(id); });
    }
  }

  function stateText(state) {
    return state === 'done' ? 'Đã hoàn thành' : state === 'current' ? 'Hiện tại' : state === 'cancelled' ? 'Đã hủy' : 'Sắp tới';
  }

  function renderTimeline(order) {
    var steps = Rules.buildTimeline(order, order.history);
    var ol = make('ol', 'os-timeline');
    steps.forEach(function (st) {
      var li = make('li', 'os-step os-step--' + st.state);
      li.setAttribute('data-status', st.status);
      var mark = make('span', 'os-step__mark', st.state === 'done' ? '✓' : st.state === 'cancelled' ? '✕' : '');
      mark.setAttribute('aria-hidden', 'true');
      li.appendChild(mark);
      var body = make('div', 'os-step__body');
      var head = make('div', 'os-step__head');
      head.appendChild(make('strong', 'os-step__label', st.label));
      head.appendChild(make('span', 'sr-only', ' — ' + stateText(st.state)));
      body.appendChild(head);
      if (st.at) body.appendChild(make('span', 'os-step__time', dateTime(st.at)));
      if (st.state === 'cancelled') {
        body.appendChild(make('span', 'os-step__reason', 'Lý do: ' + (st.reasonLabel || 'Không rõ')));
        if (st.note) body.appendChild(make('span', 'os-step__note', st.note));
      }
      li.appendChild(body);
      ol.appendChild(li);
    });
    return ol;
  }

  function renderInfoCards(order) {
    var wrap = make('div', 'os-info');

    var c1 = make('section', 'os-box');
    c1.appendChild(make('h4', 'os-box__title', 'Thông tin giao hàng'));
    if (order.customer_name) {
      var d1 = make('dl', 'os-dl');
      row(d1, 'Người nhận', order.customer_name);
      row(d1, 'Điện thoại', order.customer_phone || '—');
      row(d1, 'Địa chỉ', order.customer_address || '—');
      if (order.customer_note) row(d1, 'Ghi chú', order.customer_note);
      c1.appendChild(d1);
    } else {
      c1.appendChild(make('p', 'os-muted', 'Đơn này không có thông tin người nhận.'));
    }
    wrap.appendChild(c1);

    var c2 = make('section', 'os-box');
    c2.appendChild(make('h4', 'os-box__title', 'Thanh toán'));
    var d2 = make('dl', 'os-dl');
    row(d2, 'Phương thức', PAYMENT_METHOD_LABELS[order.payment_method] || '—');
    row(d2, 'Tình trạng', PAYMENT_STATUS_LABELS[order.payment_status] || '—');
    c2.appendChild(d2);
    wrap.appendChild(c2);

    var c3 = make('section', 'os-box');
    c3.appendChild(make('h4', 'os-box__title', 'Món đã đặt'));
    var ul = make('ul', 'os-items');
    order.items.forEach(function (it) {
      var li = make('li', 'os-item');
      var name = make('span', 'os-item__name', it.product_name + ' × ' + it.quantity);
      if (it.discount_percent > 0) name.appendChild(make('span', 'os-item__sale', '-' + it.discount_percent + '%'));
      li.appendChild(name);
      li.appendChild(make('strong', 'os-item__line', fmt(it.line_total)));
      ul.appendChild(li);
    });
    c3.appendChild(ul);
    var d3 = make('dl', 'os-dl os-dl--totals');
    if (order.discount_total > 0) row(d3, 'Đã giảm', '−' + fmt(order.discount_total));
    row(d3, 'Tổng cộng', fmt(order.total));
    c3.appendChild(d3);
    wrap.appendChild(c3);
    return wrap;
  }

  function renderDetail() {
    var o = current;
    view = 'detail';
    el.title.textContent = 'Chi tiết đơn hàng';
    el.body.textContent = '';
    ui = {};

    var back = make('button', 'os-back');
    back.type = 'button';
    back.appendChild(svgIcon('M15 18l-6-6 6-6', 18));
    back.appendChild(document.createTextNode(' Danh sách đơn hàng'));
    back.addEventListener('click', function () { if (!busy) loadList(String(o.id)); });
    el.body.appendChild(back);

    var head = make('div', 'os-detail__head');
    var h = make('h3', 'os-detail__code', o.order_code);
    h.tabIndex = -1;
    head.appendChild(h);
    head.appendChild(badge(o.status));
    el.body.appendChild(head);
    el.body.appendChild(make('p', 'os-detail__time', 'Đặt lúc ' + dateTime(o.created_at)));

    ui.flash = make('div', 'os-flash');
    ui.flash.setAttribute('role', 'status');
    ui.flash.hidden = true;
    el.body.appendChild(ui.flash);
    if (flash) { showFlash(flash.text, flash.kind); flash = null; }

    var layout = make('div', 'os-layout');
    var left = make('div', 'os-main');
    var tl = make('section', 'os-box');
    tl.appendChild(make('h4', 'os-box__title', 'Tiến trình đơn hàng'));
    tl.appendChild(renderTimeline(o));
    left.appendChild(tl);
    ui.actions = make('section', 'os-box os-actions');
    left.appendChild(ui.actions);
    layout.appendChild(left);
    layout.appendChild(renderInfoCards(o));
    el.body.appendChild(layout);

    renderActions();
    el.body.scrollTop = 0;
    h.focus();
  }

  function showFlash(text, kind) {
    if (!ui.flash) return;
    ui.flash.textContent = text;
    ui.flash.className = 'os-flash os-flash--' + (kind || 'success');
    ui.flash.hidden = false;
  }

  // ---------- Hành động chuyển trạng thái ----------
  var ACTION_LABELS = { sending: 'Bắt đầu gửi hàng', delivered: 'Xác nhận đã gửi thành công', cancelled: 'Hủy đơn' };

  function renderActions() {
    var o = current;
    var box = ui.actions;
    box.textContent = '';
    var status = Rules.normalize(o.status);
    box.appendChild(make('h4', 'os-box__title', 'Cập nhật trạng thái'));

    if (Rules.isFinal(status)) {
      box.appendChild(make('p', 'os-muted', 'Đơn hàng "' + Rules.label(status) + '" đã kết thúc, không thể đổi trạng thái.'));
      return;
    }

    ui.error = make('div', 'os-error');
    ui.error.setAttribute('role', 'alert');
    ui.error.tabIndex = -1;
    ui.error.hidden = true;
    box.appendChild(ui.error);

    var row1 = make('div', 'os-actions__row');
    Rules.allowedNext(status).forEach(function (to) {
      var b = make('button', to === 'cancelled' ? 'btn os-btn-danger' : 'btn btn-primary', ACTION_LABELS[to]);
      b.type = 'button';
      b.setAttribute('data-to', to);
      b.addEventListener('click', function () { onAction(to); });
      row1.appendChild(b);
    });
    box.appendChild(row1);
    ui.row = row1;
    ui.panel = make('div', 'os-panel');
    ui.panel.hidden = true;
    box.appendChild(ui.panel);
  }

  function showError(text) {
    if (!ui.error) return;
    ui.error.textContent = text;
    ui.error.hidden = false;
    ui.error.focus();
  }
  function hideError() { if (ui.error) { ui.error.hidden = true; ui.error.textContent = ''; } }

  function closePanel() { ui.panel.hidden = true; ui.panel.textContent = ''; ui.row.hidden = false; hideError(); }

  function onAction(to) {
    if (busy) return;
    hideError();
    if (to === 'sending') { applyChange('sending'); return; }
    ui.row.hidden = true;
    ui.panel.hidden = false;
    ui.panel.textContent = '';
    if (to === 'delivered') buildDeliveredConfirm(); else buildCancelForm();
  }

  function buildDeliveredConfirm() {
    var p = ui.panel;
    p.appendChild(make('p', 'os-panel__text', 'Xác nhận đơn hàng đã được gửi thành công? Thao tác này không thể hoàn tác.'));
    var actions = make('div', 'os-actions__row');
    var ok = make('button', 'btn btn-primary', 'Xác nhận');
    ok.type = 'button';
    ok.setAttribute('data-confirm', 'delivered');
    ok.addEventListener('click', function () { applyChange('delivered'); });
    var cancel = make('button', 'btn btn-outline', 'Quay lại');
    cancel.type = 'button';
    cancel.addEventListener('click', function () { if (!busy) { closePanel(); ui.row.querySelector('[data-to="delivered"]').focus(); } });
    actions.appendChild(ok);
    actions.appendChild(cancel);
    p.appendChild(actions);
    ok.focus();
  }

  function buildCancelForm() {
    var p = ui.panel;
    p.appendChild(make('p', 'os-panel__text', 'Hủy đơn hàng là thao tác không thể hoàn tác. Vui lòng chọn lý do:'));

    var fs = make('fieldset', 'os-reasons');
    var legend = make('legend', 'sr-only', 'Lý do hủy đơn');
    fs.appendChild(legend);
    Rules.CANCEL_REASONS.forEach(function (r) {
      var lab = make('label', 'os-reason');
      var radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'cancel-reason';
      radio.value = r;
      radio.addEventListener('change', hideReasonError);
      lab.appendChild(radio);
      lab.appendChild(make('span', 'os-reason__text', Rules.reasonLabel(r)));
      fs.appendChild(lab);
    });
    p.appendChild(fs);

    ui.reasonError = make('p', 'os-field-error', 'Vui lòng chọn lý do hủy: Tai nạn hoặc Hư hỏng.');
    ui.reasonError.hidden = true;
    ui.reasonError.id = 'os-reason-error';
    p.appendChild(ui.reasonError);

    var noteWrap = make('div', 'os-note');
    var noteLabel = make('label', 'os-note__label', 'Ghi chú (không bắt buộc)');
    noteLabel.htmlFor = 'os-cancel-note';
    ui.note = document.createElement('textarea');
    ui.note.id = 'os-cancel-note';
    ui.note.className = 'os-note__input';
    ui.note.rows = 2;
    ui.note.placeholder = 'Ví dụ: xe giao hàng va chạm trên đường…';
    ui.note.addEventListener('input', function () { hideNoteError(); });
    ui.noteError = make('p', 'os-field-error');
    ui.noteError.hidden = true;
    ui.noteError.id = 'os-note-error';
    noteWrap.appendChild(noteLabel);
    noteWrap.appendChild(ui.note);
    noteWrap.appendChild(ui.noteError);
    p.appendChild(noteWrap);

    var actions = make('div', 'os-actions__row');
    var ok = make('button', 'btn os-btn-danger-solid', 'Xác nhận hủy đơn');
    ok.type = 'button';
    ok.setAttribute('data-confirm', 'cancelled');
    ok.addEventListener('click', onConfirmCancel);
    var back = make('button', 'btn btn-outline', 'Quay lại');
    back.type = 'button';
    back.addEventListener('click', function () { if (!busy) { closePanel(); ui.row.querySelector('[data-to="cancelled"]').focus(); } });
    actions.appendChild(ok);
    actions.appendChild(back);
    p.appendChild(actions);
    fs.querySelector('input').focus();
  }

  function hideReasonError() {
    if (!ui.reasonError) return;
    ui.reasonError.hidden = true;
    Array.prototype.forEach.call(ui.panel.querySelectorAll('input[name=cancel-reason]'), function (r) { r.removeAttribute('aria-describedby'); });
  }
  function hideNoteError() {
    if (!ui.noteError) return;
    ui.noteError.hidden = true; ui.noteError.textContent = '';
    ui.note.removeAttribute('aria-invalid'); ui.note.removeAttribute('aria-describedby');
  }

  function onConfirmCancel() {
    if (busy) return;
    hideError();
    var checked = ui.panel.querySelector('input[name=cancel-reason]:checked');
    var v = Rules.validateChange(Rules.normalize(current.status), 'cancelled', { reason: checked ? checked.value : undefined, note: ui.note.value });
    if (!v.ok) {
      if (v.code === 'cancel_reason_required') {
        ui.reasonError.hidden = false;
        var first = ui.panel.querySelector('input[name=cancel-reason]');
        Array.prototype.forEach.call(ui.panel.querySelectorAll('input[name=cancel-reason]'), function (r) { r.setAttribute('aria-describedby', 'os-reason-error'); });
        first.focus();
      } else {
        ui.noteError.textContent = v.message;
        ui.noteError.hidden = false;
        ui.note.setAttribute('aria-invalid', 'true');
        ui.note.setAttribute('aria-describedby', 'os-note-error');
        ui.note.focus();
      }
      return;
    }
    applyChange('cancelled', { reason: v.reason, note: ui.note.value });
  }

  /** Khóa/mở khóa các nút; nút vừa bấm (trigger) hiện "Đang cập nhật…" và được trả nhãn cũ khi xong */
  function setBusy(on, trigger) {
    busy = on;
    el.dialog.setAttribute('aria-busy', on ? 'true' : 'false');
    el.close.disabled = on;
    Array.prototype.forEach.call(el.body.querySelectorAll('.os-actions button, .os-actions input, .os-actions textarea, .os-back'), function (n) { n.disabled = on; });
    if (on && trigger) {
      trigger.setAttribute('data-label', trigger.textContent);
      trigger.textContent = 'Đang cập nhật…';
    }
    if (!on) {
      Array.prototype.forEach.call(el.body.querySelectorAll('[data-label]'), function (n) {
        n.textContent = n.getAttribute('data-label');
        n.removeAttribute('data-label');
      });
    }
  }

  async function applyChange(to, extra) {
    if (busy || !current) return;
    extra = extra || {};
    var from = Rules.normalize(current.status);
    var id = current.id;
    hideError();
    var trigger = to === 'sending' ? ui.row.querySelector('[data-to="sending"]') : ui.panel.querySelector('[data-confirm]');
    setBusy(true, trigger);
    var result;
    try {
      result = await window.KFCOrders.updateOrderStatus({ orderId: id, to: to, expectedFrom: from, reason: extra.reason, note: extra.note });
    } catch (e) {
      setBusy(false);
      handleChangeError(e, id);
      return;
    }
    setBusy(false);
    flash = { text: 'Đã chuyển đơn ' + result.code + ' sang "' + Rules.label(to) + '".', kind: 'success' };
    window.dispatchEvent(new CustomEvent('order:status-changed', { detail: { orderId: result.id, code: result.code, from: result.from, to: result.to, reason: result.reason, note: result.note } }));
    await openDetail(id, { keepFlash: true });
  }

  function handleChangeError(e, id) {
    if (e && e.code === 'status_conflict') {
      flash = { text: errorMessage(e) + '. Thông tin đã được cập nhật, vui lòng kiểm tra lại.', kind: 'warn' };
      openDetail(id, { keepFlash: true });
      return;
    }
    if (e && e.code === 'order_not_found') { renderError(e, function () { loadList(); }); return; }
    console.error('[KFC Order Status] Đổi trạng thái thất bại:', e);
    showError(errorMessage(e));
  }

  // ---------- Mở / đóng ----------
  function setBackgroundInert(on) {
    BACKGROUND_SELECTORS.forEach(function (sel) {
      var n = document.querySelector(sel);
      if (!n) return;
      if (on) n.setAttribute('inert', ''); else n.removeAttribute('inert');
    });
  }

  function goToMenu() {
    closeDialog();
    var menu = document.getElementById('menu');
    if (menu) menu.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openDialog() {
    if (isOpen) return;
    if (window.KFCCart && window.KFCCart.close) window.KFCCart.close();
    lastFocus = document.activeElement;
    isOpen = true;
    filter = 'all';
    el.overlay.hidden = false;
    el.dialog.hidden = false;
    el.dialog.setAttribute('aria-hidden', 'false');
    el.toggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('orders-open');
    setBackgroundInert(true);
    if (!window.KFCOrders) { renderError({ code: 'x' }, function () { openDialog(); }); return; }
    loadList();
  }

  function closeDialog() {
    if (!isOpen || busy) return;
    isOpen = false;
    token++;
    el.dialog.hidden = true;
    el.overlay.hidden = true;
    el.dialog.setAttribute('aria-hidden', 'true');
    el.toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('orders-open');
    setBackgroundInert(false);
    el.body.textContent = '';
    ui = {};
    current = null;
    flash = null;
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
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
  el.toggle.addEventListener('click', function () { if (isOpen) closeDialog(); else openDialog(); });
  el.close.addEventListener('click', closeDialog);
  el.overlay.addEventListener('click', function () { if (!busy) closeDialog(); });
  document.addEventListener('keydown', function (e) {
    if (!isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); if (!busy) closeDialog(); return; }
    trapTab(e);
  });

  window.KFCOrderStatusUI = {
    open: openDialog,
    close: closeDialog,
    isOpen: function () { return isOpen; },
    refresh: function () { if (isOpen && view === 'list') loadList(); }
  };
})();
