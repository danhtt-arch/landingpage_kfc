# Design Specification

## 1. Phong cách

Phong cách tổng thể:

**Modern Minimalist**

Đặc điểm:

* Nền sáng
* Nhiều khoảng trắng
* Typography rõ ràng
* Màu đỏ làm màu chủ đạo
* Card sản phẩm đơn giản
* Hình ảnh sản phẩm lớn
* Animation nhẹ
* Không sử dụng hiệu ứng quá phức tạp

## 2. Màu sắc

### Primary

```css
--color-primary: #d71920;
```

### Dark

```css
--color-dark: #111111;
```

### White

```css
--color-white: #ffffff;
```

### Gray

```css
--color-gray: #f5f5f5;
```

### Text

```css
--color-text: #222222;
--color-text-muted: #666666;
```

Có thể điều chỉnh màu sắc để phù hợp với hình ảnh và nhận diện thương hiệu được cấp phép.

## 3. Typography

Ưu tiên font sans-serif hiện đại.

Ví dụ:

```css
font-family: Arial, Helvetica, sans-serif;
```

Nếu sử dụng web font, cần đảm bảo font có giấy phép phù hợp.

## 4. Layout

Maximum width:

```text
1200px
```

Các section chính:

```text
Header
Hero
Introduction
Featured Products
Menu
CTA
Footer
```

## 5. Header

Header gồm:

* Logo/brand
* Navigation
* Menu links
* Mobile menu button

Navigation:

```text
Trang chủ
Giới thiệu
Menu
```

Header có thể sticky khi scroll.

## 6. Hero

Hero là khu vực nổi bật nhất.

Nội dung:

* Headline lớn
* Mô tả ngắn
* CTA đến menu
* Hình ảnh sản phẩm nổi bật

Ví dụ cấu trúc:

```text
[Text]                 [Product Image]

Gà rán giòn ngon
Hương vị quen thuộc...

[Xem menu]
```

## 7. Introduction

Giới thiệu ngắn về sản phẩm/thương hiệu.

Không viết quá nhiều text.

Mục tiêu là truyền tải:

* Hương vị
* Độ giòn
* Sự hấp dẫn
* Trải nghiệm sản phẩm

## 8. Product Menu

Hiển thị danh sách sản phẩm dưới dạng grid.

Desktop:

```text
4 cards / row
```

Tablet:

```text
2 cards / row
```

Mobile:

```text
1 card / row
```

Mỗi product card gồm:

* Hình ảnh
* Tên sản phẩm
* Mô tả ngắn
* Giá
* Category

## 9. Category Filter

Các category mẫu:

```text
Tất cả
Gà rán
Combo
Burger
Món ăn kèm
Đồ uống
```

JavaScript sẽ lọc sản phẩm dựa trên dữ liệu CSV.

## 10. CTA

CTA cuối trang:

```text
Khám phá menu KFC
```

CTA chỉ dẫn người dùng quay về/xem khu vực menu.

Không có chức năng checkout.

## 11. Responsive

### Desktop

```text
>= 1024px
```

### Tablet

```text
768px - 1023px
```

### Mobile

```text
< 768px
```

Cần kiểm tra ít nhất:

* 1440px
* 1024px
* 768px
* 390px
* 375px

## 12. Animation

Chỉ sử dụng animation nhẹ:

* Fade in
* Hover card
* Button hover
* Image scale nhẹ

Không sử dụng animation gây khó chịu hoặc ảnh hưởng performance.
