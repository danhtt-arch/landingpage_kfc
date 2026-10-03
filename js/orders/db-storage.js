/**
 * KFC Orders - Nơi lưu nội dung tệp orders.db trong trình duyệt.
 * Trình duyệt không cho trang web tự ghi file ra ổ đĩa, nên bản "chính" của orders.db
 * được giữ trong IndexedDB (bền vững, dung lượng lớn). Người dùng lưu ra tệp thật bằng nút "Lưu file orders.db".
 * Nếu IndexedDB không dùng được (bị chặn...), chuyển sang lưu tạm trong bộ nhớ và báo `persistent = false`.
 *
 * Giao diện chung (khớp order-service): { load(), save(bytes), persistent }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.KFCDbStorage = factory(root);
  }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var IDB_NAME = 'kfc-orders';
  var STORE = 'files';
  var KEY = 'orders.db';

  function openIdb(idbFactory) {
    return new Promise(function (resolve, reject) {
      if (!idbFactory) { reject(new Error('IndexedDB không khả dụng')); return; }
      var req;
      try { req = idbFactory.open(IDB_NAME, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('Không mở được IndexedDB')); };
      req.onblocked = function () { reject(new Error('IndexedDB bị chặn')); };
    });
  }

  /** Mở kết nối riêng cho mỗi thao tác và đóng ngay, để không chặn việc xóa/nâng cấp DB */
  async function withStore(idbFactory, mode, fn) {
    var db = await openIdb(idbFactory);
    try {
      return await new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var holder = {};
        try { fn(tx.objectStore(STORE), holder); } catch (e) { reject(e); return; }
        tx.oncomplete = function () { resolve(holder.result); };
        tx.onerror = function () { reject(tx.error || new Error('Lỗi giao dịch IndexedDB')); };
        tx.onabort = function () { reject(tx.error || new Error('Giao dịch IndexedDB bị hủy')); };
      });
    } finally {
      db.close();
    }
  }

  /** Lưu trong bộ nhớ (dự phòng, và dùng cho test) */
  function createMemoryStorage(initial) {
    var bytes = initial || null;
    return {
      kind: 'memory',
      persistent: false,
      load: function () { return Promise.resolve(bytes ? new Uint8Array(bytes) : null); },
      save: function (b) { bytes = new Uint8Array(b); return Promise.resolve(); }
    };
  }

  /**
   * Lưu trong IndexedDB; lần dùng đầu tiên sẽ thử mở, thất bại thì tự chuyển sang bộ nhớ.
   * @param {IDBFactory} [idbFactory] mặc định indexedDB của trang
   */
  function createBrowserStorage(idbFactory) {
    var factory = idbFactory !== undefined ? idbFactory : (typeof root.indexedDB !== 'undefined' ? root.indexedDB : null);
    var fallback = createMemoryStorage();
    var mode = null; // 'idb' | 'memory'

    var api = {
      get kind() { return mode || 'unknown'; },
      get persistent() { return mode === 'idb'; }
    };

    async function ensure() {
      if (mode) return;
      try {
        var db = await openIdb(factory);
        db.close();
        mode = 'idb';
      } catch (e) {
        console.warn('[KFC Orders] IndexedDB không dùng được, chỉ lưu tạm trong phiên này:', e);
        mode = 'memory';
      }
    }

    api.load = async function () {
      await ensure();
      if (mode === 'memory') return fallback.load();
      var data = await withStore(factory, 'readonly', function (store, h) {
        var r = store.get(KEY);
        r.onsuccess = function () { h.result = r.result; };
      });
      if (data === undefined || data === null) return null;
      return data instanceof Uint8Array ? data : new Uint8Array(data);
    };

    api.save = async function (bytes) {
      await ensure();
      if (mode === 'memory') return fallback.save(bytes);
      await withStore(factory, 'readwrite', function (store) { store.put(new Uint8Array(bytes), KEY); });
    };

    return api;
  }

  return {
    createBrowserStorage: createBrowserStorage,
    createMemoryStorage: createMemoryStorage,
    IDB_NAME: IDB_NAME
  };
});
