# Module 3 — Trạng Thái Đơn Hàng

> Phạm vi: trạng thái của đơn hàng đã đặt (Chưa gửi, Đang gửi, Đã gửi thành công, Đã bị hủy), danh sách đơn, chi tiết kèm dòng thời gian, và chuyển trạng thái. Không làm gì ngoài phạm vi này.

## 1. Trạng thái và quy tắc

| Mã | Hiển thị | Ý nghĩa |
|---|---|---|
| `not_sent` | **Chưa gửi** | Trạng thái đầu của mọi đơn mới |
| `sending` | **Đang gửi** | Đơn đang trên đường giao |
| `delivered` | **Đã gửi thành công** | Kết thúc |
| `cancelled` | **Đã bị hủy** | Kết thúc; bắt buộc có lý do **Tai nạn** (`accident`) hoặc **Hư hỏng** (`damaged`), có thể kèm ghi chú |

Chuyển trạng thái hợp lệ (chỉ đi tiến, không quay lui):

```text
Chưa gửi ──► Đang gửi ──► Đã gửi thành công   (kết thúc)
    │            │
    └────────────┴──────► Đã bị hủy           (kết thúc, bắt buộc có lý do)
```

- Từ **Chưa gửi** được chuyển sang Đang gửi hoặc Đã bị hủy; từ **Đang gửi** được chuyển sang Đã gửi thành công hoặc Đã bị hủy.
- **Đã gửi thành công** và **Đã bị hủy** là trạng thái cuối: không đổi được nữa.
- Lý do hủy chỉ có hai giá trị theo yêu cầu (tai nạn, hư hỏng). Tôi cho phép hủy cả khi đơn chưa gửi (ví dụ hàng hư hỏng ngay tại cửa hàng).
- Đơn cũ tạo trước khi có module này tự nhận trạng thái **Chưa gửi**.

## 2. Chức năng

| # | Chức năng | Chi tiết |
|---|-----------|----------|
| 1 | Nút **Đơn hàng** | Trên header (chỉ hiện khi module sẵn sàng); mở hộp thoại danh sách đơn |
| 2 | Danh sách đơn | Mới nhất trước: mã đơn, giờ đặt, tên khách, số món, tổng tiền, huy hiệu trạng thái |
| 3 | Lọc theo trạng thái | Tất cả / Chưa gửi / Đang gửi / Đã gửi thành công / Đã bị hủy, kèm số lượng từng nhóm |
| 4 | Chi tiết đơn | Tiến trình (dòng thời gian có giờ từng bước), thông tin giao hàng, thanh toán, món đã đặt |
| 5 | Chuyển trạng thái | **Bắt đầu gửi hàng** (1 bước); **Xác nhận đã gửi thành công** và **Hủy đơn** có bước xác nhận vì không hoàn tác được |
| 6 | Hủy đơn | Bắt buộc chọn Tai nạn hoặc Hư hỏng, ghi chú tùy chọn (≤ 200 ký tự); lý do và ghi chú hiện trên dòng thời gian |
| 7 | Chống xung đột | Nếu trạng thái đã đổi ở nơi khác (tab khác), cảnh báo, cập nhật hiển thị và không ghi đè |
| 8 | Lịch sử | Mỗi lần đổi được ghi vào cột JSON `orders.status_log` (từ đâu, sang đâu, lý do, ghi chú, thời điểm) |
| 9 | Trạng thái giao diện | Đang tải, trống, lỗi (có Thử lại), đang cập nhật (khóa nút), thông báo thành công/cảnh báo |

> Website demo không có đăng nhập, nên bất kỳ ai dùng chung trình duyệt đều xem và cập nhật được. Màn hình có ghi chú nói rõ điều này. Phân quyền (khách chỉ xem, cửa hàng mới được đổi) cần backend và thuộc phạm vi sau.

## 3. Bảng dữ liệu/component dùng lại từ các module trước

