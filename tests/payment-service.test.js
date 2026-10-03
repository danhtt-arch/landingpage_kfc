/**
 * Test thanh toán: dịch vụ thanh toán + lưu thông tin khách vào orders.db bằng SQLite thật.
 * Cần global: test, group, assert, eq, rejects, KFCPricing, KFCCartStore, KFCOrderService,
 *             KFCPaymentValidate, KFCPaymentConfig, KFCPaymentService
 */
(function () {
  'use strict';
  var path = require('path');
  var initSqlJs = require(path.join(__dirname, '..', 'js', 'vendor', 'sql-wasm.js'));
  var OS = KFCOrderService;
  var PS = KFCPaymentService;

  var sqlPromise = initSqlJs({ locateFile: function (f) { return path.join(__dirname, '..', 'js', 'vendor', f); } });
  var loadSqlJs = function () { return sqlPromise; };
  var NOW = new Date(2026, 9, 3, 14, 30, 0);

  var CUSTOMER = { name: 'Nguyễn Văn An', phone: '0912 345 678', address: '12 Nguyễn Huệ, Quận 1, TP.HCM', note: 'Ít cay' };
  var CHICKEN = { id: '1', name: 'Gà Rán Giòn Cay', category: 'Gà rán', price: 45000, discount: 20 };
  var COMBO = { id: '3', name: 'Combo Gà Rán 1 Người', category: 'Combo', price: 95000, discount: 10 };

  function memStorage(initial) {
    var s = {
      bytes: initial || null, saves: 0, persistent: true, failSave: false,
      load: function () { return Promise.resolve(s.bytes ? new Uint8Array(s.bytes) : null); },
      save: function (b) { s.saves++; if (s.failSave) return Promise.reject(new Error('disk full')); s.bytes = new Uint8Array(b); return Promise.resolve(); }
    };
    return s;
  }

  /** Dựng toàn bộ: giỏ thật + order-service thật (SQLite) + payment-service */
  function setup(opts) {
    opts = opts || {};
    var storage = opts.storage || memStorage();
    var orders = OS.createOrderService({ loadSqlJs: loadSqlJs, storage: storage, now: function () { return NOW; } });
    var cart = KFCCartStore.createCartStore({ storage: { getItem: function () { return null; }, setItem: function () {} } });
    (opts.items || [[CHICKEN, 2], [COMBO, 1]]).forEach(function (p) { cart.add(p[0], p[1]); });
    var calls = { place: 0, clear: 0 };
    var svc = PS.createPaymentService({
      getCartState: cart.getState,
      clearCart: function () { calls.clear++; if (opts.clearThrows) throw new Error('clear failed'); cart.clear(); },
      placeOrder: function (state, meta) { calls.place++; return (opts.placeOrder || orders.placeOrder)(state, meta); }
    });
    return { storage: storage, orders: orders, cart: cart, svc: svc, calls: calls };
  }

  async function openBytes(bytes) { var SQL = await sqlPromise; return new SQL.Database(bytes); }
  function q(db, sql, params) {
    var r = db.exec(sql, params); if (!r.length) return [];
    return r[0].values.map(function (v) { var o = {}; r[0].columns.forEach(function (c, i) { o[c] = v[i]; }); return o; });
  }
  function submitInput(env, extra) {
    return Object.assign({ customer: CUSTOMER, method: 'cod', expectedSignature: PS.cartSignature(env.cart.getState()) }, extra || {});
  }

  // ======================================================================
  group('cấu hình thanh toán', function () {
    test('các phương thức trong cấu hình khớp danh sách hợp lệ và bảng trạng thái của order-service', function () {
      var ids = KFCPaymentConfig.methods.map(function (m) { return m.id; });
      eq(ids, KFCPaymentValidate.METHOD_IDS);
      eq(Object.keys(OS.PAYMENT_METHODS), ids);
      assert(ids.indexOf(KFCPaymentConfig.defaultMethod) !== -1, 'phương thức mặc định hợp lệ');
      KFCPaymentConfig.methods.forEach(function (m) { assert(m.label && m.description, m.id); });
    });
    test('thông tin ngân hàng mặc định được đánh dấu là demo', function () {
      eq(KFCPaymentConfig.bank.isDemo, true);
      assert(KFCPaymentConfig.bank.accountNumber && KFCPaymentConfig.bank.accountName && KFCPaymentConfig.bank.bankName);
    });
  });

  group('cartSignature', function () {
    test('đổi mã món, số lượng hoặc giá bán thì chữ ký đổi', function () {
      var a = PS.cartSignature({ items: [{ id: '1', qty: 2, unitPrice: 36000 }] });
      assert(a !== PS.cartSignature({ items: [{ id: '2', qty: 2, unitPrice: 36000 }] }));
      assert(a !== PS.cartSignature({ items: [{ id: '1', qty: 3, unitPrice: 36000 }] }));
      assert(a !== PS.cartSignature({ items: [{ id: '1', qty: 2, unitPrice: 40000 }] }));
      eq(a, PS.cartSignature({ items: [{ id: '1', qty: 2, unitPrice: 36000 }] }));
    });
    test('giỏ rỗng/null không crash', function () {
      eq(PS.cartSignature(null), ''); eq(PS.cartSignature({}), ''); eq(PS.cartSignature({ items: [] }), '');
    });
  });

  group('buildInstructions', function () {
    test('COD: số tiền phải trả khi nhận hàng', function () {
      eq(PS.buildInstructions({ payment: { method: 'cod' }, total: 157500, code: 'KFC-1' }), { type: 'cod', amountDue: 157500 });
    });
    test('chuyển khoản: tài khoản, số tiền, nội dung = mã đơn, cờ demo', function () {
      var r = PS.buildInstructions({ payment: { method: 'bank_transfer' }, total: 157500, code: 'KFC-20261003-0001' });
      eq(r.type, 'bank_transfer'); eq(r.amount, 157500); eq(r.memo, 'KFC-20261003-0001');
      eq(r.accountNumber, KFCPaymentConfig.bank.accountNumber); eq(r.isDemo, true);
    });
    test('đơn không có thông tin thanh toán -> coi như COD', function () {
      eq(PS.buildInstructions({ payment: null, total: 5, code: 'x' }).type, 'cod');
    });
  });

  // ======================================================================
  group('submit: thành công', function () {
    test('lưu đơn kèm thông tin khách và phương thức vào SQLite, rồi xóa giỏ', async function () {
      var env = setup();
      var r = await env.svc.submit(submitInput(env));
      eq(r.order.code, 'KFC-20261003-0001'); eq(r.cartCleared, true);
      eq(env.cart.getItems().length, 0, 'giỏ phải được xóa');
      eq(env.calls.clear, 1);
      var db = await openBytes(env.storage.bytes);
      var o = q(db, 'SELECT * FROM orders')[0];
      eq([o.customer_name, o.customer_phone, o.customer_address, o.customer_note, o.payment_method, o.payment_status],
        ['Nguyễn Văn An', '0912345678', '12 Nguyễn Huệ, Quận 1, TP.HCM', 'Ít cay', 'cod', 'unpaid']);
      eq([o.total_qty, o.subtotal, o.discount_total, o.total], [3, 185000, 27500, 157500]);
      eq(q(db, 'SELECT COUNT(*) AS n FROM order_items')[0].n, 2);
      db.close();
    });
    test('thông tin khách được chuẩn hóa trước khi lưu (số điện thoại +84, khoảng trắng, xuống dòng)', async function () {
      var env = setup();
      await env.svc.submit({ customer: { name: '  Trần   Thị  Bích ', phone: '+84 912.345.678', address: '5 Lê Lợi,\nQuận 1', note: '  a  ' }, method: 'cod' });
      var db = await openBytes(env.storage.bytes); var o = q(db, 'SELECT * FROM orders')[0];
      eq([o.customer_name, o.customer_phone, o.customer_address, o.customer_note], ['Trần Thị Bích', '0912345678', '5 Lê Lợi, Quận 1', 'a']);
      db.close();
    });
    test('chuyển khoản: payment_status = awaiting_transfer và có hướng dẫn chuyển khoản với nội dung = mã đơn', async function () {
      var env = setup();
      var r = await env.svc.submit(submitInput(env, { method: 'bank_transfer' }));
      eq(r.order.payment, { method: 'bank_transfer', status: 'awaiting_transfer' });
      eq(r.instructions.type, 'bank_transfer'); eq(r.instructions.memo, r.order.code); eq(r.instructions.amount, 157500);
      var db = await openBytes(env.storage.bytes);
      eq(q(db, 'SELECT payment_method, payment_status FROM orders')[0], { payment_method: 'bank_transfer', payment_status: 'awaiting_transfer' });
      db.close();
    });
    test('COD: hướng dẫn là số tiền phải trả khi nhận', async function () {
      var env = setup();
      var r = await env.svc.submit(submitInput(env));
      eq(r.instructions, { type: 'cod', amountDue: 157500 });
    });
    test('ghi chú rỗng được lưu là chuỗi rỗng (không phải NULL)', async function () {
      var env = setup();
      await env.svc.submit({ customer: Object.assign({}, CUSTOMER, { note: '' }), method: 'cod' });
      var db = await openBytes(env.storage.bytes);
      eq(q(db, 'SELECT customer_note AS n FROM orders')[0].n, ''); db.close();
    });
    test('không truyền expectedSignature vẫn đặt được (dùng cho module khác gọi trực tiếp)', async function () {
      var env = setup();
      eq((await env.svc.submit({ customer: CUSTOMER, method: 'cod' })).order.id, 1);
    });
    test('hai đơn liên tiếp: mã -0001 và -0002, mỗi đơn đúng khách của mình', async function () {
      var env = setup();
      await env.svc.submit(submitInput(env));
      env.cart.add(COMBO, 2);
      var r2 = await env.svc.submit({ customer: Object.assign({}, CUSTOMER, { name: 'Lê Hoàng' }), method: 'bank_transfer' });
      eq(r2.order.code, 'KFC-20261003-0002');
      var list = await env.orders.listOrders();
      eq(list.map(function (o) { return [o.order_code, o.customer_name, o.payment_method]; }),
        [['KFC-20261003-0002', 'Lê Hoàng', 'bank_transfer'], ['KFC-20261003-0001', 'Nguyễn Văn An', 'cod']]);
    });
    test('đơn đã lưu và giỏ đã xóa dù hàm xóa giỏ lỗi (cartCleared=false)', async function () {
      var env = setup({ clearThrows: true });
      var orig = console.error; console.error = function () {};
      var r; try { r = await env.svc.submit(submitInput(env)); } finally { console.error = orig; }
      eq(r.cartCleared, false); eq((await env.orders.listOrders()).length, 1);
    });
    test('SQL injection / HTML trong địa chỉ và ghi chú chỉ được lưu như chữ', async function () {
      var env = setup();
      var evil = "12 Lê Lợi'); DROP TABLE orders;-- <script>alert(1)</script>";
      await env.svc.submit({ customer: Object.assign({}, CUSTOMER, { address: evil, note: "'; DELETE FROM order_items;--" }), method: 'cod' });
      var db = await openBytes(env.storage.bytes);
      eq(q(db, 'SELECT customer_address AS a, customer_note AS n FROM orders')[0], { a: evil, n: "'; DELETE FROM order_items;--" });
      eq(q(db, 'SELECT COUNT(*) AS n FROM order_items')[0].n, 2); db.close();
    });
  });

  // ======================================================================
  group('submit: từ chối và lỗi (giỏ và dữ liệu cũ luôn nguyên vẹn)', function () {
    test('thông tin khách sai -> validation_failed kèm lỗi từng trường; không đụng giỏ/DB', async function () {
      var env = setup();
      var e = await rejects(env.svc.submit({ customer: { name: '', phone: '123', address: 'x', note: '' }, method: 'cod' }), 'validation_failed');
      eq(Object.keys(e.details.errors).sort(), ['address', 'name', 'phone']);
      eq([env.calls.place, env.calls.clear, env.storage.saves], [0, 0, 0]);
      eq(env.cart.getItems().length, 2);
    });
    test('phương thức thanh toán sai -> invalid_payment', async function () {
      var env = setup();
      for (var m of [undefined, '', 'card', 'COD', 'momo', null, '__proto__']) {
        await rejects(env.svc.submit({ customer: CUSTOMER, method: m }), 'invalid_payment');
      }
      eq(env.calls.place, 0);
    });
    test('giỏ trống -> empty_cart', async function () {
      var env = setup({ items: [] });
      await rejects(env.svc.submit({ customer: CUSTOMER, method: 'cod' }), 'empty_cart');
      eq(env.calls.place, 0);
    });
    test('giỏ đã thay đổi sau khi khách xem tổng tiền -> cart_changed, không đặt đơn, giỏ giữ nguyên', async function () {
      var env = setup();
      var input = submitInput(env);
      env.cart.add(COMBO, 1); // tab khác thêm món
      await rejects(env.svc.submit(input), 'cart_changed');
      eq([env.calls.place, env.storage.saves], [0, 0]);
      eq(env.cart.getItems().length, 2);
      // xem lại (chữ ký mới) rồi đặt được
      eq((await env.svc.submit(submitInput(env))).order.totalQty, 4);
    });
    test('đổi số lượng, đổi giá do menu cập nhật cũng bị phát hiện', async function () {
      var env = setup(); var input = submitInput(env);
      env.cart.setQty('1', 5);
      await rejects(env.svc.submit(input), 'cart_changed');
      input = submitInput(env);
      env.cart.reconcile([{ id: '1', name: CHICKEN.name, price: 45000, discount: 10 }, COMBO]);
      await rejects(env.svc.submit(input), 'cart_changed');
    });
    test('lưu SQLite thất bại: giữ nguyên giỏ, ném lỗi gốc, thử lại được', async function () {
      var env = setup(); env.storage.failSave = true;
      await rejects(env.svc.submit(submitInput(env)), 'storage_save_failed');
      eq(env.calls.clear, 0, 'không được xóa giỏ'); eq(env.cart.getItems().length, 2);
      env.storage.failSave = false;
      eq((await env.svc.submit(submitInput(env))).order.code, 'KFC-20261003-0001', 'đơn lỗi không chiếm mã');
    });
    test('orders.db đã lưu bị hỏng -> db_corrupt, không ghi đè, giỏ giữ nguyên', async function () {
      var garbage = new Uint8Array(4096); for (var i = 0; i < garbage.length; i++) garbage[i] = (i * 13 + 5) & 255;
      var env = setup({ storage: memStorage(garbage) });
      await rejects(env.svc.submit(submitInput(env)), 'db_corrupt');
      eq(env.storage.saves, 0); eq(env.cart.getItems().length, 2);
    });
    test('bấm xác nhận nhiều lần cùng lúc: chỉ một đơn, các lần còn lại bị từ chối busy', async function () {
      var env = setup();
      var results = await Promise.all([1, 2, 3, 4].map(function () {
        return env.svc.submit(submitInput(env)).then(function () { return 'ok'; }, function (e) { return e.code; });
      }));
      eq(results.filter(function (r) { return r === 'ok'; }).length, 1);
      eq(results.filter(function (r) { return r === 'busy'; }).length, 3);
      eq((await env.orders.listOrders()).length, 1); eq(env.calls.clear, 1);
    });
    test('sau khi lỗi, service không bị kẹt ở trạng thái đang xử lý', async function () {
      var env = setup(); env.storage.failSave = true;
      await rejects(env.svc.submit(submitInput(env)), 'storage_save_failed');
      eq(env.svc.isBusy(), false);
      await rejects(env.svc.submit({ customer: {}, method: 'cod' }), 'validation_failed');
      eq(env.svc.isBusy(), false);
    });
    test('thiếu hàm phụ thuộc khi khởi tạo -> ném lỗi', function () {
      var n = 0;
      ['getCartState', 'clearCart', 'placeOrder'].forEach(function (k) {
        var deps = { getCartState: function () {}, clearCart: function () {}, placeOrder: function () {} }; delete deps[k];
        try { PS.createPaymentService(deps); } catch (e) { n++; }
      });
      eq(n, 3);
    });
  });

  // ======================================================================
  group('order-service: thông tin khách + thanh toán', function () {
    var cartState = function () { var c = KFCCartStore.createCartStore({ storage: { getItem: function () { return null; }, setItem: function () {} } }); c.add(CHICKEN, 1); return c.getState(); };
    function svcOf(st) { return OS.createOrderService({ loadSqlJs: loadSqlJs, storage: st || memStorage(), now: function () { return NOW; } }); }
    var META = { customer: { name: 'An', phone: '0912345678', address: '12 Lê Lợi Q1', note: '' }, payment: { method: 'cod' } };
    function bad(mutate, code) {
      return async function () {
        var m = JSON.parse(JSON.stringify(META)); mutate(m);
        var st = memStorage();
        await rejects(svcOf(st).placeOrder(cartState(), m), code);
        eq(st.saves, 0, 'không được ghi gì');
      };
    }

    test('không truyền meta: đơn kiểu module 1, các cột khách/thanh toán là NULL', async function () {
      var st = memStorage(); var r = await svcOf(st).placeOrder(cartState());
      eq([r.customer, r.payment], [null, null]);
      var db = await openBytes(st.bytes); var o = q(db, 'SELECT * FROM orders')[0];
      eq([o.customer_name, o.payment_method, o.payment_status], [null, null, null]); db.close();
    });
    test('thiếu customer -> invalid_customer', bad(function (m) { delete m.customer; }, 'invalid_customer'));
    test('customer.name rỗng -> invalid_customer', bad(function (m) { m.customer.name = '  '; }, 'invalid_customer'));
    test('customer.phone không phải chuỗi -> invalid_customer', bad(function (m) { m.customer.phone = 912345678; }, 'invalid_customer'));
    test('customer.address quá dài -> invalid_customer', bad(function (m) { m.customer.address = new Array(302).join('a'); }, 'invalid_customer'));
    test('customer.note quá dài -> invalid_customer', bad(function (m) { m.customer.note = new Array(302).join('a'); }, 'invalid_customer'));
    test('thiếu payment -> invalid_payment', bad(function (m) { delete m.payment; }, 'invalid_payment'));
    test('payment.method lạ -> invalid_payment', bad(function (m) { m.payment.method = 'card'; }, 'invalid_payment'));
    test('payment.method kiểu "__proto__"/"constructor" -> invalid_payment', async function () {
      for (var name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
        var m = JSON.parse(JSON.stringify(META)); m.payment.method = name;
        await rejects(svcOf().placeOrder(cartState(), m), 'invalid_payment');
      }
    });
    test('lỗi meta được báo trước khi đọc/ghi storage', async function () {
      var st = memStorage(); var loads = 0; var orig = st.load; st.load = function () { loads++; return orig(); };
      var m = JSON.parse(JSON.stringify(META)); m.payment.method = 'x';
      await rejects(svcOf(st).placeOrder(cartState(), m), 'invalid_payment');
      eq(loads, 0);
    });
    test('kết quả trả về có customer và payment đã chuẩn hóa', async function () {
      var r = await svcOf().placeOrder(cartState(), META);
      eq(r.customer, META.customer); eq(r.payment, { method: 'cod', status: 'unpaid' });
    });
  });

  // ======================================================================
  group('nâng cấp orders.db từ module Giỏ hàng (migration)', function () {
    /** orders.db đúng như module 1 tạo ra (chưa có cột khách/thanh toán) + 1 đơn cũ */
    async function legacyDb() {
      var SQL = await sqlPromise; var d = new SQL.Database();
      OS.SCHEMA_STATEMENTS.forEach(function (s) { d.run(s); });
      d.run("INSERT INTO orders (order_code, created_at, total_qty, subtotal, discount_total, total) VALUES ('KFC-20261002-0001','2026-10-02T03:00:00.000Z',1,45000,0,45000)");
      d.run("INSERT INTO order_items (order_id, product_id, product_name, category, original_price, discount_percent, unit_price, quantity, line_total) VALUES (1,'2','Gà Truyền Thống','Gà rán',45000,0,45000,1,45000)");
      var b = d.export(); d.close(); return b;
    }
    test('DB cũ không có cột mới: tự thêm cột, đơn cũ còn nguyên với NULL, đơn mới có đủ dữ liệu', async function () {
      var env = setup({ storage: memStorage(await legacyDb()) });
      await env.svc.submit(submitInput(env, { method: 'bank_transfer' }));
      var db = await openBytes(env.storage.bytes);
      var rows = q(db, 'SELECT order_code, total, customer_name, payment_method, payment_status FROM orders ORDER BY id');
      eq(rows, [
        { order_code: 'KFC-20261002-0001', total: 45000, customer_name: null, payment_method: null, payment_status: null },
        { order_code: 'KFC-20261003-0001', total: 157500, customer_name: 'Nguyễn Văn An', payment_method: 'bank_transfer', payment_status: 'awaiting_transfer' }
      ]);
      eq(q(db, 'SELECT COUNT(*) AS n FROM order_items')[0].n, 3, 'dòng hàng của đơn cũ không bị mất');
      db.close();
    });
    test('migration chạy lặp lại không lỗi và không nhân đôi cột', async function () {
      var env = setup({ storage: memStorage(await legacyDb()) });
      await env.svc.submit(submitInput(env));
      env.cart.add(COMBO, 1);
      await env.svc.submit(submitInput(env));
      var db = await openBytes(env.storage.bytes);
      var cols = q(db, 'PRAGMA table_info(orders)').map(function (c) { return c.name; });
      eq(cols.length, 17); eq(new Set(cols).size, 17);
      eq(q(db, 'SELECT COUNT(*) AS n FROM orders')[0].n, 3); db.close();
    });
    test('chỉ đọc (listOrders) trên DB cũ vẫn chạy, không ghi vào tệp', async function () {
      var st = memStorage(await legacyDb()); var before = Array.prototype.slice.call(st.bytes);
      var list = await OS.createOrderService({ loadSqlJs: loadSqlJs, storage: st }).listOrders();
      eq(list.length, 1); eq(list[0].customer_name, null);
      eq(Array.prototype.slice.call(st.bytes), before); eq(st.saves, 0);
    });
    test('xuất tệp từ DB cũ có đủ cột mới (để module khác đọc)', async function () {
      var st = memStorage(await legacyDb());
      var db = await openBytes(await OS.createOrderService({ loadSqlJs: loadSqlJs, storage: st }).exportDb());
      assert(q(db, 'PRAGMA table_info(orders)').some(function (c) { return c.name === 'payment_status'; })); db.close();
    });
    test('đơn thanh toán ghi lỗi giữa chừng (ROLLBACK): DB cũ không đổi một byte', async function () {
      var SQL = await sqlPromise; var d = await openBytes(await legacyDb());
      d.run("CREATE TRIGGER block BEFORE INSERT ON order_items WHEN NEW.product_id = '1' BEGIN SELECT RAISE(ABORT,'blocked'); END");
      var bytes = d.export(); d.close();
      var env = setup({ storage: memStorage(bytes) }); var before = Array.prototype.slice.call(env.storage.bytes);
      await rejects(env.svc.submit(submitInput(env)), 'db_write_failed');
      eq(Array.prototype.slice.call(env.storage.bytes), before); eq(env.cart.getItems().length, 2);
    });
    test('toàn vẹn: orders.total = tổng line_total cho cả đơn cũ và đơn thanh toán', async function () {
      var env = setup({ storage: memStorage(await legacyDb()) });
      await env.svc.submit(submitInput(env));
      var db = await openBytes(env.storage.bytes);
      eq(q(db, 'SELECT o.id FROM orders o WHERE o.total != (SELECT SUM(line_total) FROM order_items WHERE order_id = o.id)'), []);
      db.close();
    });
  });
})();
