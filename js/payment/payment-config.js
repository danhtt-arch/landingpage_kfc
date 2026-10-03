/**
 * KFC Payment - Cấu hình các phương thức thanh toán.
 *
 * Đây là website demo/học tập, KHÔNG có cổng thanh toán và KHÔNG thu thập số thẻ.
 *  - cod:           thanh toán tiền mặt khi nhận hàng
 *  - bank_transfer: chuyển khoản; khách chuyển theo thông tin bên dưới, ghi mã đơn ở nội dung
 *
 * Khi triển khai thật: thay `bank` bằng tài khoản thật và đặt `isDemo: false`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KFCPaymentConfig = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  return {
    defaultMethod: 'cod',
    methods: [
      {
        id: 'cod',
        label: 'Thanh toán khi nhận hàng (COD)',
        description: 'Trả tiền mặt cho nhân viên giao hàng khi nhận món.'
      },
      {
        id: 'bank_transfer',
        label: 'Chuyển khoản ngân hàng',
        description: 'Chuyển khoản theo thông tin hiển thị sau khi đặt hàng, ghi đúng mã đơn ở nội dung chuyển khoản.'
      }
    ],
    bank: {
      isDemo: true,
      bankName: 'Ngân hàng DEMO',
      accountNumber: '0000000000',
      accountName: 'CONG TY KFC DEMO'
    }
  };
});
