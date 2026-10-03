/**
 * KFC Orders - Tự động ghi orders.db ra FILE THẬT trên máy (File System Access API, Chrome/Edge).
 *
 * Vì sao cần: trình duyệt không cho trang web tự tạo file trên ổ đĩa. Người dùng phải CHỌN file một lần
 * (hộp thoại "Lưu thành…"); trình duyệt trao cho trang một "handle" tới file đó. Sau đó mỗi lần đặt hàng hoặc đổi
 * trạng thái, trang ghi lại toàn bộ cơ sở dữ liệu vào đúng file này, không cần bấm gì nữa.
 *
 * Nguồn dữ liệu chính vẫn là bản trong trình duyệt (IndexedDB); file là bản sao luôn được cập nhật theo.
 *
 * Quy tắc an toàn:
 *  - Không bao giờ ghi đè một file không phải SQLite / không phải orders.db (từ chối và không liên kết).
 *  - File đã có đơn hàng: KHÔNG ghi đè âm thầm; người dùng phải chọn "dùng dữ liệu trong file" hoặc "ghi đè".
 *  - Ghi qua createWritable (trình duyệt ghi vào tệp tạm rồi thay thế khi close), lỗi giữa chừng không làm hỏng file cũ.
 *  - Lỗi ghi file không làm hỏng đơn hàng (đơn đã nằm trong cơ sở dữ liệu của trình duyệt); chỉ báo lại tình trạng.
 *
 * Logic thuần: mọi thứ phụ thuộc trình duyệt được truyền vào (picker, handleStore, ...), nên test được bằng Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KFCFileSync = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SQLITE_MAGIC = 'SQLite format 3';
  var PICKER_OPTIONS = {
    types: [{ description: 'SQLite database (orders.db)', accept: { 'application/vnd.sqlite3': ['.db'] } }]
  };

  function hasSqliteHeader(bytes) {
    if (!bytes || bytes.length < SQLITE_MAGIC.length) return false;
    for (var i = 0; i < SQLITE_MAGIC.length; i++) if (bytes[i] !== SQLITE_MAGIC.charCodeAt(i)) return false;
    return true;
  }

  function isAbort(e) { return !!e && e.name === 'AbortError'; }
  function isPermissionError(e) { return !!e && (e.name === 'NotAllowedError' || e.name === 'SecurityError'); }

  /**
   * @param {Object} deps
   * @param {Function} deps.isSupported   () => boolean
   * @param {Function} deps.picker        (options) => Promise<FileSystemFileHandle>  (showSaveFilePicker)
   * @param {Object}   deps.handleStore   { get(), set(handle), clear() }  nơi nhớ handle giữa các lần mở trang
   * @param {Function} deps.getBytes      () => Promise<Uint8Array>  nội dung cơ sở dữ liệu hiện tại
   * @param {Function} deps.inspect       (bytes) => Promise<{isOrdersDb, empty, orderCount}>
   * @param {Function} deps.importBytes   (bytes) => Promise<{orderCount}>  thay dữ liệu hiện có bằng nội dung file
   * @param {string}   [deps.fileName]
   * @param {Function} [deps.now]
   */
  function createFileSync(deps) {
    deps = deps || {};
    ['isSupported', 'picker', 'handleStore', 'getBytes', 'inspect', 'importBytes'].forEach(function (k) {
      if (!deps[k]) throw new Error('[KFC FileSync] Thiếu ' + k);
    });
    var suggestedName = deps.fileName || 'orders.db';
    var clock = deps.now || function () { return new Date(); };

    var handle = null;
    var access = 'unknown';   // 'granted' | 'prompt' | 'denied' | 'unknown'
    var lastWrite = null;
    var lastError = null;
    var pending = null;       // { handle, bytes, orderCount, fileName } khi file đã có đơn và đang chờ người dùng chọn
    var listeners = [];
    var chain = Promise.resolve();

    function getState() {
      return {
        supported: !!deps.isSupported(),
        linked: !!handle,
        fileName: handle ? handle.name || suggestedName : null,
        access: access,
        lastWrite: lastWrite,
        lastError: lastError,
        pending: pending ? { orderCount: pending.orderCount, fileName: pending.fileName } : null
      };
    }

    function emit() {
      var s = getState();
      listeners.slice().forEach(function (fn) { try { fn(s); } catch (e) { console.error('[KFC FileSync] listener lỗi:', e); } });
    }

    function subscribe(fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (l) { return l !== fn; }); };
    }

    async function queryAccess(h) {
      try {
        if (h && typeof h.queryPermission === 'function') return await h.queryPermission({ mode: 'readwrite' });
      } catch (e) { /* bỏ qua */ }
      return 'unknown';
    }

    /** Khôi phục handle đã liên kết ở lần dùng trước */
    async function init() {
      if (!deps.isSupported()) return getState();
      try {
        var h = await deps.handleStore.get();
        if (h) { handle = h; access = await queryAccess(h); }
      } catch (e) {
        console.warn('[KFC FileSync] Không đọc được liên kết file đã lưu:', e);
      }
      emit();
      return getState();
    }

    /** Ghi cơ sở dữ liệu hiện tại vào file đã liên kết. Không bao giờ ném lỗi; trả về { status, ... } */
    function doWrite() {
      return (async function () {
        if (!handle) return { status: 'not_linked' };
        var h = handle;
        try {
          var perm = await queryAccess(h);
          if (perm !== 'granted' && typeof h.requestPermission === 'function') {
            try { perm = await h.requestPermission({ mode: 'readwrite' }); } catch (e) { perm = 'prompt'; }
          }
          access = perm === 'granted' || perm === 'denied' ? perm : 'prompt';
          if (perm !== 'granted') { emit(); return { status: 'needs_permission', fileName: h.name }; }

          var bytes = await deps.getBytes();
          var w = await h.createWritable();
          try {
            await w.write(bytes);
            await w.close();
          } catch (e) {
            try { if (w.abort) await w.abort(); } catch (_) { /* bỏ qua */ }
            throw e;
          }
          lastWrite = clock().toISOString();
          lastError = null;
          emit();
          return { status: 'written', fileName: h.name, at: lastWrite, bytes: bytes.length };
        } catch (e) {
          if (isPermissionError(e)) { access = 'prompt'; emit(); return { status: 'needs_permission', fileName: h.name }; }
          lastError = e && e.message ? e.message : String(e);
          console.warn('[KFC FileSync] Không ghi được file:', e);
          emit();
          return { status: 'error', fileName: h.name, error: lastError, errorName: e && e.name };
        }
      })();
    }

    /** Ghi tuần tự (không bao giờ hai lần ghi chồng nhau) */
    function sync() {
      if (!handle) return Promise.resolve({ status: 'not_linked' });
      var run = chain.then(doWrite);
      chain = run.catch(function () {});
      return run;
    }

    async function finishLink(h) {
      handle = h;
      access = 'granted';
      pending = null;
      lastError = null;
      try { await deps.handleStore.set(h); } catch (e) { console.warn('[KFC FileSync] Không nhớ được liên kết file:', e); }
      emit();
      return sync();
    }

    /**
     * Cho người dùng chọn file orders.db (PHẢI gọi từ thao tác bấm nút).
     * @returns {Promise<{status:string}>}
     *   linked/written | needs_choice (file đã có đơn) | cancelled | not_sqlite | not_orders_db | file_unreadable | unsupported | error
     */
    async function link() {
      if (!deps.isSupported()) return { status: 'unsupported' };
      var h;
      try {
        h = await deps.picker(Object.assign({ suggestedName: suggestedName }, PICKER_OPTIONS));
      } catch (e) {
        if (isAbort(e)) return { status: 'cancelled' };
        return { status: 'error', error: e && e.message ? e.message : String(e) };
      }
      try {
        var file = await h.getFile();
        if (file.size === 0) return Object.assign({ linked: true }, await finishLink(h));

        var bytes = new Uint8Array(await file.arrayBuffer());
        if (!hasSqliteHeader(bytes)) return { status: 'not_sqlite', fileName: h.name };

        var info;
        try { info = await deps.inspect(bytes); } catch (e) { return { status: 'file_unreadable', fileName: h.name }; }
        if (!info.isOrdersDb && !info.empty) return { status: 'not_orders_db', fileName: h.name };
        if (info.orderCount === 0) return Object.assign({ linked: true }, await finishLink(h));

        pending = { handle: h, bytes: bytes, orderCount: info.orderCount, fileName: h.name };
        emit();
        return { status: 'needs_choice', orderCount: info.orderCount, fileName: h.name };
      } catch (e) {
        return { status: 'error', error: e && e.message ? e.message : String(e) };
      }
    }

    /**
     * Sau khi link() trả về needs_choice:
     *   'use_file'  : dùng dữ liệu trong file (thay dữ liệu hiện có trong trình duyệt), rồi ghi lại bản đã nâng cấp
     *   'overwrite' : ghi đè file bằng dữ liệu hiện có trong trình duyệt
     *   'cancel'    : không liên kết, giữ nguyên cả hai
     */
    async function resolvePending(choice) {
      if (!pending) return { status: 'nothing_pending' };
      var p = pending;
      if (choice === 'cancel') { pending = null; emit(); return { status: 'cancelled' }; }
      if (choice === 'use_file') {
        try { await deps.importBytes(p.bytes); } catch (e) {
          return { status: 'import_failed', error: e && e.message ? e.message : String(e), errorCode: e && e.code };
        }
        return Object.assign({ linked: true, imported: p.orderCount }, await finishLink(p.handle));
      }
      if (choice === 'overwrite') return Object.assign({ linked: true }, await finishLink(p.handle));
      return { status: 'invalid_choice' };
    }

    /** Cấp lại quyền ghi (sau khi mở trình duyệt lại) — PHẢI gọi từ thao tác bấm nút */
    async function grant() {
      if (!handle) return { status: 'not_linked' };
      return sync();
    }

    async function unlink() {
      handle = null;
      access = 'unknown';
      lastWrite = null;
      lastError = null;
      pending = null;
      try { await deps.handleStore.clear(); } catch (e) { console.warn('[KFC FileSync] Không xóa được liên kết file:', e); }
      emit();
      return { status: 'unlinked' };
    }

    return { init: init, getState: getState, subscribe: subscribe, link: link, resolvePending: resolvePending, sync: sync, grant: grant, unlink: unlink };
  }

  return { createFileSync: createFileSync, hasSqliteHeader: hasSqliteHeader, SQLITE_MAGIC: SQLITE_MAGIC };
});
