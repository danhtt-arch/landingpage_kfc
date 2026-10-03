# Module 2 — Thanh Toán

> Phạm vi: bước thanh toán sau Giỏ Hàng: nhập thông tin giao hàng, chọn phương thức thanh toán, xác nhận đơn và lưu vào `orders.db`.
> Trạng Thái Đơn Hàng là module 3, xem `docs/MODULE-03-ORDER-STATUS.md`.

## 1. Giả định (không có PRD riêng cho KFC)

Bộ tài liệu của dự án không mô tả chi tiết bước thanh toán, nên module này dựa trên các ràng buộc có sẵn: frontend thuần, không backend, website demo/học tập.

- **Không có thanh toán thật.** Không cổng thanh toán, không thu thập số thẻ/CVV. Hai phương thức là:
  - `cod`: thanh toán tiền mặt khi nhận hàng.
  - `bank_transfer`: khách chuyển khoản theo thông tin hiển thị sau khi đặt hàng, ghi mã đơn ở nội dung. Cửa hàng xác nhận thủ công về sau.
- **Chưa có phí giao hàng**, nên `total` của đơn vẫn là tổng sau giảm giá như ở Giỏ hàng.
- Thông tin tài khoản ngân hàng trong `js/payment/payment-config.js` là **DEMO** (`isDemo: true`, giao diện có cảnh báo). Khi triển khai thật hãy thay bằng tài khoản thật và đặt `isDemo: false`.

## 2. Chức năng

| # | Chức năng | Chi tiết |
|---|-----------|----------|
| 1 | Mở thanh toán | Bấm **Đặt hàng** ở giỏ → hộp thoại **Thanh toán** (giỏ đóng, nội dung giỏ được giữ nguyên) |
| 2 | Thông tin giao hàng | Họ tên, số điện thoại, địa chỉ (bắt buộc), ghi chú (không bắt buộc) |
| 3 | Kiểm tra dữ liệu | Khi rời ô nhập và khi gửi. Lỗi có chữ + biểu tượng (không chỉ màu), `aria-invalid`, `aria-describedby`, focus vào ô lỗi đầu tiên |
| 4 | Chuẩn hóa | Gộp khoảng trắng, `+84…` → `0…`, bỏ ký tự ẩn/điều khiển, Unicode NFC |
| 5 | Phương thức thanh toán | COD (mặc định) hoặc chuyển khoản |
| 6 | Tóm tắt đơn | Món, số lượng, giá sau giảm, tạm tính, giảm giá, tổng cộng. Tự cập nhật + cảnh báo nếu giỏ đổi (ví dụ từ tab khác) |
| 7 | Xác nhận đặt hàng | Kiểm tra lại giỏ mới nhất → lưu đơn vào SQLite → **chỉ khi lưu xong mới xóa giỏ** |
| 8 | Đặt hàng thành công | Mã đơn, thông tin giao hàng, đơn hàng, hướng dẫn thanh toán (COD: số tiền; chuyển khoản: tài khoản, số tiền, nội dung = mã đơn, nút **Chép**), nút **Lưu file orders.db** |
| 9 | Trạng thái | Đang xử lý (khóa form), giỏ trống, lỗi (giữ nguyên form và giỏ) |

## 3. Bảng dữ liệu/component dùng lại từ module Giỏ Hàng

