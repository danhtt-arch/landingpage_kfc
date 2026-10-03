/**
 * Harness test tối giản (không phụ thuộc thư viện). Dùng chung cho Node và trình duyệt.
 * Cung cấp: test(name, fn), group(name, fn), assert(cond, msg), eq(actual, expected, msg),
 *           rejects(promise, code), __wait() chạy tuần tự mọi test (hỗ trợ test async), __report()
 */
(function (root) {
  'use strict';
  var queue = [];
  var results = [];
  var prefix = '';

  function fmt(v) { try { return JSON.stringify(v); } catch (e) { return String(v); } }

  root.group = function (name, fn) {
    var old = prefix;
    prefix = old + name + ' › ';
    try { fn(); } finally { prefix = old; }
  };

  root.test = function (name, fn) {
    queue.push({ name: prefix + name, fn: fn });
  };

  root.assert = function (cond, msg) {
    if (!cond) throw new Error(msg || 'assert failed');
  };

  root.eq = function (actual, expected, msg) {
    if (fmt(actual) !== fmt(expected)) {
      throw new Error((msg ? msg + ': ' : '') + 'expected ' + fmt(expected) + ' but got ' + fmt(actual));
    }
  };

  /** Kỳ vọng promise bị từ chối với OrderError có `code` cho trước. Trả về lỗi để kiểm tra thêm. */
  root.rejects = function (promise, code) {
    return Promise.resolve(promise).then(function () {
      throw new Error('expected rejection with code ' + code + ' but it resolved');
    }, function (e) {
      if (e && e.code === code) return e;
      throw new Error('expected error code ' + code + ' but got ' + fmt(e && (e.code || e.message)));
    });
  };

  /** Chạy tuần tự tất cả test đã đăng ký (an toàn khi test thay đổi console.warn, storage...) */
  root.__wait = async function () {
    while (queue.length) {
      var t = queue.shift();
      var rec = { name: t.name, ok: true };
      try { await t.fn(); } catch (e) { rec.ok = false; rec.error = e && e.message ? e.message : String(e); }
      results.push(rec);
    }
    return results;
  };

  root.__testResults = function () { return results; };

  root.__report = function () {
    var failed = results.filter(function (r) { return !r.ok; });
    results.forEach(function (r) {
      console.log((r.ok ? '  PASS ' : '  FAIL ') + r.name + (r.ok ? '' : '\n         → ' + r.error));
    });
    console.log('\n' + (results.length - failed.length) + '/' + results.length + ' test passed' + (failed.length ? ', ' + failed.length + ' FAILED' : ''));
    return failed.length;
  };
})(typeof window !== 'undefined' ? window : globalThis);
