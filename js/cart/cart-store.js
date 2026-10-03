/**
 * KFC Cart Module - Store (logic thuần, không đụng DOM)
 * - Lưu giỏ hàng trong localStorage (không backend)
 * - Dùng được cả trong trình duyệt (window.KFCCartStore) và Node (module.exports) để test
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../pricing.js'));
  } else {
    root.KFCCartStore = factory(root.KFCPricing);
  }
})(typeof self !== 'undefined' ? self : this, function (Pricing) {
  'use strict';

  if (!Pricing) throw new Error('[KFC Cart] Thiếu js/pricing.js');

  var STORAGE_KEY = 'kfc_cart_v1';
  var STORAGE_VERSION = 1;
  var MAX_QTY = 99;

  /** 45000 -> "45.000 ₫" */
  function formatVND(amount) {
    var n = Number(amount);
    if (!isFinite(n)) n = 0;
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
  }

  function isValidProduct(p) {
    return !!p &&
      (typeof p.id === 'string' || typeof p.id === 'number') && String(p.id).trim() !== '' &&
      typeof p.name === 'string' && p.name.trim() !== '' &&
      typeof p.price === 'number' && isFinite(p.price) && p.price >= 0;
  }

  function isValidQty(q) {
    return typeof q === 'number' && isFinite(q) && Math.floor(q) === q;
  }

  /** Lấy storage an toàn: trả null nếu bị chặn (private mode, quota...) */
  function safeStorage(storage) {
    try {
      if (storage) return storage;
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch (e) { /* bị chặn */ }
    return null;
  }

  /**
   * @param {Object} [options]
   * @param {Storage} [options.storage]  mặc định localStorage
   * @param {string}  [options.key]
   * @param {number}  [options.maxQty]
   */
  function createCartStore(options) {
    options = options || {};
    var key = options.key || STORAGE_KEY;
    var maxQty = options.maxQty || MAX_QTY;
    var storage = safeStorage(options.storage);
    var items = [];
    var listeners = [];

    function findIndex(id) {
      var sid = String(id);
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === sid) return i;
      }
      return -1;
    }

    function snapshot() {
      return items.map(function (it) {
        return {
          id: it.id, name: it.name, price: it.price, discount: it.discount,
          unitPrice: Pricing.discountedPrice(it.price, it.discount),
          image: it.image, category: it.category, qty: it.qty
        };
      });
    }

    function persist() {
      if (!storage) return false;
      try {
        storage.setItem(key, JSON.stringify({ v: STORAGE_VERSION, items: items }));
        return true;
      } catch (e) {
        console.warn('[KFC Cart] Không thể lưu giỏ hàng:', e);
        return false;
      }
    }

    function emit(change) {
      persist();
      var state = getState();
      listeners.slice().forEach(function (fn) {
        try { fn(state, change); } catch (e) { console.error('[KFC Cart] listener lỗi:', e); }
      });
    }

    function getTotals() {
      var totalQty = 0;
      var subtotal = 0;      // theo giá gốc
      var discountTotal = 0; // tổng tiền được giảm
      items.forEach(function (it) {
        totalQty += it.qty;
        subtotal += it.qty * it.price;
        discountTotal += it.qty * Pricing.savingPerUnit(it.price, it.discount);
      });
      return { lines: items.length, totalQty: totalQty, subtotal: subtotal, discountTotal: discountTotal, total: subtotal - discountTotal };
    }

    function getState() {
      return { items: snapshot(), totals: getTotals() };
    }

    /** Đọc giỏ từ storage, bỏ qua mọi dòng sai định dạng. */
    function load() {
      items = [];
      if (!storage) return getState();
      var raw = null;
      try { raw = storage.getItem(key); } catch (e) { raw = null; }
      if (!raw) return getState();
      try {
        var data = JSON.parse(raw);
        var list = data && data.v === STORAGE_VERSION && Array.isArray(data.items) ? data.items : [];
        list.forEach(function (it) {
          if (!isValidProduct(it) || !isValidQty(it.qty) || it.qty < 1) return;
          var id = String(it.id);
          if (findIndex(id) !== -1) return; // bỏ trùng id
          items.push({
            id: id,
            name: it.name,
            price: it.price,
            discount: Pricing.normalizeDiscount(it.discount),
            image: typeof it.image === 'string' ? it.image : '',
            category: typeof it.category === 'string' ? it.category : '',
            qty: Math.min(it.qty, maxQty)
          });
        });
      } catch (e) {
        console.warn('[KFC Cart] Dữ liệu giỏ hàng hỏng, bắt đầu giỏ mới.', e);
        items = [];
      }
      return getState();
    }

    /**
     * Thêm sản phẩm. Nếu đã có thì cộng dồn số lượng (tối đa maxQty).
     * @returns {{ok:boolean, error?:string, capped?:boolean, qty?:number}}
     */
    function add(product, qty) {
      if (qty === undefined) qty = 1;
      if (!isValidProduct(product)) return { ok: false, error: 'invalid_product' };
      if (!isValidQty(qty) || qty < 1) return { ok: false, error: 'invalid_qty' };

      var idx = findIndex(product.id);
      var capped = false;
      var finalQty;
      if (idx === -1) {
        finalQty = Math.min(qty, maxQty);
        capped = qty > maxQty;
        items.push({
          id: String(product.id),
          name: product.name,
          price: product.price,
          discount: Pricing.normalizeDiscount(product.discount),
          image: typeof product.image === 'string' ? product.image : '',
          category: typeof product.category === 'string' ? product.category : '',
          qty: finalQty
        });
      } else {
        var wanted = items[idx].qty + qty;
        finalQty = Math.min(wanted, maxQty);
        capped = wanted > maxQty;
        items[idx].qty = finalQty;
      }
      emit({ type: 'add', id: String(product.id), capped: capped });
      return { ok: true, capped: capped, qty: finalQty };
    }

    /** Đặt số lượng. qty <= 0 sẽ xóa dòng. */
    function setQty(id, qty) {
      var idx = findIndex(id);
      if (idx === -1) return { ok: false, error: 'not_found' };
      if (!isValidQty(qty)) return { ok: false, error: 'invalid_qty' };
      if (qty <= 0) return remove(id);
      var capped = qty > maxQty;
      items[idx].qty = Math.min(qty, maxQty);
      emit({ type: 'qty', id: String(id), capped: capped });
      return { ok: true, capped: capped, qty: items[idx].qty };
    }

    function increment(id) {
      var idx = findIndex(id);
      if (idx === -1) return { ok: false, error: 'not_found' };
      if (items[idx].qty >= maxQty) return { ok: true, capped: true, qty: items[idx].qty };
      return setQty(id, items[idx].qty + 1);
    }

    /** Giảm 1; về 0 thì xóa dòng. */
    function decrement(id) {
      var idx = findIndex(id);
      if (idx === -1) return { ok: false, error: 'not_found' };
      return setQty(id, items[idx].qty - 1);
    }

    function remove(id) {
      var idx = findIndex(id);
      if (idx === -1) return { ok: false, error: 'not_found' };
      var removed = items.splice(idx, 1)[0];
      emit({ type: 'remove', id: removed.id, item: removed });
      return { ok: true, item: removed };
    }

    function clear() {
      if (items.length === 0) return { ok: true, cleared: 0 };
      var n = items.length;
      items = [];
      emit({ type: 'clear' });
      return { ok: true, cleared: n };
    }

    /**
     * Đồng bộ với menu hiện tại (nguồn giá duy nhất là menu.csv):
     * - Món không còn trong menu: bị gỡ
     * - Giá/tên/ảnh thay đổi: cập nhật theo menu
     * @returns {{removed:Array, updated:Array}}
     */
    function reconcile(products) {
      var map = {};
      (products || []).forEach(function (p) { if (isValidProduct(p)) map[String(p.id)] = p; });
      var removed = [];
      var updated = [];
      items = items.filter(function (it) {
        var p = map[it.id];
        if (!p) { removed.push(it); return false; }
        var oldUnit = Pricing.discountedPrice(it.price, it.discount);
        var newUnit = Pricing.discountedPrice(p.price, p.discount);
        if (newUnit !== oldUnit || p.name !== it.name) updated.push({ id: it.id, name: p.name, oldPrice: oldUnit, newPrice: newUnit });
        it.price = p.price;
        it.discount = Pricing.normalizeDiscount(p.discount);
        it.name = p.name;
        if (typeof p.image === 'string') it.image = p.image;
        if (typeof p.category === 'string') it.category = p.category;
        return true;
      });
      if (removed.length || updated.length) emit({ type: 'reconcile', removed: removed, updated: updated });
      return { removed: removed, updated: updated };
    }

    function subscribe(fn) {
      listeners.push(fn);
      return function unsubscribe() {
        listeners = listeners.filter(function (l) { return l !== fn; });
      };
    }

    load();

    return {
      getState: getState,
      getItems: function () { return snapshot(); },
      getTotals: getTotals,
      add: add,
      setQty: setQty,
      increment: increment,
      decrement: decrement,
      remove: remove,
      clear: clear,
      reconcile: reconcile,
      reload: function () { load(); emit({ type: 'reload' }); return getState(); },
      subscribe: subscribe,
      MAX_QTY: maxQty
    };
  }

  return {
    createCartStore: createCartStore,
    formatVND: formatVND,
    isValidProduct: isValidProduct,
    STORAGE_KEY: STORAGE_KEY,
    MAX_QTY: MAX_QTY
  };
});
