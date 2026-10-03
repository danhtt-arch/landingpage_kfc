/**
 * Test quy tắc trạng thái đơn hàng. Cần global: test, group, assert, eq, KFCOrderStatus
 * (chạy được cả trong Node và trình duyệt)
 */
(function () {
  'use strict';
  var S = KFCOrderStatus;
  var ALL = ['not_sent', 'sending', 'delivered', 'cancelled'];

  group('danh sách và nhãn', function () {
    test('đúng 4 trạng thái theo thứ tự: chưa gửi, đang gửi, đã gửi thành công, đã bị hủy', function () {
      eq(S.IDS, ALL);
      eq(ALL.map(S.label), ['Chưa gửi', 'Đang gửi', 'Đã gửi thành công', 'Đã bị hủy']);
    });
    test('trạng thái đầu của đơn mới là "Chưa gửi"', function () { eq(S.INITIAL, 'not_sent'); });
    test('lý do hủy gồm đúng hai giá trị: Tai nạn, Hư hỏng', function () {
      eq(S.CANCEL_REASONS, ['accident', 'damaged']);
      eq(S.CANCEL_REASONS.map(S.reasonLabel), ['Tai nạn', 'Hư hỏng']);
    });
    test('isStatus chỉ nhận 4 giá trị (không nhận __proto__, constructor, rỗng, null)', function () {
      ALL.forEach(function (s) { assert(S.isStatus(s), s); });
      ['', 'SENDING', 'shipped', null, undefined, 5, {}, '__proto__', 'constructor', 'toString', 'hasOwnProperty'].forEach(function (s) { assert(!S.isStatus(s), String(s)); });
    });
    test('normalize: giá trị lạ/thiếu (đơn cũ) -> "Chưa gửi"', function () {
      [undefined, null, '', 'x', 5].forEach(function (v) { eq(S.normalize(v), 'not_sent'); });
      eq(S.normalize('sending'), 'sending');
    });
    test('label và reasonLabel không crash với giá trị lạ', function () {
      eq(S.label('zzz'), 'Chưa gửi'); eq(S.reasonLabel('zzz'), ''); eq(S.reasonLabel(null), ''); eq(S.reasonLabel('__proto__'), '');
    });
  });

  group('canTransition: toàn bộ ma trận 4×4', function () {
    var allowed = { not_sent: ['sending', 'cancelled'], sending: ['delivered', 'cancelled'], delivered: [], cancelled: [] };
    ALL.forEach(function (from) {
      ALL.forEach(function (to) {
        var expected = allowed[from].indexOf(to) !== -1;
        test(S.label(from) + ' -> ' + S.label(to) + ': ' + (expected ? 'được' : 'không được'), function () {
          eq(S.canTransition(from, to), expected);
        });
      });
    });
    test('giá trị lạ -> false', function () {
      eq(S.canTransition('x', 'sending'), false); eq(S.canTransition('not_sent', 'x'), false);
      eq(S.canTransition(null, undefined), false); eq(S.canTransition('__proto__', 'sending'), false);
    });
  });

  group('allowedNext / isFinal', function () {
    test('allowedNext theo từng trạng thái', function () {
      eq(S.allowedNext('not_sent'), ['sending', 'cancelled']);
      eq(S.allowedNext('sending'), ['delivered', 'cancelled']);
      eq(S.allowedNext('delivered'), []); eq(S.allowedNext('cancelled'), []); eq(S.allowedNext('x'), []);
    });
    test('allowedNext trả về bản sao: sửa kết quả không làm hỏng bảng quy tắc', function () {
      S.allowedNext('not_sent').push('delivered');
      eq(S.allowedNext('not_sent'), ['sending', 'cancelled']);
    });
    test('isFinal: chỉ "đã gửi thành công" và "đã bị hủy"', function () {
      eq(ALL.map(S.isFinal), [false, false, true, true]); eq(S.isFinal('x'), false);
    });
    test('mọi trạng thái đều có thể đi tới trạng thái cuối (không có ngõ cụt)', function () {
      ['not_sent', 'sending'].forEach(function (s) { assert(S.allowedNext(s).some(S.isFinal) || S.allowedNext(s).some(function (n) { return S.allowedNext(n).length; }), s); });
    });
  });

  group('validateChange', function () {
    test('chuyển hợp lệ không cần lý do', function () {
      var r = S.validateChange('not_sent', 'sending'); eq([r.ok, r.reason, r.note], [true, null, '']);
      r = S.validateChange('sending', 'delivered'); eq(r.ok, true);
    });
    test('hủy phải có lý do: thiếu -> cancel_reason_required, nêu cả hai lý do', function () {
      ['not_sent', 'sending'].forEach(function (from) {
        [undefined, {}, { reason: '' }, { reason: null }, { reason: 'other' }, { reason: 'ACCIDENT' }, { reason: 5 }, { reason: '__proto__' }].forEach(function (extra) {
          var r = S.validateChange(from, 'cancelled', extra);
          eq([r.ok, r.code], [false, 'cancel_reason_required'], from + ' ' + JSON.stringify(extra));
          assert(/Tai nạn/.test(r.message) && /Hư hỏng/.test(r.message), 'thông báo phải nêu lý do');
        });
      });
    });
    test('hủy với lý do tai nạn / hư hỏng hợp lệ, kèm ghi chú đã làm sạch', function () {
      var r = S.validateChange('sending', 'cancelled', { reason: 'accident', note: '  xe va chạm ​ ' });
      eq([r.ok, r.reason, r.note], [true, 'accident', 'xe va chạm']);
      r = S.validateChange('not_sent', 'cancelled', { reason: 'damaged' });
      eq([r.ok, r.reason, r.note], [true, 'damaged', '']);
    });
    test('không cho kèm lý do khi không hủy -> reason_not_allowed', function () {
      var r = S.validateChange('not_sent', 'sending', { reason: 'accident' });
      eq([r.ok, r.code], [false, 'reason_not_allowed']);
      eq(S.validateChange('sending', 'delivered', { reason: 'damaged' }).code, 'reason_not_allowed');
    });
    test('lý do rỗng/null khi không hủy thì bỏ qua', function () {
      eq(S.validateChange('not_sent', 'sending', { reason: '' }).ok, true);
      eq(S.validateChange('not_sent', 'sending', { reason: null }).ok, true);
    });
    test('đi lùi, nhảy cóc, đứng yên đều bị từ chối: invalid_transition', function () {
      [['sending', 'not_sent'], ['delivered', 'sending'], ['delivered', 'not_sent'], ['not_sent', 'delivered'], ['not_sent', 'not_sent'], ['sending', 'sending']].forEach(function (c) {
        var r = S.validateChange(c[0], c[1]); eq([r.ok, r.code], [false, 'invalid_transition'], c.join('->'));
      });
    });
    test('đơn đã kết thúc không đổi được nữa và thông báo nói rõ', function () {
      ['delivered', 'cancelled'].forEach(function (from) {
        ['not_sent', 'sending', 'delivered', 'cancelled'].forEach(function (to) {
          var r = S.validateChange(from, to, { reason: 'accident' });
          eq(r.ok, false, from + '->' + to);
        });
        assert(S.validateChange(from, 'sending').message.indexOf('đã kết thúc') > -1);
      });
    });
    test('trạng thái lạ -> invalid_status', function () {
      eq(S.validateChange('not_sent', 'shipped').code, 'invalid_status');
      eq(S.validateChange('x', 'sending').code, 'invalid_status');
      eq(S.validateChange('not_sent', undefined).code, 'invalid_status');
    });
    test('ghi chú: không phải chuỗi / quá dài -> invalid_note; biên 200 ok, 201 lỗi', function () {
      eq(S.validateChange('sending', 'cancelled', { reason: 'damaged', note: 5 }).code, 'invalid_note');
      eq(S.validateChange('sending', 'cancelled', { reason: 'damaged', note: {} }).code, 'invalid_note');
      eq(S.validateChange('sending', 'cancelled', { reason: 'damaged', note: new Array(202).join('a') }).code, 'invalid_note');
      eq(S.validateChange('sending', 'cancelled', { reason: 'damaged', note: new Array(201).join('a') }).ok, true);
    });
    test('ghi chú chỉ toàn ký tự ẩn -> rỗng; null/undefined cho phép', function () {
      eq(S.validateChange('sending', 'cancelled', { reason: 'damaged', note: '​\u0000 ' }).note, '');
      eq(S.validateChange('sending', 'cancelled', { reason: 'damaged', note: null }).note, '');
    });
    test('thông báo lỗi là tiếng Việt, nêu tên trạng thái', function () {
      var m = S.validateChange('not_sent', 'delivered').message;
      assert(m.indexOf('Chưa gửi') > -1 && m.indexOf('Đã gửi thành công') > -1, m);
    });
    test('không làm thay đổi object đầu vào', function () {
      var extra = { reason: 'accident', note: ' a ' }; var before = JSON.stringify(extra);
      S.validateChange('sending', 'cancelled', extra); eq(JSON.stringify(extra), before);
    });
  });

  group('buildTimeline', function () {
    var T0 = '2026-10-03T07:00:00.000Z', T1 = '2026-10-03T08:00:00.000Z', T2 = '2026-10-03T09:00:00.000Z';
    function sum(steps) { return steps.map(function (s) { return s.status + ':' + s.state; }); }

    test('đơn mới: Chưa gửi (hiện tại, có giờ đặt) -> Đang gửi, Đã gửi thành công (sắp tới, chưa có giờ)', function () {
      var st = S.buildTimeline({ status: 'not_sent', created_at: T0 }, []);
      eq(sum(st), ['not_sent:current', 'sending:upcoming', 'delivered:upcoming']);
      eq([st[0].at, st[1].at, st[2].at], [T0, null, null]);
    });
    test('đang gửi: bước 1 xong, bước 2 hiện tại kèm giờ', function () {
      var st = S.buildTimeline({ status: 'sending', created_at: T0 }, [{ from_status: 'not_sent', to_status: 'sending', changed_at: T1 }]);
      eq(sum(st), ['not_sent:done', 'sending:current', 'delivered:upcoming']);
      eq([st[0].at, st[1].at, st[2].at], [T0, T1, null]);
    });
    test('đã gửi thành công: mọi bước xong, đủ giờ', function () {
      var st = S.buildTimeline({ status: 'delivered', created_at: T0 }, [
        { from_status: 'not_sent', to_status: 'sending', changed_at: T1 }, { from_status: 'sending', to_status: 'delivered', changed_at: T2 }]);
      eq(sum(st), ['not_sent:done', 'sending:done', 'delivered:done']);
      eq(st.map(function (s) { return s.at; }), [T0, T1, T2]);
    });
    test('hủy khi đang gửi: các bước tới "Đang gửi" xong rồi tới bước "Đã bị hủy" kèm lý do + ghi chú + giờ', function () {
      var st = S.buildTimeline({ status: 'cancelled', created_at: T0, cancel_reason: 'accident' }, [
        { from_status: 'not_sent', to_status: 'sending', changed_at: T1 },
        { from_status: 'sending', to_status: 'cancelled', reason: 'accident', note: 'xe va chạm', changed_at: T2 }]);
      eq(sum(st), ['not_sent:done', 'sending:done', 'cancelled:cancelled']);
      var c = st[2]; eq([c.at, c.reason, c.reasonLabel, c.note], [T2, 'accident', 'Tai nạn', 'xe va chạm']);
    });
    test('hủy khi chưa gửi: chỉ có bước đầu rồi tới "Đã bị hủy"', function () {
      var st = S.buildTimeline({ status: 'cancelled', created_at: T0, cancel_reason: 'damaged' }, [
        { from_status: 'not_sent', to_status: 'cancelled', reason: 'damaged', note: '', changed_at: T1 }]);
      eq(sum(st), ['not_sent:done', 'cancelled:cancelled']); eq(st[1].reasonLabel, 'Hư hỏng');
    });
    test('thiếu lịch sử (dữ liệu cũ) vẫn dựng được, không crash', function () {
      eq(sum(S.buildTimeline({ status: 'cancelled', created_at: T0, cancel_reason: 'damaged' }, undefined)), ['not_sent:done', 'cancelled:cancelled']);
      eq(sum(S.buildTimeline({}, null)), ['not_sent:current', 'sending:upcoming', 'delivered:upcoming']);
      eq(sum(S.buildTimeline(null, [null, undefined])), ['not_sent:current', 'sending:upcoming', 'delivered:upcoming']);
    });
    test('lý do lấy từ cột cancel_reason khi lịch sử không có', function () {
      var st = S.buildTimeline({ status: 'cancelled', created_at: T0, cancel_reason: 'accident' }, []);
      eq(st[st.length - 1].reasonLabel, 'Tai nạn');
    });
  });
})();
