/**
 * Test kiểm tra thông tin giao hàng. Cần global: test, group, assert, eq, KFCPaymentValidate
 * (chạy được cả trong Node và trình duyệt)
 */
(function () {
  'use strict';
  var V = KFCPaymentValidate;

  function ok(r) { return r.error === null; }

  group('normalizePhone', function () {
    [
      ['0912345678', '0912345678'],
      ['0912 345 678', '0912345678'],
      ['0912.345.678', '0912345678'],
      ['0912-345-678', '0912345678'],
      ['(0912) 345 678', '0912345678'],
      ['+84912345678', '0912345678'],
      ['+84 912 345 678', '0912345678'],
      ['84912345678', '0912345678'],
      ['  0912345678  ', '0912345678'],
      ['0912​345678', '0912345678'] // ký tự ẩn
    ].forEach(function (c) {
      test(JSON.stringify(c[0]) + ' -> ' + c[1], function () { eq(V.normalizePhone(c[0]), c[1]); });
    });
    test('giá trị không phải chuỗi -> chuỗi rỗng, không crash', function () {
      [null, undefined, 123, {}, []].forEach(function (v) { eq(V.normalizePhone(v), ''); });
    });
  });

  group('validatePhone', function () {
    ['0912345678', '0312345678', '0512345678', '0712345678', '0812345678', '+84 912 345 678', '84912345678'].forEach(function (p) {
      test('hợp lệ: ' + p, function () { assert(ok(V.validatePhone(p)), V.validatePhone(p).error); });
    });
    [
      '', '   ', '091234567', '09123456789', '0212345678', '0112345678', '0412345678', '0612345678',
      'abcdefghij', '09123abcde', '+8491234567', '+849123456789', '123456789', '0912345678a', '912345678'
    ].forEach(function (p) {
      test('không hợp lệ: ' + JSON.stringify(p), function () { assert(!ok(V.validatePhone(p)), 'phải bị từ chối'); });
    });
    test('trả về số đã chuẩn hóa', function () { eq(V.validatePhone('+84 912.345.678').value, '0912345678'); });
    test('thông báo lỗi bằng tiếng Việt, nêu ví dụ', function () {
      assert(/0912345678/.test(V.validatePhone('123').error));
    });
  });

  group('validateName', function () {
    ['Nguyễn Văn An', 'Trần Thị Bích Ngọc', 'Lê Hoàng', "O'Brien", 'Mary-Jane Watson', 'Nguyễn Văn A.', 'An', 'Đặng Thị Thu Hà', 'Nguyễn Thị Hồng', 'Zoë Quốc'].forEach(function (n) {
      test('hợp lệ: ' + n, function () { assert(ok(V.validateName(n)), V.validateName(n).error); });
    });
    test('chấp nhận chữ có dấu ở dạng tổ hợp (NFD) và chuẩn hóa về NFC', function () {
      var nfd = 'Nguyễn Văn An'; // Nguyễn Văn An dạng NFD
      var r = V.validateName(nfd);
      assert(ok(r), r.error);
      eq(r.value, 'Nguyễn Văn An'); eq(r.value.length, 'Nguyễn Văn An'.length);
    });
    [['', 'rỗng'], ['   ', 'toàn dấu cách'], ['A', 'quá ngắn'], ['12345', 'toàn số'], ['An123', 'có số'], ['An <b>', 'có thẻ HTML'],
      ['<script>alert(1)</script>', 'script'], ['An;DROP TABLE orders', 'ký tự ;'], ['@an', 'ký hiệu @'], ['-An', 'bắt đầu bằng dấu -'], ['😀 An', 'emoji']
    ].forEach(function (c) {
      test('không hợp lệ (' + c[1] + ')', function () { assert(!ok(V.validateName(c[0])), JSON.stringify(c[0])); });
    });
    test('độ dài biên 60 ok, 61 bị từ chối', function () {
      assert(ok(V.validateName(new Array(61).join('a'))), '60 ký tự');
      assert(!ok(V.validateName(new Array(62).join('a'))), '61 ký tự');
    });
    test('gộp khoảng trắng thừa và xuống dòng', function () {
      eq(V.validateName('  Nguyễn   Văn \n  An  ').value, 'Nguyễn Văn An');
    });
    test('loại ký tự ẩn/điều khiển', function () {
      eq(V.validateName('Nguyễn​ Văn\u0007 An‮').value, 'Nguyễn Văn An');
    });
    test('không phải chuỗi -> lỗi bắt buộc, không crash', function () {
      [null, undefined, 5, {}].forEach(function (v) { assert(!ok(V.validateName(v))); });
    });
  });

  group('validateAddress', function () {
    ['12 Nguyễn Huệ, Quận 1, TP.HCM', 'Số 5 ngõ 10 Láng Hạ, Đống Đa, Hà Nội', '123 Lê Lợi phường Bến Thành'].forEach(function (a) {
      test('hợp lệ: ' + a, function () { assert(ok(V.validateAddress(a)), V.validateAddress(a).error); });
    });
    [['', 'rỗng'], ['   ', 'toàn dấu cách'], ['12 Lê Lợi', 'quá ngắn (9 ký tự)'], ['1234567890', 'chỉ có số'], ['----------', 'chỉ có ký hiệu']].forEach(function (c) {
      test('không hợp lệ (' + c[1] + ')', function () { assert(!ok(V.validateAddress(c[0])), JSON.stringify(c[0])); });
    });
    test('biên: 10 ký tự ok, 9 bị từ chối', function () {
      assert(ok(V.validateAddress('Phố Huế 12')), '10 ký tự'); // 10
      assert(!ok(V.validateAddress('Phố Huế 1')), '9 ký tự');
    });
    test('biên: 200 ok, 201 bị từ chối', function () {
      assert(ok(V.validateAddress(new Array(201).join('a'))), '200');
      assert(!ok(V.validateAddress(new Array(202).join('a'))), '201');
    });
    test('xuống dòng trong địa chỉ được gộp thành dấu cách', function () {
      eq(V.validateAddress('12 Nguyễn Huệ\nQuận 1\r\nTP.HCM').value, '12 Nguyễn Huệ Quận 1 TP.HCM');
    });
    test('giữ nguyên chữ có thẻ HTML (UI luôn hiển thị bằng textContent, DB dùng tham số)', function () {
      var r = V.validateAddress('12 <b>Lê Lợi</b> Quận 1');
      assert(ok(r)); eq(r.value, '12 <b>Lê Lợi</b> Quận 1');
    });
  });

  group('validateNote', function () {
    test('không bắt buộc: rỗng/undefined/null hợp lệ', function () {
      [undefined, null, '', '   '].forEach(function (v) { var r = V.validateNote(v); assert(ok(r)); eq(r.value, ''); });
    });
    test('giữ xuống dòng, dọn khoảng trắng đầu/cuối và dòng trống thừa', function () {
      eq(V.validateNote('  ít cay  \n\n\n\nkhông hành  ').value, 'ít cay\n\nkhông hành');
    });
    test('CRLF -> LF', function () { eq(V.validateNote('a\r\nb\rc').value, 'a\nb\nc'); });
    test('biên 200 ok, 201 bị từ chối', function () {
      assert(ok(V.validateNote(new Array(201).join('a'))));
      assert(!ok(V.validateNote(new Array(202).join('a'))));
    });
    test('loại ký tự ẩn', function () { eq(V.validateNote('a​b\u0000c').value, 'abc'); });
  });

  group('validateCustomer (cả form)', function () {
    var good = { name: 'Nguyễn Văn An', phone: '0912345678', address: '12 Nguyễn Huệ, Quận 1, TP.HCM', note: '' };
    test('hợp lệ -> ok, value đã chuẩn hóa', function () {
      var r = V.validateCustomer({ name: '  Nguyễn  Văn An ', phone: '+84 912 345 678', address: '12 Nguyễn Huệ,\nQuận 1', note: ' ít cay ' });
      eq(r.ok, true); eq(r.errors, {});
      eq(r.value, { name: 'Nguyễn Văn An', phone: '0912345678', address: '12 Nguyễn Huệ, Quận 1', note: 'ít cay' });
    });
    test('thiếu hết: báo lỗi 3 trường bắt buộc, không báo ghi chú', function () {
      var r = V.validateCustomer({});
      eq(r.ok, false); eq(Object.keys(r.errors).sort(), ['address', 'name', 'phone']);
    });
    test('null / undefined / không phải object -> như thiếu hết, không crash', function () {
      [null, undefined, 'x', 5].forEach(function (v) { eq(V.validateCustomer(v).ok, false); });
    });
    test('chỉ sai một trường: chỉ báo trường đó', function () {
      ['name', 'phone', 'address'].forEach(function (k) {
        var f = JSON.parse(JSON.stringify(good)); f[k] = '';
        var r = V.validateCustomer(f);
        eq(Object.keys(r.errors), [k]);
      });
    });
    test('ghi chú quá dài cũng báo lỗi', function () {
      var f = JSON.parse(JSON.stringify(good)); f.note = new Array(250).join('a');
      eq(Object.keys(V.validateCustomer(f).errors), ['note']);
    });
    test('mọi thông báo lỗi là chuỗi tiếng Việt không rỗng', function () {
      var r = V.validateCustomer({ name: '1', phone: '1', address: '1', note: new Array(300).join('a') });
      Object.keys(r.errors).forEach(function (k) { assert(typeof r.errors[k] === 'string' && r.errors[k].length > 5, k); });
    });
    test('không làm thay đổi object đầu vào', function () {
      var f = { name: '  An  ', phone: '+84912345678', address: 'x', note: ' a ' }; var before = JSON.stringify(f);
      V.validateCustomer(f); eq(JSON.stringify(f), before);
    });
    test('validateField trùng kết quả với validateCustomer', function () {
      eq(V.validateField('phone', '+84912345678').value, '0912345678');
      var threw = false; try { V.validateField('zip', '1'); } catch (e) { threw = true; } assert(threw, 'trường lạ phải ném lỗi');
    });
  });

  group('isValidMethod', function () {
    test('chỉ chấp nhận cod và bank_transfer', function () {
      eq(V.METHOD_IDS, ['cod', 'bank_transfer']);
      assert(V.isValidMethod('cod') && V.isValidMethod('bank_transfer'));
      ['', 'COD', 'card', 'momo', null, undefined, 5, {}, '__proto__', 'constructor', 'toString'].forEach(function (m) {
        assert(!V.isValidMethod(m), String(m));
      });
    });
  });
})();
