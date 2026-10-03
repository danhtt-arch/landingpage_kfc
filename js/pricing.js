/**
 * Tính giá sau giảm theo phần trăm (cột `discount` trong data/menu.csv).
 * Dùng chung cho thẻ sản phẩm (app.js) và giỏ hàng (js/cart) để hai nơi luôn cùng một giá.
 * Chạy được trong trình duyệt (window.KFCPricing) và Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KFCPricing = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Chuẩn hóa % giảm về số nguyên 0..100. Giá trị lạ (NaN, chữ, âm, > 100) không bao giờ
   * làm giá bị âm hoặc tăng lên: không hợp lệ -> 0, vượt khoảng -> kẹp lại.
   */
  function normalizeDiscount(d) {
    var n = typeof d === 'string' && d.trim() !== '' ? Number(d) : d;
    if (typeof n !== 'number' || !isFinite(n)) return 0;
    return Math.min(100, Math.max(0, Math.round(n)));
  }

  /** Giá sau giảm, làm tròn đến đồng. 45000, 20 -> 36000 */
  function discountedPrice(price, discount) {
    var p = Number(price);
    if (!isFinite(p) || p < 0) return 0;
    return Math.round(p * (100 - normalizeDiscount(discount)) / 100);
  }

  /** Số tiền tiết kiệm được trên 1 phần */
  function savingPerUnit(price, discount) {
    return Math.max(0, Number(price) - discountedPrice(price, discount)) || 0;
  }

  return {
    normalizeDiscount: normalizeDiscount,
    discountedPrice: discountedPrice,
    savingPerUnit: savingPerUnit
  };
});
