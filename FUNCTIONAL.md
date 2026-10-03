# Functional Specification

## 1. Mục tiêu

JavaScript chịu trách nhiệm:

* Load CSV
* Parse CSV
* Render product cards
* Filter category
* Format price
* Xử lý mobile navigation
* Xử lý các tương tác UI

Không có backend.

## 2. Load CSV

Khi trang load:

```text
DOMContentLoaded
        ↓
fetch(data/menu.csv)
        ↓
read response
        ↓
parse CSV
        ↓
store products
        ↓
render products
```

## 3. Product rendering

Mỗi product được render thành card:

```html
<article class="product-card">
    <img>
    <div class="product-card__content">
        <span class="product-card__category"></span>
        <h3></h3>
        <p></p>
        <strong></strong>
    </div>
</article>
```

Không sử dụng `innerHTML` với dữ liệu không tin cậy nếu có thể tránh được.

Ưu tiên tạo DOM elements bằng JavaScript.

## 4. Featured products

Các sản phẩm có:

```text
featured = true
```

được hiển thị trong khu vực sản phẩm nổi bật.

## 5. Category filter

Khi người dùng click category:

```text
Tất cả
```

→ hiển thị toàn bộ sản phẩm.

Khi chọn:

```text
Gà rán
```

→ chỉ hiển thị sản phẩm category `Gà rán`.

Sau khi filter:

* Cập nhật product grid
* Cập nhật trạng thái active của button
* Không reload trang

## 6. Price formatting

Input:

```text
45000
```

Output:

```text
45.000 ₫
```

Có thể sử dụng:

```javascript
new Intl.NumberFormat('vi-VN')
```

## 7. Mobile navigation

Trên mobile:

* Navigation mặc định được ẩn.
* Click menu button → mở navigation.
* Click lần nữa → đóng navigation.
* Click navigation item → đóng mobile menu.

## 8. Smooth scrolling

Các navigation link đến section sử dụng smooth scrolling.

Ví dụ:

```text
#about
#menu
```

## 9. Error handling

Nếu fetch CSV thất bại:

* Không throw lỗi ra UI.
* Hiển thị error state.
* Ghi lỗi vào console để developer debug.

## 10. Không có backend

Không được viết:

```text
API endpoint
POST request
database connection
server-side code
authentication
checkout API
```

Toàn bộ dữ liệu chỉ đọc từ CSV.

## 11. Accessibility

Cần đảm bảo:

* Button có accessible label
* Image có `alt`
* Navigation dùng semantic HTML
* Có keyboard focus
* Không chỉ dùng màu sắc để biểu thị trạng thái
