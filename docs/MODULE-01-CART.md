# Module 1 — Giỏ Hàng

> Phạm vi: Giỏ Hàng và lưu đơn đã đặt vào SQLite (`orders.db`). Thanh Toán và Trạng Thái Đơn Hàng là các module sau.
>
> Lưu ý: `PROJECT.md` ghi "Không có giỏ hàng" cho landing page ban đầu. Module này được thêm theo yêu cầu mới trong `prompt/prompt.txt`, nên mục đó không còn đúng. Các ràng buộc khác vẫn giữ: HTML/CSS/Vanilla JS, không backend, không framework.

## 1. Chức năng

| # | Chức năng | Chi tiết |
|---|-----------|----------|
| 1 | Thêm vào giỏ | Nút **Thêm vào giỏ** trên mọi product card (Nổi bật + Menu). Thêm lại cùng món thì cộng dồn số lượng |
| 2 | Badge giỏ hàng | Số món trên header, ẩn khi giỏ rỗng, hiển thị `99+` khi lớn hơn 99 |
| 3 | Drawer giỏ hàng | Trượt từ bên phải; trên mobile chiếm toàn màn hình. Có overlay, nút đóng, phím Esc |
| 4 | Đổi số lượng | Nút −/+ hoặc nhập số. Giới hạn 1–99 mỗi món. Nhập 0 sẽ xóa món; nhập sai (chữ, số lẻ) sẽ trả về số cũ và báo lỗi |
| 5 | Xóa món | Nút thùng rác hoặc giảm từ 1 về 0. Có **Hoàn tác** trong 6 giây |
| 6 | Xóa toàn bộ | Bấm 2 lần (lần 1 hỏi xác nhận, tự hủy sau 3,5 giây). Có **Hoàn tác** |
| 7 | Tổng tiền | Tạm tính và Tổng cộng, định dạng `45.000 ₫` |
| 8 | Lưu trữ | `localStorage` (khóa `kfc_cart_v1`), giữ giỏ sau khi tải lại trang và đồng bộ giữa các tab |
| 9 | Đồng bộ với menu | Khi menu tải xong: món không còn bán bị gỡ, giá đổi thì cập nhật theo `menu.csv` (có thông báo) |
| 10 | Tiếp tục mua sắm | Đóng giỏ và cuộn tới mục Menu |
| 11 | Đặt hàng | Phát sự kiện `cart:checkout` (module Thanh Toán sau này có thể `preventDefault()` để tự xử lý). Nếu không ai chặn thì lưu đơn vào SQLite, xóa giỏ và hiện màn hình **Đặt hàng thành công** (mã đơn, tổng tiền, nút **Lưu file orders.db**) |
| 12 | Giảm giá theo món | Cột `discount` (%) trong `menu.csv`. Thẻ sản phẩm hiện nhãn `-20%`, giá sau giảm và giá gốc gạch ngang. Giỏ hàng tính theo giá sau giảm, có dòng **Giảm giá** ở phần tổng |
| 13 | Lưu đơn vào SQLite | Xem mục 7. Giỏ chỉ bị xóa **sau khi** lưu xong; lỗi thì giữ nguyên giỏ và báo rõ nguyên nhân |
| 14 | Trạng thái | Giỏ rỗng, thông báo thành công/cảnh báo (toast), ảnh lỗi dùng icon thay thế |

## 2. Bảng dữ liệu/component dùng lại từ module trước

Đây là module đầu tiên nên không có module trước. Module này dùng lại các thành phần **nền của landing page**:

| Thành phần dùng lại | Nguồn | Cách dùng trong giỏ hàng |
|---------------------|-------|--------------------------|
| Dữ liệu sản phẩm `id, name, category, price, discount, image` | `data/menu.csv` (qua `app.js`) | Nguồn giá duy nhất; nguồn của nút "Thêm vào giỏ" và của đồng bộ giá |
| CSV parser | `js/csv.js` (tách từ `app.js`) | Không đổi hành vi, chỉ tách file để test được |
| Product card | `app.js › createProductCard` | Thay nút "Chi tiết" bằng nút "Thêm vào giỏ", phát sự kiện `cart:add` |
| Design tokens (màu, bán kính, shadow) | `css/style.css` (`:root`) | `cart.css` dùng lại `--color-primary`, `--color-dark`, `--color-gray`… |
| `.btn`, `.btn-primary` | `css/style.css` | Nút "Đặt hàng", "Xem thực đơn" |
| Header sticky | `index.html` | Thêm nút giỏ hàng cạnh nút hamburger |

