/**
 * KFC Payment - Kiểm tra và chuẩn hóa thông tin giao hàng (logic thuần, không đụng DOM).
 * Chạy được trong trình duyệt (window.KFCPaymentValidate) và Node (module.exports).
 *
 * Quy tắc:
 *  - Họ tên: 2-60 ký tự, chữ cái (có dấu tiếng Việt), khoảng trắng và . ' -
 *  - Số điện thoại: di động Việt Nam 10 số (03/05/07/08/09...), chấp nhận +84, dấu cách . - ( )
 *  - Địa chỉ: 10-200 ký tự, có chữ cái
 *  - Ghi chú: không bắt buộc, tối đa 200 ký tự
 *  - Mọi dữ liệu được loại bỏ ký tự điều khiển / ký tự ẩn và chuẩn hóa Unicode (NFC).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KFCPaymentValidate = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var METHOD_IDS = ['cod', 'bank_transfer'];
  var LIMITS = { nameMin: 2, nameMax: 60, addressMin: 10, addressMax: 200, noteMax: 200 };

  // Ký tự điều khiển (trừ tab, xuống dòng), ký tự rộng bằng 0 và ký tự đảo chiều văn bản
  var HIDDEN_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g;
  var NAME_PATTERN = /^\p{L}[\p{L}\p{M}\s.'’-]*$/u;
  var PHONE_PATTERN = /^0(3|5|7|8|9)\d{8}$/;

  function clean(v) {
    return typeof v === 'string' ? v.normalize('NFC').replace(HIDDEN_CHARS, '') : '';
  }

  /** Gộp mọi khoảng trắng/xuống dòng thành một dấu cách, cắt hai đầu */
  function oneLine(v) {
    return clean(v).replace(/\s+/g, ' ').trim();
  }

  /** "+84 912.345.678" -> "0912345678"; chuỗi lạ giữ nguyên (sẽ bị validatePhone từ chối) */
  function normalizePhone(raw) {
    var s = oneLine(raw).replace(/[\s.\-()]/g, '');
    if (/^\+84\d+$/.test(s)) return '0' + s.slice(3);
    if (/^84\d{9}$/.test(s)) return '0' + s.slice(2);
    return s;
  }

  function validateName(raw) {
    var v = oneLine(raw);
    if (!v) return { error: 'Vui lòng nhập họ và tên.', value: v };
    if (v.length < LIMITS.nameMin) return { error: 'Họ và tên quá ngắn.', value: v };
    if (v.length > LIMITS.nameMax) return { error: 'Họ và tên tối đa ' + LIMITS.nameMax + ' ký tự.', value: v };
    if (!NAME_PATTERN.test(v)) return { error: 'Họ và tên chỉ gồm chữ cái, khoảng trắng và các dấu . \' -', value: v };
    return { error: null, value: v };
  }

  function validatePhone(raw) {
    var v = normalizePhone(raw);
    if (!v) return { error: 'Vui lòng nhập số điện thoại.', value: v };
    if (!PHONE_PATTERN.test(v)) return { error: 'Số điện thoại di động gồm 10 chữ số, ví dụ 0912345678.', value: v };
    return { error: null, value: v };
  }

  function validateAddress(raw) {
    var v = oneLine(raw);
    if (!v) return { error: 'Vui lòng nhập địa chỉ giao hàng.', value: v };
    if (v.length < LIMITS.addressMin) return { error: 'Địa chỉ quá ngắn, vui lòng ghi rõ số nhà, đường, phường/xã, quận/huyện, tỉnh/thành.', value: v };
    if (v.length > LIMITS.addressMax) return { error: 'Địa chỉ tối đa ' + LIMITS.addressMax + ' ký tự.', value: v };
    if (!/\p{L}/u.test(v)) return { error: 'Địa chỉ không hợp lệ.', value: v };
    return { error: null, value: v };
  }

  function validateNote(raw) {
    var v = clean(raw).replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (v.length > LIMITS.noteMax) return { error: 'Ghi chú tối đa ' + LIMITS.noteMax + ' ký tự.', value: v };
    return { error: null, value: v };
  }

  var FIELD_VALIDATORS = { name: validateName, phone: validatePhone, address: validateAddress, note: validateNote };

  /** Kiểm tra một trường theo tên (dùng khi người dùng rời khỏi ô nhập) */
  function validateField(field, raw) {
    var fn = FIELD_VALIDATORS[field];
    if (!fn) throw new Error('Trường không tồn tại: ' + field);
    return fn(raw);
  }

  /**
   * Kiểm tra toàn bộ thông tin khách.
   * @param {{name?:*, phone?:*, address?:*, note?:*}} fields
   * @returns {{ok:boolean, errors:Object, value:{name:string, phone:string, address:string, note:string}}}
   */
  function validateCustomer(fields) {
    var f = fields && typeof fields === 'object' ? fields : {};
    var errors = {};
    var value = {};
    Object.keys(FIELD_VALIDATORS).forEach(function (k) {
      var r = FIELD_VALIDATORS[k](f[k]);
      value[k] = r.value;
      if (r.error) errors[k] = r.error;
    });
    return { ok: Object.keys(errors).length === 0, errors: errors, value: value };
  }

  function isValidMethod(id) {
    return typeof id === 'string' && METHOD_IDS.indexOf(id) !== -1;
  }

  return {
    METHOD_IDS: METHOD_IDS,
    LIMITS: LIMITS,
    normalizePhone: normalizePhone,
    validateField: validateField,
    validateName: validateName,
    validatePhone: validatePhone,
    validateAddress: validateAddress,
    validateNote: validateNote,
    validateCustomer: validateCustomer,
    isValidMethod: isValidMethod
  };
});
