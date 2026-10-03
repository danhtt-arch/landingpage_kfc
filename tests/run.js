/**
 * Chạy test bằng Node (không cần cài gì):  node tests/run.js
 * Test đơn hàng/thanh toán dùng SQLite thật (sql.js trong js/vendor).
 */
'use strict';
var path = require('path');
var js = function () { return path.join.apply(path, [__dirname, '..', 'js'].concat([].slice.call(arguments))); };
require('./harness.js');
globalThis.KFCPricing = require(js('pricing.js'));
globalThis.KFCCartStore = require(js('cart', 'cart-store.js'));
globalThis.KFCOrderStatus = require(js('orders', 'order-status.js'));
globalThis.KFCOrderService = require(js('orders', 'order-service.js'));
globalThis.KFCDbStorage = require(js('orders', 'db-storage.js'));
globalThis.KFCFileSync = require(js('orders', 'file-sync.js'));
globalThis.KFCPaymentValidate = require(js('payment', 'payment-validate.js'));
globalThis.KFCPaymentConfig = require(js('payment', 'payment-config.js'));
globalThis.KFCPaymentService = require(js('payment', 'payment-service.js'));
require('./pricing.test.js');
require('./cart-store.test.js');
require('./discount-store.test.js');
require('./csv-and-menu.test.js');
require('./order-service.test.js');
require('./order-db.test.js');
require('./payment-validate.test.js');
require('./payment-service.test.js');
require('./order-status.test.js');
require('./order-status-service.test.js');
require('./file-sync.test.js');

globalThis.__wait().then(function () {
  process.exit(globalThis.__report() ? 1 : 0);
});