| Thành phần dùng lại | Nguồn (module Giỏ Hàng) | Cách module Thanh Toán dùng |
|---|---|---|
| Sự kiện `cart:checkout` (cancelable) | `cart-ui.js` | Lắng nghe và gọi `preventDefault()` để tự xử lý bước thanh toán (khi đó giỏ không tự lưu đơn) |
| `KFCCart.getState()` | `cart-ui.js` | Đọc món, số lượng, giá sau giảm (`unitPrice`) và `totals` để hiển thị và đặt đơn |
| `KFCCart.clear()` | `cart-ui.js` | Xóa giỏ **sau khi** lưu đơn thành công |
| `KFCCart.close()` / `open()` | `cart-ui.js` | Đóng giỏ khi mở thanh toán; mở lại giỏ khi bấm "Chỉnh sửa giỏ hàng" |
| `KFCCart.subscribe()` | `cart-ui.js` | Cập nhật tóm tắt khi giỏ đổi lúc đang thanh toán |
| `KFCOrders.placeOrder(cartState, meta)` | `orders-boot.js` / `order-service.js` | Lưu đơn vào `orders.db` kèm `meta` (khách + phương thức) |
| `KFCOrders.saveToFile()` | `orders-boot.js` | Nút **Lưu file orders.db** ở màn hình thành công |
| `KFCOrders.listOrders()` | `orders-boot.js` | (Dùng trong test) đọc lại đơn đã lưu |
| Cấu trúc `orders.db` (bảng `orders`, `order_items`) | `order-service.js` | Thêm cột cho thông tin khách và thanh toán (mục 5) |
| `KFCCartStore.formatVND` | `cart-store.js` | Định dạng tiền `45.000 ₫` |
| `KFCPricing` | `pricing.js` | Giá sau giảm (đã dùng bên trong `order-service`) |
| Sự kiện `order:placed` | `cart-ui.js` (định nghĩa) | Module này cũng phát sự kiện này khi thành công, kèm `instructions` |
| Design tokens, `.btn`, `.cart-link-btn` | `css/style.css`, `css/cart.css` | Màu, bán kính, nút, liên kết |

Đây là **chỗ duy nhất module 2 chạm vào code module 1**: `order-service.js` được mở rộng nhận thêm `meta` và tự nâng cấp `orders.db` (mục 5). Khi không truyền `meta`, hành vi của Giỏ hàng giữ nguyên.

## 4. Hợp đồng giao tiếp

| Sự kiện / API | Hướng | Ý nghĩa |
|---|---|---|
| `cart:checkout` | giỏ hàng → thanh toán | Thanh toán gọi `preventDefault()` rồi mở hộp thoại |
| `order:placed` `{ order, instructions }` | thanh toán → các module khác | Đơn đã lưu xong |
| `window.KFCPayment` = `{ open, close, isOpen }` | công khai | Mở/đóng hộp thoại thanh toán bằng code |

Nếu bỏ module Thanh Toán (gỡ 4 script `js/payment/*`), Giỏ hàng vẫn chạy như trước: bấm **Đặt hàng** sẽ tự lưu đơn không có thông tin khách.

## 5. Dữ liệu lưu vào orders.db

Bảng `orders` có thêm 6 cột (nullable, thêm tự động bằng `ALTER TABLE` nếu còn thiếu; không thêm bảng, `orders.db` vẫn chỉ có 2 bảng):

| Cột | Nội dung |
|---|---|
| `customer_name` | Họ tên (đã chuẩn hóa) |
| `customer_phone` | Số điện thoại dạng `0xxxxxxxxx` |
| `customer_address` | Địa chỉ (một dòng) |
| `customer_note` | Ghi chú (chuỗi rỗng nếu không có) |
| `payment_method` | `cod` hoặc `bank_transfer` |
| `payment_status` | `cod` → `unpaid`; `bank_transfer` → `awaiting_transfer` |

- `orders.db` được tạo từ module Giỏ hàng (chưa có các cột này) vẫn dùng được: tự nâng cấp khi đặt đơn mới, các đơn cũ giữ nguyên với giá trị `NULL`. Việc nâng cấp an toàn khi chạy lặp lại.
- `payment_status` ban đầu chỉ là điểm xuất phát. Việc chuyển sang đã thanh toán thuộc module sau; trạng thái giao hàng của đơn do module 3 quản lý bằng cột `status` riêng.

## 6. Quy tắc kiểm tra dữ liệu (`js/payment/payment-validate.js`)

