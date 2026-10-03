/**
 * KFC Order Status - Quy tắc trạng thái đơn hàng (logic thuần, không đụng DOM/DB).
 * Chạy được trong trình duyệt (window.KFCOrderStatus) và Node (module.exports).
 *
 * Trạng thái:
 *   not_sent  = Chưa gửi              (trạng thái đầu của mọi đơn mới)
 *   sending   = Đang gửi
 *   delivered = Đã gửi thành công     (kết thúc)
 *   cancelled = Đã bị hủy             (kết thúc, bắt buộc có lý do: tai nạn / hư hỏng)
 *
 * Chuyển trạng thái hợp lệ (chỉ đi tiến, không quay lui):
 *   not_sent -> sending | cancelled
 *   sending  -> delivered | cancelled
 *   delivered, cancelled: không đổi được nữa
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KFCOrderStatus = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var INITIAL = 'not_sent';
  var IDS = ['not_sent', 'sending', 'delivered', 'cancelled'];

  var LABELS = {
    not_sent: 'Chưa gửi',
    sending: 'Đang gửi',
    delivered: 'Đã gửi thành công',
    cancelled: 'Đã bị hủy'
  };

  var TRANSITIONS = {
    not_sent: ['sending', 'cancelled'],
    sending: ['delivered', 'cancelled'],
    delivered: [],
    cancelled: []
  };

  var CANCEL_REASONS = ['accident', 'damaged'];
  var CANCEL_REASON_LABELS = { accident: 'Tai nạn', damaged: 'Hư hỏng' };
  var NOTE_MAX = 200;

  /** Các bước hiển thị trên dòng thời gian của một đơn thành công (đi tiến) */
  var HAPPY_PATH = ['not_sent', 'sending', 'delivered'];

  function has(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

  function isStatus(s) { return typeof s === 'string' && has(LABELS, s); }

  /** Đơn cũ (chưa có cột status) được coi là "Chưa gửi" */
  function normalize(s) { return isStatus(s) ? s : INITIAL; }

  function label(s) { return isStatus(s) ? LABELS[s] : LABELS[INITIAL]; }

  function reasonLabel(r) { return typeof r === 'string' && has(CANCEL_REASON_LABELS, r) ? CANCEL_REASON_LABELS[r] : ''; }

  function canTransition(from, to) {
    return isStatus(from) && isStatus(to) && TRANSITIONS[from].indexOf(to) !== -1;
  }

  /** Các trạng thái có thể chuyển tới từ `from` (mảng mới, không ảnh hưởng dữ liệu gốc) */
  function allowedNext(from) {
    return isStatus(from) ? TRANSITIONS[from].slice() : [];
  }

  function isFinal(s) { return isStatus(s) && TRANSITIONS[s].length === 0; }

  /** Làm sạch ghi chú: bỏ ký tự điều khiển/ẩn, cắt đầu cuối */
  function cleanNote(raw) {
    if (typeof raw !== 'string') return '';
    return raw.normalize('NFC')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, '')
      .replace(/\r\n?/g, '\n')
      .trim();
  }

  /**
   * Kiểm tra một lần đổi trạng thái.
   * @param {string} from  trạng thái hiện tại
   * @param {string} to    trạng thái muốn chuyển tới
   * @param {{reason?:string, note?:string}} [extra]
   * @returns {{ok:true, reason:string|null, note:string} | {ok:false, code:string, message:string}}
   */
  function validateChange(from, to, extra) {
    extra = extra && typeof extra === 'object' ? extra : {};
    if (!isStatus(to)) return { ok: false, code: 'invalid_status', message: 'Trạng thái không hợp lệ' };
    if (!isStatus(from)) return { ok: false, code: 'invalid_status', message: 'Trạng thái hiện tại không hợp lệ' };
    if (from === to) return { ok: false, code: 'invalid_transition', message: 'Đơn hàng đã ở trạng thái "' + LABELS[to] + '"' };
    if (!canTransition(from, to)) {
      return {
        ok: false, code: 'invalid_transition',
        message: isFinal(from)
          ? 'Đơn hàng "' + LABELS[from] + '" đã kết thúc, không thể đổi trạng thái'
          : 'Không thể chuyển từ "' + LABELS[from] + '" sang "' + LABELS[to] + '"'
      };
    }
    if (to === 'cancelled') {
      if (CANCEL_REASONS.indexOf(extra.reason) === -1) {
        return { ok: false, code: 'cancel_reason_required', message: 'Vui lòng chọn lý do hủy: ' + CANCEL_REASONS.map(reasonLabel).join(' hoặc ') };
      }
    } else if (extra.reason !== undefined && extra.reason !== null && extra.reason !== '') {
      return { ok: false, code: 'reason_not_allowed', message: 'Chỉ đơn bị hủy mới có lý do' };
    }
    if (extra.note !== undefined && extra.note !== null && typeof extra.note !== 'string') {
      return { ok: false, code: 'invalid_note', message: 'Ghi chú không hợp lệ' };
    }
    var note = cleanNote(extra.note);
    if (note.length > NOTE_MAX) return { ok: false, code: 'invalid_note', message: 'Ghi chú tối đa ' + NOTE_MAX + ' ký tự' };
    return { ok: true, reason: to === 'cancelled' ? extra.reason : null, note: note };
  }

  /**
   * Dòng thời gian của một đơn: mỗi phần tử { status, label, state, at, reason?, reasonLabel?, note? }
   *   state: 'done' | 'current' | 'upcoming' | 'cancelled'
   * @param {{status?:string, created_at?:string, cancel_reason?:string}} order
   * @param {Array<{from_status:string, to_status:string, reason:string, note:string, changed_at:string}>} [history] theo thứ tự thời gian
   */
  function buildTimeline(order, history) {
    order = order || {};
    history = Array.isArray(history) ? history : [];
    var status = normalize(order.status);
    var entered = { not_sent: order.created_at || null };
    var cancelEntry = null;
    history.forEach(function (h) {
      if (!h) return;
      if (h.to_status === 'cancelled') cancelEntry = h;
      else if (isStatus(h.to_status)) entered[h.to_status] = h.changed_at || null;
    });

    var steps = [];
    if (status === 'cancelled') {
      var from = cancelEntry && isStatus(cancelEntry.from_status) ? cancelEntry.from_status : INITIAL;
      var upto = HAPPY_PATH.indexOf(from);
      if (upto === -1) upto = 0;
      HAPPY_PATH.slice(0, upto + 1).forEach(function (s) {
        steps.push({ status: s, label: LABELS[s], state: 'done', at: entered[s] || null });
      });
      var reason = (cancelEntry && cancelEntry.reason) || order.cancel_reason || null;
      steps.push({
        status: 'cancelled', label: LABELS.cancelled, state: 'cancelled',
        at: cancelEntry ? cancelEntry.changed_at || null : null,
        reason: reason, reasonLabel: reasonLabel(reason),
        note: cancelEntry && cancelEntry.note ? cancelEntry.note : ''
      });
      return steps;
    }
    var idx = HAPPY_PATH.indexOf(status);
    HAPPY_PATH.forEach(function (s, i) {
      // Đơn đã giao thành công: mọi bước đều "xong"
      var state = status === 'delivered' ? 'done' : i < idx ? 'done' : i === idx ? 'current' : 'upcoming';
      steps.push({ status: s, label: LABELS[s], state: state, at: i <= idx ? entered[s] || null : null });
    });
    return steps;
  }

  return {
    IDS: IDS,
    INITIAL: INITIAL,
    LABELS: LABELS,
    TRANSITIONS: TRANSITIONS,
    CANCEL_REASONS: CANCEL_REASONS,
    CANCEL_REASON_LABELS: CANCEL_REASON_LABELS,
    NOTE_MAX: NOTE_MAX,
    isStatus: isStatus,
    normalize: normalize,
    label: label,
    reasonLabel: reasonLabel,
    canTransition: canTransition,
    allowedNext: allowedNext,
    isFinal: isFinal,
    cleanNote: cleanNote,
    validateChange: validateChange,
    buildTimeline: buildTimeline
  };
});
