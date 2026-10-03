/**
 * Test trạng thái đơn hàng trên SQLite thật: lưu, đổi trạng thái, lịch sử, trigger bảo vệ, xung đột, đồng thời, migration.
 * Cần global: test, group, assert, eq, rejects, KFCCartStore, KFCOrderStatus, KFCOrderService
 */
(function () {
  'use strict';
  var path = require('path');
  var initSqlJs = require(path.join(__dirname, '..', 'js', 'vendor', 'sql-wasm.js'));
  var OS = KFCOrderService;
  var S = KFCOrderStatus;

  var sqlPromise = initSqlJs({ locateFile: function (f) { return path.join(__dirname, '..', 'js', 'vendor', f); } });
  var loadSqlJs = function () { return sqlPromise; };

  var CHICKEN = { id: '1', name: 'Gà Rán Giòn Cay', category: 'Gà rán', price: 45000, discount: 20 };
  var PEPSI = { id: '9', name: 'Pepsi Tươi Cold', category: 'Đồ uống', price: 19000 };
  var META = { customer: { name: 'Nguyễn Văn An', phone: '0912345678', address: '12 Nguyễn Huệ, Quận 1', note: '' }, payment: { method: 'cod' } };

  function memStorage(initial) {
    var s = {
      bytes: initial || null, saves: 0, persistent: true, failSave: false,
      load: function () { return Promise.resolve(s.bytes ? new Uint8Array(s.bytes) : null); },
      save: function (b) { s.saves++; if (s.failSave) return Promise.reject(new Error('disk full')); s.bytes = new Uint8Array(b); return Promise.resolve(); }
    };
    return s;
  }

  /** Đồng hồ giả: mỗi lần đọc tiến 1 phút để các mốc thời gian khác nhau và dễ kiểm tra */
  function makeClock() {
    var t = Date.UTC(2026, 9, 3, 7, 0, 0);
    return function () { var d = new Date(t); t += 60000; return d; };
  }

  function setup(opts) {
    opts = opts || {};
    var st = opts.storage || memStorage();
    var svc = OS.createOrderService({ loadSqlJs: loadSqlJs, storage: st, now: opts.now || makeClock(), lock: opts.lock });
    return { st: st, svc: svc };
  }
  function cartOf(list) {
    var c = KFCCartStore.createCartStore({ storage: { getItem: function () { return null; }, setItem: function () {} } });
    list.forEach(function (p) { c.add(p[0], p[1] || 1); });
    return c.getState();
  }
  async function newOrder(env, meta) { return env.svc.placeOrder(cartOf([[CHICKEN, 2], [PEPSI, 1]]), meta === undefined ? META : meta); }
  async function openBytes(bytes) { var SQL = await sqlPromise; return new SQL.Database(bytes); }
  function q(db, sql, params) {
    var r = db.exec(sql, params); if (!r.length) return [];
    return r[0].values.map(function (v) { var o = {}; r[0].columns.forEach(function (c, i) { o[c] = v[i]; }); return o; });
  }
  function bytesOf(st) { return Array.prototype.slice.call(st.bytes); }
  function throwsSql(db, sql, params) { try { db.run(sql, params); } catch (e) { return String(e.message || e); } return null; }

  // ======================================================================
  group('đơn mới', function () {
    test('mọi đơn mới bắt đầu ở "Chưa gửi", status_updated_at = created_at, chưa có lý do hủy hay lịch sử', async function () {
      var env = setup(); var o = await newOrder(env);
      eq(o.status, 'not_sent');
      var got = await env.svc.getOrder(o.id);
      eq([got.status, got.status_updated_at, got.cancel_reason, got.history], ['not_sent', got.created_at, null, []]);
    });
    test('đơn không có thông tin khách (kiểu module 1) cũng có trạng thái "Chưa gửi"', async function () {
      var env = setup(); var o = await newOrder(env, null);
      eq((await env.svc.getOrder(o.id)).status, 'not_sent');
    });
    test('listOrders có cột status cho mọi đơn', async function () {
      var env = setup(); await newOrder(env); await newOrder(env);
      eq((await env.svc.listOrders()).map(function (o) { return o.status; }), ['not_sent', 'not_sent']);
    });
  });

  // ======================================================================
  group('đổi trạng thái: luồng thành công', function () {
    test('Chưa gửi -> Đang gửi -> Đã gửi thành công: lưu đúng trạng thái, thời điểm và lịch sử', async function () {
      var env = setup(); var o = await newOrder(env);
      var r1 = await env.svc.updateOrderStatus({ orderId: o.id, to: 'sending', expectedFrom: 'not_sent' });
      eq([r1.id, r1.code, r1.from, r1.to, r1.reason, r1.note], [o.id, o.code, 'not_sent', 'sending', null, '']);
      var r2 = await env.svc.updateOrderStatus({ orderId: o.id, to: 'delivered', expectedFrom: 'sending' });
      eq([r2.from, r2.to], ['sending', 'delivered']);
      assert(r2.changedAt > r1.changedAt, 'thời điểm sau phải lớn hơn');
      var got = await env.svc.getOrder(o.id);
      eq([got.status, got.status_updated_at, got.cancel_reason], ['delivered', r2.changedAt, null]);
      eq(got.history.map(function (h) { return [h.from_status, h.to_status, h.reason, h.note, h.changed_at]; }),
        [['not_sent', 'sending', null, '', r1.changedAt], ['sending', 'delivered', null, '', r2.changedAt]]);
    });
    test('dữ liệu thật nằm trong tệp (đọc lại bằng DB độc lập)', async function () {
      var env = setup(); var o = await newOrder(env);
      await env.svc.updateOrderStatus({ orderId: o.id, to: 'sending' });
      var db = await openBytes(env.st.bytes);
      eq(q(db, 'SELECT status, cancel_reason FROM orders')[0], { status: 'sending', cancel_reason: null });
      eq(q(db, 'SELECT COUNT(*) AS n FROM order_status_history')[0].n, 1);
      db.close();
    });
    test('hủy khi chưa gửi với lý do "hư hỏng" + ghi chú', async function () {
      var env = setup(); var o = await newOrder(env);
      var r = await env.svc.updateOrderStatus({ orderId: o.id, to: 'cancelled', reason: 'damaged', note: '  Gà bị rơi vỡ hộp  ' });
      eq([r.to, r.reason, r.note], ['cancelled', 'damaged', 'Gà bị rơi vỡ hộp']);
      var got = await env.svc.getOrder(o.id);
      eq([got.status, got.cancel_reason], ['cancelled', 'damaged']);
      eq(got.history[0], { id: 1, order_id: o.id, from_status: 'not_sent', to_status: 'cancelled', reason: 'damaged', note: 'Gà bị rơi vỡ hộp', changed_at: r.changedAt });
    });
    test('hủy khi đang gửi với lý do "tai nạn"', async function () {
      var env = setup(); var o = await newOrder(env);
      await env.svc.updateOrderStatus({ orderId: o.id, to: 'sending' });
      var r = await env.svc.updateOrderStatus({ orderId: o.id, to: 'cancelled', reason: 'accident' });
      eq([r.from, r.to, r.reason], ['sending', 'cancelled', 'accident']);
      var got = await env.svc.getOrder(o.id);
      eq(got.history.map(function (h) { return h.to_status; }), ['sending', 'cancelled']);
    });
    test('đổi trạng thái không ảnh hưởng dữ liệu đơn (khách, tiền, dòng hàng, thanh toán)', async function () {
      var env = setup(); var o = await newOrder(env);
      var before = await env.svc.getOrder(o.id);
      await env.svc.updateOrderStatus({ orderId: o.id, to: 'sending' });
      var after = await env.svc.getOrder(o.id);
      ['order_code', 'created_at', 'total_qty', 'subtotal', 'discount_total', 'total', 'customer_name', 'customer_phone', 'customer_address', 'payment_method', 'payment_status'].forEach(function (k) { eq(after[k], before[k], k); });
      eq(after.items, before.items);
    });
    test('nhiều đơn: đổi trạng thái một đơn không động tới đơn khác', async function () {
      var env = setup(); var a = await newOrder(env), b = await newOrder(env), c = await newOrder(env);
      await env.svc.updateOrderStatus({ orderId: b.id, to: 'sending' });
      await env.svc.updateOrderStatus({ orderId: c.id, to: 'cancelled', reason: 'accident' });
      eq((await env.svc.listOrders()).map(function (o) { return [o.id, o.status]; }), [[c.id, 'cancelled'], [b.id, 'sending'], [a.id, 'not_sent']]);
      eq((await env.svc.getOrder(a.id)).history, []);
    });
    test('getOrder: dòng hàng và lịch sử theo thứ tự', async function () {
      var env = setup(); var o = await newOrder(env);
      await env.svc.updateOrderStatus({ orderId: o.id, to: 'sending' }); await env.svc.updateOrderStatus({ orderId: o.id, to: 'delivered' });
      var got = await env.svc.getOrder(o.id);
      eq(got.items.map(function (i) { return i.product_id; }), ['1', '9']);
      eq(got.history.map(function (h) { return h.id; }), [1, 2]);
    });
  });

  // ======================================================================
  group('đổi trạng thái: bị từ chối (dữ liệu không đổi một byte)', function () {
    async function expectRejected(env, o, input, code) {
      var before = bytesOf(env.st), saves = env.st.saves;
      var e = await rejects(env.svc.updateOrderStatus(Object.assign({ orderId: o.id }, input)), code);
      eq(bytesOf(env.st), before, 'tệp bị thay đổi'); eq(env.st.saves, saves, 'không được ghi');
      return e;
    }
    test('toàn bộ chuyển trạng thái không hợp lệ bị chặn', async function () {
      var cases = [
        [[], 'delivered'], [[], 'not_sent'],                       // từ Chưa gửi
        [['sending'], 'not_sent'], [['sending'], 'sending'],        // từ Đang gửi
        [['sending', 'delivered'], 'not_sent'], [['sending', 'delivered'], 'sending'], [['sending', 'delivered'], 'delivered']
      ];
      for (var i = 0; i < cases.length; i++) {
        var env = setup(); var o = await newOrder(env);
        for (var p of cases[i][0]) await env.svc.updateOrderStatus({ orderId: o.id, to: p });
        await expectRejected(env, o, { to: cases[i][1] }, 'invalid_transition');
      }
    });
    test('đơn đã kết thúc (đã gửi thành công / đã hủy) không đổi được sang bất kỳ trạng thái nào', async function () {
      for (var finalPath of [['sending', 'delivered'], ['cancelled']]) {
        var env = setup(); var o = await newOrder(env);
        for (var p of finalPath) await env.svc.updateOrderStatus({ orderId: o.id, to: p, reason: p === 'cancelled' ? 'accident' : undefined });
        for (var to of S.IDS) await expectRejected(env, o, { to: to, reason: 'damaged' }, 'invalid_transition');
      }
    });
    test('hủy mà không có lý do / lý do sai -> cancel_reason_required', async function () {
      var env = setup(); var o = await newOrder(env);
      for (var reason of [undefined, '', null, 'other', 'ACCIDENT', 5, '__proto__']) {
        await expectRejected(env, o, { to: 'cancelled', reason: reason }, 'cancel_reason_required');
      }
      eq((await env.svc.getOrder(o.id)).status, 'not_sent');
    });
    test('kèm lý do khi không hủy -> reason_not_allowed', async function () {
      var env = setup(); var o = await newOrder(env);
      await expectRejected(env, o, { to: 'sending', reason: 'accident' }, 'reason_not_allowed');
    });
    test('ghi chú sai (không phải chuỗi / quá 200 ký tự) -> invalid_note', async function () {
      var env = setup(); var o = await newOrder(env);
      await expectRejected(env, o, { to: 'cancelled', reason: 'damaged', note: 123 }, 'invalid_note');
      await expectRejected(env, o, { to: 'cancelled', reason: 'damaged', note: new Array(202).join('x') }, 'invalid_note');
    });
    test('trạng thái đích không tồn tại -> invalid_status (không đọc DB)', async function () {
      var env = setup(); var o = await newOrder(env); var saves = env.st.saves;
      for (var to of ['shipped', '', null, undefined, 5, '__proto__', 'constructor']) {
        await rejects(env.svc.updateOrderStatus({ orderId: o.id, to: to }), 'invalid_status');
      }
      eq(env.st.saves, saves);
    });
    test('mã đơn không hợp lệ / không tồn tại -> order_not_found', async function () {
      var env = setup(); await newOrder(env);
      for (var id of [999, 0, -1, 1.5, '1', null, undefined, NaN, {}]) {
        await rejects(env.svc.updateOrderStatus({ orderId: id, to: 'sending' }), 'order_not_found');
        await rejects(env.svc.getOrder(id), 'order_not_found');
      }
      await rejects(env.svc.updateOrderStatus(null), 'order_not_found');
    });
    test('trạng thái đã đổi ở nơi khác (expectedFrom lệch) -> status_conflict kèm trạng thái hiện tại', async function () {
      var env = setup(); var o = await newOrder(env);
      await env.svc.updateOrderStatus({ orderId: o.id, to: 'sending' });
      var e = await expectRejected(env, o, { to: 'cancelled', reason: 'accident', expectedFrom: 'not_sent' }, 'status_conflict');
      eq(e.currentStatus, 'sending'); assert(e.message.indexOf('Đang gửi') > -1, e.message);
    });
    test('expectedFrom khớp thì cho phép; không truyền thì bỏ qua kiểm tra xung đột', async function () {
      var env = setup(); var o = await newOrder(env);
      eq((await env.svc.updateOrderStatus({ orderId: o.id, to: 'sending', expectedFrom: 'not_sent' })).to, 'sending');
      eq((await env.svc.updateOrderStatus({ orderId: o.id, to: 'delivered' })).to, 'delivered');
    });
    test('lưu tệp thất bại: giữ nguyên trạng thái, ném storage_save_failed, thử lại được', async function () {
      var env = setup(); var o = await newOrder(env);
      var before = bytesOf(env.st); env.st.failSave = true;
      var e = await rejects(env.svc.updateOrderStatus({ orderId: o.id, to: 'sending' }), 'storage_save_failed');
      assert(e.cause && /disk full/.test(e.cause.message));
      eq(bytesOf(env.st), before); env.st.failSave = false;
      eq((await env.svc.updateOrderStatus({ orderId: o.id, to: 'sending' })).to, 'sending');
      eq((await env.svc.getOrder(o.id)).history.length, 1, 'lần lỗi không để lại lịch sử');
    });
    test('orders.db hỏng -> db_corrupt, không ghi đè', async function () {
      var garbage = new Uint8Array(4096); for (var i = 0; i < garbage.length; i++) garbage[i] = (i * 7 + 3) & 255;
      var env = setup({ storage: memStorage(garbage) });
      await rejects(env.svc.updateOrderStatus({ orderId: 1, to: 'sending' }), 'db_corrupt');
      eq(env.st.saves, 0);
    });
    test('ghi giữa chừng lỗi (trigger chặn lịch sử): ROLLBACK, trạng thái đơn không đổi', async function () {
      var env = setup(); var o = await newOrder(env);
      var db = await openBytes(env.st.bytes);
      db.run("CREATE TRIGGER block_hist BEFORE INSERT ON order_status_history BEGIN SELECT RAISE(ABORT, 'blocked'); END");
      env.st.bytes = db.export(); db.close();
      var before = bytesOf(env.st);
      await rejects(env.svc.updateOrderStatus({ orderId: o.id, to: 'sending' }), 'db_write_failed');
      eq(bytesOf(env.st), before);
      db = await openBytes(env.st.bytes);
      eq(q(db, 'SELECT status FROM orders')[0].status, 'not_sent', 'UPDATE phải được hoàn tác'); db.close();
    });
  });

  // ======================================================================
  group('bảo vệ ngay trong SQLite (ghi trực tiếp cũng không phá được quy tắc)', function () {
    async function dbWith(statusPath) {
      var env = setup(); var o = await newOrder(env);
      for (var p of statusPath) await env.svc.updateOrderStatus({ orderId: o.id, to: p, reason: p === 'cancelled' ? 'accident' : undefined });
      return openBytes(env.st.bytes);
    }
    test('UPDATE nhảy cóc Chưa gửi -> Đã gửi thành công bị trigger chặn', async function () {
      var db = await dbWith([]);
      assert(/invalid_status_transition/.test(throwsSql(db, "UPDATE orders SET status = 'delivered'")), 'phải bị chặn');
      eq(q(db, 'SELECT status FROM orders')[0].status, 'not_sent'); db.close();
    });
    test('UPDATE đi lùi Đang gửi -> Chưa gửi bị chặn', async function () {
      var db = await dbWith(['sending']);
      assert(/invalid_status_transition/.test(throwsSql(db, "UPDATE orders SET status = 'not_sent'"))); db.close();
    });
    test('đơn đã kết thúc không sửa được status bằng SQL trực tiếp', async function () {
      for (var path of [['sending', 'delivered'], ['cancelled']]) {
        var db = await dbWith(path);
        S.IDS.forEach(function (to) {
          if (to === q(db, 'SELECT status FROM orders')[0].status) return;
          assert(throwsSql(db, 'UPDATE orders SET status = ?, cancel_reason = ?', [to, 'damaged']) !== null, 'phải chặn ' + to);
        });
        db.close();
      }
    });
    test('hủy bằng SQL trực tiếp mà thiếu lý do bị chặn; có lý do thì được', async function () {
      var db = await dbWith([]);
      assert(/cancel_reason_required/.test(throwsSql(db, "UPDATE orders SET status = 'cancelled'")));
      eq(throwsSql(db, "UPDATE orders SET status = 'cancelled', cancel_reason = 'damaged'"), null); db.close();
    });
    test('giá trị status/cancel_reason/to_status ngoài danh sách bị CHECK từ chối', async function () {
      var db = await dbWith([]);
      assert(throwsSql(db, "UPDATE orders SET status = 'shipped'") !== null, 'status lạ');
      assert(throwsSql(db, "UPDATE orders SET cancel_reason = 'other'") !== null, 'lý do lạ');
      assert(throwsSql(db, "INSERT INTO order_status_history (order_id, from_status, to_status, changed_at) VALUES (1, 'not_sent', 'shipped', 't')") !== null, 'to_status lạ');
      assert(throwsSql(db, "UPDATE orders SET status = NULL") !== null, 'status không được NULL');
      db.close();
    });
    test('chèn đơn mới trực tiếp với status khác "Chưa gửi" bị chặn', async function () {
      var db = await dbWith([]);
      assert(/invalid_initial_status/.test(throwsSql(db, "INSERT INTO orders (order_code, created_at, total_qty, subtotal, discount_total, total, status) VALUES ('X1','t',1,1,0,1,'delivered')")));
      eq(throwsSql(db, "INSERT INTO orders (order_code, created_at, total_qty, subtotal, discount_total, total) VALUES ('X2','t',1,1,0,1)"), null, 'không chỉ định thì mặc định hợp lệ');
      eq(q(db, "SELECT status FROM orders WHERE order_code = 'X2'")[0].status, 'not_sent'); db.close();
    });
    test('xóa đơn thì lịch sử bị xóa theo (cascade); lịch sử không mồ côi', async function () {
      var db = await dbWith(['sending']); db.run('PRAGMA foreign_keys = ON');
      eq(q(db, 'SELECT COUNT(*) AS n FROM order_status_history')[0].n, 1);
      db.run('DELETE FROM orders');
      eq(q(db, 'SELECT COUNT(*) AS n FROM order_status_history')[0].n, 0);
      assert(throwsSql(db, "INSERT INTO order_status_history (order_id, to_status, changed_at) VALUES (999, 'sending', 't')") !== null, 'khóa ngoại'); db.close();
    });
    test('trigger sinh từ bảng quy tắc: mọi cặp (từ, tới) trong DB khớp đúng ma trận của order-status.js', async function () {
      for (var from of S.IDS) {
        for (var to of S.IDS) {
          if (from === to) continue;
          var env = setup(); var o = await newOrder(env);
          // đưa đơn tới trạng thái `from` bằng đường hợp lệ
          var route = { not_sent: [], sending: ['sending'], delivered: ['sending', 'delivered'], cancelled: ['cancelled'] }[from];
          for (var p of route) await env.svc.updateOrderStatus({ orderId: o.id, to: p, reason: p === 'cancelled' ? 'damaged' : undefined });
          var db = await openBytes(env.st.bytes);
          var err = throwsSql(db, 'UPDATE orders SET status = ?, cancel_reason = ?', [to, to === 'cancelled' ? 'accident' : null]);
          eq(err === null, S.canTransition(from, to), from + ' -> ' + to + ' (DB: ' + err + ')');
          db.close();
        }
      }
    });
  });

  // ======================================================================
  group('đồng thời', function () {
    test('5 yêu cầu cùng lúc đổi một đơn sang "Đang gửi": đúng 1 thành công, 4 bị từ chối, chỉ 1 dòng lịch sử', async function () {
      var env = setup(); var o = await newOrder(env);
      var results = await Promise.all([1, 2, 3, 4, 5].map(function () {
        return env.svc.updateOrderStatus({ orderId: o.id, to: 'sending', expectedFrom: 'not_sent' }).then(function () { return 'ok'; }, function (e) { return e.code; });
      }));
      eq(results.filter(function (r) { return r === 'ok'; }).length, 1);
      eq(results.filter(function (r) { return r === 'status_conflict'; }).length, 4);
      eq((await env.svc.getOrder(o.id)).history.length, 1);
    });
    test('"Đã gửi thành công" và "Hủy" cùng lúc từ Đang gửi: chỉ một cái thắng, trạng thái cuối nhất quán với lịch sử', async function () {
      var env = setup(); var o = await newOrder(env);
      await env.svc.updateOrderStatus({ orderId: o.id, to: 'sending' });
      var r = await Promise.all([
        env.svc.updateOrderStatus({ orderId: o.id, to: 'delivered', expectedFrom: 'sending' }).then(function () { return 'delivered'; }, function () { return 'lost'; }),
        env.svc.updateOrderStatus({ orderId: o.id, to: 'cancelled', reason: 'accident', expectedFrom: 'sending' }).then(function () { return 'cancelled'; }, function () { return 'lost'; })
      ]);
      eq(r.filter(function (x) { return x === 'lost'; }).length, 1);
      var got = await env.svc.getOrder(o.id);
      eq(got.history.length, 2); eq(got.status, got.history[1].to_status);
      eq(got.status === 'cancelled' ? got.cancel_reason : null, got.status === 'cancelled' ? 'accident' : null);
    });
    test('hai service (hai tab) dùng chung storage + khóa: đổi trạng thái hai đơn khác nhau không mất cập nhật nào', async function () {
      var st = memStorage(); var tail = Promise.resolve();
      var lock = function (fn) { var run = tail.then(fn); tail = run.catch(function () {}); return run; };
      var A = setup({ storage: st, lock: lock }), B = setup({ storage: st, lock: lock });
      var o1 = await newOrder(A), o2 = await newOrder(B);
      await Promise.all([A.svc.updateOrderStatus({ orderId: o1.id, to: 'sending' }), B.svc.updateOrderStatus({ orderId: o2.id, to: 'cancelled', reason: 'damaged' })]);
      eq((await A.svc.listOrders()).map(function (o) { return [o.id, o.status]; }), [[o2.id, 'cancelled'], [o1.id, 'sending']]);
    });
    test('đặt đơn mới trong lúc đổi trạng thái: không mất bên nào', async function () {
      var env = setup(); var o = await newOrder(env);
      await Promise.all([env.svc.updateOrderStatus({ orderId: o.id, to: 'sending' }), newOrder(env), newOrder(env)]);
      var list = await env.svc.listOrders();
      eq(list.length, 3); eq(list.filter(function (x) { return x.status === 'sending'; }).length, 1);
    });
    test('một yêu cầu lỗi không làm kẹt hàng đợi', async function () {
      var env = setup(); var o = await newOrder(env);
      var r = await Promise.all([
        env.svc.updateOrderStatus({ orderId: o.id, to: 'delivered' }).then(function () { return 'ok'; }, function () { return 'fail'; }),
        env.svc.updateOrderStatus({ orderId: o.id, to: 'sending' }).then(function () { return 'ok'; }, function () { return 'fail'; })
      ]);
      eq(r, ['fail', 'ok']);
    });
  });

  // ======================================================================
  group('nâng cấp từ orders.db của module Giỏ hàng / Thanh toán', function () {
    async function legacyDb(withPaymentCols) {
      var SQL = await sqlPromise; var d = new SQL.Database();
      OS.SCHEMA_STATEMENTS.forEach(function (s) { d.run(s); });
      if (withPaymentCols) ['customer_name', 'customer_phone', 'customer_address', 'customer_note', 'payment_method', 'payment_status'].forEach(function (c) { d.run('ALTER TABLE orders ADD COLUMN ' + c + ' TEXT'); });
      d.run("INSERT INTO orders (order_code, created_at, total_qty, subtotal, discount_total, total) VALUES ('KFC-20261002-0001','2026-10-02T03:00:00.000Z',1,45000,0,45000)");
      d.run("INSERT INTO orders (order_code, created_at, total_qty, subtotal, discount_total, total) VALUES ('KFC-20261002-0002','2026-10-02T04:00:00.000Z',1,19000,0,19000)");
      d.run("INSERT INTO order_items (order_id, product_id, product_name, original_price, discount_percent, unit_price, quantity, line_total) VALUES (1,'2','Gà Truyền Thống',45000,0,45000,1,45000)");
      var b = d.export(); d.close(); return b;
    }
    test('DB module 1 (chưa có cột khách/thanh toán/trạng thái): đơn cũ tự là "Chưa gửi" và đổi trạng thái được', async function () {
      var env = setup({ storage: memStorage(await legacyDb(false)) });
      eq((await env.svc.listOrders()).map(function (o) { return o.status; }), ['not_sent', 'not_sent']);
      var r = await env.svc.updateOrderStatus({ orderId: 1, to: 'sending', expectedFrom: 'not_sent' });
      eq(r.code, 'KFC-20261002-0001');
      var got = await env.svc.getOrder(1);
      eq([got.status, got.history.length, got.items.length], ['sending', 1, 1]);
      eq((await env.svc.getOrder(2)).status, 'not_sent');
    });
    test('DB module 2 (đã có cột khách/thanh toán): thêm cột trạng thái, giữ nguyên dữ liệu', async function () {
      var env = setup({ storage: memStorage(await legacyDb(true)) });
      await env.svc.updateOrderStatus({ orderId: 2, to: 'cancelled', reason: 'damaged' });
      var db = await openBytes(env.st.bytes);
      eq(q(db, 'SELECT order_code, status, cancel_reason FROM orders ORDER BY id'), [
        { order_code: 'KFC-20261002-0001', status: 'not_sent', cancel_reason: null },
        { order_code: 'KFC-20261002-0002', status: 'cancelled', cancel_reason: 'damaged' }]);
      db.close();
    });
    test('migration chạy lặp lại: không nhân đôi cột/trigger/bảng, không lỗi', async function () {
      var env = setup({ storage: memStorage(await legacyDb(false)) });
      for (var i = 0; i < 3; i++) await newOrder(env);
      var db = await openBytes(env.st.bytes);
      var cols = q(db, 'PRAGMA table_info(orders)').map(function (c) { return c.name; });
      eq(cols.length, 16); eq(new Set(cols).size, 16);
      eq(q(db, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger'")[0].n, 3);
      eq(q(db, "SELECT COUNT(*) AS n FROM sqlite_master WHERE name='order_status_history'")[0].n, 1);
      db.close();
    });
    test('chỉ đọc trên DB cũ: dùng được nhưng không ghi vào tệp', async function () {
      var st = memStorage(await legacyDb(false)); var before = bytesOf(st);
      var svc = setup({ storage: st }).svc;
      eq((await svc.listOrders()).length, 2); await svc.getOrder(1); await svc.exportDb();
      eq(bytesOf(st), before); eq(st.saves, 0);
    });
    test('toàn vẹn sau nhiều thao tác: orders.status luôn khớp dòng lịch sử cuối cùng', async function () {
      var env = setup({ storage: memStorage(await legacyDb(true)) });
      var paths = [[], ['sending'], ['sending', 'delivered'], ['cancelled'], ['sending', 'cancelled']];
      for (var i = 0; i < paths.length; i++) {
        var o = await newOrder(env);
        for (var p of paths[i]) await env.svc.updateOrderStatus({ orderId: o.id, to: p, reason: p === 'cancelled' ? (i % 2 ? 'accident' : 'damaged') : undefined });
      }
      var db = await openBytes(env.st.bytes);
      var bad = q(db, "SELECT o.id FROM orders o WHERE o.status != COALESCE((SELECT to_status FROM order_status_history h WHERE h.order_id = o.id ORDER BY h.id DESC LIMIT 1), 'not_sent')");
      eq(bad, [], 'đơn có status lệch lịch sử');
      eq(q(db, "SELECT COUNT(*) AS n FROM orders WHERE (status = 'cancelled') != (cancel_reason IS NOT NULL)")[0].n, 0, 'cancel_reason phải có khi và chỉ khi đã hủy');
      eq(q(db, 'SELECT h.id FROM order_status_history h WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = h.order_id)'), []);
      db.close();
    });
  });
})();