| Thành phần dùng lại | Nguồn | Cách module Trạng Thái dùng |
|---|---|---|
| Bảng `orders`, `order_items` và đơn đã lưu | Giỏ hàng (`order-service.js`) | Đọc đơn để hiển thị; thêm cột trạng thái vào `orders` (không thêm bảng) |
| Các cột khách/thanh toán (`customer_*`, `payment_*`) | Thanh toán (migration trong `order-service.js`) | Hiển thị thông tin giao hàng và thanh toán ở trang chi tiết |
| `KFCOrders.listOrders()` | `orders-boot.js` | Danh sách đơn |
| Khung "Lưu thành file orders.db" (`KFCFileSyncUI`) và tự ghi file sau mỗi lần đổi trạng thái | `file-sync-ui.js`, `orders-boot.js` | Hiện ở đầu danh sách đơn; mọi lần đổi trạng thái tự ghi vào file đã liên kết |
| Khóa ghi, nơi lưu `orders.db` (IndexedDB), nạp sql.js lười | `orders-boot.js`, `db-storage.js` | Mọi lần đổi trạng thái ghi trong cùng khóa, không đè dữ liệu của tab khác |
| `KFCCartStore.formatVND` | `cart-store.js` | Định dạng tiền |
| `KFCPricing` | `pricing.js` | (Qua `order-service`) tính tiền của đơn |
| Hộp thoại (lớp phủ, `inert`, focus, Esc, xoay vòng Tab), nút `.btn`, token màu | Thanh toán/Giỏ hàng (`payment.css`, `style.css`) | Cùng mẫu giao diện và hành vi; CSS riêng `order-status.css` để module độc lập |
| `KFCCart.close()` | `cart-ui.js` | Đóng giỏ nếu đang mở khi mở danh sách đơn |
| Sự kiện `order:placed` | Giỏ hàng/Thanh toán | Đơn mới luôn ở trạng thái Chưa gửi nên xuất hiện đúng trong danh sách |

Phần của module 1/2 bị chạm: `order-service.js` (thêm cột/bảng/trigger, hàm `updateOrderStatus` và `getOrder`) và `orders-boot.js` (công khai thêm 2 hàm). Hành vi đặt hàng cũ giữ nguyên, các test của module 1 và 2 vẫn qua.

## 4. Dữ liệu trong orders.db

Thêm vào bảng `orders` (tự thêm bằng `ALTER TABLE` nếu còn thiếu, an toàn khi chạy lặp lại):

| Cột | Nội dung |
|---|---|
| `status` | `NOT NULL DEFAULT 'not_sent'`, `CHECK` chỉ nhận 4 giá trị |
| `cancel_reason` | `NULL` hoặc `accident` / `damaged` (`CHECK`) |
| `status_updated_at` | Thời điểm đổi gần nhất (ISO 8601 UTC); đơn mới = `created_at` |

| `status_log` | **Nhật ký đổi trạng thái dạng JSON** (mảng các lần đổi), `CHECK (json_valid(...))`. Đơn mới là `NULL` (chưa đổi lần nào; bước đầu "Chưa gửi" lấy từ `created_at`) |

`orders.db` vẫn chỉ có **đúng 2 bảng: `orders` và `order_items`**. Nhật ký trạng thái nằm trong cột `status_log` của chính dòng đơn nên không cần bảng thứ 3. Mỗi phần tử có dạng:

```json
[
  { "from_status": "not_sent", "to_status": "sending", "reason": null, "note": "", "changed_at": "2026-10-03T07:10:00.000Z" },
  { "from_status": "sending", "to_status": "cancelled", "reason": "accident", "note": "Xe va chạm", "changed_at": "2026-10-03T07:30:00.000Z" }
]
```

Trạng thái và nhật ký luôn đổi **cùng một câu `UPDATE`** nên không bao giờ lệch nhau. Truy vấn nhật ký bằng SQLite: `SELECT json_extract(status_log, '$[#-1].to_status') FROM orders`.

> Phiên bản đầu của module này dùng một bảng thứ 3 `order_status_history`. Vì yêu cầu là `orders.db` chỉ có 2 bảng, bảng đó đã bị bỏ: khi mở một `orders.db` cũ có bảng này, dữ liệu được chuyển vào `status_log` rồi bảng bị xóa (có test).

### Quy tắc được ép ngay trong SQLite (3 trigger)

| Trigger | Chặn |
|---|---|
| `trg_orders_status_guard` | Mọi bước chuyển ngoài bảng quy tắc (nhảy cóc, đi lùi, đổi đơn đã kết thúc). Được **sinh từ bảng quy tắc trong `order-status.js`**, không viết tay lần thứ hai nên không lệch |
| `trg_orders_cancel_reason` | Hủy đơn mà không có `cancel_reason` |
| `trg_orders_initial_status` | Tạo đơn mới với trạng thái khác "Chưa gửi" |

Nhờ vậy, dù ai sửa trực tiếp tệp `orders.db` bằng công cụ SQLite nào cũng không phá được quy tắc. Tôi đã kiểm chứng bằng SQLite 3.50 của Python (không phải sql.js): mọi thao tác trái quy tắc đều bị chặn, thao tác hợp lệ vẫn được.

## 5. Luồng đổi trạng thái (`updateOrderStatus`)

