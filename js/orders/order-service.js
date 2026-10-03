/**
 * KFC Orders - Service (lưu đơn hàng vào SQLite: orders.db, 2 bảng orders và order_items)
 *
 * Không đụng DOM, không biết sql.js nạp từ đâu hay file lưu ở đâu: nhận vào
 *   loadSqlJs : () => Promise<SQL>       (sql.js đã khởi tạo)
 *   storage   : { load(): Promise<Uint8Array|null>, save(bytes): Promise<void>, persistent?: boolean }
 * nên chạy được cả trong trình trình duyệt (window.KFCOrderService) lẫn Node (để test với SQLite thật).
 *
 * Quy tắc an toàn dữ liệu:
 *  - Đơn hàng được kiểm tra và tính lại tổng tiền từ từng dòng TRƯỚC khi chạm vào DB.
 *  - Ghi trong một transaction: lỗi giữa chừng thì ROLLBACK, không để đơn "nửa vời".
 *  - Không bao giờ ghi đè một orders.db đã có mà đọc không được (hỏng / sai cấu trúc).
 *  - Mọi lần ghi chạy trong một khóa, đọc DB mới nhất ngay trước khi ghi (nhiều tab không đè nhau).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../pricing.js'));
  } else {
    root.KFCOrderService = factory(root.KFCPricing);
  }
})(typeof self !== 'undefined' ? self : this, function (Pricing) {
  'use strict';

  if (!Pricing) throw new Error('[KFC Orders] Thiếu js/pricing.js');

  var DB_FILE_NAME = 'orders.db';
  var MAX_QTY = 99;

  var SCHEMA_STATEMENTS = [
    'CREATE TABLE IF NOT EXISTS orders (' +
    '  id             INTEGER PRIMARY KEY AUTOINCREMENT,' +
    '  order_code     TEXT    NOT NULL UNIQUE,' +
    '  created_at     TEXT    NOT NULL,' +
    '  total_qty      INTEGER NOT NULL CHECK (total_qty > 0),' +
    '  subtotal       INTEGER NOT NULL CHECK (subtotal >= 0),' +
    '  discount_total INTEGER NOT NULL CHECK (discount_total >= 0),' +
    '  total          INTEGER NOT NULL CHECK (total >= 0)' +
    ')',
    'CREATE TABLE IF NOT EXISTS order_items (' +
    '  id               INTEGER PRIMARY KEY AUTOINCREMENT,' +
    '  order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,' +
    '  product_id       TEXT    NOT NULL,' +
    '  product_name     TEXT    NOT NULL,' +
    '  category         TEXT,' +
    '  original_price   INTEGER NOT NULL CHECK (original_price >= 0),' +
    '  discount_percent INTEGER NOT NULL CHECK (discount_percent BETWEEN 0 AND 100),' +
    '  unit_price       INTEGER NOT NULL CHECK (unit_price >= 0),' +
    '  quantity         INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND ' + MAX_QTY + '),' +
    '  line_total       INTEGER NOT NULL CHECK (line_total >= 0)' +
    ')',
    'CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)'
  ];

  /**
   * Phương thức thanh toán -> trạng thái thanh toán ban đầu.
   * cod: thu tiền khi nhận hàng; bank_transfer: chờ khách chuyển khoản (cửa hàng xác nhận sau).
   * Module Thanh Toán dùng bảng này; module Trạng Thái Đơn Hàng có thể cập nhật payment_status về sau.
   */
  var PAYMENT_METHODS = { cod: 'unpaid', bank_transfer: 'awaiting_transfer' };

  /**
   * Cột thêm vào bảng orders bởi module Thanh Toán. Thêm bằng ALTER TABLE nếu còn thiếu,
   * nên orders.db tạo từ module Giỏ hàng vẫn dùng được (các đơn cũ có giá trị NULL ở các cột này).
   */
  var MIGRATION_COLUMNS = [
    ['orders', 'customer_name', 'TEXT'],
    ['orders', 'customer_phone', 'TEXT'],
    ['orders', 'customer_address', 'TEXT'],
    ['orders', 'customer_note', 'TEXT'],
    ['orders', 'payment_method', 'TEXT'],
    ['orders', 'payment_status', 'TEXT']
  ];

  var EXPECTED_COLUMNS = {
    orders: ['id', 'order_code', 'created_at', 'total_qty', 'subtotal', 'discount_total', 'total'],
    order_items: ['id', 'order_id', 'product_id', 'product_name', 'category', 'original_price',
      'discount_percent', 'unit_price', 'quantity', 'line_total']
  };

  /** Lỗi có `code` để UI chọn thông báo phù hợp */
  function OrderError(code, message, cause) {
    var e = new Error(message || code);
    e.name = 'OrderError';
    e.code = code;
    if (cause) e.cause = cause;
    return e;
  }

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
  }

  /** YYYYMMDD theo giờ địa phương (dùng cho mã đơn) */
  function dateKey(d) {
    return d.getFullYear() + pad(d.getMonth() + 1, 2) + pad(d.getDate(), 2);
  }

  function isId(v) {
    return (typeof v === 'string' || typeof v === 'number') && String(v).trim() !== '';
  }

  /**
   * Kiểm tra giỏ hàng và tính lại toàn bộ tiền từ từng dòng (không tin unitPrice/totals đưa vào).
   * Nếu `cartState.totals` có sẵn mà lệch với kết quả tính lại -> từ chối (phát hiện dữ liệu bị sửa/lỗi).
   * @returns {{createdAt:string, dateKey:string, items:Array, totalQty:number, subtotal:number, discountTotal:number, total:number}}
   */
  function buildOrder(cartState, now, meta) {
    var items = cartState && Array.isArray(cartState.items) ? cartState.items : null;
    if (!items || items.length === 0) throw OrderError('empty_cart', 'Giỏ hàng đang trống');

    var when = now instanceof Date && !isNaN(now.getTime()) ? now : new Date();
    var seen = {};
    var out = [];
    var totalQty = 0;
    var subtotal = 0;
    var total = 0;

    items.forEach(function (it) {
      if (!it || !isId(it.id) || typeof it.name !== 'string' || it.name.trim() === '') {
        throw OrderError('invalid_item', 'Món trong giỏ thiếu mã hoặc tên');
      }
      if (typeof it.price !== 'number' || !isFinite(it.price) || it.price < 0 || Math.floor(it.price) !== it.price) {
        throw OrderError('invalid_item', 'Giá món "' + it.name + '" không hợp lệ (phải là số nguyên đồng, không âm)');
      }
      if (typeof it.qty !== 'number' || Math.floor(it.qty) !== it.qty || it.qty < 1 || it.qty > MAX_QTY) {
        throw OrderError('invalid_item', 'Số lượng món "' + it.name + '" không hợp lệ (1-' + MAX_QTY + ')');
      }
      var id = String(it.id);
      if (seen[id]) throw OrderError('duplicate_item', 'Món trùng mã trong giỏ: ' + id);
      seen[id] = true;

      var discount = Pricing.normalizeDiscount(it.discount);
      var unit = Pricing.discountedPrice(it.price, discount);
      var line = unit * it.qty;

      out.push({
        productId: id,
        productName: it.name,
        category: typeof it.category === 'string' ? it.category : '',
        originalPrice: it.price,
        discountPercent: discount,
        unitPrice: unit,
        quantity: it.qty,
        lineTotal: line
      });
      totalQty += it.qty;
      subtotal += it.price * it.qty;
      total += line;
    });

    if (!Number.isSafeInteger(subtotal) || !Number.isSafeInteger(total)) {
      throw OrderError('invalid_item', 'Tổng tiền vượt quá giới hạn cho phép');
    }

    var t = cartState.totals;
    if (t && (t.total !== total || t.subtotal !== subtotal || t.totalQty !== totalQty)) {
      throw OrderError('total_mismatch', 'Tổng tiền của giỏ hàng không khớp với các dòng hàng');
    }

    var info = normalizeMeta(meta);

    return {
      customer: info ? info.customer : null,
      payment: info ? info.payment : null,
      createdAt: when.toISOString(),
      dateKey: dateKey(when),
      items: out,
      totalQty: totalQty,
      subtotal: subtotal,
      discountTotal: subtotal - total,
      total: total
    };
  }

  var LIMITS = { name: 100, phone: 20, address: 300, note: 300 };

  /**
   * Kiểm tra thông tin khách + phương thức thanh toán do module Thanh Toán truyền vào.
   * (Quy tắc nghiệp vụ chi tiết như định dạng số điện thoại nằm ở js/payment; ở đây chỉ chặn dữ liệu rõ ràng sai.)
   * @returns {null | {customer:{name,phone,address,note}, payment:{method,status}}}
   */
  function normalizeMeta(meta) {
    if (meta === undefined || meta === null) return null;
    var c = meta.customer;
    if (!c || typeof c !== 'object') throw OrderError('invalid_customer', 'Thiếu thông tin khách hàng');
    var out = {};
    ['name', 'phone', 'address'].forEach(function (k) {
      var v = c[k];
      if (typeof v !== 'string' || v.trim() === '' || v.length > LIMITS[k]) {
        throw OrderError('invalid_customer', 'Thông tin khách hàng không hợp lệ: ' + k);
      }
      out[k] = v;
    });
    var note = c.note === undefined || c.note === null ? '' : c.note;
    if (typeof note !== 'string' || note.length > LIMITS.note) throw OrderError('invalid_customer', 'Ghi chú không hợp lệ');
    out.note = note;
    var p = meta.payment;
    var method = p && typeof p.method === 'string' ? p.method : null;
    if (!method || !Object.prototype.hasOwnProperty.call(PAYMENT_METHODS, method)) {
      throw OrderError('invalid_payment', 'Phương thức thanh toán không hợp lệ');
    }
    return { customer: out, payment: { method: method, status: PAYMENT_METHODS[method] } };
  }

  /** Khóa tuần tự trong cùng một trang (dự phòng khi không có Web Locks) */
  function makeLocalLock() {
    var tail = Promise.resolve();
    return function (fn) {
      var run = tail.then(fn);
      tail = run.catch(function () {});
      return run;
    };
  }

  function rowsOf(result) {
    if (!result || !result.length) return [];
    var cols = result[0].columns;
    return result[0].values.map(function (v) {
      var o = {};
      cols.forEach(function (c, i) { o[c] = v[i]; });
      return o;
    });
  }

  /**
   * @param {Object} opts
   * @param {Function} opts.loadSqlJs
   * @param {Object}   opts.storage
   * @param {Function} [opts.now]   trả về Date (để test)
   * @param {Function} [opts.lock]  (fn) => Promise
   */
  function createOrderService(opts) {
    opts = opts || {};
    if (typeof opts.loadSqlJs !== 'function') throw new Error('[KFC Orders] Thiếu loadSqlJs');
    if (!opts.storage || typeof opts.storage.load !== 'function' || typeof opts.storage.save !== 'function') {
      throw new Error('[KFC Orders] Thiếu storage');
    }
    var storage = opts.storage;
    var clock = opts.now || function () { return new Date(); };
    var lock = opts.lock || makeLocalLock();
    var sqlPromise = null;

    function getSql() {
      if (!sqlPromise) {
        sqlPromise = Promise.resolve().then(opts.loadSqlJs).catch(function (e) {
          sqlPromise = null; // cho phép thử lại lần sau
          throw OrderError('sqljs_load_failed', 'Không tải được SQLite', e);
        });
      }
      return sqlPromise;
    }

    function tableColumns(db, table) {
      return rowsOf(db.exec('PRAGMA table_info(' + table + ')')).map(function (r) { return r.name; });
    }

    function ensureSchema(db) {
      SCHEMA_STATEMENTS.forEach(function (sql) { db.run(sql); });
      Object.keys(EXPECTED_COLUMNS).forEach(function (table) {
        var have = tableColumns(db, table);
        EXPECTED_COLUMNS[table].forEach(function (col) {
          if (have.indexOf(col) === -1) throw OrderError('schema_mismatch', 'Bảng ' + table + ' thiếu cột ' + col);
        });
      });
      // nâng cấp cấu trúc (thêm cột còn thiếu), an toàn khi chạy lặp lại
      MIGRATION_COLUMNS.forEach(function (m) {
        if (tableColumns(db, m[0]).indexOf(m[1]) === -1) db.run('ALTER TABLE ' + m[0] + ' ADD COLUMN ' + m[1] + ' ' + m[2]);
      });
    }

    /** Mở DB từ storage (hoặc tạo mới nếu chưa có). Không bao giờ thay thế DB hỏng bằng DB rỗng. */
    async function openDb() {
      var SQL = await getSql();
      var bytes;
      try {
        bytes = await storage.load();
      } catch (e) {
        throw OrderError('storage_load_failed', 'Không đọc được dữ liệu đơn hàng đã lưu', e);
      }
      var db = null;
      try {
        db = bytes && bytes.length ? new SQL.Database(bytes) : new SQL.Database();
        db.run('PRAGMA foreign_keys = ON');
        ensureSchema(db);
        return db;
      } catch (e) {
        if (db) { try { db.close(); } catch (_) { /* bỏ qua */ } }
        if (e && e.code === 'schema_mismatch') throw e;
        throw OrderError('db_corrupt', 'Tệp orders.db đã lưu bị hỏng hoặc không phải SQLite', e);
      }
    }

    function nextSequence(db, key) {
      var prefix = 'KFC-' + key + '-';
      var r = db.exec('SELECT MAX(CAST(substr(order_code, ' + (prefix.length + 1) + ') AS INTEGER)) FROM orders WHERE order_code LIKE ?', [prefix + '%']);
      var max = r.length && r[0].values[0][0] !== null ? Number(r[0].values[0][0]) : 0;
      return max + 1;
    }

    /**
     * Đặt hàng: kiểm tra -> ghi (transaction) -> lưu storage.
     * Chỉ thành công khi đã lưu xong. Lỗi thì ném OrderError và dữ liệu cũ không bị đổi.
     * @param {Object} [meta] { customer:{name,phone,address,note}, payment:{method} } từ module Thanh Toán (không bắt buộc)
     * @returns {Promise<{id:number, code:string, createdAt:string, totalQty:number, subtotal:number, discountTotal:number, total:number, items:Array, customer:Object|null, payment:Object|null, persistent:boolean}>}
     */
    function placeOrder(cartState, meta) {
      var order;
      try {
        order = buildOrder(cartState, clock(), meta); // kiểm tra trước khi chạm vào DB
      } catch (e) {
        return Promise.reject(e); // luôn trả về Promise, kể cả khi dữ liệu không hợp lệ
      }
      return lock(async function () {
        var db = await openDb();
        var bytes, id, code;
        try {
          db.run('BEGIN');
          try {
            code = 'KFC-' + order.dateKey + '-' + pad(nextSequence(db, order.dateKey), 4);
            var cu = order.customer, pay = order.payment;
            db.run('INSERT INTO orders (order_code, created_at, total_qty, subtotal, discount_total, total, customer_name, customer_phone, customer_address, customer_note, payment_method, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [code, order.createdAt, order.totalQty, order.subtotal, order.discountTotal, order.total,
                cu ? cu.name : null, cu ? cu.phone : null, cu ? cu.address : null, cu ? cu.note : null,
                pay ? pay.method : null, pay ? pay.status : null]);
            id = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0]);
            var stmt = db.prepare('INSERT INTO order_items (order_id, product_id, product_name, category, original_price, discount_percent, unit_price, quantity, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
            try {
              order.items.forEach(function (it) {
                stmt.run([id, it.productId, it.productName, it.category, it.originalPrice, it.discountPercent, it.unitPrice, it.quantity, it.lineTotal]);
              });
            } finally {
              stmt.free();
            }
            db.run('COMMIT');
          } catch (e) {
            try { db.run('ROLLBACK'); } catch (_) { /* bỏ qua */ }
            throw OrderError('db_write_failed', 'Không ghi được đơn hàng vào SQLite', e);
          }
          bytes = db.export();
        } finally {
          db.close();
        }
        try {
          await storage.save(bytes);
        } catch (e) {
          throw OrderError('storage_save_failed', 'Không lưu được tệp orders.db', e);
        }
        return {
          id: id,
          code: code,
          createdAt: order.createdAt,
          totalQty: order.totalQty,
          subtotal: order.subtotal,
          discountTotal: order.discountTotal,
          total: order.total,
          items: order.items,
          customer: order.customer,
          payment: order.payment,
          persistent: storage.persistent !== false
        };
      });
    }

    /** Đọc toàn bộ đơn (mới nhất trước) kèm các dòng hàng */
    function listOrders() {
      return lock(async function () {
        var db = await openDb();
        try {
          var orders = rowsOf(db.exec('SELECT * FROM orders ORDER BY id DESC'));
          var items = rowsOf(db.exec('SELECT * FROM order_items ORDER BY order_id, id'));
          orders.forEach(function (o) { o.items = items.filter(function (i) { return i.order_id === o.id; }); });
          return orders;
        } finally {
          db.close();
        }
      });
    }

    /** Nội dung tệp orders.db hiện tại (nếu chưa có đơn nào thì là DB rỗng có sẵn 2 bảng) */
    function exportDb() {
      return lock(async function () {
        var db = await openDb();
        try { return db.export(); } finally { db.close(); }
      });
    }

    return { placeOrder: placeOrder, listOrders: listOrders, exportDb: exportDb };
  }

  return {
    createOrderService: createOrderService,
    buildOrder: buildOrder,
    OrderError: OrderError,
    DB_FILE_NAME: DB_FILE_NAME,
    PAYMENT_METHODS: PAYMENT_METHODS,
    SCHEMA_STATEMENTS: SCHEMA_STATEMENTS,
    MAX_QTY: MAX_QTY
  };
});
