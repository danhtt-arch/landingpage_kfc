/**
 * Test giảm giá trong giỏ hàng. Cần các global: test, group, assert, eq, KFCCartStore
 */
(function () {
  'use strict';
  var S = KFCCartStore;

  function memStorage() {
    var data = {};
    return {
      data: data,
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); }
    };
  }
  function fresh(st) { return S.createCartStore({ storage: st || memStorage() }); }

  var P1 = { id: '1', name: 'Gà Rán Giòn Cay', price: 45000 };
  var P2 = { id: '3', name: 'Combo 1 Người', price: 95000 };
  var SALE = { id: '11', name: 'Gà Giảm 20%', price: 45000, discount: 20, image: 's.jpg', category: 'Gà rán' };
  var SALE2 = { id: '12', name: 'Combo Giảm 15%', price: 279000, discount: 15 };

  group('giảm giá › item', function () {
    test('unitPrice = giá sau giảm; price giữ giá gốc', function () {
      var c = fresh(); c.add(SALE);
      var it = c.getItems()[0];
      eq(it.price, 45000); eq(it.discount, 20); eq(it.unitPrice, 36000);
    });
    test('món không có discount: discount = 0, unitPrice = price', function () {
      var c = fresh(); c.add(P1);
      eq(c.getItems()[0].discount, 0); eq(c.getItems()[0].unitPrice, 45000);
    });
    test('discount sai (âm, > 100, chữ) được chuẩn hóa, giá không bao giờ âm', function () {
      var c = fresh();
      c.add({ id: 'a', name: 'A', price: 1000, discount: 500 });
      c.add({ id: 'b', name: 'B', price: 1000, discount: -30 });
      c.add({ id: 'c', name: 'C', price: 1000, discount: 'abc' });
      var items = c.getItems();
      eq(items.map(function (i) { return i.discount; }), [100, 0, 0]);
      eq(items.map(function (i) { return i.unitPrice; }), [0, 1000, 1000]);
      assert(c.getTotals().total >= 0);
    });
  });

  group('giảm giá › tổng tiền', function () {
    test('subtotal theo giá gốc, discountTotal là tiền giảm, total = subtotal - discountTotal', function () {
      var c = fresh(); c.add(SALE, 2); c.add(P2, 1);
      var t = c.getTotals();
      eq(t.subtotal, 2 * 45000 + 95000);
      eq(t.discountTotal, 2 * 9000);
      eq(t.total, 2 * 36000 + 95000);
    });
    test('nhiều món giảm giá khác nhau', function () {
      var c = fresh(); c.add(SALE, 3); c.add(SALE2, 2);
      var t = c.getTotals();
      eq(t.discountTotal, 3 * 9000 + 2 * (279000 - 237150));
      eq(t.total, 3 * 36000 + 2 * 237150);
    });
    test('giỏ không có món giảm giá: discountTotal = 0, total = subtotal', function () {
      var c = fresh(); c.add(P1, 2); c.add(P2);
      eq(c.getTotals().discountTotal, 0);
      eq(c.getTotals().total, c.getTotals().subtotal);
    });
    test('total = subtotal - discountTotal và không âm ở mọi thao tác', function () {
      var c = fresh();
      function check() { var t = c.getTotals(); eq(t.total, t.subtotal - t.discountTotal); assert(t.total >= 0); }
      c.add(SALE, 5); check(); c.add(SALE2); check(); c.setQty('11', 99); check(); c.decrement('12'); check(); c.add(P1, 4); check();
    });
    test('giảm 100%: miễn phí, total không âm', function () {
      var c = fresh(); c.add({ id: 'f', name: 'Free', price: 10000, discount: 100 }, 3);
      eq(c.getTotals().total, 0); eq(c.getTotals().discountTotal, 30000);
    });
    test('đổi số lượng cập nhật cả tiền giảm', function () {
      var c = fresh(); c.add(SALE, 1);
      c.setQty('11', 10);
      eq(c.getTotals().discountTotal, 90000); eq(c.getTotals().total, 360000);
    });
  });

  group('giảm giá › lưu trữ', function () {
    test('được lưu và nạp lại', function () {
      var st = memStorage(); var a = fresh(st); a.add(SALE, 2);
      var b = fresh(st);
      eq(b.getItems()[0].discount, 20); eq(b.getTotals().total, 72000); eq(b.getTotals().discountTotal, 18000);
    });
    test('dữ liệu cũ không có discount được nạp với discount = 0', function () {
      var st = memStorage();
      st.data[S.STORAGE_KEY] = JSON.stringify({ v: 1, items: [{ id: '1', name: 'Cũ', price: 45000, qty: 2 }] });
      var c = fresh(st);
      eq(c.getItems()[0].discount, 0); eq(c.getTotals().total, 90000);
    });
    test('discount hỏng trong storage bị chuẩn hóa, không làm giá âm', function () {
      var st = memStorage();
      st.data[S.STORAGE_KEY] = JSON.stringify({ v: 1, items: [
        { id: '1', name: 'A', price: 1000, discount: 999, qty: 1 },
        { id: '2', name: 'B', price: 1000, discount: 'x', qty: 1 },
        { id: '3', name: 'C', price: 1000, discount: -9, qty: 1 }
      ] });
      eq(fresh(st).getItems().map(function (i) { return i.unitPrice; }), [0, 1000, 1000]);
    });
    test('hoàn tác (thêm lại từ bản chụp item) giữ nguyên giảm giá', function () {
      var c = fresh(); c.add(SALE, 3);
      var snap = c.getItems()[0]; // có thêm unitPrice
      c.clear(); c.add(snap, snap.qty);
      eq(c.getItems()[0].unitPrice, 36000); eq(c.getTotals().total, 108000);
    });
  });

  group('giảm giá › đồng bộ với menu (reconcile)', function () {
    test('menu thêm giảm giá cho món trong giỏ -> cập nhật giá và báo updated', function () {
      var c = fresh(); c.add(P1, 2);
      var r = c.reconcile([{ id: '1', name: P1.name, price: 45000, discount: 20 }]);
      eq(r.updated.length, 1); eq(r.updated[0].oldPrice, 45000); eq(r.updated[0].newPrice, 36000);
      eq(c.getTotals().total, 72000);
    });
    test('menu bỏ giảm giá -> giá trở về giá gốc', function () {
      var c = fresh(); c.add(SALE, 1);
      var r = c.reconcile([{ id: '11', name: SALE.name, price: 45000, discount: 0 }]);
      eq(r.updated[0].newPrice, 45000); eq(c.getTotals().discountTotal, 0);
    });
    test('giá bán cuối không đổi (dù giá gốc/discount đổi) -> không báo updated', function () {
      var c = fresh(); c.add({ id: '11', name: 'A', price: 50000, discount: 20 }); // 40000
      var r = c.reconcile([{ id: '11', name: 'A', price: 40000, discount: 0 }]);   // 40000
      eq(r.updated.length, 0);
      eq(c.getTotals().total, 40000);
    });
    test('số lượng giữ nguyên sau reconcile', function () {
      var c = fresh(); c.add(P1, 7);
      c.reconcile([{ id: '1', name: P1.name, price: 45000, discount: 10 }]);
      eq(c.getItems()[0].qty, 7); eq(c.getTotals().total, 7 * 40500);
    });
  });
})();
