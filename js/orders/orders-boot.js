/**
 * KFC Orders - Khởi tạo trong trình duyệt: nạp sql.js (SQLite/WebAssembly) khi cần và gắn các phần lại với nhau.
 * Tạo window.KFCOrders = { placeOrder, listOrders, getOrder, updateOrderStatus, exportDb, saveToFile, storage }.
 *
 * sql.js chỉ được nạp ở lần đặt hàng (hoặc lưu file) đầu tiên, nên không làm chậm lúc mở trang.
 * Lưu ý: WebAssembly cần trang chạy qua http (Live Server), không chạy khi mở bằng file://.
 */
(function () {
  'use strict';

  var Service = window.KFCOrderService;
  var Storage = window.KFCDbStorage;
  if (!Service || !Storage) {
    console.error('[KFC Orders] Thiếu order-service.js hoặc db-storage.js');
    return;
  }

  // thư mục js/vendor/ tính từ vị trí của chính file này (không phụ thuộc trang đang ở đâu)
  var self = document.currentScript && document.currentScript.src;
  var VENDOR = self ? self.replace(/orders\/orders-boot\.js(\?.*)?$/, 'vendor/') : 'js/vendor/';

  function loadSqlJs() {
    return new Promise(function (resolve, reject) {
      function init() {
        window.initSqlJs({ locateFile: function (f) { return VENDOR + f; } }).then(resolve, reject);
      }
      if (typeof window.initSqlJs === 'function') { init(); return; }
      var s = document.createElement('script');
      s.src = VENDOR + 'sql-wasm.js';
      s.onload = init;
      s.onerror = function () { reject(new Error('Không tải được ' + s.src)); };
      document.head.appendChild(s);
    });
  }

  // Khóa giữa các tab: hai tab đặt hàng cùng lúc sẽ ghi lần lượt, không đè dữ liệu của nhau
  var localQueue = Promise.resolve();
  function lock(fn) {
    if (navigator.locks && navigator.locks.request) {
      return navigator.locks.request('kfc-orders-db', fn);
    }
    var run = localQueue.then(fn);
    localQueue = run.catch(function () {});
    return run;
  }

  var storage = Storage.createBrowserStorage();
  var service = Service.createOrderService({ loadSqlJs: loadSqlJs, storage: storage, lock: lock });

  // Tự động ghi orders.db ra file thật (nếu người dùng đã chọn file). Không có API này thì chỉ lưu trong trình duyệt.
  var FileSync = window.KFCFileSync;
  var fileSync = FileSync ? FileSync.createFileSync({
    isSupported: function () { return typeof window.showSaveFilePicker === 'function' && window.isSecureContext !== false; },
    picker: function (options) { return window.showSaveFilePicker(options); },
    handleStore: Storage.createHandleStore(),
    getBytes: function () { return service.exportDb(); },
    inspect: function (bytes) { return service.inspectDb(bytes); },
    importBytes: function (bytes) { return service.importDb(bytes); },
    fileName: Service.DB_FILE_NAME
  }) : null;
  if (fileSync) fileSync.init();

  /** Chạy thao tác ghi rồi cập nhật file (nếu đã liên kết). Lỗi ghi file không làm hỏng đơn: chỉ gắn kết quả vào `file`. */
  async function withFileSync(promise) {
    var result = await promise;
    if (result && typeof result === 'object') {
      result.file = fileSync ? await fileSync.sync() : { status: 'unsupported' };
    }
    return result;
  }

  /**
   * Lưu orders.db ra tệp thật. Dùng hộp thoại "Lưu thành..." nếu trình duyệt hỗ trợ
   * (Chrome/Edge), nếu không thì tải xuống.
   * @returns {Promise<{method:'picker'|'download'|'cancelled'}>}
   */
  async function saveToFile() {
    var bytes = await service.exportDb();
    var blob = new Blob([bytes], { type: 'application/vnd.sqlite3' });
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        var handle = await window.showSaveFilePicker({
          suggestedName: Service.DB_FILE_NAME,
          types: [{ description: 'SQLite database', accept: { 'application/vnd.sqlite3': ['.db'] } }]
        });
        var w = await handle.createWritable();
        await w.write(blob);
        await w.close();
        return { method: 'picker' };
      } catch (e) {
        if (e && e.name === 'AbortError') return { method: 'cancelled' };
        console.warn('[KFC Orders] Hộp thoại lưu file không dùng được, chuyển sang tải xuống:', e);
      }
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = Service.DB_FILE_NAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    return { method: 'download' };
  }

  window.KFCOrders = {
    placeOrder: function (state, meta) { return withFileSync(service.placeOrder(state, meta)); },
    listOrders: service.listOrders,
    exportDb: service.exportDb,
    getOrder: service.getOrder,
    updateOrderStatus: function (input) { return withFileSync(service.updateOrderStatus(input)); },
    fileSync: fileSync,
    inspectDb: service.inspectDb,
    importDb: service.importDb,
    saveToFile: saveToFile,
    storage: storage
  };
})();