```text
KFCOrders.updateOrderStatus({ orderId, to, expectedFrom, reason, note })
  1. kiểm tra đầu vào (mã đơn, trạng thái đích)
  2. [khóa giữa các tab] đọc orders.db mới nhất
  3. đơn không tồn tại -> order_not_found
  4. expectedFrom lệch trạng thái hiện tại -> status_conflict (kèm trạng thái hiện tại)
  5. kiểm tra quy tắc (validateChange): chuyển hợp lệ, lý do hủy, ghi chú
  6. BEGIN -> UPDATE orders (status, cancel_reason, status_updated_at, status_log cùng lúc) -> COMMIT (lỗi thì ROLLBACK)
  7. lưu lại tệp (lưu không được thì báo lỗi, dữ liệu cũ nguyên vẹn)
```

Mã lỗi: `order_not_found`, `invalid_status`, `invalid_transition`, `cancel_reason_required`, `reason_not_allowed`, `invalid_note`, `status_conflict`, `db_write_failed`, `storage_save_failed`, `db_corrupt`, `sqljs_load_failed`.

## 6. Hợp đồng giao tiếp

| API / sự kiện | Ý nghĩa |
|---|---|
| `KFCOrders.updateOrderStatus(input)` | Đổi trạng thái (mục 5) |
| `KFCOrders.getOrder(id)` | Một đơn kèm dòng hàng và lịch sử |
| `KFCOrders.listOrders()` | Danh sách đơn, mỗi đơn có `status`, `cancel_reason`, `status_updated_at` |
| `window.KFCOrderStatus` | Quy tắc thuần: `IDS, LABELS, TRANSITIONS, canTransition, allowedNext, isFinal, validateChange, buildTimeline` |
| `window.KFCOrderStatusUI` | `{ open, close, isOpen, refresh }` |
| Sự kiện `order:status-changed` `{ orderId, code, from, to, reason, note }` | Phát sau mỗi lần đổi thành công (module sau, ví dụ thông báo cho khách, có thể lắng nghe) |

## 7. Cấu trúc file

```text
js/orders/order-status.js          Quy tắc trạng thái (logic thuần, dùng chung cho DB và giao diện)
js/orders/order-service.js         (mở rộng) cột trạng thái + status_log, trigger, updateOrderStatus, getOrder
js/order-status/order-status-ui.js Hộp thoại: danh sách, lọc, chi tiết, dòng thời gian, hành động
css/order-status.css               Giao diện (dùng token trong style.css)
tests/order-status.test.js, tests/order-status-service.test.js, tests/ui.html (phần Trạng thái đơn hàng)
```

Gỡ `js/order-status/order-status-ui.js` thì nút **Đơn hàng** không hiện và Giỏ hàng/Thanh toán chạy như cũ (đơn vẫn có trạng thái mặc định ở DB).

## 8. Giao diện theo DESIGN.md

- Nền sáng, nhiều khoảng trắng, đỏ `#d71920` là màu chủ đạo (bộ lọc đang chọn, tổng tiền, nút chính, nút Hủy đơn); xám `#f5f5f5` cho các khối; font Arial, chỉ weight 400/700; hộp thoại tối đa 1040px; animation nhẹ, tắt khi `prefers-reduced-motion`.
- Mỗi trạng thái luôn có **chữ + chấm/biểu tượng** đi kèm (không chỉ dựa vào màu): xám (Chưa gửi), vàng (Đang gửi), xanh (Đã gửi thành công), đỏ (Đã bị hủy). Màu chữ của cả 4 huy hiệu đạt tương phản ≥ 4.5:1 (có test).
- Dòng thời gian có chữ ẩn cho trình đọc màn hình ("Đã hoàn thành", "Hiện tại", "Sắp tới", "Đã hủy").
- Hộp thoại `role="dialog"`, `aria-modal`, `aria-busy` khi đang cập nhật; nền bị khóa (`inert`); xoay vòng Tab, Esc đóng; thẻ đơn và bộ lọc là nút thật (`aria-pressed`); nút hành động cao ≥ 44px; trên mobile hộp thoại toàn màn hình, nút Đơn hàng chỉ còn biểu tượng.

## 9. Chạy test

```bash
node tests/run.js        # 430 test (gồm trạng thái đơn hàng trên SQLite thật)
```

Trong trình duyệt (qua Live Server hoặc `python -m http.server`):

- `tests/index.html`: 231 test logic (gồm toàn bộ quy tắc trạng thái).
- `tests/ui.html`: 107 test giao diện (gồm 27 test của module này).

**Quy tắc** (`order-status.test.js`): đủ 4 nhãn tiếng Việt; **toàn bộ ma trận 4×4** các cặp chuyển trạng thái; `allowedNext`/`isFinal` (và trả bản sao); `validateChange` (hủy bắt buộc lý do Tai nạn/Hư hỏng, lý do sai hoặc kiểu lạ, không được kèm lý do khi không hủy, đi lùi/nhảy cóc/đứng yên, đơn đã kết thúc, ghi chú sai/quá dài/ký tự ẩn, `__proto__`); `buildTimeline` cho cả 4 trạng thái và dữ liệu thiếu.

