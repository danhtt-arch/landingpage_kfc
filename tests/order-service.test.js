/**
 * Test lưu đơn hàng vào SQLite (orders.db) bằng SQLite thật (sql.js).
 * Cần global: test, group, assert, eq, rejects, KFCPricing, KFCCartStore, KFCOrderService, KFCDbStorage
 */
(function () {
  'use strict';
  var path = require('path');
  var initSqlJs = require(path.join(__dirname, '..', 'js', 'vendor', 'sql-wasm.js'));
  var OS = KFCOrderService;
  var Pricing = KFCPricing;

  var sqlPromise = initSqlJs({ locateFile: function (f) { return path.join(__dirname, '..', 'js', 'vendor', f); } });
  var loadSqlJs = function () { return sqlPromise; };

  var FIXED_NOW = new Date(2026, 9, 3, 14, 30, 0); // 03/10/2026 14:30 giờ địa phương

  // ---------- Tiện ích ----------
  function memStorage(initialBytes) {
    var s = {
      bytes: initialBytes || null, loads: 0, saves: 0, persistent: true,
      failLoad: false, failSave: false,
      load: function () { s.loads++; if (s.failLoad) return Promise.reject(new Error('disk read error')); return Promise.resolve(s.bytes ? new Uint8Array(s.bytes) : null); },
      save: function (b) { s.saves++; if (s.failSave) return Promise.reject(new Error('disk full')); s.bytes = new Uint8Array(b); return Promise.resolve(); }
    };
    return s;
  }

  function makeService(storage, opts) {
    opts = opts || {};
    return OS.createOrderService({
      loadSqlJs: opts.loadSqlJs || loadSqlJs,
      storage: storage,
      now: opts.now || function () { return FIXED_NOW; },
      lock: opts.lock
    });
  }

  /** Giỏ hàng thật (KFCCartStore) -> cartState đúng như UI sẽ gửi */
  function cartOf(list) {
    var st = { getItem: function () { return null; }, setItem: function () {} };
    var c = KFCCartStore.createCartStore({ storage: st });
    list.forEach(function (p) { c.add(p[0], p[1] || 1); });
    return c.getState();
  }

  var CHICKEN = { id: '1', name: 'Gà Rán Giòn Cay', category: 'Gà rán', price: 45000, discount: 20 };
  var COMBO = { id: '3', name: 'Combo Gà Rán 1 Người', category: 'Combo', price: 95000, discount: 10 };
  var PEPSI = { id: '9', name: 'Pepsi Tươi Cold', category: 'Đồ uống', price: 19000 };

  /** Mở bytes như một DB độc lập để kiểm tra nội dung thật sự được lưu */
  async function openBytes(bytes) {
    var SQL = await sqlPromise;
    return new SQL.Database(bytes);
  }
  function q(db, sql, params) {
    var r = db.exec(sql, params);
    if (!r.length) return [];
    var cols = r[0].columns;
    return r[0].values.map(function (v) { var o = {}; cols.forEach(function (c, i) { o[c] = v[i]; }); return o; });
  }
  function scalar(db, sql, params) { var r = db.exec(sql, params); return r.length ? r[0].values[0][0] : null; }

  function cloneState(s) { return JSON.parse(JSON.stringify(s)); }

  // ======================================================================
  group('buildOrder (kiểm tra + tính lại tiền, chưa chạm DB)', function () {
    test('giỏ rỗng / null / không phải mảng -> empty_cart', function () {
      [null, undefined, {}, { items: [] }, { items: 'x' }, 5].forEach(function (s) {
        try { OS.buildOrder(s, FIXED_NOW); throw new Error('phải ném lỗi'); } catch (e) { eq(e.code, 'empty_cart'); }
      });
    });
    test('tính tiền từ từng dòng: subtotal, discountTotal, total, totalQty', function () {
      var o = OS.buildOrder(cartOf([[CHICKEN, 2], [COMBO, 1], [PEPSI, 3]]), FIXED_NOW);
      eq(o.subtotal, 2 * 45000 + 95000 + 3 * 19000);
      eq(o.total, 2 * 36000 + 85500 + 3 * 19000);
      eq(o.discountTotal, o.subtotal - o.total);
      eq(o.totalQty, 6);
      eq(o.items.length, 3);
    });
    test('mỗi dòng có đủ trường và lineTotal = unitPrice × quantity', function () {
      var o = OS.buildOrder(cartOf([[CHICKEN, 3]]), FIXED_NOW);
      eq(o.items[0], { productId: '1', productName: 'Gà Rán Giòn Cay', category: 'Gà rán', originalPrice: 45000, discountPercent: 20, unitPrice: 36000, quantity: 3, lineTotal: 108000 });
    });
    test('không tin unitPrice do bên ngoài đưa vào: luôn tính lại', function () {
      var s = cloneState(cartOf([[CHICKEN, 2]]));
      s.items[0].unitPrice = 1; delete s.totals;
      eq(OS.buildOrder(s, FIXED_NOW).total, 72000);
    });
    test('totals bị sửa (total/subtotal/totalQty) -> total_mismatch', function () {
      ['total', 'subtotal', 'totalQty'].forEach(function (k) {
        var s = cloneState(cartOf([[CHICKEN, 2]])); s.totals[k] += 1;
        try { OS.buildOrder(s, FIXED_NOW); throw new Error('phải ném lỗi ' + k); } catch (e) { eq(e.code, 'total_mismatch', k); }
      });
    });
    test('không có totals thì vẫn tính được', function () {
      var s = cloneState(cartOf([[PEPSI, 2]])); delete s.totals;
      eq(OS.buildOrder(s, FIXED_NOW).total, 38000);
    });
    test('dòng sai: thiếu id, tên rỗng -> invalid_item', function () {
      [{ name: 'A', price: 1, qty: 1 }, { id: '  ', name: 'A', price: 1, qty: 1 }, { id: '1', name: '  ', price: 1, qty: 1 }, { id: '1', price: 1, qty: 1 }, null].forEach(function (it) {
        try { OS.buildOrder({ items: [it] }, FIXED_NOW); throw new Error('phải ném lỗi'); } catch (e) { eq(e.code, 'invalid_item', JSON.stringify(it)); }
      });
    });
    test('giá sai: âm, NaN, Infinity, chuỗi, số thập phân -> invalid_item', function () {
      [-1, NaN, Infinity, '45000', 45000.5, null].forEach(function (p) {
        try { OS.buildOrder({ items: [{ id: '1', name: 'A', price: p, qty: 1 }] }, FIXED_NOW); throw new Error('phải ném lỗi'); } catch (e) { eq(e.code, 'invalid_item', String(p)); }
      });
    });
    test('số lượng sai: 0, âm, 100, thập phân, chuỗi -> invalid_item', function () {
      [0, -1, 100, 1.5, '2', NaN, null].forEach(function (n) {
        try { OS.buildOrder({ items: [{ id: '1', name: 'A', price: 1000, qty: n }] }, FIXED_NOW); throw new Error('phải ném lỗi'); } catch (e) { eq(e.code, 'invalid_item', String(n)); }
      });
    });
    test('số lượng biên 1 và 99 hợp lệ', function () {
      eq(OS.buildOrder({ items: [{ id: '1', name: 'A', price: 1000, qty: 1 }, { id: '2', name: 'B', price: 1000, qty: 99 }] }, FIXED_NOW).totalQty, 100);
    });
    test('trùng mã món -> duplicate_item', function () {
      try { OS.buildOrder({ items: [{ id: 1, name: 'A', price: 1, qty: 1 }, { id: '1', name: 'A', price: 1, qty: 1 }] }, FIXED_NOW); throw new Error('phải ném lỗi'); } catch (e) { eq(e.code, 'duplicate_item'); }
    });
    test('discount sai được chuẩn hóa (999 -> 100%, -5 -> 0%, "abc" -> 0%)', function () {
      var o = OS.buildOrder({ items: [
        { id: 'a', name: 'A', price: 1000, qty: 1, discount: 999 },
        { id: 'b', name: 'B', price: 1000, qty: 1, discount: -5 },
        { id: 'c', name: 'C', price: 1000, qty: 1, discount: 'abc' }
      ] }, FIXED_NOW);
      eq(o.items.map(function (i) { return i.discountPercent; }), [100, 0, 0]);
      eq(o.items.map(function (i) { return i.unitPrice; }), [0, 1000, 1000]);
    });
    test('tổng vượt giới hạn số nguyên an toàn -> invalid_item', function () {
      try { OS.buildOrder({ items: [{ id: '1', name: 'A', price: Number.MAX_SAFE_INTEGER, qty: 99 }] }, FIXED_NOW); throw new Error('phải ném lỗi'); } catch (e) { eq(e.code, 'invalid_item'); }
    });
    test('createdAt là ISO 8601 UTC; dateKey theo giờ địa phương', function () {
      var o = OS.buildOrder(cartOf([[PEPSI]]), FIXED_NOW);
      eq(o.createdAt, FIXED_NOW.toISOString());
      eq(o.dateKey, '20261003');
    });
    test('ngày tháng một chữ số được đệm 0', function () {
      eq(OS.buildOrder(cartOf([[PEPSI]]), new Date(2026, 0, 5)).dateKey, '20260105');
    });
    test('category thiếu -> chuỗi rỗng; tên giữ nguyên văn', function () {
      var o = OS.buildOrder({ items: [{ id: '1', name: ' A  ', price: 1000, qty: 1 }] }, FIXED_NOW);
      eq(o.items[0].category, ''); eq(o.items[0].productName, ' A  ');
    });
    test('không làm thay đổi dữ liệu giỏ hàng truyền vào', function () {
      var s = cartOf([[CHICKEN, 2]]); var before = JSON.stringify(s);
      OS.buildOrder(s, FIXED_NOW);
      eq(JSON.stringify(s), before);
    });
  });

  // ======================================================================
  group('cấu trúc orders.db', function () {
    test('có đúng các bảng orders, order_items (+ order_status_history của module 3) và index, đủ cột', async function () {
      var st = memStorage(); var svc = makeService(st);
      await svc.placeOrder(cartOf([[CHICKEN]]));
      var db = await openBytes(st.bytes);
      var tables = q(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(function (r) { return r.name; });
      eq(tables, ['order_items', 'order_status_history', 'orders']);
      eq(q(db, 'PRAGMA table_info(orders)').map(function (c) { return c.name; }), ['id', 'order_code', 'created_at', 'total_qty', 'subtotal', 'discount_total', 'total',
        'customer_name', 'customer_phone', 'customer_address', 'customer_note', 'payment_method', 'payment_status', 'status', 'cancel_reason', 'status_updated_at']);
      eq(q(db, 'PRAGMA table_info(order_items)').map(function (c) { return c.name; }), ['id', 'order_id', 'product_id', 'product_name', 'category', 'original_price', 'discount_percent', 'unit_price', 'quantity', 'line_total']);
      eq(q(db, "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_order_items_order_id'").length, 1);
      db.close();
    });
    test('order_items có khóa ngoại tới orders(id) ON DELETE CASCADE', async function () {
      var st = memStorage(); await makeService(st).placeOrder(cartOf([[CHICKEN]]));
      var db = await openBytes(st.bytes);
      var fk = q(db, 'PRAGMA foreign_key_list(order_items)')[0];
      eq([fk.table, fk.from, fk.to, fk.on_delete], ['orders', 'order_id', 'id', 'CASCADE']);
      db.close();
    });
    test('tệp xuất ra bắt đầu bằng "SQLite format 3" (là file SQLite hợp lệ)', async function () {
      var st = memStorage(); var svc = makeService(st);
      await svc.placeOrder(cartOf([[CHICKEN]]));
      var head = String.fromCharCode.apply(null, Array.prototype.slice.call(st.bytes, 0, 15));
      eq(head, 'SQLite format 3');
    });
    test('ràng buộc CHECK chặn dữ liệu sai ngay ở DB (giá âm, số lượng 0, giảm > 100)', async function () {
      var st = memStorage(); await makeService(st).placeOrder(cartOf([[CHICKEN]]));
      var db = await openBytes(st.bytes); db.run('PRAGMA foreign_keys = ON');
      var bad = [
        "INSERT INTO orders (order_code, created_at, total_qty, subtotal, discount_total, total) VALUES ('X1','t',1,-1,0,0)",
        "INSERT INTO orders (order_code, created_at, total_qty, subtotal, discount_total, total) VALUES ('X2','t',0,1,0,1)",
        "INSERT INTO order_items (order_id, product_id, product_name, original_price, discount_percent, unit_price, quantity, line_total) VALUES (1,'a','a',1,101,1,1,1)",
        "INSERT INTO order_items (order_id, product_id, product_name, original_price, discount_percent, unit_price, quantity, line_total) VALUES (1,'a','a',1,0,1,0,0)",
        "INSERT INTO order_items (order_id, product_id, product_name, original_price, discount_percent, unit_price, quantity, line_total) VALUES (999,'a','a',1,0,1,1,1)"
      ];
      bad.forEach(function (sql) {
        var threw = false; try { db.run(sql); } catch (e) { threw = true; }
        assert(threw, 'DB phải từ chối: ' + sql);
      });
      db.close();
    });
    test('xóa đơn thì các dòng hàng bị xóa theo (cascade)', async function () {
      var st = memStorage(); await makeService(st).placeOrder(cartOf([[CHICKEN, 1], [COMBO, 2]]));
      var db = await openBytes(st.bytes); db.run('PRAGMA foreign_keys = ON');
      eq(scalar(db, 'SELECT COUNT(*) FROM order_items'), 2);
      db.run('DELETE FROM orders WHERE id = 1');
      eq(scalar(db, 'SELECT COUNT(*) FROM order_items'), 0);
      db.close();
    });
  });

  // ======================================================================
  group('placeOrder (ghi SQLite)', function () {
    test('trả về mã đơn KFC-YYYYMMDD-0001, id, thời gian, tổng tiền, items', async function () {
      var st = memStorage();
      var r = await makeService(st).placeOrder(cartOf([[CHICKEN, 2], [COMBO]]));
      eq(r.code, 'KFC-20261003-0001'); eq(r.id, 1);
      eq(r.createdAt, FIXED_NOW.toISOString());
      eq(r.totalQty, 3); eq(r.subtotal, 185000); eq(r.discountTotal, 27500); eq(r.total, 157500);
      eq(r.items.length, 2); eq(r.persistent, true);
    });
    test('dữ liệu thật sự nằm trong tệp: orders và order_items khớp giỏ hàng', async function () {
      var st = memStorage();
      await makeService(st).placeOrder(cartOf([[CHICKEN, 2], [COMBO, 1], [PEPSI, 3]]));
      var db = await openBytes(st.bytes);
      var o = q(db, 'SELECT * FROM orders')[0];
      eq([o.id, o.order_code, o.created_at, o.total_qty, o.subtotal, o.discount_total, o.total],
        [1, 'KFC-20261003-0001', FIXED_NOW.toISOString(), 6, 2 * 45000 + 95000 + 3 * 19000, 2 * 9000 + 9500, 2 * 36000 + 85500 + 3 * 19000]);
      var items = q(db, 'SELECT * FROM order_items ORDER BY id');
      eq(items.length, 3);
      eq(items.map(function (i) { return [i.order_id, i.product_id, i.product_name, i.category, i.original_price, i.discount_percent, i.unit_price, i.quantity, i.line_total]; }), [
        [1, '1', 'Gà Rán Giòn Cay', 'Gà rán', 45000, 20, 36000, 2, 72000],
        [1, '3', 'Combo Gà Rán 1 Người', 'Combo', 95000, 10, 85500, 1, 85500],
        [1, '9', 'Pepsi Tươi Cold', 'Đồ uống', 19000, 0, 19000, 3, 57000]
      ]);
      db.close();
    });
    test('đơn thứ 2 cùng ngày: mã -0002 và các đơn cộng dồn trong cùng tệp', async function () {
      var st = memStorage(); var svc = makeService(st);
      var a = await svc.placeOrder(cartOf([[CHICKEN]]));
      var b = await svc.placeOrder(cartOf([[PEPSI, 2]]));
      eq([a.code, b.code, b.id], ['KFC-20261003-0001', 'KFC-20261003-0002', 2]);
      var db = await openBytes(st.bytes);
      eq(scalar(db, 'SELECT COUNT(*) FROM orders'), 2);
      eq(scalar(db, 'SELECT COUNT(*) FROM order_items WHERE order_id = 2'), 1);
      db.close();
    });
    test('sang ngày khác: số thứ tự đếm lại từ 0001', async function () {
      var st = memStorage(); var day = new Date(2026, 9, 3, 9, 0, 0);
      var svc = makeService(st, { now: function () { return day; } });
      await svc.placeOrder(cartOf([[CHICKEN]])); await svc.placeOrder(cartOf([[CHICKEN]]));
      day = new Date(2026, 9, 4, 9, 0, 0);
      var r = await svc.placeOrder(cartOf([[CHICKEN]]));
      eq(r.code, 'KFC-20261004-0001');
    });
    test('số thứ tự tiếp tục từ lớn nhất, không đụng mã cũ dù có đơn bị xóa', async function () {
      var st = memStorage(); var svc = makeService(st);
      await svc.placeOrder(cartOf([[CHICKEN]])); await svc.placeOrder(cartOf([[CHICKEN]]));
      var db = await openBytes(st.bytes); db.run('DELETE FROM orders WHERE id = 1'); st.bytes = db.export(); db.close();
      var r = await svc.placeOrder(cartOf([[CHICKEN]]));
      eq(r.code, 'KFC-20261003-0003');
    });
    test('số thứ tự quá 9999 vẫn hợp lệ và duy nhất (0000 -> 10000)', async function () {
      var st = memStorage(); var svc = makeService(st);
      await svc.placeOrder(cartOf([[CHICKEN]]));
      var db = await openBytes(st.bytes); db.run("UPDATE orders SET order_code = 'KFC-20261003-9999'"); st.bytes = db.export(); db.close();
      eq((await svc.placeOrder(cartOf([[CHICKEN]]))).code, 'KFC-20261003-10000');
    });
    test('giỏ có giảm giá 100% (giá bán 0) vẫn đặt được', async function () {
      var st = memStorage();
      var r = await makeService(st).placeOrder({ items: [{ id: 'f', name: 'Quà tặng', price: 10000, discount: 100, qty: 2 }] });
      eq(r.total, 0); eq(r.discountTotal, 20000);
    });
    test('tên món có ký tự đặc biệt, emoji, nháy, câu SQL được lưu nguyên văn và bảng không bị ảnh hưởng', async function () {
      var st = memStorage(); var svc = makeService(st);
      var names = ["Gà \"cay\" 'đặc biệt'", "Robert'); DROP TABLE orders;--", '🍗 Combo 日本語 ñ', '<script>alert(1)</script>'];
      await svc.placeOrder({ items: names.map(function (n, i) { return { id: 'p' + i, name: n, price: 1000, qty: 1, category: "Đồ ăn'--" }; }) });
      var db = await openBytes(st.bytes);
      eq(q(db, 'SELECT product_name FROM order_items ORDER BY id').map(function (r) { return r.product_name; }), names);
      eq(scalar(db, 'SELECT COUNT(*) FROM orders'), 1);
      eq(q(db, 'SELECT DISTINCT category FROM order_items')[0].category, "Đồ ăn'--");
      db.close();
    });
    test('đơn lớn: 50 món khác nhau số lượng tối đa vẫn đúng tiền', async function () {
      var st = memStorage(); var items = [];
      for (var i = 0; i < 50; i++) items.push({ id: 'p' + i, name: 'Món ' + i, price: 1000 * (i + 1), qty: 99, discount: i % 101 });
      var r = await makeService(st).placeOrder({ items: items });
      var db = await openBytes(st.bytes);
      eq(scalar(db, 'SELECT COUNT(*) FROM order_items'), 50);
      eq(scalar(db, 'SELECT total FROM orders'), r.total);
      eq(scalar(db, 'SELECT SUM(line_total) FROM order_items'), r.total);
      db.close();
    });
    test('toàn vẹn tiền với giỏ ngẫu nhiên: các tổng trong orders khớp tổng các dòng', async function () {
      var seed = 12345; function rnd(n) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; }
      var st = memStorage(); var svc = makeService(st);
      for (var k = 0; k < 15; k++) {
        var items = [], n = 1 + rnd(8);
        for (var i = 0; i < n; i++) items.push({ id: 'p' + i, name: 'M' + i, price: rnd(300) * 1000 + rnd(1000), qty: 1 + rnd(99), discount: rnd(120) - 10 });
        await svc.placeOrder({ items: items });
      }
      var db = await openBytes(st.bytes);
      eq(scalar(db, 'SELECT COUNT(*) FROM orders'), 15);
      var bad = q(db, 'SELECT o.id FROM orders o WHERE ' +
        'o.total != (SELECT SUM(line_total) FROM order_items WHERE order_id = o.id) OR ' +
        'o.subtotal != (SELECT SUM(original_price * quantity) FROM order_items WHERE order_id = o.id) OR ' +
        'o.discount_total != o.subtotal - o.total OR ' +
        'o.total_qty != (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id)');
      eq(bad, [], 'đơn lệch tiền');
      eq(scalar(db, 'SELECT COUNT(*) FROM order_items WHERE line_total != unit_price * quantity'), 0);
      q(db, 'SELECT original_price, discount_percent, unit_price FROM order_items').forEach(function (r) {
        eq(r.unit_price, Pricing.discountedPrice(r.original_price, r.discount_percent));
      });
      db.close();
    });
    test('persistent phản ánh storage (false khi chỉ lưu tạm)', async function () {
      var st = memStorage(); st.persistent = false;
      eq((await makeService(st).placeOrder(cartOf([[CHICKEN]]))).persistent, false);
    });
  });

  // ======================================================================
  group('lỗi và an toàn dữ liệu', function () {
    test('giỏ không hợp lệ: ném lỗi TRƯỚC khi đọc/ghi storage', async function () {
      var st = memStorage(); var svc = makeService(st);
      var thrown = null;
      try { await svc.placeOrder({ items: [] }); } catch (e) { thrown = e; }
      eq(thrown && thrown.code, 'empty_cart'); eq([st.loads, st.saves], [0, 0]);
    });
    test('lưu thất bại (storage_save_failed): không ghi gì, dữ liệu cũ nguyên vẹn, thử lại được', async function () {
      var st = memStorage(); var svc = makeService(st);
      await svc.placeOrder(cartOf([[CHICKEN]]));
      var before = Array.prototype.slice.call(st.bytes);
      st.failSave = true;
      await rejects(svc.placeOrder(cartOf([[PEPSI]])), 'storage_save_failed');
      eq(Array.prototype.slice.call(st.bytes), before, 'dữ liệu đã lưu bị đổi');
      st.failSave = false;
      var r = await svc.placeOrder(cartOf([[PEPSI]]));
      eq(r.code, 'KFC-20261003-0002', 'đơn thất bại không được chiếm số thứ tự');
    });
    test('không đọc được storage (storage_load_failed): không ghi đè bằng DB rỗng', async function () {
      var st = memStorage(); var svc = makeService(st);
      await svc.placeOrder(cartOf([[CHICKEN]]));
      var before = Array.prototype.slice.call(st.bytes); var savesBefore = st.saves;
      st.failLoad = true;
      await rejects(svc.placeOrder(cartOf([[PEPSI]])), 'storage_load_failed');
      eq(st.saves, savesBefore, 'không được gọi save');
      st.failLoad = false;
      eq(Array.prototype.slice.call(st.bytes), before);
    });
    test('orders.db hỏng (db_corrupt): từ chối ghi và KHÔNG ghi đè tệp hỏng', async function () {
      var garbage = new Uint8Array(4096); for (var i = 0; i < garbage.length; i++) garbage[i] = (i * 31 + 7) & 255;
      var st = memStorage(garbage); var svc = makeService(st);
      await rejects(svc.placeOrder(cartOf([[CHICKEN]])), 'db_corrupt');
      eq(st.saves, 0); eq(Array.prototype.slice.call(st.bytes, 0, 16), Array.prototype.slice.call(garbage, 0, 16));
    });
    test('orders.db sai cấu trúc (schema_mismatch): từ chối ghi, không sửa tệp', async function () {
      var SQL = await sqlPromise; var d = new SQL.Database();
      d.run('CREATE TABLE orders (id INTEGER PRIMARY KEY, note TEXT)');
      var bytes = d.export(); d.close();
      var st = memStorage(bytes); var svc = makeService(st);
      await rejects(svc.placeOrder(cartOf([[CHICKEN]])), 'schema_mismatch');
      eq(st.saves, 0);
    });
    test('giao dịch lỗi giữa chừng: ROLLBACK, không có đơn nửa vời, DB vẫn dùng được', async function () {
      var st = memStorage(); var svc = makeService(st);
      await svc.placeOrder(cartOf([[CHICKEN]]));
      // thêm trigger khiến việc chèn dòng hàng 'bad' bị chặn ở giữa giao dịch
      var db = await openBytes(st.bytes);
      db.run("CREATE TRIGGER block_bad BEFORE INSERT ON order_items WHEN NEW.product_id = 'bad' BEGIN SELECT RAISE(ABORT, 'blocked'); END");
      st.bytes = db.export(); db.close();
      var before = Array.prototype.slice.call(st.bytes);
      await rejects(svc.placeOrder({ items: [{ id: 'ok', name: 'Món tốt', price: 1000, qty: 1 }, { id: 'bad', name: 'Món bị chặn', price: 1000, qty: 1 }] }), 'db_write_failed');
      eq(Array.prototype.slice.call(st.bytes), before, 'tệp đã đổi dù giao dịch lỗi');
      var r = await svc.placeOrder(cartOf([[PEPSI]]));
      eq(r.code, 'KFC-20261003-0002'); eq(r.id, 2);
      db = await openBytes(st.bytes);
      eq(scalar(db, 'SELECT COUNT(*) FROM orders'), 2);
      eq(scalar(db, "SELECT COUNT(*) FROM order_items WHERE product_id = 'ok'"), 0, 'dòng của đơn lỗi không được tồn tại');
      db.close();
    });
    test('không tải được sql.js (sqljs_load_failed): ném lỗi rõ ràng và thử lại được', async function () {
      var fail = true; var st = memStorage();
      var svc = makeService(st, { loadSqlJs: function () { return fail ? Promise.reject(new Error('wasm 404')) : sqlPromise; } });
      await rejects(svc.placeOrder(cartOf([[CHICKEN]])), 'sqljs_load_failed');
      eq(st.saves, 0);
      fail = false;
      eq((await svc.placeOrder(cartOf([[CHICKEN]]))).code, 'KFC-20261003-0001');
    });
    test('thiếu loadSqlJs hoặc storage khi khởi tạo -> ném lỗi', function () {
      var threw = 0;
      try { OS.createOrderService({ storage: memStorage() }); } catch (e) { threw++; }
      try { OS.createOrderService({ loadSqlJs: loadSqlJs }); } catch (e) { threw++; }
      try { OS.createOrderService({ loadSqlJs: loadSqlJs, storage: {} }); } catch (e) { threw++; }
      eq(threw, 3);
    });
    test('lỗi mang theo nguyên nhân gốc (cause) để dễ debug', async function () {
      var st = memStorage(); st.failSave = true;
      var e = await rejects(makeService(st).placeOrder(cartOf([[CHICKEN]])), 'storage_save_failed');
      assert(e.cause && /disk full/.test(e.cause.message), 'cause');
    });
  });

  // ======================================================================
  group('đồng thời (nhiều đơn / nhiều tab cùng lúc)', function () {
    test('10 đơn gửi cùng lúc trên một service: đủ 10 đơn, mã duy nhất', async function () {
      var st = memStorage(); var svc = makeService(st);
      var rs = await Promise.all(Array.from({ length: 10 }, function () { return svc.placeOrder(cartOf([[CHICKEN]])); }));
      eq(rs.map(function (r) { return r.code; }).sort(), Array.from({ length: 10 }, function (_, i) { return 'KFC-20261003-' + ('000' + (i + 1)).slice(-4); }).sort());
      var db = await openBytes(st.bytes); eq(scalar(db, 'SELECT COUNT(*) FROM orders'), 10); db.close();
    });
    test('hai service (hai tab) dùng chung storage và khóa: không mất đơn nào', async function () {
      var st = memStorage(); var tail = Promise.resolve();
      var sharedLock = function (fn) { var run = tail.then(fn); tail = run.catch(function () {}); return run; };
      var a = makeService(st, { lock: sharedLock }), b = makeService(st, { lock: sharedLock });
      var rs = await Promise.all([a.placeOrder(cartOf([[CHICKEN]])), b.placeOrder(cartOf([[COMBO]])), a.placeOrder(cartOf([[PEPSI]])), b.placeOrder(cartOf([[CHICKEN, 2]]))]);
      eq(new Set(rs.map(function (r) { return r.code; })).size, 4);
      var db = await openBytes(st.bytes); eq(scalar(db, 'SELECT COUNT(*) FROM orders'), 4); eq(scalar(db, 'SELECT COUNT(*) FROM order_items'), 4); db.close();
    });
    test('một đơn lỗi không làm hỏng hàng đợi: các đơn sau vẫn được ghi', async function () {
      var st = memStorage(); var svc = makeService(st);
      var results = await Promise.all([
        svc.placeOrder(cartOf([[CHICKEN]])).then(function () { return 'ok'; }, function () { return 'fail'; }),
        svc.placeOrder({ items: [{ id: 'x', name: 'A', price: -1, qty: 1 }] }).then(function () { return 'ok'; }, function () { return 'fail'; }),
        svc.placeOrder(cartOf([[PEPSI]])).then(function () { return 'ok'; }, function () { return 'fail'; })
      ]);
      eq(results, ['ok', 'fail', 'ok']);
      var db = await openBytes(st.bytes); eq(scalar(db, 'SELECT COUNT(*) FROM orders'), 2); db.close();
    });
  });

  // ======================================================================
  group('listOrders / exportDb', function () {
    test('chưa có đơn: listOrders = [], exportDb vẫn ra tệp SQLite hợp lệ với 2 bảng rỗng', async function () {
      var st = memStorage(); var svc = makeService(st);
      eq(await svc.listOrders(), []);
      var bytes = await svc.exportDb();
      var db = await openBytes(bytes);
      eq(scalar(db, 'SELECT COUNT(*) FROM orders'), 0); eq(scalar(db, 'SELECT COUNT(*) FROM order_items'), 0);
      db.close();
      eq(st.saves, 0, 'chỉ đọc thì không được ghi');
    });
    test('listOrders: mới nhất trước, kèm dòng hàng đúng đơn', async function () {
      var st = memStorage(); var svc = makeService(st);
      await svc.placeOrder(cartOf([[CHICKEN, 2]])); await svc.placeOrder(cartOf([[PEPSI], [COMBO]]));
      var list = await svc.listOrders();
      eq(list.map(function (o) { return o.order_code; }), ['KFC-20261003-0002', 'KFC-20261003-0001']);
      eq(list[0].items.map(function (i) { return i.product_id; }), ['9', '3']);
      eq(list[1].items.length, 1); eq(list[1].items[0].quantity, 2);
    });
    test('exportDb sau khi có đơn: mở được độc lập và chứa đúng dữ liệu', async function () {
      var st = memStorage(); var svc = makeService(st);
      await svc.placeOrder(cartOf([[CHICKEN, 2]]));
      var db = await openBytes(await svc.exportDb());
      eq(q(db, 'SELECT order_code, total FROM orders'), [{ order_code: 'KFC-20261003-0001', total: 72000 }]);
      db.close();
    });
    test('đọc không làm đổi tệp đã lưu', async function () {
      var st = memStorage(); var svc = makeService(st);
      await svc.placeOrder(cartOf([[CHICKEN]]));
      var before = Array.prototype.slice.call(st.bytes), saves = st.saves;
      await svc.listOrders(); await svc.exportDb();
      eq(Array.prototype.slice.call(st.bytes), before); eq(st.saves, saves);
    });
  });
})();
