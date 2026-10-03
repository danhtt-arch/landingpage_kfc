# KFC Landing Page

Dự án Landing Page quảng cáo thương hiệu và sản phẩm gà rán KFC được xây dựng theo phong cách **Modern Minimalist**, tuân thủ nghiêm ngặt chuẩn Responsive, Accessibility và Frontend thuần (HTML5, CSS3, Vanilla JavaScript, CSV data).

## 🚀 Công nghệ sử dụng

- **HTML5**: Thẻ Semantic (header, nav, main, section, article, footer).
- **CSS3**: CSS Custom Properties, Flexbox, Grid Layout, Responsive design, Micro-interactions.
- **Vanilla JavaScript**: Fetch API, Async/Await, Robust CSV Parser, Dynamic DOM rendering, Event delegation.
- **Dữ liệu**: CSV file (`data/menu.csv`).
- **Không backend, không database server, không framework JS**.

## 📁 Cấu trúc dự án

```text
landingpage_kfc/
├── index.html          # Trang HTML chính với cấu trúc Semantic
├── README.md           # Hướng dẫn dự án
├── css/
│   ├── style.css       # Design System & Responsive Stylesheet
│   └── cart.css        # Giao diện module Giỏ hàng
├── js/
│   ├── app.js          # Logic tải CSV, render DOM, filter category, formatting
│   ├── csv.js          # CSV parser (tách riêng để test)
│   ├── pricing.js      # Tính giá sau giảm (dùng chung thẻ sản phẩm + giỏ hàng)
│   ├── cart/
│   │   ├── cart-store.js   # Module 1: logic giỏ hàng + lưu localStorage
│   │   └── cart-ui.js      # Module 1: drawer, badge, toast, màn hình đặt hàng thành công
│   ├── orders/             # Module 1: lưu đơn hàng vào SQLite (orders.db)
│   │   ├── order-service.js
│   │   ├── db-storage.js
│   │   └── orders-boot.js
│   └── vendor/             # sql.js (SQLite/WebAssembly), xem js/vendor/README.md
├── data/
│   └── menu.csv        # Nguồn dữ liệu sản phẩm động
├── assets/
│   └── images/         # Hình ảnh sản phẩm + hero
├── tests/              # Test module: node tests/run.js, tests/index.html (logic), tests/ui.html (giao diện + lưu SQLite)
└── docs/
    └── MODULE-01-CART.md   # Tài liệu module Giỏ hàng
```

## 📊 Cấu trúc Dữ liệu Menu (CSV)

File `data/menu.csv` chứa danh sách sản phẩm với các cột:
- `id`: ID duy nhất của sản phẩm.
- `name`: Tên sản phẩm.
- `category`: Danh mục (`Gà rán`, `Combo`, `Burger`, `Món ăn kèm`, `Đồ uống`).
- `description`: Mô tả ngắn gọn sản phẩm.
- `price`: Giá tiền (số nguyên, ví dụ `45000`).
- `image`: Đường dẫn hình ảnh (ví dụ `assets/images/chicken-1.jpg`).
- `featured`: Trạng thái nổi bật (`true` hoặc `false`).
- `discount`: % giảm giá của món (số nguyên 0–100, không bắt buộc). `price` luôn là giá gốc.

## 💡 Chức năng chính

1. **Đọc & Parse CSV Động**: Tự động tải và parse dữ liệu từ `data/menu.csv` khi trang được nạp. Hỗ trợ parse cả các trường dữ liệu có dấu phẩy nằm trong ngoặc kép `"..."`.
2. **Hiển thị Sản phẩm Nổi bật (Featured Products)**: Lọc và hiển thị các món best-seller (`featured = true`).
3. **Bộ lọc Danh mục (Category Filter)**: Lọc sản phẩm tức thì theo từng danh mục mà không cần reload trang.
4. **Định dạng Giá tiền (Price Format)**: Định dạng số tiền tự động sang định dạng VND (ví dụ `45.000 ₫`).
5. **Mobile Navigation**: Menu responsive dạng hamburger toggle linh hoạt trên điện thoại và máy tính bảng.
6. **Xử lý Lỗi & Loading State**: Hiển thị trạng thái "Đang tải menu..." và thông báo lỗi thân thiện nếu không tải được CSV.

## 🛒 Modules

| # | Module | Trạng thái | Tài liệu |
|---|--------|-----------|----------|
| 1 | Giỏ hàng + lưu đơn vào SQLite (`orders.db`) | Hoàn thành | [docs/MODULE-01-CART.md](docs/MODULE-01-CART.md) |
| 2 | Thanh toán | Chưa làm | |
| 3 | Trạng thái đơn hàng | Chưa làm | |

## 💻 Cách chạy dự án

1. Clone hoặc tải thư mục dự án về máy.
2. Mở file `index.html` trực tiếp bằng trình duyệt web (hoặc sử dụng Live Server trong VS Code / IDE).
3. Thưởng thức giao diện KFC Landing Page mượt mà và hiện đại!
