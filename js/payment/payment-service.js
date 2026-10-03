/**
 * KFC Payment - Service: điều phối bước thanh toán (không đụng DOM).
 *
 * Nhận vào các hàm của module Giỏ hàng:
 *   getCartState() -> { items, totals }
 *   clearCart()    -> xóa giỏ
 *   placeOrder(cartState, meta) -> Promise<order>   (KFCOrders.placeOrder, lưu vào orders.db)
 *
 * Thứ tự an toàn của submit():
 *   1. kiểm tra thông tin khách và phương thức  (sai: dừng, chưa đụng giỏ/DB)
 *   2. đọc giỏ MỚI NHẤT, đối chiếu với đơn khách đang xem (giỏ đổi: dừng, bắt khách xem lại)
 *   3. lưu đơn (SQLite)
 *   4. chỉ khi lưu xong mới xóa giỏ
 *   Nhiều lần bấm cùng lúc chỉ tạo một đơn.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./payment-validate.js'), require('./payment-config.js'));
  } else {
    root.KFCPaymentService = factory(root.KFCPaymentValidate, root.KFCPaymentConfig);
  }
})(typeof self !== 'undefined' ? self : this, function (Validate, Config) {
  'use strict';

  if (!Validate || !Config) throw new Error('[KFC Payment] Thiếu payment-validate.js hoặc payment-config.js');

  function PaymentError(code, message, details) {
    var e = new Error(message || code);
    e.name = 'PaymentError';
    e.code = code;
    if (details) e.details = details;
    return e;
  }

  /** Chữ ký của giỏ hàng (mã món, số lượng, giá bán): đổi bất kỳ thứ gì thì chữ ký đổi */
  function cartSignature(state) {
    var items = state && Array.isArray(state.items) ? state.items : [];
    return items.map(function (i) { return i.id + 'x' + i.qty + '@' + i.unitPrice; }).join('|');
  }

  /** Hướng dẫn thanh toán hiển thị sau khi đặt hàng thành công */
  function buildInstructions(order, config) {
    var cfg = config || Config;
    var method = order && order.payment ? order.payment.method : null;
    if (method === 'bank_transfer') {
      return {
        type: 'bank_transfer',
        isDemo: !!cfg.bank.isDemo,
        bankName: cfg.bank.bankName,
        accountNumber: cfg.bank.accountNumber,
        accountName: cfg.bank.accountName,
        amount: order.total,
        memo: order.code
      };
    }
    return { type: 'cod', amountDue: order.total };
  }

  /**
   * @param {Object} deps { getCartState, clearCart, placeOrder, config? }
   */
  function createPaymentService(deps) {
    deps = deps || {};
    ['getCartState', 'clearCart', 'placeOrder'].forEach(function (k) {
      if (typeof deps[k] !== 'function') throw new Error('[KFC Payment] Thiếu ' + k);
    });
    var config = deps.config || Config;
    var inFlight = false;

    /**
     * @param {{customer:Object, method:string, expectedSignature?:string}} input
     * @returns {Promise<{order:Object, instructions:Object, cartCleared:boolean}>}
     */
    async function submit(input) {
      input = input || {};
      if (inFlight) throw PaymentError('busy', 'Đơn hàng đang được xử lý, vui lòng đợi');

      var v = Validate.validateCustomer(input.customer);
      if (!v.ok) throw PaymentError('validation_failed', 'Thông tin giao hàng chưa hợp lệ', { errors: v.errors });
      if (!Validate.isValidMethod(input.method)) throw PaymentError('invalid_payment', 'Vui lòng chọn phương thức thanh toán');

      inFlight = true;
      try {
        var state = deps.getCartState();
        if (!state || !state.items || state.items.length === 0) throw PaymentError('empty_cart', 'Giỏ hàng đang trống');
        if (typeof input.expectedSignature === 'string' && input.expectedSignature !== cartSignature(state)) {
          throw PaymentError('cart_changed', 'Giỏ hàng đã thay đổi so với đơn bạn đang xem');
        }

        var order = await deps.placeOrder(state, { customer: v.value, payment: { method: input.method } });

        // Đã lưu xong mới xóa giỏ. Nếu xóa giỏ lỗi thì đơn vẫn hợp lệ.
        var cleared = true;
        try { deps.clearCart(); } catch (e) {
          cleared = false;
          console.error('[KFC Payment] Đã lưu đơn nhưng không xóa được giỏ hàng:', e);
        }
        return { order: order, instructions: buildInstructions(order, config), cartCleared: cleared };
      } finally {
        inFlight = false;
      }
    }

    return { submit: submit, isBusy: function () { return inFlight; } };
  }

  return {
    createPaymentService: createPaymentService,
    buildInstructions: buildInstructions,
    cartSignature: cartSignature,
    PaymentError: PaymentError
  };
});
