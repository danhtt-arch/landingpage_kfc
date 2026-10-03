# Implementation Instructions

## Role

Bạn là một senior frontend developer.

Hãy xây dựng landing page giới thiệu KFC dựa trên toàn bộ specification trong các file `.MD` của project.

## Tech Stack

Chỉ sử dụng:

* HTML5
* CSS3
* Vanilla JavaScript
* CSV

Không sử dụng framework hoặc backend.

## Project Structure

Tạo cấu trúc:

```text
/
├── index.html
├── README.md
│
├── css/
│   └── style.css
│
├── js/
│   └── app.js
│
├── data/
│   └── menu.csv
│
└── assets/
    └── images/
```

Các file specification:

```text
PROJECT.md
DESIGN.md
DATA.md
FUNCTIONAL.md
IMPLEMENTATION.md
```

## Development Order

Thực hiện theo thứ tự:

### Step 1

Đọc:

```text
PROJECT.md
DESIGN.md
DATA.md
FUNCTIONAL.md
IMPLEMENTATION.md
```

### Step 2

Tạo HTML semantic.

### Step 3

Tạo CSS responsive.

### Step 4

Tạo JavaScript.

### Step 5

Tạo CSV mẫu.

### Step 6

Kết nối CSV với JavaScript.

### Step 7

Implement category filter.

### Step 8

Implement responsive navigation.

### Step 9

Kiểm tra lỗi.

## HTML Requirements

Sử dụng:

```html
<header>
<nav>
<main>
<section>
<article>
<footer>
```

Không tạo toàn bộ trang bằng `<div>`.

## Sections

Trang phải có:

```text
Header
Hero
Introduction
Featured Products
Menu
CTA
Footer
```

## Visual Requirements

Landing page cần:

* Modern
* Minimal
* Clean
* Premium
* Product-focused
* Mobile responsive

Màu đỏ là màu accent chính.

Không làm giao diện quá nhiều gradient hoặc animation.

## Product Cards

Card cần có:

```text
Image
Category
Name
Description
Price
```

Hover trên desktop:

* Card nâng nhẹ
* Image scale nhẹ
* Shadow thay đổi nhẹ

## CSV

Không hard-code menu vào HTML.

Menu phải được load từ:

```text
data/menu.csv
```

## JavaScript

JavaScript phải có các chức năng:

```text
loadProducts()
parseCSV()
renderProducts()
filterProducts()
formatPrice()
initMobileMenu()
```

Có thể thay đổi tên function nếu kiến trúc code hợp lý hơn.

## Performance

Ưu tiên:

* Không có thư viện không cần thiết.
* Không có dependency lớn.
* Lazy loading cho ảnh sản phẩm nếu phù hợp.
* CSS tối ưu.
* JavaScript tối giản.

## Accessibility

Đảm bảo:

* Alt text cho ảnh
* Keyboard navigation
* Focus state
* Semantic HTML
* Contrast phù hợp

## Validation Checklist

Sau khi hoàn thành, kiểm tra:

### Layout

* [ ] Header hoạt động
* [ ] Hero hiển thị đúng
* [ ] Introduction hiển thị đúng
* [ ] Featured products hiển thị
* [ ] Menu hiển thị
* [ ] CTA hoạt động
* [ ] Footer hiển thị

### Data

* [ ] CSV load thành công
* [ ] CSV parse đúng
* [ ] Product render đúng
* [ ] Price format đúng
* [ ] Image path đúng

### Filter

* [ ] Tất cả hoạt động
* [ ] Gà rán hoạt động
* [ ] Combo hoạt động
* [ ] Burger hoạt động
* [ ] Category khác hoạt động

### Responsive

Test:

```text
1440px
1024px
768px
390px
375px
```

### Error handling

Kiểm tra trường hợp:

```text
CSV không tồn tại
CSV rỗng
CSV sai format
Image không tồn tại
```

Không được để JavaScript crash toàn bộ trang.

## Final Output

Sau khi triển khai:

1. Kiểm tra toàn bộ file.
2. Kiểm tra console.
3. Kiểm tra responsive.
4. Kiểm tra CSV.
5. Kiểm tra filter.
6. Sửa các lỗi phát hiện được.
7. Không tự ý thêm backend.
8. Không tự ý thêm framework.

Ưu tiên code đơn giản, dễ đọc và phù hợp cho người mới học Vibe Coding.