## 3. Hợp đồng giao tiếp giữa các module (sự kiện)

| Sự kiện | Hướng | `detail` | Ý nghĩa |
|---------|-------|----------|---------|
| `menu:loaded` | app.js → giỏ hàng | `{ products }` | Menu sẵn sàng, giỏ đồng bộ giá |
| `cart:add` | app.js → giỏ hàng | `{ product }` | Thêm 1 phần |
| `cart:checkout` | giỏ hàng → module Thanh Toán | `{ items, totals }` (có thể `preventDefault()`) | Người dùng bấm Đặt hàng. Module Thanh Toán gọi `preventDefault()` để tự xử lý (khi đó giỏ không tự lưu đơn) |
| `order:placed` | giỏ hàng → các module khác | `{ order }` | Đơn đã lưu xong vào SQLite. `order` gồm `id, code, createdAt, totalQty, subtotal, discountTotal, total, items, persistent` |

API công khai:

- `window.KFCCart` = `{ getState, add, clear, open, close, subscribe }`
- `window.KFCOrders` = `{ placeOrder(cartState), listOrders(), exportDb(), saveToFile(), storage }`. Module Thanh Toán sau khi thanh toán xong có thể gọi `KFCOrders.placeOrder(cartState)`.
Mỗi item: `{ id, name, price, discount, unitPrice, image, category, qty }`, trong đó `price` là giá gốc, `discount` là % giảm (0–100), `unitPrice` là giá bán sau giảm.
`totals`: `{ lines, totalQty, subtotal, discountTotal, total }` với `subtotal` theo giá gốc, `discountTotal` là tổng tiền được giảm và `total = subtotal − discountTotal` (số tiền khách phải trả).

## 4. Cấu trúc file của module

```text
js/pricing.js           Tính giá sau giảm (dùng chung cho thẻ sản phẩm và giỏ hàng)
js/cart/cart-store.js   Logic thuần (thêm/sửa/xóa, tổng tiền, lưu trữ, reconcile). Không đụng DOM
js/cart/cart-ui.js      Drawer, badge, toast, focus, sự kiện, màn hình đặt hàng thành công
js/orders/order-service.js  Kiểm tra đơn + ghi SQLite trong transaction (không đụng DOM)
js/orders/db-storage.js     Nơi giữ nội dung orders.db trong trình duyệt (IndexedDB, dự phòng bộ nhớ)
js/orders/orders-boot.js    Nạp sql.js khi cần, khóa giữa các tab, nút lưu file; tạo window.KFCOrders
js/vendor/              sql.js 1.14.2 (SQLite/WebAssembly), xem js/vendor/README.md
css/cart.css            Giao diện (dùng token trong style.css)
tests/                  Test (harness.js, pricing / cart-store / discount-store / csv-and-menu / order-service / order-db, run.js, index.html, ui.html)
```

## 5. Giao diện theo DESIGN.md

- Nền sáng, nhiều khoảng trắng, màu đỏ `#d71920` là màu chủ đạo; `#111` cho tiêu đề; xám `#f5f5f5` cho footer giỏ hàng.
- Font: `Arial, Helvetica, sans-serif`. Chỉ dùng weight 400/700 vì Arial không có weight 800/900 (trên Windows sẽ bị đổi thành Arial Black, thiếu glyph tiếng Việt).
- Bố cục: container tối đa 1200px, header sticky, responsive 1440 / 1024 / 768 / 390 / 375.
- Animation nhẹ: trượt drawer, fade-in, nảy badge. Tắt khi `prefers-reduced-motion`.

## 6. Chạy test

```bash
node tests/run.js        # 391 test (giá, giảm giá, logic giỏ, CSV, dữ liệu menu, lưu đơn bằng SQLite thật, thanh toán, trạng thái đơn hàng)
```

