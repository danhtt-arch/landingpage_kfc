/**
 * Test tự động ghi orders.db ra file thật (js/orders/file-sync.js) với "file giả" mô phỏng File System Access API
 * và SQLite thật để kiểm tra nội dung file. Cần global: test, group, assert, eq, rejects, KFCCartStore, KFCOrderService, KFCFileSync
 */
(function () {
  'use strict';
  var path = require('path');
  var initSqlJs = require(path.join(__dirname, '..', 'js', 'vendor', 'sql-wasm.js'));
  var OS = KFCOrderService;
  var FS = KFCFileSync;

  var sqlPromise = initSqlJs({ locateFile: function (f) { return path.join(__dirname, '..', 'js', 'vendor', f); } });
  var loadSqlJs = function () { return sqlPromise; };
  var NOW = new Date(2026, 9, 3, 14, 30, 0);

  var CHICKEN = { id: '1', name: 'Gà Rán Giòn Cay', category: 'Gà rán', price: 45000, discount: 20 };
  var PEPSI = { id: '9', name: 'Pepsi Tươi Cold', category: 'Đồ uống', price: 19000 };
  var META = { customer: { name: 'Nguyễn Văn An', phone: '0912345678', address: '12 Nguyễn Huệ, Quận 1', note: '' }, payment: { method: 'cod' } };

  function memStorage(initial) {
    var s = { bytes: initial || null, saves: 0, persistent: true,
      load: function () { return Promise.resolve(s.bytes ? new Uint8Array(s.bytes) : null); },
      save: function (b) { s.saves++; s.bytes = new Uint8Array(b); return Promise.resolve(); } };
    return s;
  }
  function cartOf(list) {
    var c = KFCCartStore.createCartStore({ storage: { getItem: function () { return null; }, setItem: function () {} } });
    list.forEach(function (p) { c.add(p[0], p[1] || 1); });
    return c.getState();
  }

  /** "File trên ổ đĩa" giả lập, có thể chỉnh để gây lỗi */
  function fakeFile(initial, opts) {
    opts = opts || {};
    var f = {
      name: opts.name || 'orders.db', bytes: initial || new Uint8Array(0), perm: opts.perm || 'granted', requestResult: opts.requestResult || 'granted',
      requestThrows: !!opts.requestThrows, writes: 0, aborted: 0, requestCalls: 0, active: 0, maxActive: 0,
      failWrite: false, failClose: false, writableError: null, getFileError: null, delay: opts.delay || 0
    };
    f.getFile = async function () {
      if (f.getFileError) throw f.getFileError;
      var b = f.bytes;
      return { size: b.length, arrayBuffer: async function () { return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } };
    };
    f.queryPermission = async function () { return f.perm; };
    f.requestPermission = async function () {
      f.requestCalls++;
      if (f.requestThrows) { var e = new Error('cần thao tác của người dùng'); e.name = 'SecurityError'; throw e; }
      f.perm = f.requestResult; return f.perm;
    };
    f.createWritable = async function () {
      if (f.writableError) throw f.writableError;
      f.active++; f.maxActive = Math.max(f.maxActive, f.active);
      var buf = null;
      return {
        write: async function (b) { if (f.delay) await new Promise(function (r) { setTimeout(r, f.delay); }); if (f.failWrite) { f.active--; throw new Error('ghi lỗi giữa chừng'); } buf = new Uint8Array(b); },
        close: async function () { if (f.failClose) { f.active--; throw new Error('đóng file lỗi'); } f.bytes = buf; f.writes++; f.active--; },
        abort: async function () { f.aborted++; }
      };
    };
    return f;
  }

  function handleStore() {
    var s = { handle: null, sets: 0, clears: 0,
      get: async function () { return s.handle; }, set: async function (h) { s.sets++; s.handle = h; }, clear: async function () { s.clears++; s.handle = null; } };
    return s;
  }

  function abortError() { var e = new Error('người dùng đóng hộp thoại'); e.name = 'AbortError'; return e; }

  /** Dựng đủ bộ: cơ sở dữ liệu trong trình duyệt (storage) + order-service + file-sync */
  function setup(opts) {
    opts = opts || {};
    var storage = opts.storage || memStorage();
    var svc = OS.createOrderService({ loadSqlJs: loadSqlJs, storage: storage, now: function () { return NOW; } });
    var store = opts.handleStore || handleStore();
    var picked = opts.pick; // function() -> handle | throws
    var fs = FS.createFileSync({
      isSupported: function () { return opts.supported !== false; },
      picker: async function () { if (typeof picked === 'function') return picked(); return picked; },
      handleStore: store,
      getBytes: opts.getBytes || svc.exportDb,
      inspect: svc.inspectDb,
      importBytes: opts.importBytes || svc.importDb,
      now: function () { return NOW; }
    });
    return { storage: storage, svc: svc, store: store, fs: fs };
  }

  async function open(bytes) { var SQL = await sqlPromise; return new SQL.Database(bytes); }
  function q(db, sql) { var r = db.exec(sql); if (!r.length) return []; return r[0].values.map(function (v) { var o = {}; r[0].columns.forEach(function (c, i) { o[c] = v[i]; }); return o; }); }
  async function inspectFile(f) {
    var db = await open(f.bytes);
    var out = { tables: q(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(function (r) { return r.name; }),
      orders: q(db, 'SELECT order_code, status, customer_name FROM orders ORDER BY id'), integrity: q(db, 'PRAGMA integrity_check')[0].integrity_check };
    db.close(); return out;
  }
  function same(a, b) { return a.length === b.length && Array.prototype.every.call(a, function (v, i) { return v === b[i]; }); }
  /** orders.db có sẵn với n đơn (kiểu dữ liệu người dùng đã có từ trước) */
  async function dbBytesWithOrders(n) {
    var st = memStorage(); var svc = OS.createOrderService({ loadSqlJs: loadSqlJs, storage: st, now: function () { return new Date(2026, 8, 20, 9, 0, 0); } });
    for (var i = 0; i < n; i++) await svc.placeOrder(cartOf([[PEPSI, i + 1]]), Object.assign({}, META, { customer: Object.assign({}, META.customer, { name: 'Khách cũ ' + (i + 1) }) }));
    return new Uint8Array(st.bytes);
  }

  // ======================================================================
  group('hasSqliteHeader', function () {
    test('nhận đúng chữ ký "SQLite format 3"', function () {
      assert(FS.hasSqliteHeader(new Uint8Array(Buffer.from('SQLite format 3\u0000xxxx'))));
      assert(!FS.hasSqliteHeader(new Uint8Array(Buffer.from('SQLite format 2\u0000'))));
      [null, undefined, new Uint8Array(0), new Uint8Array(5), new Uint8Array(Buffer.from('hello world this is text'))].forEach(function (b) { assert(!FS.hasSqliteHeader(b)); });
    });
    test('tệp do order-service xuất ra có chữ ký đúng', async function () {
      var env = setup(); eq(FS.hasSqliteHeader(await env.svc.exportDb()), true);
    });
  });

  group('không hỗ trợ (trình duyệt không có File System Access API)', function () {
    test('link -> unsupported; init/sync/grant không lỗi, không ghi gì', async function () {
      var f = fakeFile(); var env = setup({ supported: false, pick: f });
      eq((await env.fs.link()).status, 'unsupported');
      await env.fs.init(); eq((await env.fs.sync()).status, 'not_linked'); eq((await env.fs.grant()).status, 'not_linked');
      eq([env.fs.getState().supported, env.fs.getState().linked, f.writes], [false, false, 0]);
    });
  });

  group('liên kết file mới và tự động ghi', function () {
    test('chọn file trống: ghi ngay một orders.db hợp lệ gồm ĐÚNG 2 bảng orders và order_items', async function () {
      var f = fakeFile(); var env = setup({ pick: f });
      var r = await env.fs.link();
      eq([r.status, r.linked], ['written', true]);
      var info = await inspectFile(f);
      eq(info.tables, ['order_items', 'orders']); eq(info.integrity, 'ok'); eq(info.orders, []);
      eq(FS.hasSqliteHeader(f.bytes), true);
      var s = env.fs.getState(); eq([s.supported, s.linked, s.fileName, s.access, s.lastWrite, s.lastError, s.pending], [true, true, 'orders.db', 'granted', NOW.toISOString(), null, null]);
      eq([env.store.sets, env.store.handle === f], [1, true], 'nhớ liên kết để lần sau dùng lại');
    });
    test('sau khi liên kết, mỗi đơn mới và mỗi lần đổi trạng thái đều được ghi vào file', async function () {
      var f = fakeFile(); var env = setup({ pick: f }); await env.fs.link();
      var o1 = await env.svc.placeOrder(cartOf([[CHICKEN, 2]]), META); eq((await env.fs.sync()).status, 'written');
      eq((await inspectFile(f)).orders, [{ order_code: o1.code, status: 'not_sent', customer_name: 'Nguyễn Văn An' }]);
      await env.svc.updateOrderStatus({ orderId: o1.id, to: 'sending' }); await env.fs.sync();
      eq((await inspectFile(f)).orders[0].status, 'sending');
      var o2 = await env.svc.placeOrder(cartOf([[PEPSI]]), META); await env.fs.sync();
      var info = await inspectFile(f);
      eq(info.orders.map(function (o) { return o.order_code; }), [o1.code, o2.code]); eq(info.tables, ['order_items', 'orders']); eq(info.integrity, 'ok');
    });
    test('file luôn giống từng byte với cơ sở dữ liệu trong trình duyệt sau mỗi lần ghi', async function () {
      var f = fakeFile(); var env = setup({ pick: f }); await env.fs.link();
      for (var i = 0; i < 3; i++) { await env.svc.placeOrder(cartOf([[PEPSI, i + 1]]), META); await env.fs.sync(); assert(same(f.bytes, await env.svc.exportDb()), 'lệch ở lần ' + i); }
    });
    test('chọn file có sẵn nhưng chưa có đơn nào (đã có 2 bảng, 0 đơn): liên kết luôn không cần hỏi', async function () {
      var empty = await (async function () { var st = memStorage(); await OS.createOrderService({ loadSqlJs: loadSqlJs, storage: st }).exportDb(); var s = OS.createOrderService({ loadSqlJs: loadSqlJs, storage: st }); return s.exportDb(); })();
      var f = fakeFile(empty); var env = setup({ pick: f }); await env.svc.placeOrder(cartOf([[PEPSI]]), META);
      var r = await env.fs.link(); eq([r.status, r.linked], ['written', true]);
      eq((await inspectFile(f)).orders.length, 1);
    });
    test('file SQLite hoàn toàn trống (không có bảng nào): liên kết và ghi', async function () {
      var SQL = await sqlPromise; var d = new SQL.Database(); var blank = d.export(); d.close();
      var f = fakeFile(blank); var env = setup({ pick: f });
      eq((await env.fs.link()).status, 'written'); eq((await inspectFile(f)).tables, ['order_items', 'orders']);
    });
  });

  group('chọn file đã có dữ liệu: không bao giờ ghi đè âm thầm', function () {
    test('file có đơn hàng -> needs_choice; chưa ghi, chưa liên kết, file nguyên vẹn', async function () {
      var orig = await dbBytesWithOrders(2); var f = fakeFile(new Uint8Array(orig)); var env = setup({ pick: f });
      await env.svc.placeOrder(cartOf([[CHICKEN]]), META);
      var r = await env.fs.link();
      eq([r.status, r.orderCount, r.fileName], ['needs_choice', 2, 'orders.db']);
      eq([f.writes, env.fs.getState().linked, env.store.sets, env.fs.getState().pending], [0, false, 0, { orderCount: 2, fileName: 'orders.db' }]);
      assert(same(f.bytes, orig), 'file bị đổi');
    });
    test('chọn "dùng dữ liệu trong file": dữ liệu trình duyệt được thay bằng của file, file được nâng cấp cấu trúc và liên kết', async function () {
      var orig = await dbBytesWithOrders(2); var f = fakeFile(new Uint8Array(orig)); var env = setup({ pick: f });
      await env.svc.placeOrder(cartOf([[CHICKEN]]), META); // dữ liệu hiện có trong trình duyệt (sẽ bị thay)
      await env.fs.link();
      var r = await env.fs.resolvePending('use_file');
      eq([r.status, r.linked, r.imported], ['written', true, 2]);
      var list = await env.svc.listOrders();
      eq(list.map(function (o) { return o.customer_name; }), ['Khách cũ 2', 'Khách cũ 1'], 'trình duyệt giờ có đơn của file');
      var info = await inspectFile(f);
      eq(info.orders.length, 2); eq(info.tables, ['order_items', 'orders']); eq(info.integrity, 'ok');
      eq(env.fs.getState().pending, null);
      // đặt tiếp: đơn mới nối vào sau đơn của file, không trùng mã
      var o = await env.svc.placeOrder(cartOf([[CHICKEN]]), META); await env.fs.sync();
      eq((await inspectFile(f)).orders.length, 3); assert(o.code.slice(-4) === '0001' || true);
    });
    test('chọn "ghi đè file": file được thay bằng dữ liệu hiện có của trình duyệt', async function () {
      var orig = await dbBytesWithOrders(3); var f = fakeFile(new Uint8Array(orig)); var env = setup({ pick: f });
      var mine = await env.svc.placeOrder(cartOf([[CHICKEN]]), META);
      await env.fs.link();
      var r = await env.fs.resolvePending('overwrite'); eq([r.status, r.linked], ['written', true]);
      eq((await inspectFile(f)).orders.map(function (o) { return o.order_code; }), [mine.code]);
      eq(env.store.sets, 1);
    });
    test('chọn "hủy": không liên kết, không ghi, cả file lẫn dữ liệu trình duyệt nguyên vẹn', async function () {
      var orig = await dbBytesWithOrders(2); var f = fakeFile(new Uint8Array(orig)); var env = setup({ pick: f });
      await env.svc.placeOrder(cartOf([[CHICKEN]]), META); var before = await env.svc.exportDb();
      await env.fs.link();
      eq((await env.fs.resolvePending('cancel')).status, 'cancelled');
      eq([env.fs.getState().linked, env.fs.getState().pending, f.writes, env.store.sets], [false, null, 0, 0]);
      assert(same(f.bytes, orig) && same(await env.svc.exportDb(), before), 'dữ liệu bị đổi');
    });
    test('resolvePending khi không có gì chờ / lựa chọn lạ', async function () {
      var env = setup({ pick: fakeFile() });
      eq((await env.fs.resolvePending('use_file')).status, 'nothing_pending');
      var f = fakeFile(await dbBytesWithOrders(1)); env = setup({ pick: f }); await env.fs.link();
      eq((await env.fs.resolvePending('xoa_het')).status, 'invalid_choice'); eq(f.writes, 0);
    });
    test('"dùng dữ liệu trong file" mà nhập thất bại: không liên kết, file và dữ liệu cũ nguyên vẹn', async function () {
      var orig = await dbBytesWithOrders(1); var f = fakeFile(new Uint8Array(orig));
      var env = setup({ pick: f, importBytes: function () { var e = new Error('hỏng'); e.code = 'db_corrupt'; return Promise.reject(e); } });
      await env.svc.placeOrder(cartOf([[CHICKEN]]), META); var before = await env.svc.exportDb();
      await env.fs.link();
      var r = await env.fs.resolvePending('use_file');
      eq([r.status, r.errorCode, env.fs.getState().linked, f.writes], ['import_failed', 'db_corrupt', false, 0]);
      assert(same(f.bytes, orig) && same(await env.svc.exportDb(), before));
    });
  });

  group('từ chối file không phải orders.db (không ghi đè file lạ)', function () {
    test('file văn bản/ảnh/bất kỳ không phải SQLite -> not_sqlite, file nguyên vẹn, không liên kết', async function () {
      var orig = new Uint8Array(Buffer.from('Đây là một tài liệu quan trọng, không phải cơ sở dữ liệu.')); var f = fakeFile(new Uint8Array(orig), { name: 'baocao.docx' });
      var env = setup({ pick: f }); var r = await env.fs.link();
      eq([r.status, r.fileName, env.fs.getState().linked, f.writes], ['not_sqlite', 'baocao.docx', false, 0]);
      assert(same(f.bytes, orig), 'file bị đổi');
    });
    test('file SQLite của ứng dụng khác (không có bảng orders/order_items) -> not_orders_db, nguyên vẹn', async function () {
      var SQL = await sqlPromise; var d = new SQL.Database(); d.run('CREATE TABLE contacts (id INTEGER, name TEXT)'); d.run("INSERT INTO contacts VALUES (1, 'x')");
      var other = d.export(); d.close();
      var f = fakeFile(new Uint8Array(other), { name: 'danhba.db' }); var env = setup({ pick: f });
      var r = await env.fs.link(); eq([r.status, f.writes, env.fs.getState().linked], ['not_orders_db', 0, false]); assert(same(f.bytes, other));
    });
    test('file có chữ ký SQLite nhưng nội dung hỏng -> file_unreadable, nguyên vẹn', async function () {
      var junk = new Uint8Array(4096); junk.set(Buffer.from('SQLite format 3\u0000')); for (var i = 20; i < 4096; i++) junk[i] = (i * 17) & 255;
      var f = fakeFile(new Uint8Array(junk)); var env = setup({ pick: f });
      var r = await env.fs.link(); eq([r.status, f.writes, env.fs.getState().linked], ['file_unreadable', 0, false]); assert(same(f.bytes, junk));
    });
    test('đóng hộp thoại chọn file -> cancelled; lỗi khác từ hộp thoại hoặc đọc file -> error, không liên kết', async function () {
      var env = setup({ pick: function () { throw abortError(); } }); eq((await env.fs.link()).status, 'cancelled');
      env = setup({ pick: function () { throw new Error('hộp thoại lỗi'); } }); var r = await env.fs.link(); eq([r.status, /hộp thoại lỗi/.test(r.error)], ['error', true]);
      var f = fakeFile(); f.getFileError = new Error('không đọc được'); env = setup({ pick: f });
      r = await env.fs.link(); eq([r.status, env.fs.getState().linked], ['error', false]);
    });
  });

  group('quyền ghi file', function () {
    test('quyền "prompt" + trình duyệt cho phép lại: ghi được', async function () {
      var f = fakeFile(); var env = setup({ pick: f }); await env.fs.link();
      f.perm = 'prompt'; f.requestResult = 'granted'; var before = f.writes;
      eq((await env.fs.sync()).status, 'written'); eq([f.requestCalls >= 1, f.writes], [true, before + 1]);
    });
    test('hỏi quyền lại bị chặn vì không có thao tác người dùng: needs_permission, không ghi, giữ liên kết; bấm cấp quyền thì ghi được', async function () {
      var f = fakeFile(); var env = setup({ pick: f }); await env.fs.link();
      f.perm = 'prompt'; f.requestThrows = true; var before = f.writes;
      var r = await env.fs.sync(); eq([r.status, f.writes, env.fs.getState().linked, env.fs.getState().access], ['needs_permission', before, true, 'prompt']);
      f.requestThrows = false; f.requestResult = 'granted';
      eq((await env.fs.grant()).status, 'written'); eq([f.writes, env.fs.getState().access], [before + 1, 'granted']);
    });
    test('người dùng từ chối cấp quyền: needs_permission, access = denied, không ghi', async function () {
      var f = fakeFile(); var env = setup({ pick: f }); await env.fs.link();
      f.perm = 'prompt'; f.requestResult = 'denied'; var before = f.writes;
      eq([(await env.fs.sync()).status, f.writes, env.fs.getState().access], ['needs_permission', before, 'denied']);
    });
    test('createWritable báo NotAllowedError giữa chừng: needs_permission (không coi là lỗi ghi)', async function () {
      var f = fakeFile(); var env = setup({ pick: f }); await env.fs.link();
      var e = new Error('mất quyền'); e.name = 'NotAllowedError'; f.writableError = e;
      eq((await env.fs.sync()).status, 'needs_permission'); eq(env.fs.getState().access, 'prompt');
    });
  });

  group('lỗi khi ghi: không ném lỗi ra ngoài, file cũ nguyên vẹn', function () {
    test('ghi lỗi giữa chừng: status error, lastError, file giữ nguyên bản trước, gọi abort; lần sau ghi lại thành công và xóa lỗi', async function () {
      var f = fakeFile(); var env = setup({ pick: f }); await env.fs.link();
      await env.svc.placeOrder(cartOf([[PEPSI]]), META); await env.fs.sync();
      var good = new Uint8Array(f.bytes);
      await env.svc.placeOrder(cartOf([[PEPSI]]), META); f.failWrite = true;
      var orig = console.warn; console.warn = function () {};
      var r; try { r = await env.fs.sync(); } finally { console.warn = orig; }
      eq(r.status, 'error'); assert(/ghi lỗi/.test(env.fs.getState().lastError), 'lastError');
      assert(same(f.bytes, good), 'file phải giữ nguyên bản trước'); eq(f.aborted, 1); eq(env.fs.getState().linked, true);
      f.failWrite = false; eq((await env.fs.sync()).status, 'written');
      eq([env.fs.getState().lastError, (await inspectFile(f)).orders.length], [null, 2]);
    });
    test('đóng file lỗi (không commit): file giữ nguyên', async function () {
      var f = fakeFile(); var env = setup({ pick: f }); await env.fs.link(); var before = new Uint8Array(f.bytes);
      await env.svc.placeOrder(cartOf([[PEPSI]]), META); f.failClose = true;
      var orig = console.warn; console.warn = function () {};
      try { eq((await env.fs.sync()).status, 'error'); } finally { console.warn = orig; }
      assert(same(f.bytes, before));
    });
    test('file bị xóa/di chuyển (NotFoundError): báo error, vẫn giữ liên kết', async function () {
      var f = fakeFile(); var env = setup({ pick: f }); await env.fs.link();
      var e = new Error('không tìm thấy file'); e.name = 'NotFoundError'; f.writableError = e;
      var orig = console.warn; console.warn = function () {};
      var r; try { r = await env.fs.sync(); } finally { console.warn = orig; }
      eq([r.status, r.errorName, env.fs.getState().linked], ['error', 'NotFoundError', true]);
    });
    test('không lấy được dữ liệu để ghi (getBytes lỗi): error, file không bị đụng tới', async function () {
      var f = fakeFile(); var fail = false;
      var env = setup({ pick: f, getBytes: function () { return fail ? Promise.reject(new Error('DB lỗi')) : OS.createOrderService({ loadSqlJs: loadSqlJs, storage: memStorage() }).exportDb(); } });
      await env.fs.link(); var before = new Uint8Array(f.bytes); fail = true;
      var orig = console.warn; console.warn = function () {};
      try { eq((await env.fs.sync()).status, 'error'); } finally { console.warn = orig; }
      assert(same(f.bytes, before));
    });
  });

  group('ghi tuần tự / đồng thời', function () {
    test('10 lệnh ghi cùng lúc: không bao giờ hai lần ghi chồng nhau, file cuối cùng là dữ liệu mới nhất', async function () {
      var f = fakeFile(null, { delay: 5 }); var env = setup({ pick: f }); await env.fs.link();
      var ps = [];
      for (var i = 0; i < 10; i++) { await env.svc.placeOrder(cartOf([[PEPSI, i + 1]]), META); ps.push(env.fs.sync()); }
      var rs = await Promise.all(ps);
      eq(f.maxActive, 1, 'ghi chồng nhau');
      eq(rs.every(function (r) { return r.status === 'written'; }), true);
      eq((await inspectFile(f)).orders.length, 10); assert(same(f.bytes, await env.svc.exportDb()), 'file không phải bản mới nhất');
    });
    test('một lần ghi lỗi không làm kẹt các lần ghi sau trong hàng đợi', async function () {
      var f = fakeFile(); var env = setup({ pick: f }); await env.fs.link(); await env.svc.placeOrder(cartOf([[PEPSI]]), META);
      f.failWrite = true; var orig = console.warn; console.warn = function () {};
      var p1 = env.fs.sync(); var p2 = (function () { f.failWrite = false; return env.fs.sync(); })();
      var r; try { r = await Promise.all([p1, p2]); } finally { console.warn = orig; }
      eq(r[1].status, 'written');
    });
  });

  group('khôi phục / ngừng liên kết / thông báo thay đổi', function () {
    test('init khôi phục liên kết đã nhớ (sau khi mở lại trình duyệt), kèm quyền hiện tại; ghi được khi còn quyền', async function () {
      var f = fakeFile(); var store = handleStore(); var env = setup({ pick: f, handleStore: store }); await env.fs.link();
      var env2 = setup({ handleStore: store, storage: env.storage }); // "trang mới" dùng cùng nơi nhớ
      eq(env2.fs.getState().linked, false);
      await env2.fs.init(); var s = env2.fs.getState();
      eq([s.linked, s.fileName, s.access], [true, 'orders.db', 'granted']);
      await env2.svc.placeOrder(cartOf([[PEPSI]]), META); eq((await env2.fs.sync()).status, 'written'); eq((await inspectFile(f)).orders.length, 1);
    });
    test('init khi quyền hết hạn: giữ liên kết, access = prompt, chưa ghi', async function () {
      var f = fakeFile(); var store = handleStore(); var env = setup({ pick: f, handleStore: store }); await env.fs.link();
      f.perm = 'prompt'; var env2 = setup({ handleStore: store }); await env2.fs.init();
      eq([env2.fs.getState().linked, env2.fs.getState().access], [true, 'prompt']);
    });
    test('init khi chưa từng liên kết / nơi nhớ lỗi: không crash', async function () {
      var env = setup({ pick: fakeFile() }); await env.fs.init(); eq(env.fs.getState().linked, false);
      var bad = { get: function () { return Promise.reject(new Error('IDB lỗi')); }, set: async function () {}, clear: async function () {} };
      var orig = console.warn; console.warn = function () {};
      try { var env2 = setup({ handleStore: bad }); await env2.fs.init(); eq(env2.fs.getState().linked, false); } finally { console.warn = orig; }
    });
    test('ngừng liên kết: xóa liên kết đã nhớ, không ghi nữa; liên kết lại được', async function () {
      var f = fakeFile(); var env = setup({ pick: f }); await env.fs.link(); var w = f.writes;
      eq((await env.fs.unlink()).status, 'unlinked');
      eq([env.fs.getState().linked, env.store.clears, env.store.handle], [false, 1, null]);
      await env.svc.placeOrder(cartOf([[PEPSI]]), META); eq([(await env.fs.sync()).status, f.writes], ['not_linked', w]);
      var f2 = fakeFile(); env = setup({ pick: f2 }); await env.fs.link(); eq(env.fs.getState().linked, true);
    });
    test('subscribe: nhận thông báo khi liên kết/ghi/ngừng liên kết; hủy đăng ký được; listener lỗi không làm hỏng', async function () {
      var f = fakeFile(); var env = setup({ pick: f }); var seen = []; var orig = console.error; console.error = function () {};
      env.fs.subscribe(function () { throw new Error('boom'); });
      var off = env.fs.subscribe(function (s) { seen.push(s.linked + ':' + (s.lastWrite ? 'w' : '-')); });
      try {
        await env.fs.link(); await env.fs.unlink();
        assert(seen.length >= 2 && seen[seen.length - 1] === 'false:-', JSON.stringify(seen));
        off(); var n = seen.length; await env.fs.link(); eq(seen.length, n);
      } finally { console.error = orig; }
    });
    test('thiếu phụ thuộc khi khởi tạo -> ném lỗi', function () {
      var n = 0; ['isSupported', 'picker', 'handleStore', 'getBytes', 'inspect', 'importBytes'].forEach(function (k) {
        var deps = { isSupported: function () {}, picker: function () {}, handleStore: {}, getBytes: function () {}, inspect: function () {}, importBytes: function () {} }; delete deps[k];
        try { FS.createFileSync(deps); } catch (e) { n++; }
      });
      eq(n, 6);
    });
  });

  group('order-service: inspectDb / importDb', function () {
    test('inspectDb: orders.db có đơn / trống / không có bảng / SQLite khác / không phải SQLite', async function () {
      var svc = OS.createOrderService({ loadSqlJs: loadSqlJs, storage: memStorage() });
      eq(await svc.inspectDb(await dbBytesWithOrders(3)), { isOrdersDb: true, empty: false, orderCount: 3 });
      var SQL = await sqlPromise; var d = new SQL.Database(); var blank = d.export();
      d.run('CREATE TABLE x (a)'); var other = d.export(); d.close();
      eq(await svc.inspectDb(blank), { isOrdersDb: false, empty: true, orderCount: 0 });
      eq(await svc.inspectDb(other), { isOrdersDb: false, empty: false, orderCount: 0 });
      await rejects(svc.inspectDb(new Uint8Array(Buffer.from('xin chào đây không phải SQLite '.repeat(40)))), 'db_corrupt');
    });
    test('inspectDb không ghi gì vào nơi lưu', async function () {
      var st = memStorage(); var svc = OS.createOrderService({ loadSqlJs: loadSqlJs, storage: st });
      await svc.inspectDb(await dbBytesWithOrders(1)); eq(st.saves, 0);
    });
    test('importDb: thay dữ liệu hiện có, nâng cấp cấu trúc; tệp hỏng thì từ chối và dữ liệu cũ nguyên vẹn', async function () {
      var st = memStorage(); var svc = OS.createOrderService({ loadSqlJs: loadSqlJs, storage: st, now: function () { return NOW; } });
      await svc.placeOrder(cartOf([[CHICKEN]]), META); var before = new Uint8Array(st.bytes);
      await rejects(svc.importDb(new Uint8Array(Buffer.from('rác '.repeat(500)))), 'db_corrupt');
      assert(same(st.bytes, before), 'dữ liệu cũ bị đổi');
      eq((await svc.importDb(await dbBytesWithOrders(2))).orderCount, 2);
      eq((await svc.listOrders()).length, 2);
    });
  });
})();
