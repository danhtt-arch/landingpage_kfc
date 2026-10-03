/**
 * Test dữ liệu menu + CSV parser (chỉ chạy bằng Node vì cần đọc file).
 * Đảm bảo mọi món trong menu.csv đều thêm được vào giỏ.
 */
(function () {
  'use strict';
  var fs = require('fs');
  var path = require('path');
  var root = path.join(__dirname, '..');
  var Csv = require(path.join(root, 'js', 'csv.js'));
  var S = KFCCartStore;

  var csvText = fs.readFileSync(path.join(root, 'data', 'menu.csv'), 'utf8');
  var products = Csv.parseCSV(csvText);

  group('csv.parseCSV', function () {
    test('field có dấu phẩy trong ngoặc kép được giữ nguyên', function () {
      var rows = Csv.parseCSV('id,name,price\n1,"A, B",100');
      eq(rows[0].name, 'A, B');
      eq(rows[0].price, 100);
    });
    test('dấu nháy kép escape ""', function () {
      eq(Csv.parseCSV('id,name\n1,"He said ""hi"""')[0].name, 'He said "hi"');
    });
    test('CRLF, dòng trống và BOM', function () {
      var rows = Csv.parseCSV('﻿id,name\r\n1,A\r\n\r\n2,B\r\n');
      eq(rows.length, 2);
      eq(rows[1].name, 'B');
    });
    test('dòng thiếu cột bị bỏ qua', function () {
      eq(Csv.parseCSV('id,name,price\n1,A\n2,B,5').length, 1);
    });
    test('cột discount -> number; thiếu hoặc sai -> 0', function () {
      var r = Csv.parseCSV('id,price,discount\n1,100,"20"\n2,100,abc\n3,100,');
      eq(r.map(function (x) { return x.discount; }), [20, 0, 0]);
    });
    test('CSV rỗng / chỉ header / không phải chuỗi -> []', function () {
      eq(Csv.parseCSV(''), []);
      eq(Csv.parseCSV('id,name'), []);
      eq(Csv.parseCSV(null), []);
      eq(Csv.parseCSV(undefined), []);
    });
    test('price sai định dạng -> 0, featured -> boolean', function () {
      var r = Csv.parseCSV('id,price,featured\n1,abc,TRUE\n2,9000,false');
      eq(r[0].price, 0); eq(r[0].featured, true);
      eq(r[1].price, 9000); eq(r[1].featured, false);
    });
  });

  group('data/menu.csv', function () {
    test('có sản phẩm', function () { assert(products.length > 0); });
    test('ID không trùng', function () {
      var ids = products.map(function (p) { return p.id; });
      eq(new Set(ids).size, ids.length);
    });
    test('mọi sản phẩm hợp lệ để đưa vào giỏ (id, name, price số >= 0)', function () {
      products.forEach(function (p) { assert(S.isValidProduct(p), 'sản phẩm lỗi: ' + JSON.stringify(p)); });
    });
    test('discount là số nguyên 0..100', function () {
      products.forEach(function (p) {
        var d = p.discount === undefined ? 0 : p.discount;
        assert(typeof d === 'number' && d >= 0 && d <= 100 && Math.floor(d) === d, 'discount sai id=' + p.id + ': ' + p.discount);
      });
    });
    test('có ít nhất một món đang giảm giá, và giá bán thấp hơn giá gốc', function () {
      var sale = products.filter(function (p) { return p.discount > 0; });
      assert(sale.length > 0, 'chưa có món giảm giá');
      sale.forEach(function (p) { assert(KFCPricing.discountedPrice(p.price, p.discount) < p.price, 'id=' + p.id); });
    });
    test('thêm toàn bộ menu vào giỏ: tổng sau giảm đúng', function () {
      var c = S.createCartStore({ storage: { getItem: function () { return null; }, setItem: function () {} } });
      var expected = 0;
      products.forEach(function (p) { c.add(p, 2); expected += 2 * KFCPricing.discountedPrice(p.price, p.discount); });
      eq(c.getTotals().total, expected);
    });
    test('category không rỗng', function () {
      products.forEach(function (p) { assert(p.category, 'thiếu category id=' + p.id); });
    });
    test('file ảnh của mọi sản phẩm tồn tại', function () {
      products.forEach(function (p) {
        assert(fs.existsSync(path.join(root, p.image)), 'thiếu ảnh: ' + p.image);
      });
    });
    test('thêm toàn bộ menu vào giỏ: tổng đúng', function () {
      var c = S.createCartStore({ storage: { getItem: function () { return null; }, setItem: function () {} } });
      var expected = 0;
      products.forEach(function (p) { c.add(p, 2); expected += 2 * p.price; });
      eq(c.getItems().length, products.length);
      eq(c.getTotals().subtotal, expected);
    });
  });

  group('app.js: CSV dự phòng khi mở bằng file://', function () {
    test('bản CSV nhúng trong app.js khớp data/menu.csv', function () {
      var src = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
      var m = src.match(/EMBEDDED_CSV_FALLBACK\s*=\s*`([\s\S]*?)`/);
      assert(m, 'không tìm thấy EMBEDDED_CSV_FALLBACK');
      eq(Csv.parseCSV(m[1]), products);
    });
  });
})();
