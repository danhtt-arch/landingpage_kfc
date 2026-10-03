/**
 * Test case cho Cart Store. Cần các global: test, group, assert, eq, KFCCartStore
 */
(function () {
  'use strict';
  var S = KFCCartStore;

  /** Storage giả lập, có thể bật chế độ lỗi */
  function memStorage(opts) {
    opts = opts || {};
    var data = {};
    return {
      data: data,
      getItem: function (k) {
        if (opts.throwOnGet) throw new Error('blocked');
        return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null;
      },
      setItem: function (k, v) {
        if (opts.throwOnSet) throw new Error('QuotaExceededError');
        data[k] = String(v);
      },
      removeItem: function (k) { delete data[k]; }
    };
  }

  var P1 = { id: '1', name: 'Gà Rán Giòn Cay', price: 45000, image: 'a.jpg', category: 'Gà rán' };
  var P2 = { id: '3', name: 'Combo Gà Rán 1 Người', price: 95000, image: 'b.jpg', category: 'Combo' };
  var P3 = { id: '9', name: 'Pepsi Tươi Cold', price: 19000, image: 'c.jpg', category: 'Đồ uống' };

  function fresh(storage) {
    return S.createCartStore({ storage: storage || memStorage() });
  }

  group('formatVND', function () {
    test('45000 -> 45.000 ₫', function () {
      eq(S.formatVND(45000).replace(/\s/g, ' '), '45.000 ₫');
    });
    test('0 -> 0 ₫', function () {
      eq(S.formatVND(0).replace(/\s/g, ' '), '0 ₫');
    });
    test('giá trị không hợp lệ -> 0 ₫ (không crash)', function () {
      eq(S.formatVND(NaN).replace(/\s/g, ' '), '0 ₫');
      eq(S.formatVND(undefined).replace(/\s/g, ' '), '0 ₫');
      eq(S.formatVND('abc').replace(/\s/g, ' '), '0 ₫');
    });
    test('số lớn: 1.234.567 ₫', function () {
      eq(S.formatVND(1234567).replace(/\s/g, ' '), '1.234.567 ₫');
    });
  });

  group('isValidProduct', function () {
    test('hợp lệ', function () { assert(S.isValidProduct(P1)); });
    test('id số vẫn hợp lệ', function () { assert(S.isValidProduct({ id: 7, name: 'x', price: 1 })); });
    test('null / undefined / chuỗi', function () {
      assert(!S.isValidProduct(null)); assert(!S.isValidProduct(undefined)); assert(!S.isValidProduct('x'));
    });
    test('thiếu id hoặc id rỗng', function () {
      assert(!S.isValidProduct({ name: 'x', price: 1 }));
      assert(!S.isValidProduct({ id: '  ', name: 'x', price: 1 }));
    });
    test('thiếu hoặc rỗng name', function () {
      assert(!S.isValidProduct({ id: '1', price: 1 }));
      assert(!S.isValidProduct({ id: '1', name: ' ', price: 1 }));
    });
    test('price sai: âm, NaN, Infinity, chuỗi', function () {
      assert(!S.isValidProduct({ id: '1', name: 'x', price: -1 }));
      assert(!S.isValidProduct({ id: '1', name: 'x', price: NaN }));
      assert(!S.isValidProduct({ id: '1', name: 'x', price: Infinity }));
      assert(!S.isValidProduct({ id: '1', name: 'x', price: '45000' }));
    });
    test('price = 0 hợp lệ', function () { assert(S.isValidProduct({ id: '1', name: 'x', price: 0 })); });
  });

  group('add', function () {
    test('giỏ mới rỗng', function () {
      var c = fresh();
      eq(c.getItems(), []);
      eq(c.getTotals(), { lines: 0, totalQty: 0, subtotal: 0, discountTotal: 0, total: 0 });
    });
    test('thêm 1 sản phẩm: qty mặc định = 1', function () {
      var c = fresh();
      var r = c.add(P1);
      eq(r.ok, true); eq(r.qty, 1);
      eq(c.getItems().length, 1);
      eq(c.getItems()[0].qty, 1);
    });
    test('thêm cùng sản phẩm: cộng dồn, không tạo dòng mới', function () {
      var c = fresh();
      c.add(P1); c.add(P1, 2);
      eq(c.getItems().length, 1);
      eq(c.getItems()[0].qty, 3);
    });
    test('id số và id chuỗi cùng một dòng', function () {
      var c = fresh();
      c.add({ id: 1, name: 'A', price: 10 }); c.add({ id: '1', name: 'A', price: 10 });
      eq(c.getItems().length, 1);
      eq(c.getItems()[0].qty, 2);
    });
    test('thêm nhiều sản phẩm khác nhau giữ thứ tự thêm', function () {
      var c = fresh();
      c.add(P2); c.add(P1); c.add(P3);
      eq(c.getItems().map(function (i) { return i.id; }), ['3', '1', '9']);
    });
    test('sản phẩm không hợp lệ bị từ chối, giỏ không đổi', function () {
      var c = fresh();
      eq(c.add(null).error, 'invalid_product');
      eq(c.add({ id: '1', name: 'x', price: -5 }).error, 'invalid_product');
      eq(c.getItems().length, 0);
    });
    test('qty không hợp lệ bị từ chối: 0, âm, thập phân, NaN, chuỗi', function () {
      var c = fresh();
      [0, -1, 1.5, NaN, '2', Infinity].forEach(function (q) {
        eq(c.add(P1, q).error, 'invalid_qty', 'qty=' + q);
      });
      eq(c.getItems().length, 0);
    });
    test('vượt MAX_QTY (99): bị chặn ở 99 và báo capped', function () {
      var c = fresh();
      c.add(P1, 98);
      var r = c.add(P1, 5);
      eq(r.ok, true); eq(r.capped, true); eq(r.qty, 99);
      eq(c.getItems()[0].qty, 99);
    });
    test('thêm lần đầu với qty > 99 cũng bị chặn', function () {
      var c = fresh();
      var r = c.add(P1, 500);
      eq(r.qty, 99); eq(r.capped, true);
    });
    test('getItems trả bản sao: sửa bên ngoài không ảnh hưởng store', function () {
      var c = fresh();
      c.add(P1);
      var list = c.getItems();
      list[0].qty = 50; list.push({ id: 'x' });
      eq(c.getItems().length, 1);
      eq(c.getItems()[0].qty, 1);
    });
    test('sửa object product gốc sau khi thêm không ảnh hưởng giỏ', function () {
      var c = fresh();
      var p = { id: '1', name: 'A', price: 100 };
      c.add(p); p.price = 1; p.name = 'hack';
      eq(c.getItems()[0].price, 100);
      eq(c.getItems()[0].name, 'A');
    });
  });

  group('totals', function () {
    test('subtotal = Σ qty × price', function () {
      var c = fresh();
      c.add(P1, 2); c.add(P2, 1); c.add(P3, 3);
      var t = c.getTotals();
      eq(t.subtotal, 2 * 45000 + 95000 + 3 * 19000);
      eq(t.total, t.subtotal);
      eq(t.totalQty, 6);
      eq(t.lines, 3);
    });
    test('giá 0 không làm hỏng tổng', function () {
      var c = fresh();
      c.add({ id: 'f', name: 'Free', price: 0 }, 5);
      eq(c.getTotals().subtotal, 0);
      eq(c.getTotals().totalQty, 5);
    });
    test('tổng cập nhật sau khi đổi số lượng và xóa', function () {
      var c = fresh();
      c.add(P1, 2); c.add(P2, 1);
      c.setQty('1', 5);
      eq(c.getTotals().subtotal, 5 * 45000 + 95000);
      c.remove('3');
      eq(c.getTotals().subtotal, 5 * 45000);
    });
    test('không bị lỗi làm tròn với giá lớn', function () {
      var c = fresh();
      c.add({ id: 'big', name: 'Big', price: 99999999 }, 99);
      eq(c.getTotals().subtotal, 99999999 * 99);
    });
  });

  group('setQty / increment / decrement', function () {
    test('setQty đổi số lượng', function () {
      var c = fresh(); c.add(P1);
      eq(c.setQty('1', 7).qty, 7);
      eq(c.getItems()[0].qty, 7);
    });
    test('setQty(0) xóa dòng', function () {
      var c = fresh(); c.add(P1);
      eq(c.setQty('1', 0).ok, true);
      eq(c.getItems().length, 0);
    });
    test('setQty âm xóa dòng', function () {
      var c = fresh(); c.add(P1);
      c.setQty('1', -3);
      eq(c.getItems().length, 0);
    });
    test('setQty > 99 bị chặn', function () {
      var c = fresh(); c.add(P1);
      var r = c.setQty('1', 150);
      eq(r.qty, 99); eq(r.capped, true);
    });
    test('setQty giá trị không phải số nguyên bị từ chối, giữ nguyên số cũ', function () {
      var c = fresh(); c.add(P1, 2);
      [1.5, NaN, '3', null, undefined].forEach(function (q) {
        eq(c.setQty('1', q).error, 'invalid_qty');
      });
      eq(c.getItems()[0].qty, 2);
    });
    test('setQty id không tồn tại', function () {
      var c = fresh();
      eq(c.setQty('nope', 2).error, 'not_found');
    });
    test('increment +1 và dừng ở 99', function () {
      var c = fresh(); c.add(P1, 98);
      eq(c.increment('1').qty, 99);
      var r = c.increment('1');
      eq(r.qty, 99); eq(r.capped, true);
    });
    test('decrement -1; về 0 thì xóa dòng', function () {
      var c = fresh(); c.add(P1, 2);
      eq(c.decrement('1').qty, 1);
      c.decrement('1');
      eq(c.getItems().length, 0);
    });
    test('increment/decrement id không tồn tại', function () {
      var c = fresh();
      eq(c.increment('x').error, 'not_found');
      eq(c.decrement('x').error, 'not_found');
    });
  });

  group('remove / clear', function () {
    test('remove xóa đúng dòng, trả về item đã xóa', function () {
      var c = fresh(); c.add(P1); c.add(P2);
      var r = c.remove('1');
      eq(r.ok, true); eq(r.item.id, '1');
      eq(c.getItems().map(function (i) { return i.id; }), ['3']);
    });
    test('remove id không tồn tại không làm hỏng giỏ', function () {
      var c = fresh(); c.add(P1);
      eq(c.remove('zzz').error, 'not_found');
      eq(c.getItems().length, 1);
    });
    test('clear xóa toàn bộ', function () {
      var c = fresh(); c.add(P1); c.add(P2); c.add(P3);
      eq(c.clear().cleared, 3);
      eq(c.getItems().length, 0);
      eq(c.getTotals().subtotal, 0);
    });
    test('clear giỏ rỗng không phát sự kiện', function () {
      var c = fresh(); var n = 0;
      c.subscribe(function () { n++; });
      c.clear();
      eq(n, 0);
    });
    test('thêm lại bình thường sau clear', function () {
      var c = fresh(); c.add(P1, 3); c.clear(); c.add(P1);
      eq(c.getItems()[0].qty, 1);
    });
  });

  group('subscribe', function () {
    test('listener nhận state mới và loại thay đổi', function () {
      var c = fresh(); var seen = [];
      c.subscribe(function (state, change) { seen.push([change.type, state.totals.totalQty]); });
      c.add(P1, 2); c.setQty('1', 4); c.remove('1');
      eq(seen, [['add', 2], ['qty', 4], ['remove', 0]]);
    });
    test('unsubscribe ngừng nhận', function () {
      var c = fresh(); var n = 0;
      var off = c.subscribe(function () { n++; });
      c.add(P1); off(); c.add(P2);
      eq(n, 1);
    });
    test('listener ném lỗi không làm hỏng listener khác hay store', function () {
      var c = fresh(); var ok = 0;
      var origErr = console.error; console.error = function () {};
      c.subscribe(function () { throw new Error('boom'); });
      c.subscribe(function () { ok++; });
      c.add(P1);
      console.error = origErr;
      eq(ok, 1);
      eq(c.getItems().length, 1);
    });
    test('thao tác thất bại không phát sự kiện', function () {
      var c = fresh(); var n = 0;
      c.subscribe(function () { n++; });
      c.add(null); c.remove('x'); c.setQty('x', 1); c.add(P1, 0);
      eq(n, 0);
    });
  });

  group('persistence', function () {
    test('giỏ được lưu và nạp lại ở store mới', function () {
      var st = memStorage();
      var a = fresh(st); a.add(P1, 2); a.add(P2);
      var b = fresh(st);
      eq(b.getItems(), a.getItems());
      eq(b.getTotals().subtotal, 2 * 45000 + 95000);
    });
    test('clear được ghi xuống storage', function () {
      var st = memStorage();
      var a = fresh(st); a.add(P1); a.clear();
      eq(fresh(st).getItems().length, 0);
    });
    test('JSON hỏng -> giỏ rỗng, không crash', function () {
      var st = memStorage(); st.data[S.STORAGE_KEY] = '{not json';
      var origWarn = console.warn; console.warn = function () {};
      var c = fresh(st);
      console.warn = origWarn;
      eq(c.getItems().length, 0);
    });
    test('sai version -> bỏ qua', function () {
      var st = memStorage(); st.data[S.STORAGE_KEY] = JSON.stringify({ v: 999, items: [{ id: '1', name: 'x', price: 1, qty: 1 }] });
      eq(fresh(st).getItems().length, 0);
    });
    test('dữ liệu không phải object/mảng -> giỏ rỗng', function () {
      [ 'null', '123', '"abc"', '[]', '{"v":1}', '{"v":1,"items":"x"}' ].forEach(function (raw) {
        var st = memStorage(); st.data[S.STORAGE_KEY] = raw;
        eq(fresh(st).getItems().length, 0, raw);
      });
    });
    test('dòng sai (giá âm, qty 0, qty thập phân, thiếu tên) bị lọc; dòng đúng được giữ', function () {
      var st = memStorage();
      st.data[S.STORAGE_KEY] = JSON.stringify({ v: 1, items: [
        { id: '1', name: 'OK', price: 10, qty: 2 },
        { id: '2', name: 'neg', price: -1, qty: 1 },
        { id: '3', name: 'q0', price: 1, qty: 0 },
        { id: '4', name: 'q1.5', price: 1, qty: 1.5 },
        { id: '5', price: 1, qty: 1 },
        null,
        { id: '1', name: 'dup', price: 1, qty: 1 }
      ] });
      var items = fresh(st).getItems();
      eq(items.length, 1);
      eq(items[0].name, 'OK');
      eq(items[0].qty, 2);
    });
    test('qty lưu quá 99 bị kéo về 99 khi nạp', function () {
      var st = memStorage();
      st.data[S.STORAGE_KEY] = JSON.stringify({ v: 1, items: [{ id: '1', name: 'A', price: 1, qty: 5000 }] });
      eq(fresh(st).getItems()[0].qty, 99);
    });
    test('storage ném lỗi khi ghi (đầy/bị chặn): giỏ vẫn hoạt động trong bộ nhớ', function () {
      var origWarn = console.warn; console.warn = function () {};
      var c = fresh(memStorage({ throwOnSet: true }));
      var r = c.add(P1, 2);
      console.warn = origWarn;
      eq(r.ok, true);
      eq(c.getItems()[0].qty, 2);
    });
    test('storage ném lỗi khi đọc: bắt đầu giỏ rỗng', function () {
      var c = fresh(memStorage({ throwOnGet: true }));
      eq(c.getItems().length, 0);
      eq(c.add(P1).ok, true);
    });
    test('không có storage (null): vẫn dùng được', function () {
      var c = S.createCartStore({ storage: { getItem: function () { throw 1; }, setItem: function () { throw 1; } } });
      var origWarn = console.warn; console.warn = function () {};
      eq(c.add(P1).ok, true);
      console.warn = origWarn;
    });
    test('hai giỏ khác key không lẫn nhau', function () {
      var st = memStorage();
      var a = S.createCartStore({ storage: st, key: 'A' }); a.add(P1);
      var b = S.createCartStore({ storage: st, key: 'B' });
      eq(b.getItems().length, 0);
    });
    test('reload() nạp lại dữ liệu mới ghi từ tab khác', function () {
      var st = memStorage();
      var a = fresh(st);
      var other = fresh(st); other.add(P2, 4);
      a.reload();
      eq(a.getItems()[0].qty, 4);
    });
  });

  group('reconcile với menu', function () {
    test('món không còn trong menu bị gỡ', function () {
      var c = fresh(); c.add(P1); c.add(P2);
      var r = c.reconcile([P1]);
      eq(r.removed.map(function (i) { return i.id; }), ['3']);
      eq(c.getItems().length, 1);
    });
    test('giá đổi trong menu -> giỏ lấy giá mới và báo updated', function () {
      var c = fresh(); c.add(P1, 2);
      var r = c.reconcile([{ id: '1', name: 'Gà Rán Giòn Cay', price: 50000, image: 'a.jpg', category: 'Gà rán' }]);
      eq(r.updated.length, 1);
      eq(r.updated[0].oldPrice, 45000); eq(r.updated[0].newPrice, 50000);
      eq(c.getTotals().subtotal, 100000);
    });
    test('không đổi gì -> không phát sự kiện', function () {
      var c = fresh(); c.add(P1); var n = 0;
      c.subscribe(function () { n++; });
      c.reconcile([P1, P2]);
      eq(n, 0);
    });
    test('menu rỗng hoặc undefined -> xóa hết, không crash', function () {
      var c = fresh(); c.add(P1);
      c.reconcile(undefined);
      eq(c.getItems().length, 0);
    });
    test('sản phẩm sai định dạng trong menu bị bỏ qua', function () {
      var c = fresh(); c.add(P1);
      c.reconcile([null, { id: '1', name: 'x', price: -1 }, P1]);
      eq(c.getItems().length, 1);
    });
    test('số lượng được giữ nguyên sau reconcile', function () {
      var c = fresh(); c.add(P1, 7);
      c.reconcile([{ id: '1', name: 'Gà Rán Giòn Cay', price: 46000 }]);
      eq(c.getItems()[0].qty, 7);
    });
  });

  group('an toàn dữ liệu (XSS payload chỉ là chuỗi)', function () {
    test('tên chứa HTML được giữ nguyên dạng chuỗi (UI chịu trách nhiệm dùng textContent)', function () {
      var c = fresh();
      c.add({ id: 'x', name: '<img src=x onerror=alert(1)>', price: 1 });
      eq(c.getItems()[0].name, '<img src=x onerror=alert(1)>');
    });
  });
})();
