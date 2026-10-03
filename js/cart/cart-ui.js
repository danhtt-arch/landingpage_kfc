/**
 * KFC Cart Module - UI
 * Giao tiếp với phần còn lại của trang qua sự kiện (không gọi trực tiếp code khác):
 *   Nhận:  'cart:add'     {product}          -> thêm 1 món vào giỏ
 *          'menu:loaded'  {products}         -> đồng bộ giá/món còn bán với menu.csv
 *   Phát:  'cart:checkout' {items, totals}   -> module Thanh Toán (sau này) lắng nghe và preventDefault()
 * Dữ liệu từ CSV luôn được đưa vào DOM bằng textContent (không innerHTML).
 */
(function () {
  'use strict';

  var Store = window.KFCCartStore;
  if (!Store) {
    console.error('[KFC Cart] Thiếu js/cart/cart-store.js');
    return;
  }

  var cart = Store.createCartStore();
  var fmt = Store.formatVND;

  // ---- DOM ----
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    toggle: $('cart-toggle'), badge: $('cart-badge'),
    overlay: $('cart-overlay'), drawer: $('cart-drawer'),
    close: $('cart-close'), count: $('cart-count'), body: $('cart-body'),
    footer: $('cart-footer'), summaryQty: $('cart-summary-qty'),
    subtotal: $('cart-subtotal'), discountRow: $('cart-discount-row'), discount: $('cart-discount'), total: $('cart-total'),
    checkout: $('cart-checkout'), cont: $('cart-continue'), clear: $('cart-clear'),
    toasts: $('toast-region')
  };
  if (!el.drawer || !el.body || !el.toggle) {
    console.error('[KFC Cart] Thiếu markup giỏ hàng trong index.html');
    return;
  }

  var isOpen = false;
  var view = 'cart';   // 'cart' | 'success' (màn hình sau khi đặt hàng thành công)
  var placing = false; // đang lưu đơn hàng
  var lastFocus = null;
  var confirmClearTimer = null;
  var BACKGROUND_SELECTORS = ['header.header', 'main', 'footer.footer'];

  // ---- Tiện ích DOM ----
  function make(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function iconSvg(pathD, size) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', size || 18);
    svg.setAttribute('height', size || 18);
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

  // ---- Render ----
  function renderBadge(totals) {
    var n = totals.totalQty;
    el.badge.textContent = n > 99 ? '99+' : String(n);
    el.badge.hidden = n === 0;
    el.toggle.setAttribute('aria-label', n === 0 ? 'Mở giỏ hàng, giỏ đang trống' : 'Mở giỏ hàng, hiện có ' + n + ' món');
  }

  function renderEmpty() {
    var box = make('div', 'cart-empty');
    box.appendChild(make('div', 'cart-empty__icon', '🛒'));
    box.appendChild(make('h3', 'cart-empty__title', 'Giỏ hàng đang trống'));
    box.appendChild(make('p', 'cart-empty__text', 'Chọn vài món gà rán giòn rụm từ thực đơn nhé!'));
    var btn = make('button', 'btn btn-primary', 'Xem thực đơn');
    btn.type = 'button';
    btn.setAttribute('data-action', 'continue');
    box.appendChild(btn);
    return box;
  }

  function renderItem(item) {
    var li = make('li', 'cart-item');
    li.setAttribute('data-id', item.id);

    var thumb = make('div', 'cart-item__thumb');
    if (item.image) {
      var img = document.createElement('img');
      img.src = item.image;
      img.alt = item.name;
      img.loading = 'lazy';
      img.width = 72; img.height = 72;
      img.addEventListener('error', function () { img.remove(); thumb.classList.add('cart-item__thumb--fallback'); thumb.textContent = '🍗'; });
      thumb.appendChild(img);
    } else {
      thumb.classList.add('cart-item__thumb--fallback');
      thumb.textContent = '🍗';
    }

    var info = make('div', 'cart-item__info');
    info.appendChild(make('h3', 'cart-item__name', item.name));
    if (item.category) info.appendChild(make('span', 'cart-item__category', item.category));
    var unit = make('span', 'cart-item__unit');
    unit.appendChild(make('span', item.discount > 0 ? 'cart-item__unit-now' : '', fmt(item.unitPrice)));
    if (item.discount > 0) {
      unit.appendChild(make('del', 'cart-item__unit-old', fmt(item.price)));
      unit.appendChild(make('span', 'cart-item__sale', '-' + item.discount + '%'));
      unit.appendChild(make('span', 'sr-only', 'Giảm ' + item.discount + '%, giá gốc ' + fmt(item.price)));
    }
    info.appendChild(unit);

    var controls = make('div', 'cart-item__controls');

    var qty = make('div', 'qty');
    qty.setAttribute('role', 'group');
    qty.setAttribute('aria-label', 'Số lượng ' + item.name);

    var minus = make('button', 'qty__btn');
    minus.type = 'button';
    minus.setAttribute('data-action', 'dec');
    minus.setAttribute('aria-label', item.qty === 1 ? 'Xóa ' + item.name + ' khỏi giỏ' : 'Giảm số lượng ' + item.name);
    minus.appendChild(iconSvg('M5 12h14', 16));

    var input = make('input', 'qty__input');
    input.type = 'number';
    input.inputMode = 'numeric';
    input.min = '0';
    input.max = String(cart.MAX_QTY);
    input.step = '1';
    input.value = String(item.qty);
    input.setAttribute('data-action', 'qty');
    input.setAttribute('aria-label', 'Số lượng ' + item.name);

    var plus = make('button', 'qty__btn');
    plus.type = 'button';
    plus.setAttribute('data-action', 'inc');
    plus.setAttribute('aria-label', 'Tăng số lượng ' + item.name);
    plus.appendChild(iconSvg('M12 5v14M5 12h14', 16));
    if (item.qty >= cart.MAX_QTY) plus.disabled = true;

    qty.appendChild(minus);
    qty.appendChild(input);
    qty.appendChild(plus);

    var line = make('strong', 'cart-item__line', fmt(item.unitPrice * item.qty));

    var remove = make('button', 'cart-item__remove');
    remove.type = 'button';
    remove.setAttribute('data-action', 'remove');
    remove.setAttribute('aria-label', 'Xóa ' + item.name + ' khỏi giỏ');
    remove.appendChild(iconSvg('M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6', 18));

    controls.appendChild(qty);
    controls.appendChild(line);
    controls.appendChild(remove);

    li.appendChild(thumb);
    li.appendChild(info);
    li.appendChild(controls);
    return li;
  }

  function render(state) {
    var items = state.items;
    var totals = state.totals;

    renderBadge(totals);
    el.count.textContent = totals.totalQty > 0 ? '(' + totals.totalQty + ')' : '';
    if (view === 'success') return; // đang hiện màn hình đặt hàng thành công, không vẽ đè danh sách

    // giữ vị trí cuộn và phần tử đang focus khi render lại
    var scrollTop = el.body.scrollTop;
    var active = document.activeElement;
    var focusKey = null;
    if (active && el.body.contains(active)) {
      var row = active.closest('.cart-item');
      focusKey = row ? { id: row.getAttribute('data-id'), action: active.getAttribute('data-action') } : null;
    }

    el.body.textContent = '';
    if (items.length === 0) {
      el.body.appendChild(renderEmpty());
      el.footer.hidden = true;
    } else {
      var list = make('ul', 'cart-list');
      items.forEach(function (it) { list.appendChild(renderItem(it)); });
      el.body.appendChild(list);
      el.footer.hidden = false;
    }

    el.summaryQty.textContent = String(totals.totalQty);
    el.subtotal.textContent = fmt(totals.subtotal);
    el.discountRow.hidden = totals.discountTotal <= 0;
    el.discount.textContent = '−' + fmt(totals.discountTotal);
    el.total.textContent = fmt(totals.total);
    el.body.scrollTop = scrollTop;

    if (focusKey) {
      var target = el.body.querySelector('.cart-item[data-id="' + cssEscape(focusKey.id) + '"] [data-action="' + focusKey.action + '"]');
      if (target && !target.disabled) target.focus();
      else if (isOpen) el.drawer.focus();
    }
  }

  function cssEscape(s) {
    return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
  }

  // Khi drawer mở, đặt toast ngay trên phần tổng tiền để không che nút Đặt hàng
  function placeToasts() {
    el.toasts.classList.toggle('toast-region--drawer', isOpen);
    el.toasts.style.setProperty('--cart-footer-h', (isOpen && !el.footer.hidden ? el.footer.offsetHeight : 0) + 'px');
  }

  // ---- Toast ----
  function toast(message, opts) {
    opts = opts || {};
    var t = make('div', 'toast' + (opts.type ? ' toast--' + opts.type : ''));
    t.appendChild(make('span', 'toast__msg', message));
    var timer;
    function dismiss() {
      clearTimeout(timer);
      t.classList.add('toast--out');
      setTimeout(function () { t.remove(); }, 200);
    }
    if (opts.actionLabel && opts.onAction) {
      var a = make('button', 'toast__action', opts.actionLabel);
      a.type = 'button';
      a.addEventListener('click', function () { opts.onAction(); dismiss(); });
      t.appendChild(a);
    }
    // gộp toast trùng nội dung, tối đa 3 toast cùng lúc
    Array.prototype.slice.call(el.toasts.children).forEach(function (old) {
      var m = old.querySelector('.toast__msg');
      if (m && m.textContent === message) old.remove();
    });
    while (el.toasts.children.length >= 3) el.toasts.firstChild.remove();
    placeToasts();
    el.toasts.appendChild(t);
    timer = setTimeout(dismiss, opts.duration || 4000);
    return t;
  }

  // ---- Drawer ----
  function setBackgroundInert(on) {
    BACKGROUND_SELECTORS.forEach(function (sel) {
      var n = document.querySelector(sel);
      if (!n) return;
      if (on) n.setAttribute('inert', ''); else n.removeAttribute('inert');
    });
  }

  /** focus() không có tác dụng khi phần tử còn visibility:hidden (transition), nên thử lại vài lần */
  function focusWhenVisible(node, tries) {
    node.focus();
    if (document.activeElement === node || !isOpen) return;
    if ((tries || 0) < 5) setTimeout(function () { focusWhenVisible(node, (tries || 0) + 1); }, 40);
    else el.drawer.focus();
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    lastFocus = document.activeElement;
    el.overlay.hidden = false;
    el.drawer.setAttribute('aria-hidden', 'false');
    el.toggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('cart-open');
    void el.overlay.offsetWidth; // buộc reflow để transition của overlay chạy
    el.overlay.classList.add('is-visible');
    el.drawer.classList.add('is-open'); // visibility hiện ngay nên focus được ngay
    setBackgroundInert(true);
    placeToasts();
    focusWhenVisible(el.close);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    resetClearConfirm();
    if (view === 'success') { view = 'cart'; render(cart.getState()); }
    el.overlay.classList.remove('is-visible');
    el.drawer.classList.remove('is-open');
    el.drawer.setAttribute('aria-hidden', 'true');
    el.toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('cart-open');
    setBackgroundInert(false);
    placeToasts();
    setTimeout(function () { if (!isOpen) el.overlay.hidden = true; }, 250);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function trapTab(e) {
    if (e.key !== 'Tab' || !isOpen) return;
    var nodes = el.drawer.querySelectorAll('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
    var visible = Array.prototype.filter.call(nodes, function (n) { return n.offsetParent !== null; });
    if (!visible.length) { e.preventDefault(); return; }
    var first = visible[0];
    var last = visible[visible.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === el.drawer)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // ---- Hành động ----
  function rowId(node) {
    var row = node.closest('.cart-item');
    return row ? row.getAttribute('data-id') : null;
  }

  function findItem(id) {
    var list = cart.getItems();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function notifyCap() {
    toast('Mỗi món tối đa ' + cart.MAX_QTY + ' phần trong một đơn.', { type: 'warn' });
  }

  function removeWithUndo(id) {
    var item = findItem(id);
    if (!item) return;
    cart.remove(id);
    toast('Đã xóa ' + item.name + ' khỏi giỏ.', {
      actionLabel: 'Hoàn tác',
      onAction: function () { cart.add(item, item.qty); },
      duration: 6000
    });
  }

  function onBodyClick(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn || btn.tagName === 'INPUT') return;
    var action = btn.getAttribute('data-action');
    var id = rowId(btn);

    if (action === 'inc' && id) {
      var r = cart.increment(id);
      if (r.capped) notifyCap();
    } else if (action === 'dec' && id) {
      var item = findItem(id);
      if (item && item.qty === 1) removeWithUndo(id); else cart.decrement(id);
    } else if (action === 'remove' && id) {
      removeWithUndo(id);
    } else if (action === 'continue') {
      goToMenu();
    }
  }

  function onBodyChange(e) {
    var input = e.target;
    if (!input.matches || !input.matches('input[data-action="qty"]')) return;
    var id = rowId(input);
    if (!id) return;
    var raw = input.value.trim();
    var n = Number(raw);
    if (raw === '' || !isFinite(n) || Math.floor(n) !== n) {
      // giá trị không hợp lệ: trả lại số lượng cũ
      render(cart.getState());
      toast('Số lượng phải là số nguyên từ 1 đến ' + cart.MAX_QTY + '.', { type: 'warn' });
      return;
    }
    if (n <= 0) { removeWithUndo(id); return; }
    var r = cart.setQty(id, n);
    if (r.capped) notifyCap();
    else if (!r.ok) render(cart.getState());
  }

  function onBodyKeydown(e) {
    // Enter trong ô số lượng = áp dụng ngay
    if (e.key === 'Enter' && e.target.matches && e.target.matches('input[data-action="qty"]')) {
      e.preventDefault();
      e.target.blur();
    }
  }

  function goToMenu() {
    close();
    var menu = document.getElementById('menu');
    if (menu) menu.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Xóa toàn bộ: bấm 2 lần (lần 1 hỏi xác nhận), tránh xóa nhầm
  function resetClearConfirm() {
    clearTimeout(confirmClearTimer);
    el.clear.textContent = 'Xóa giỏ hàng';
    el.clear.classList.remove('is-confirming');
  }

  function onClear() {
    if (!el.clear.classList.contains('is-confirming')) {
      el.clear.textContent = 'Bấm lần nữa để xác nhận';
      el.clear.classList.add('is-confirming');
      confirmClearTimer = setTimeout(resetClearConfirm, 3500);
      return;
    }
    resetClearConfirm();
    var backup = cart.getItems();
    if (!backup.length) return;
    cart.clear();
    toast('Đã xóa toàn bộ giỏ hàng.', {
      actionLabel: 'Hoàn tác',
      onAction: function () { backup.forEach(function (it) { cart.add(it, it.qty); }); },
      duration: 6000
    });
  }

  function onCheckout() {
    var state = cart.getState();
    if (!state.items.length || placing) return;
    // Module Thanh Toán (sau này) có thể lắng nghe sự kiện này và gọi preventDefault() để tự xử lý
    var ev = new CustomEvent('cart:checkout', { cancelable: true, detail: { items: state.items, totals: state.totals } });
    var proceed = window.dispatchEvent(ev);
    if (proceed) placeOrderFlow(state);
  }

  // ---- Đặt hàng: lưu vào SQLite (orders.db) ----
  function setPlacing(on) {
    placing = on;
    el.drawer.setAttribute('aria-busy', on ? 'true' : 'false');
    [el.body, el.footer].forEach(function (n) {
      if (on) n.setAttribute('inert', ''); else n.removeAttribute('inert');
    });
    el.checkout.textContent = on ? 'Đang lưu đơn hàng…' : 'Đặt hàng';
    el.checkout.classList.toggle('is-busy', on);
  }

  function orderErrorMessage(e) {
    var keep = ' Giỏ hàng của bạn vẫn được giữ lại.';
    switch (e && e.code) {
      case 'sqljs_load_failed': return 'Không tải được SQLite. Hãy mở trang qua Live Server (http://) rồi thử lại.' + keep;
      case 'db_corrupt': return 'Tệp dữ liệu đơn hàng đã lưu bị hỏng nên không thể ghi thêm, dữ liệu cũ được giữ nguyên.' + keep;
      case 'schema_mismatch': return 'Tệp dữ liệu đơn hàng đã lưu có cấu trúc không đúng nên không thể ghi thêm.' + keep;
      case 'storage_load_failed':
      case 'storage_save_failed': return 'Không lưu được đơn hàng do lỗi lưu trữ của trình duyệt.' + keep;
      case 'empty_cart': return 'Giỏ hàng đang trống.';
      case 'invalid_item':
      case 'duplicate_item':
      case 'total_mismatch': return 'Không thể đặt hàng: ' + e.message + '.' + keep;
      default: return 'Không thể đặt hàng lúc này.' + keep;
    }
  }

  async function placeOrderFlow(state) {
    if (placing) return;
    if (!window.KFCOrders) {
      toast('Không tìm thấy module lưu đơn hàng.', { type: 'warn' });
      return;
    }
    setPlacing(true);
    var order;
    try {
      order = await window.KFCOrders.placeOrder(state);
    } catch (e) {
      console.error('[KFC Orders] Đặt hàng thất bại:', e);
      setPlacing(false);
      toast(orderErrorMessage(e), { type: 'warn', duration: 8000 });
      if (isOpen) el.checkout.focus();
      return;
    }
    // Đã lưu xong mới xóa giỏ
    cart.clear();
    setPlacing(false);
    el.toasts.textContent = ''; // bỏ các thông báo cũ ("Đã thêm...") để không che màn hình thành công
    if (isOpen) {
      showSuccess(order);
    } else {
      toast('Đặt hàng thành công! Mã đơn ' + order.code + '.', { type: 'success', duration: 7000 });
    }
    window.dispatchEvent(new CustomEvent('order:placed', { detail: { order: order } }));
  }

  function showSuccess(order) {
    view = 'success';
    el.footer.hidden = true;
    placeToasts();
    el.body.textContent = '';

    var box = make('div', 'order-success');
    var icon = make('div', 'order-success__icon');
    icon.appendChild(iconSvg('M5 13l4 4L19 7', 34));
    box.appendChild(icon);

    var title = make('h3', 'order-success__title', 'Đặt hàng thành công!');
    title.tabIndex = -1;
    box.appendChild(title);
    box.appendChild(make('p', 'order-success__sub', 'Cảm ơn bạn đã chọn KFC. Mã đơn hàng của bạn:'));
    box.appendChild(make('strong', 'order-success__code', order.code));

    var dl = make('dl', 'order-success__summary');
    function row(label, value, cls) {
      var r = make('div', 'order-success__row' + (cls ? ' ' + cls : ''));
      r.appendChild(make('dt', '', label));
      r.appendChild(make('dd', '', value));
      dl.appendChild(r);
    }
    row('Số món', String(order.totalQty));
    if (order.discountTotal > 0) row('Đã giảm', '−' + fmt(order.discountTotal), 'order-success__row--discount');
    row('Tổng cộng', fmt(order.total), 'order-success__row--total');
    box.appendChild(dl);

    var note = make('p', 'order-success__note' + (order.persistent ? '' : ' order-success__note--warn'),
      order.persistent
        ? 'Đơn hàng đã được lưu vào cơ sở dữ liệu SQLite (orders.db) trên trình duyệt này.'
        : 'Trình duyệt không cho lưu lâu dài, nên đơn chỉ được giữ tạm trong phiên này. Hãy bấm "Lưu file orders.db" để giữ lại.');
    box.appendChild(note);

    var save = make('button', 'btn btn-primary order-success__save', 'Lưu file orders.db');
    save.type = 'button';
    save.addEventListener('click', function () { saveDbFile(save); });
    box.appendChild(save);

    var cont = make('button', 'cart-link-btn order-success__continue', 'Tiếp tục mua sắm');
    cont.type = 'button';
    cont.addEventListener('click', goToMenu);
    box.appendChild(cont);

    el.body.appendChild(box);
    el.body.scrollTop = 0;
    title.focus();
  }

  async function saveDbFile(btn) {
    if (!window.KFCOrders) return;
    btn.disabled = true;
    try {
      var r = await window.KFCOrders.saveToFile();
      if (r.method === 'picker') toast('Đã lưu file orders.db.', { type: 'success' });
      else if (r.method === 'download') toast('Đã tải orders.db về máy.', { type: 'success' });
    } catch (e) {
      console.error('[KFC Orders] Lưu file thất bại:', e);
      toast(e && e.code === 'sqljs_load_failed' ? 'Không thể tạo file orders.db: hãy mở trang qua Live Server (http://).' : 'Không thể lưu file orders.db, vui lòng thử lại.', { type: 'warn', duration: 7000 });
    } finally {
      btn.disabled = false;
    }
  }

  function onAddEvent(e) {
    var product = e.detail && e.detail.product;
    var r = cart.add(product, 1);
    if (!r.ok) {
      toast('Không thể thêm món này vào giỏ.', { type: 'warn' });
      return;
    }
    el.toggle.classList.remove('cart-toggle--bump');
    void el.toggle.offsetWidth; // restart animation
    el.toggle.classList.add('cart-toggle--bump');
    if (r.capped) { notifyCap(); return; }
    toast('Đã thêm ' + product.name + ' vào giỏ.', { actionLabel: 'Xem giỏ', onAction: open, type: 'success' });
  }

  function onMenuLoaded(e) {
    var products = e.detail && e.detail.products;
    var res = cart.reconcile(products);
    if (res.removed.length) {
      toast(res.removed.length + ' món trong giỏ không còn trong thực đơn nên đã được gỡ.', { type: 'warn', duration: 6000 });
    }
    if (res.updated.length) {
      toast('Giá của ' + res.updated.length + ' món trong giỏ đã được cập nhật theo thực đơn mới.', { type: 'warn', duration: 6000 });
    }
  }

  // ---- Khởi tạo ----
  cart.subscribe(function (state) { render(state); });
  render(cart.getState());

  el.toggle.addEventListener('click', function () { isOpen ? close() : open(); });
  el.close.addEventListener('click', close);
  el.overlay.addEventListener('click', close);
  el.cont.addEventListener('click', goToMenu);
  el.clear.addEventListener('click', onClear);
  el.checkout.addEventListener('click', onCheckout);
  el.body.addEventListener('click', onBodyClick);
  el.body.addEventListener('change', onBodyChange);
  el.body.addEventListener('keydown', onBodyKeydown);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) { e.preventDefault(); close(); return; }
    trapTab(e);
  });

  window.addEventListener('cart:add', onAddEvent);
  window.addEventListener('menu:loaded', onMenuLoaded);
  // đồng bộ giữa nhiều tab
  window.addEventListener('storage', function (e) {
    if (e.key === Store.STORAGE_KEY || e.key === null) cart.reload();
  });

  // API công khai cho các module sau (Thanh Toán, Trạng Thái Đơn Hàng)
  window.KFCCart = {
    getState: cart.getState,
    add: cart.add,
    clear: cart.clear,
    open: open,
    close: close,
    subscribe: cart.subscribe
  };
})();