| Trường | Quy tắc |
|---|---|
| Họ tên | 2–60 ký tự; chữ cái (có dấu tiếng Việt), khoảng trắng và `. ' -`; không số, không ký hiệu |
| Số điện thoại | Di động Việt Nam 10 số (`03/05/07/08/09…`); nhận `+84…`, `84…`, dấu cách `. - ( )`; lưu dạng `0xxxxxxxxx` |
| Địa chỉ | 10–200 ký tự, có chữ cái; xuống dòng được gộp thành dấu cách |
| Ghi chú | Không bắt buộc; tối đa 200 ký tự |
| Phương thức | Chỉ `cod` hoặc `bank_transfer` |

`order-service.js` kiểm tra thêm một lớp (kiểu dữ liệu, độ dài tối đa, phương thức hợp lệ) để chặn dữ liệu sai dù có module nào gọi trực tiếp.

## 7. Luồng và an toàn

```text
Bấm "Xác nhận đặt hàng"
  1. Kiểm tra thông tin + phương thức        (sai: dừng, chưa đụng giỏ/DB)
  2. Đọc giỏ MỚI NHẤT, so với đơn khách đang xem (đổi: dừng, bắt xem lại)
  3. KFCOrders.placeOrder(giỏ, {khách, thanh toán})   (transaction SQLite)
  4. Lưu xong mới xóa giỏ, hiện màn hình thành công, phát order:placed
```

- Nhiều lần bấm cùng lúc chỉ tạo một đơn (các lần còn lại bị từ chối `busy`).
- Mọi lỗi (SQLite, lưu trữ, `orders.db` hỏng…) giữ nguyên giỏ và dữ liệu khách đã nhập, thông báo bằng tiếng Việt kèm nguyên nhân.
- Dữ liệu người dùng luôn được đưa vào giao diện bằng `textContent`, vào DB bằng tham số `?`, nên HTML hay SQL trong địa chỉ/ghi chú chỉ là chữ.

## 8. Cấu trúc file

```text
js/payment/payment-validate.js  Kiểm tra + chuẩn hóa thông tin giao hàng (logic thuần)
js/payment/payment-config.js    Phương thức thanh toán, thông tin ngân hàng (DEMO)
js/payment/payment-service.js   Điều phối submit: kiểm tra, đối chiếu giỏ, lưu đơn, xóa giỏ
js/payment/payment-ui.js        Hộp thoại: form, tóm tắt, thành công, lỗi
css/payment.css                 Giao diện (dùng token trong style.css)
tests/payment-validate.test.js, tests/payment-service.test.js, tests/ui.html (phần Thanh toán)
```

## 9. Giao diện theo DESIGN.md

- Nền sáng, nhiều khoảng trắng, đỏ `#d71920` là màu chủ đạo (số bước, nút xác nhận, tổng tiền, viền lựa chọn); xám `#f5f5f5` cho khối tóm tắt; chữ `#222` / `#666`.
- Font `Arial, Helvetica, sans-serif`, chỉ weight 400/700. Ô nhập cỡ chữ ≥ 16px (iOS không tự phóng to).
- Bố cục: hộp thoại tối đa 1040px (≤ 1200px); hai cột (form | tóm tắt) từ 768px trở lên, một cột và toàn màn hình khi nhỏ hơn.
- Animation nhẹ (hiện dần), tắt khi `prefers-reduced-motion`.
- Truy cập: `role="dialog"`, `aria-modal`, nhãn gắn đúng ô nhập, `fieldset/legend`, radio dùng được bằng bàn phím, xoay vòng Tab, Esc đóng, nền bị khóa (`inert`), focus được trả về.

## 10. Chạy test

```bash
node tests/run.js        # 430 test, gồm test thanh toán chạy trên SQLite thật
```

Trong trình duyệt (qua Live Server hoặc `python -m http.server`):