**Dịch vụ trên SQLite thật** (`order-status-service.test.js`):
- Đơn mới luôn là Chưa gửi; luồng đầy đủ (lưu trạng thái, thời điểm, lịch sử); hủy với từng lý do; đổi trạng thái không đụng dữ liệu đơn; nhiều đơn độc lập.
- Mọi chuyển trạng thái sai bị chặn **mà tệp không đổi một byte**; đơn đã kết thúc không đổi được; thiếu/sai lý do hủy; ghi chú sai; mã đơn sai; `status_conflict`; lưu tệp thất bại (thử lại được); `orders.db` hỏng; ghi lỗi (trigger chặn): không đổi gì, trạng thái và nhật ký luôn đi cùng nhau.
- **Bảo vệ ngay trong SQLite**: ghi SQL trực tiếp để nhảy cóc, đi lùi, sửa đơn đã kết thúc, hủy không lý do, giá trị lạ, tạo đơn với trạng thái khác "Chưa gửi" đều bị chặn; `status_log` chỉ nhận JSON hợp lệ; xóa đơn kéo theo xóa nhật ký (cùng một dòng); luôn đúng 2 bảng; **trigger khớp 100% với ma trận của `order-status.js`**.
- Đồng thời: 5 yêu cầu cùng lúc chỉ 1 thắng; "giao thành công" và "hủy" tranh nhau chỉ một thắng và trạng thái khớp lịch sử; hai tab dùng chung khóa; đặt đơn mới trong lúc đổi trạng thái; một yêu cầu lỗi không làm kẹt hàng đợi.
- Nâng cấp từ `orders.db` của module Giỏ hàng và Thanh toán (đơn cũ thành Chưa gửi, chạy lặp lại không nhân đôi, chỉ đọc không ghi, toàn vẹn `status` khớp bản ghi cuối của `status_log`), và **từ bản trước có bảng thứ 3 `order_status_history`** (chuyển vào `status_log`, xóa bảng, còn đúng 2 bảng).

**Giao diện** (`tests/ui.html`): nút Đơn hàng, mở/đóng, danh sách (thứ tự, nội dung, nhãn 4 trạng thái), bộ lọc, trạng thái trống, chi tiết và tiến trình cho cả 4 trạng thái, vòng đời đầy đủ (kèm DB, lịch sử, sự kiện), hủy (bắt buộc lý do, từng lý do, ghi chú, từ cả hai trạng thái), quay lại ở bước xác nhận, ghi chú quá dài, đơn đã kết thúc, **xung đột giữa các tab**, trạng thái đang cập nhật (khóa nút, không đóng được), 5 loại lỗi + đơn không tồn tại, không tải được WebAssembly, XSS, đơn không có thông tin khách, 40 đơn, giữ trạng thái sau khi đóng/mở và tải lại trang, tích hợp với Thanh toán, chạy độc lập khi gỡ module, responsive 1440/1024/768/390/375px, tuân thủ DESIGN.md (kể cả tương phản), bàn phím.

Đã kiểm tra độc lập bộ test bằng cách cố ý làm hỏng code: bỏ trigger chặn chuyển trạng thái, bỏ kiểm tra xung đột, cho phép hủy không lý do, cho đơn đã giao quay lại Đang gửi, không ghi nhật ký, và (ở giao diện) bỏ kiểm tra xung đột và bỏ bắt buộc lý do. Mọi lần đều có test báo lỗi.

## 10. Giới hạn đã biết

- Không có đăng nhập/phân quyền: ai dùng chung trình duyệt đều đổi được trạng thái (đã ghi rõ trên giao diện).
- Dữ liệu nằm trong trình duyệt của từng máy; không đồng bộ giữa các thiết bị và không có thông báo cho khách khi trạng thái đổi (cần backend).
- Hủy đơn chỉ có hai lý do theo yêu cầu (tai nạn, hư hỏng); muốn thêm lý do khác cần sửa `order-status.js` và nâng cấp ràng buộc `CHECK` của cột (SQLite không đổi `CHECK` bằng `ALTER`).
- Chưa tự cập nhật `payment_status` khi đơn giao thành công hay bị hủy (ví dụ COD thành "đã thu tiền", hoàn tiền chuyển khoản); việc này cần quy tắc nghiệp vụ riêng.
- Danh sách chưa phân trang (40 đơn vẫn mượt); nếu có hàng nghìn đơn nên thêm phân trang.
