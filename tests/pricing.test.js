/**
 * Test tính giá giảm. Cần các global: test, group, assert, eq, KFCPricing
 */
(function () {
  'use strict';
  var P = KFCPricing;

  group('pricing.normalizeDiscount', function () {
    test('số nguyên hợp lệ giữ nguyên', function () {
      eq(P.normalizeDiscount(0), 0); eq(P.normalizeDiscount(20), 20); eq(P.normalizeDiscount(100), 100);
    });
    test('chuỗi số được hiểu là số', function () {
      eq(P.normalizeDiscount('20'), 20); eq(P.normalizeDiscount(' 15 '), 15);
    });
    test('số thập phân được làm tròn', function () {
      eq(P.normalizeDiscount(33.4), 33); eq(P.normalizeDiscount(33.5), 34);
    });
    test('âm -> 0, lớn hơn 100 -> 100', function () {
      eq(P.normalizeDiscount(-5), 0); eq(P.normalizeDiscount(150), 100); eq(P.normalizeDiscount(1e9), 100);
    });
    test('giá trị lạ -> 0 (không có giảm giá)', function () {
      [undefined, null, '', '   ', 'abc', NaN, Infinity, -Infinity, {}, [], true].forEach(function (v) {
        eq(P.normalizeDiscount(v), 0, String(v));
      });
    });
  });

  group('pricing.discountedPrice', function () {
    test('45000 giảm 20% = 36000', function () { eq(P.discountedPrice(45000, 20), 36000); });
    test('95000 giảm 10% = 85500', function () { eq(P.discountedPrice(95000, 10), 85500); });
    test('279000 giảm 15% = 237150', function () { eq(P.discountedPrice(279000, 15), 237150); });
    test('0% hoặc thiếu discount giữ nguyên giá', function () {
      eq(P.discountedPrice(45000, 0), 45000); eq(P.discountedPrice(45000), 45000); eq(P.discountedPrice(45000, 'x'), 45000);
    });
    test('100% = miễn phí, không âm', function () { eq(P.discountedPrice(45000, 100), 0); });
    test('discount > 100 hoặc âm không làm giá âm hoặc tăng', function () {
      eq(P.discountedPrice(45000, 250), 0); eq(P.discountedPrice(45000, -50), 45000);
    });
    test('làm tròn đến đồng', function () {
      eq(P.discountedPrice(1001, 50), 501); // 500.5 -> 501
      eq(P.discountedPrice(1, 33), 1);      // 0.67 -> 1
    });
    test('giá không hợp lệ -> 0', function () {
      eq(P.discountedPrice(-1, 10), 0); eq(P.discountedPrice(NaN, 10), 0); eq(P.discountedPrice('abc', 10), 0);
    });
    test('giá bán luôn là số nguyên trong khoảng [0, giá gốc]', function () {
      for (var price = 0; price <= 300000; price += 7919) {
        for (var d = -10; d <= 120; d += 7) {
          var v = P.discountedPrice(price, d);
          assert(v >= 0 && v <= price && v === Math.floor(v), 'price=' + price + ' d=' + d + ' -> ' + v);
        }
      }
    });
    test('discount lớn hơn thì giá không cao hơn (đơn điệu)', function () {
      var prev = Infinity;
      for (var d = 0; d <= 100; d++) {
        var v = P.discountedPrice(123456, d);
        assert(v <= prev, 'd=' + d);
        prev = v;
      }
    });
  });

  group('pricing.savingPerUnit', function () {
    test('giá gốc = giá bán + tiền giảm', function () {
      [[45000, 20], [95000, 10], [279000, 15], [1001, 50], [0, 30]].forEach(function (c) {
        eq(P.discountedPrice(c[0], c[1]) + P.savingPerUnit(c[0], c[1]), c[0]);
      });
    });
    test('không giảm thì tiền giảm = 0', function () { eq(P.savingPerUnit(45000, 0), 0); });
    test('giá không hợp lệ -> 0', function () { eq(P.savingPerUnit('x', 10), 0); });
  });
})();
