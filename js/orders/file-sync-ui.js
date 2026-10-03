/**
 * KFC Orders - Khung giao diện "Lưu orders.db ra file" (dùng chung cho màn hình đặt hàng thành công và danh sách đơn).
 * window.KFCFileSyncUI.create({ compact?, downloadClass? }) trả về một phần tử DOM tự cập nhật theo trạng thái liên kết file.
 * Mọi chữ hiển thị đều dùng textContent (tên file do hệ điều hành đặt, được coi là không tin cậy).
 */
(function () {
  'use strict';

  function make(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function button(label, className, onClick) {
    var b = make('button', className, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function timeOf(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    try { return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); } catch (e) { return ''; }
  }

  var NOTICES = {
    not_sqlite: function (r) { return 'File "' + (r.fileName || '') + '" không phải cơ sở dữ liệu SQLite nên không được dùng (để tránh ghi đè nhầm). Hãy chọn file khác hoặc đặt tên mới, ví dụ orders.db.'; },
    not_orders_db: function (r) { return 'File "' + (r.fileName || '') + '" là SQLite của ứng dụng khác (không có bảng orders và order_items) nên không được dùng. Hãy đặt tên file mới, ví dụ orders.db.'; },
    file_unreadable: function (r) { return 'Không đọc được nội dung file "' + (r.fileName || '') + '" (file hỏng?). Hãy chọn file khác.'; },
    error: function (r) { return 'Không thực hiện được' + (r.error ? ': ' + r.error : '') + '.'; },
    import_failed: function () { return 'Không đọc được dữ liệu trong file nên chưa liên kết. Dữ liệu hiện có không bị thay đổi.'; },
    unsupported: function () { return 'Trình duyệt này không hỗ trợ tự động ghi file.'; }
  };

  function create(options) {
    options = options || {};
    var api = window.KFCOrders;
    var sync = api && api.fileSync;
    var root = make('section', 'fs-panel' + (options.compact ? ' fs-panel--compact' : ''));
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Lưu orders.db ra file trên máy');

    var notice = '';
    var busy = false;
    var off = null;

    function downloadBtn(label) {
      return button(label, 'fs-btn fs-btn--ghost' + (options.downloadClass ? ' ' + options.downloadClass : ''), async function (e) {
        var b = e.currentTarget;
        b.disabled = true;
        try {
          var r = await api.saveToFile();
          notice = r.method === 'picker' ? 'Đã lưu bản sao orders.db.' : r.method === 'download' ? 'Đã tải bản sao orders.db về máy.' : '';
        } catch (err) {
          console.error('[KFC FileSync UI] Lưu bản sao thất bại:', err);
          notice = err && err.code === 'sqljs_load_failed' ? 'Không tạo được file: hãy mở trang qua Live Server (http://).' : 'Không lưu được bản sao, vui lòng thử lại.';
        }
        render();
      });
    }

    async function run(fn) {
      if (busy) return;
      busy = true; notice = '';
      render();
      try { await fn(); } catch (err) { console.error('[KFC FileSync UI] Lỗi:', err); notice = 'Có lỗi xảy ra, vui lòng thử lại.'; }
      busy = false;
      render();
    }

    function onLink() {
      run(async function () {
        var r = await sync.link();
        if (r.status === 'written') notice = 'Đã chọn file và ghi dữ liệu vào "' + (r.fileName || 'orders.db') + '". Từ giờ file sẽ tự động được cập nhật.';
        else if (r.status === 'needs_permission') notice = 'Đã chọn file nhưng trình duyệt chưa cho ghi. Bấm "Cho phép ghi file".';
        else if (r.status === 'error' && r.fileName) notice = NOTICES.error(r);
        else if (NOTICES[r.status]) notice = NOTICES[r.status](r);
      });
    }

    function onChoice(choice) {
      run(async function () {
        var r = await sync.resolvePending(choice);
        if (r.status === 'written') notice = choice === 'use_file'
          ? 'Đã dùng ' + (r.imported || 0) + ' đơn hàng trong file. Từ giờ file sẽ tự động được cập nhật.'
          : 'Đã ghi đè file bằng dữ liệu hiện có. Từ giờ file sẽ tự động được cập nhật.';
        else if (NOTICES[r.status]) notice = NOTICES[r.status](r);
      });
    }

    function onGrant() {
      run(async function () {
        var r = await sync.grant();
        if (r.status === 'written') notice = 'Đã ghi dữ liệu vào file.';
        else if (r.status === 'needs_permission') notice = 'Bạn chưa cho phép ghi file. Dữ liệu vẫn an toàn trong trình duyệt.';
        else if (r.status === 'error') notice = NOTICES.error(r);
      });
    }

    function onUnlink() {
      run(async function () { await sync.unlink(); notice = 'Đã ngừng tự động ghi file. File cũ vẫn còn trên máy, dữ liệu vẫn nằm trong trình duyệt.'; });
    }

    function onChangeFile() {
      run(async function () {
        var r = await sync.link();
        if (r.status === 'written') notice = 'Đã chuyển sang file "' + (r.fileName || 'orders.db') + '".';
        else if (NOTICES[r.status]) notice = NOTICES[r.status](r);
      });
    }

    function render() {
      root.textContent = '';
      root.setAttribute('aria-busy', busy ? 'true' : 'false');
      var s = sync ? sync.getState() : { supported: false, linked: false };

      var title = make('h4', 'fs-panel__title');
      var text = make('p', 'fs-panel__text');
      var actions = make('div', 'fs-panel__actions');
      var tone = '';

      if (!api || !sync || !s.supported) {
        title.textContent = 'Lưu thành file orders.db';
        text.textContent = 'Đơn hàng đã được lưu trong trình duyệt này. Trình duyệt hiện tại không cho trang web tự ghi file lên máy. Muốn tự động có file orders.db hãy dùng Chrome hoặc Edge; còn lúc này bạn có thể tải về một bản sao.';
        if (api) actions.appendChild(downloadBtn('Tải về bản sao orders.db'));
      } else if (s.pending) {
        tone = 'fs-panel--warn';
        title.textContent = 'File này đã có dữ liệu';
        text.textContent = 'File "' + s.pending.fileName + '" đã có ' + s.pending.orderCount + ' đơn hàng. Chọn cách xử lý (cả hai cách đều thay thế một bên, vì vậy hãy chọn cẩn thận):';
        var list = make('ul', 'fs-choices');
        [['use_file', 'Dùng dữ liệu trong file', 'Thay các đơn đang có trong trình duyệt bằng ' + s.pending.orderCount + ' đơn trong file.', 'fs-btn fs-btn--primary'],
          ['overwrite', 'Ghi đè file bằng dữ liệu của trình duyệt', 'Các đơn đang có trong file sẽ bị xóa khỏi file.', 'fs-btn fs-btn--danger']].forEach(function (c) {
          var li = make('li', 'fs-choice');
          var b = button(c[1], c[3], function () { onChoice(c[0]); });
          b.disabled = busy;
          li.appendChild(b);
          li.appendChild(make('span', 'fs-choice__hint', c[2]));
          list.appendChild(li);
        });
        var cancel = button('Hủy, không liên kết', 'fs-btn fs-btn--ghost', function () { onChoice('cancel'); });
        cancel.disabled = busy;
        title.textContent = 'File này đã có dữ liệu';
        root.appendChild(title); root.appendChild(text); root.appendChild(list);
        actions.appendChild(cancel);
        root.className = 'fs-panel ' + tone + (options.compact ? ' fs-panel--compact' : '');
        root.appendChild(actions);
        appendNotice();
        return;
      } else if (s.linked) {
        var needsPermission = s.access !== 'granted' && s.access !== 'unknown';
        if (s.lastError) {
          tone = 'fs-panel--warn';
          title.textContent = 'Chưa ghi được vào file';
          text.textContent = 'Không ghi được vào "' + s.fileName + '": ' + s.lastError + '. Đơn hàng vẫn an toàn trong trình duyệt.';
          actions.appendChild(button('Thử lại', 'fs-btn fs-btn--primary', onGrant));
          actions.appendChild(button('Đổi file', 'fs-btn fs-btn--ghost', onChangeFile));
        } else if (needsPermission) {
          tone = 'fs-panel--warn';
          title.textContent = 'Cần cho phép ghi vào file';
          text.textContent = 'Đã liên kết với file "' + s.fileName + '". Sau khi mở lại trang, trình duyệt yêu cầu bạn cho phép ghi file thêm một lần. Đơn hàng vẫn an toàn trong trình duyệt.';
          actions.appendChild(button('Cho phép ghi file', 'fs-btn fs-btn--primary', onGrant));
          actions.appendChild(button('Ngừng liên kết', 'fs-btn fs-btn--ghost', onUnlink));
        } else {
          tone = 'fs-panel--ok';
          title.textContent = '✓ Đang tự động lưu vào file';
          text.textContent = 'File: "' + s.fileName + '"' + (s.lastWrite ? ' · ghi gần nhất lúc ' + timeOf(s.lastWrite) : ' · sẽ được ghi khi có đơn mới hoặc khi bạn bấm "Ghi ngay"') +
            '. Mỗi đơn hàng mới và mỗi lần đổi trạng thái sẽ tự động được ghi vào file này, bạn không cần bấm gì thêm.';
          if (!s.lastWrite) actions.appendChild(button('Ghi ngay', 'fs-btn fs-btn--primary', onGrant));
          actions.appendChild(button('Đổi file', 'fs-btn fs-btn--ghost', onChangeFile));
          actions.appendChild(button('Ngừng tự động lưu', 'fs-btn fs-btn--ghost', onUnlink));
        }
      } else {
        title.textContent = 'Lưu thành file orders.db (tự động)';
        text.textContent = 'Đơn hàng đã được lưu trong trình duyệt này. Để có file orders.db thật trên máy (SQLite, gồm 2 bảng orders và order_items) và tự động cập nhật mỗi khi đặt hàng hoặc đổi trạng thái, hãy chọn nơi lưu file một lần. Trình duyệt chỉ cho trang web ghi file sau khi chính bạn chọn.';
        actions.appendChild(button('Chọn nơi lưu file orders.db', 'fs-btn fs-btn--primary', onLink));
        actions.appendChild(downloadBtn('Chỉ tải về một bản sao'));
      }

      root.className = 'fs-panel' + (tone ? ' ' + tone : '') + (options.compact ? ' fs-panel--compact' : '');
      root.appendChild(title);
      root.appendChild(text);
      Array.prototype.forEach.call(actions.querySelectorAll('button'), function (b) { b.disabled = busy; });
      root.appendChild(actions);
      appendNotice();
    }

    function appendNotice() {
      var n = make('p', 'fs-panel__notice', notice);
      n.setAttribute('role', 'status');
      n.hidden = !notice;
      root.appendChild(n);
    }

    render();
    if (sync) {
      off = sync.subscribe(function () {
        if (!root.isConnected) { if (off) off(); return; } // phần tử đã bị gỡ khỏi trang
        if (!busy) render();
      });
    }
    return root;
  }

  window.KFCFileSyncUI = { create: create };
})();