Chạy trong trình duyệt (qua Live Server hoặc `python -m http.server`, không mở bằng file://):

- `tests/index.html`: 231 test logic.
- `tests/ui.html`: 97 test giao diện (gồm luồng đặt hàng với SQLite và IndexedDB thật). Các test của Giỏ hàng chạy với module Thanh toán bị gỡ ra để kiểm tra độc lập; phần Thanh toán xem `docs/MODULE-02-PAYMENT.md`. Trang nạp `index.html` trong iframe và thao tác như người dùng.

Phạm vi test:

- **Giá/định dạng**: `45000 → 45.000 ₫`, giá trị không hợp lệ không gây crash.
- **Thêm**: cộng dồn, id số/chuỗi, sản phẩm sai (thiếu tên, giá âm/NaN/chuỗi), số lượng sai (0, âm, thập phân, NaN, chuỗi), chặn ở 99, trả về bản sao, không bị ảnh hưởng khi sửa object gốc.
- **Giảm giá**: chuẩn hóa `discount` (âm, > 100, chữ, thập phân), làm tròn đến đồng, giá bán luôn trong khoảng [0, giá gốc], `giá gốc = giá bán + tiền giảm`; trong giỏ: `total = subtotal − discountTotal` ở mọi thao tác, lưu/nạp lại, dữ liệu cũ không có `discount`, hoàn tác giữ giảm giá, reconcile khi menu đổi % giảm.
- **Tổng tiền**: nhiều dòng, giá 0, số lớn, cập nhật sau mỗi thao tác.
- **Sửa số lượng**: set/tăng/giảm, về 0 thì xóa, id không tồn tại.
- **Xóa**: từng món, toàn bộ, thao tác thất bại không phát sự kiện.
- **Lưu trữ**: lưu/nạp lại, JSON hỏng, sai version, dữ liệu sai kiểu, dòng lỗi bị lọc, trùng id, số lượng quá lớn, storage bị chặn/đầy, hai khóa tách biệt, đồng bộ giữa tab.
- **Đồng bộ menu**: món bị gỡ, giá đổi, menu rỗng/sai định dạng, giữ nguyên số lượng.
- **Dữ liệu menu**: id không trùng, mọi món hợp lệ để thêm vào giỏ, file ảnh tồn tại, bản CSV nhúng trong `app.js` (cho `file://`) khớp `menu.csv`. Mỗi lần sửa `menu.csv`, hãy chép lại nội dung vào `EMBEDDED_CSV_FALLBACK` trong `app.js`, nếu không test này sẽ báo lệch.
- **An toàn**: tên chứa HTML chỉ là chuỗi; UI dùng `textContent`.
- **Đơn hàng (`order-service.test.js`, `order-db.test.js`, chạy SQLite thật)**:
  - Kiểm tra giỏ: rỗng, dòng sai (thiếu mã/tên, giá âm/thập phân/chuỗi, số lượng 0/100/thập phân), trùng mã, discount sai, tổng vượt giới hạn, totals bị sửa (`total_mismatch`), luôn tính lại tiền từ từng dòng.
  - Cấu trúc `orders.db`: đúng 2 bảng `orders` và `order_items`, đủ cột, khóa ngoại + `ON DELETE CASCADE`, ràng buộc `CHECK` chặn giá âm, số lượng 0, giảm > 100; tệp có chữ ký `SQLite format 3`.
  - Dữ liệu ghi: từng cột khớp giỏ, mã đơn `KFC-YYYYMMDD-NNNN` (đếm theo ngày, tiếp tục từ số lớn nhất, quá 9999 vẫn hợp lệ), đơn cộng dồn trong cùng tệp, ký tự đặc biệt/emoji/câu SQL được lưu nguyên văn, 15 giỏ ngẫu nhiên (tổng các dòng luôn khớp tổng đơn).
  - Lỗi: lưu thất bại, không đọc được storage, `orders.db` hỏng, sai cấu trúc, ghi giữa chừng thất bại (ROLLBACK, tệp không đổi, không chiếm số thứ tự), không tải được sql.js. Với mọi lỗi, dữ liệu đã lưu không bị ghi đè.
  - Đồng thời: 10 đơn cùng lúc, hai tab dùng chung một khóa, một đơn lỗi không làm kẹt hàng đợi.
  - Lưu trữ: bộ nhớ, dự phòng khi IndexedDB lỗi/bị chặn.

**Test giao diện (`tests/ui.html`)**:

- **Responsive** 1440 / 1024 / 768 / 390 / 375px: không tràn ngang, số cột lưới (4/4/2/1/1), nút giỏ và drawer vừa màn hình, mobile thì drawer full màn hình, nút Đặt hàng không bị cắt.
- **DESIGN.md**: font Arial, màu `#d71920`, nền `#f5f5f5`, container 1200px.
- **Luồng chính**: thêm vào giỏ, badge, mở/đóng drawer (nút X, Esc, overlay), focus và trả focus, `inert`, `aria-*`, xoay vòng Tab, giỏ rỗng, +/−/nhập số lượng (giới hạn 99, nhập sai), nhập 0 xóa món, xóa và hoàn tác, xóa toàn bộ (2 bước), giảm giá, giữ giỏ sau khi tải lại, đồng bộ nhiều tab, sự kiện `cart:checkout` (kể cả `preventDefault`), toast (gộp trùng, tối đa 3, không che tổng tiền).
- **Đặt hàng (giao diện)**: thành công (mã đơn, tổng, xóa giỏ, `order:placed`, focus), đơn thứ 2 `-0002`, dữ liệu còn sau khi tải lại trang và xuất ra tệp SQLite hợp lệ, `preventDefault()` thì không lưu, bấm nhiều lần chỉ 1 đơn, trạng thái "Đang lưu" khóa giỏ, 8 loại lỗi đều giữ giỏ và báo đúng nguyên nhân, không tải được wasm, IndexedDB bị chặn (cảnh báo lưu tạm), nút Lưu file (tải xuống và hộp thoại lưu, hủy thì im lặng), hai tab đặt cùng lúc.
- **Xử lý lỗi (theo IMPLEMENTATION.md)**: CSV 404, mất mạng, CSV rỗng, chỉ có header, sai định dạng (dòng thiếu cột, giá chữ, discount bậy), ảnh không tồn tại, `localStorage` bị chặn, dữ liệu giỏ hỏng, món trong giỏ đã ngừng bán hoặc đổi giá.
- **XSS**: tên/mô tả chứa HTML hay script chỉ hiển thị là chữ, ở cả thẻ sản phẩm và giỏ hàng.

Các test về giá dùng dữ liệu cố định riêng, nên không hỏng khi bạn chỉnh giá hay % giảm trong `data/menu.csv`.

## 7. Lưu đơn hàng vào SQLite (orders.db)

### Cách hoạt động

```text
Bấm "Đặt hàng"
   -> phát cart:checkout (module Thanh Toán có thể chặn)
   -> KFCOrders.placeOrder(giỏ)
        1. kiểm tra giỏ và tính lại tiền từ từng dòng (sai thì dừng, chưa chạm DB)
        2. [khóa giữa các tab] đọc orders.db mới nhất từ IndexedDB
        3. BEGIN -> INSERT orders -> INSERT order_items -> COMMIT (lỗi thì ROLLBACK)
        4. lưu lại orders.db vào IndexedDB
   -> thành công: xóa giỏ, hiện mã đơn, phát order:placed
   -> thất bại: giữ nguyên giỏ, báo nguyên nhân
```

Trình duyệt không cho trang web tự ghi file ra ổ đĩa, nên bản "chính" của `orders.db` nằm trong **IndexedDB** của trình duyệt.
Muốn có tệp thật, bấm **Lưu file orders.db** trên màn hình đặt hàng thành công: Chrome/Edge mở hộp thoại "Lưu thành…", trình duyệt khác tải tệp về.
Tệp này là SQLite chuẩn, mở được bằng DB Browser for SQLite, `sqlite3`, Python `sqlite3`…

### Cấu trúc bảng

> Các module sau mở rộng `orders.db` bằng migration tự động: module Thanh Toán thêm 6 cột nullable vào `orders` (`customer_*`, `payment_*`, xem `docs/MODULE-02-PAYMENT.md`); module Trạng Thái Đơn Hàng thêm `status`, `cancel_reason`, `status_updated_at` và bảng `order_status_history` (xem `docs/MODULE-03-ORDER-STATUS.md`). Bảng dưới đây là phần của module Giỏ hàng.

```sql
CREATE TABLE orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code     TEXT    NOT NULL UNIQUE,          -- KFC-20261003-0001
  created_at     TEXT    NOT NULL,                 -- ISO 8601 (UTC)
  total_qty      INTEGER NOT NULL CHECK (total_qty > 0),
  subtotal       INTEGER NOT NULL CHECK (subtotal >= 0),        -- theo giá gốc
  discount_total INTEGER NOT NULL CHECK (discount_total >= 0),  -- tổng tiền được giảm
  total          INTEGER NOT NULL CHECK (total >= 0)            -- khách phải trả
);

CREATE TABLE order_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       TEXT    NOT NULL,
  product_name     TEXT    NOT NULL,                -- chụp lại tại thời điểm đặt
  category         TEXT,
  original_price   INTEGER NOT NULL CHECK (original_price >= 0),
  discount_percent INTEGER NOT NULL CHECK (discount_percent BETWEEN 0 AND 100),
  unit_price       INTEGER NOT NULL CHECK (unit_price >= 0),     -- giá bán sau giảm
  quantity         INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  line_total       INTEGER NOT NULL CHECK (line_total >= 0)      -- unit_price × quantity
);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
```

Tên, giá và % giảm được **chụp lại** vào từng dòng đơn, nên sửa `menu.csv` sau này không làm đổi đơn cũ.
Tiền là số nguyên đồng. `menu.csv` phải để `price` là số nguyên, nếu không đơn sẽ bị từ chối.

Ví dụ truy vấn:

```sql
SELECT o.order_code, o.created_at, o.total, COUNT(i.id) AS so_dong
FROM orders o JOIN order_items i ON i.order_id = o.id
GROUP BY o.id ORDER BY o.id DESC;
```

### Mã đơn

`KFC-YYYYMMDD-NNNN`: ngày theo giờ địa phương, NNNN tăng dần trong ngày (tiếp tục từ số lớn nhất đã có). `order_code` là `UNIQUE`.

### Đảm bảo an toàn dữ liệu

- Chỉ báo thành công khi đã lưu xong; giỏ chỉ bị xóa sau đó.
- Ghi trong transaction: lỗi giữa chừng thì ROLLBACK, không có đơn "nửa vời".
- Không bao giờ ghi đè một `orders.db` đã có mà không đọc được (hỏng hoặc sai cấu trúc): báo lỗi và giữ nguyên dữ liệu cũ.
- Mọi lần ghi chạy trong một khóa (Web Locks) và đọc DB mới nhất ngay trước khi ghi, nên hai tab đặt hàng cùng lúc không đè dữ liệu của nhau.
- Câu lệnh SQL dùng tham số (`?`), không ghép chuỗi, nên tên món chứa ký tự đặc biệt hay câu SQL vẫn an toàn.

### Điều kiện chạy

- Cần chạy qua http (Live Server hoặc `python -m http.server`) vì WebAssembly không nạp được khi mở bằng `file://`. Khi đó trang báo rõ và giữ nguyên giỏ.
- Nếu IndexedDB bị chặn (ví dụ một số chế độ riêng tư), đơn vẫn đặt được nhưng chỉ lưu tạm trong phiên; màn hình thành công cảnh báo và nhắc bấm **Lưu file orders.db**.
- Thư viện: sql.js (MIT), xem `js/vendor/README.md`. Đây là thư viện chạy trong trình duyệt, không phải backend hay database server.

## 8. Quy ước giảm giá

- `price` trong CSV luôn là **giá gốc**; `discount` là % giảm theo từng món. Giá bán = `price × (100 − discount) / 100`, làm tròn đến đồng.
- Chỉ có giảm giá theo món. Mã giảm giá (coupon) hoặc giảm theo tổng đơn chưa có.
- Thẻ sản phẩm và giỏ hàng cùng dùng `js/pricing.js`, nên không thể lệch giá nhau.
- Giá gốc và giảm giá của món trong giỏ luôn được đồng bộ lại theo `menu.csv` khi trang tải; nếu giá bán đổi, giỏ hiện thông báo.

## 9. Giới hạn đã biết

- Khi chạy riêng (không có module Thanh Toán), đơn hàng không có thông tin khách và phương thức thanh toán. Khi có module Thanh Toán, bấm **Đặt hàng** sẽ đi qua bước thanh toán (xem `docs/MODULE-02-PAYMENT.md`). Trạng thái đơn hàng do module 3 quản lý (`docs/MODULE-03-ORDER-STATUS.md`).
- `orders.db` nằm trong trình duyệt của từng máy; muốn gom đơn từ nhiều máy cần backend, mà dự án này không có.
- Giỏ hàng lưu theo từng trình duyệt (localStorage), không đồng bộ giữa các thiết bị vì dự án không có backend.