- `tests/index.html`: 231 test logic (gồm kiểm tra dữ liệu thanh toán).
- `tests/ui.html`: 107 test giao diện (gồm 28 test của module Thanh Toán).

**Kiểm tra dữ liệu** (`payment-validate.test.js`): số điện thoại (10 định dạng chuẩn hóa, hợp lệ, sai), họ tên (tiếng Việt có dấu, NFD→NFC, số/ký hiệu/emoji/thẻ HTML, biên 60/61), địa chỉ (biên 10/200, chỉ số/ký hiệu, xuống dòng), ghi chú (biên 200, CRLF, ký tự ẩn), toàn form (thiếu hết, sai một trường, không đổi dữ liệu vào), phương thức (`__proto__`, `constructor`…).

**Luồng thanh toán** (`payment-service.test.js`, SQLite thật):
- Lưu đủ cột khách/thanh toán, chuẩn hóa trước khi lưu, COD và chuyển khoản (hướng dẫn, `payment_status`), hai đơn liên tiếp, SQL injection/HTML chỉ là chữ.
- Từ chối: thông tin sai, phương thức sai, giỏ trống, **giỏ đổi sau khi khách xem** (số lượng, giá, thêm món), lưu thất bại, `orders.db` hỏng, bấm nhiều lần, service không kẹt sau lỗi; mọi trường hợp giữ nguyên giỏ và dữ liệu.
- `order-service`: kiểm tra `meta`, không có `meta` thì giữ nguyên hành vi cũ.
- **Nâng cấp từ `orders.db` của module Giỏ hàng**: thêm cột, đơn cũ còn nguyên, chạy lặp lại không nhân đôi cột, chỉ đọc không ghi, ROLLBACK khi lỗi giữa chừng, tổng tiền khớp.

**Giao diện** (`tests/ui.html`): mở thanh toán, nhãn/ô nhập/autocomplete, gửi form rỗng, kiểm tra khi rời ô, định dạng điện thoại, COD và chuyển khoản đầy đủ (kể cả nút Chép), chuẩn hóa dữ liệu, XSS, trạng thái đang xử lý (khóa form, không đóng được), 6 loại lỗi đều giữ form và giỏ, giỏ đổi/xóa khi đang thanh toán, giỏ trống, đóng/mở và giữ dữ liệu đã nhập, xoay vòng Tab, đơn thứ hai với form sạch, nút Lưu file, IndexedDB bị chặn, không tải được WebAssembly, Giỏ hàng chạy độc lập khi gỡ module Thanh toán, responsive 1440/1024/768/390/375px, tuân thủ DESIGN.md.

Ngoài ra đã **kiểm tra độc lập bộ test** bằng cách cố ý làm hỏng code (cho phép đầu số 02, bỏ kiểm tra giỏ đổi, xóa giỏ trước khi lưu, bỏ migration): cả bốn lần test đều báo lỗi.

## 11. Giới hạn đã biết

- Chưa có phí giao hàng, mã giảm giá, chọn khung giờ giao, hay xác thực số điện thoại/OTP.
- Không có cổng thanh toán: việc xác nhận chuyển khoản là thủ công và thuộc module sau. `payment_status` chưa tự chuyển sang "đã thanh toán".
- Thông tin ngân hàng là DEMO, cần thay khi triển khai thật.
- `orders.db` nằm trong trình duyệt của từng máy (xem docs module 1). Thông tin khách là dữ liệu cá nhân được lưu trong `orders.db` và IndexedDB trên máy khách; nếu triển khai thật cần chính sách quyền riêng tư và backend phù hợp.
- Hai tab cùng hiển thị thanh toán cho một giỏ: tab xác nhận trước sẽ xóa giỏ và tab còn lại tự chuyển sang "giỏ trống". Nếu bấm xác nhận ở cả hai tab trong cùng một khoảnh khắc thì có thể tạo hai đơn giống nhau.
