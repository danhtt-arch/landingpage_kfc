/**
 * Test lớp lưu trữ orders.db (db-storage.js). IndexedDB thật được kiểm tra trong trình duyệt (tests/ui.html);
 * ở đây kiểm tra logic bộ nhớ và cơ chế dự phòng. Cần global: test, group, assert, eq, KFCDbStorage
 */
(function () {
  'use strict';
  var D = KFCDbStorage;

  function bytes(arr) { return new Uint8Array(arr); }
  function quiet(fn) {
    return async function () {
      var orig = console.warn; console.warn = function () {};
      try { await fn(); } finally { console.warn = orig; }
    };
  }

  group('createMemoryStorage', function () {
    test('chưa có dữ liệu: load -> null', async function () {
      eq(await D.createMemoryStorage().load(), null);
    });
    test('save rồi load trả về đúng nội dung', async function () {
      var s = D.createMemoryStorage();
      await s.save(bytes([1, 2, 3, 250]));
      eq(Array.prototype.slice.call(await s.load()), [1, 2, 3, 250]);
    });
    test('lưu bản sao: sửa mảng gốc hay mảng đã load không ảnh hưởng dữ liệu lưu', async function () {
      var s = D.createMemoryStorage(); var src = bytes([9, 9, 9]);
      await s.save(src); src[0] = 0;
      var a = await s.load(); a[1] = 0;
      eq(Array.prototype.slice.call(await s.load()), [9, 9, 9]);
    });
    test('ghi đè: lần save sau thay thế lần trước', async function () {
      var s = D.createMemoryStorage();
      await s.save(bytes([1])); await s.save(bytes([2, 2]));
      eq(Array.prototype.slice.call(await s.load()), [2, 2]);
    });
    test('persistent = false (chỉ lưu tạm trong phiên)', function () {
      eq(D.createMemoryStorage().persistent, false);
    });
    test('khởi tạo với dữ liệu có sẵn', async function () {
      eq(Array.prototype.slice.call(await D.createMemoryStorage(bytes([7, 8])).load()), [7, 8]);
    });
  });

  group('createBrowserStorage (không có IndexedDB -> dự phòng bộ nhớ)', function () {
    test('idbFactory = null: chuyển sang bộ nhớ, persistent = false, vẫn lưu/đọc được', quiet(async function () {
      var s = D.createBrowserStorage(null);
      eq(await s.load(), null);
      eq(s.persistent, false); eq(s.kind, 'memory');
      await s.save(bytes([5, 6, 7]));
      eq(Array.prototype.slice.call(await s.load()), [5, 6, 7]);
    }));
    test('IndexedDB mở lỗi (ném ngoại lệ): chuyển sang bộ nhớ, không crash', quiet(async function () {
      var broken = { open: function () { throw new Error('SecurityError'); } };
      var s = D.createBrowserStorage(broken);
      await s.save(bytes([1]));
      eq(s.kind, 'memory'); eq(Array.prototype.slice.call(await s.load()), [1]);
    }));
    test('IndexedDB báo lỗi qua onerror: chuyển sang bộ nhớ', quiet(async function () {
      var failing = { open: function () { var req = {}; setTimeout(function () { req.error = new Error('denied'); req.onerror && req.onerror(); }, 0); return req; } };
      var s = D.createBrowserStorage(failing);
      await s.save(bytes([4]));
      eq(s.kind, 'memory');
    }));
    test('IndexedDB bị chặn (onblocked): chuyển sang bộ nhớ', quiet(async function () {
      var blocked = { open: function () { var req = {}; setTimeout(function () { req.onblocked && req.onblocked(); }, 0); return req; } };
      var s = D.createBrowserStorage(blocked);
      await s.load();
      eq(s.kind, 'memory');
    }));
    test('trước lần dùng đầu tiên: kind = unknown, persistent = false', function () {
      var s = D.createBrowserStorage(null);
      eq(s.kind, 'unknown'); eq(s.persistent, false);
    });
  });
})();
