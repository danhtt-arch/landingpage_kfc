# Data Specification

## 1. Nguồn dữ liệu

Menu được lưu trong:

```text
data/menu.csv
```

JavaScript sẽ đọc file CSV và render sản phẩm ra giao diện.

Không hard-code danh sách sản phẩm trực tiếp trong HTML.

## 2. Cấu trúc CSV

File CSV sử dụng các cột:

```csv
id,name,category,description,price,image,featured,discount
```

Ví dụ:

```csv
1,"Gà Rán","Gà rán","Gà rán giòn thơm hấp dẫn","45000","assets/images/chicken-1.jpg","true","20"
2,"Combo Gà Rán","Combo","Combo gà rán dành cho một người","99000","assets/images/combo-1.jpg","true","0"
3,"Burger Gà","Burger","Burger với thịt gà giòn","65000","assets/images/burger-1.jpg","false","10"
```

## 3. Ý nghĩa các field

### id

ID duy nhất của sản phẩm.

Ví dụ:

```text
1
2
3
```

### name

Tên sản phẩm.

### category

Danh mục sản phẩm.

Ví dụ:

```text
Gà rán
Combo
Burger
Món ăn kèm
Đồ uống
```

### description

Mô tả ngắn.

Nên giữ khoảng 1-2 câu.

### price

Giá sản phẩm.

Lưu dưới dạng số, không chứa ký hiệu tiền tệ.

Ví dụ:

```text
45000
```

JavaScript sẽ format thành:

```text
45.000 ₫
```

### image

Đường dẫn đến hình ảnh.

Ví dụ:

```text
assets/images/chicken-1.jpg
```

### featured

Xác định sản phẩm có phải sản phẩm nổi bật hay không.

Giá trị:

```text
true
false
```

### discount

Phần trăm giảm giá của món, số nguyên từ `0` đến `100`. Cột này **không bắt buộc**: để trống hoặc `0` nghĩa là không giảm.

`price` luôn là **giá gốc**. Giá bán = `price × (100 − discount) / 100`, làm tròn đến đồng.

Ví dụ:

```text
price = 45000, discount = 20  ->  giá bán 36.000 ₫ (giá gốc 45.000 ₫ hiển thị gạch ngang)
```

Giá trị không hợp lệ (chữ, âm, lớn hơn 100) được chuẩn hóa về khoảng 0–100 và không bao giờ làm giá bị âm.

## 4. Quy tắc dữ liệu

* ID không được trùng.
* Không bỏ trống `name`.
* Không bỏ trống `category`.
* `price` phải là số.
* `featured` chỉ sử dụng `true` hoặc `false`.
* `discount` là số nguyên từ 0 đến 100.
* Image path phải tồn tại.
* Description nên ngắn gọn.

## 5. CSV Parser

JavaScript cần xử lý:

* Header
* Rows
* Comma
* Field nằm trong dấu `"..."`

Không được giả định rằng mọi field đều không có dấu phẩy.

Nếu không sử dụng thư viện CSV bên ngoài, hãy viết parser đơn giản phù hợp với format CSV của dự án.

## 6. Fallback

Nếu CSV không tải được:

Hiển thị thông báo thân thiện:

```text
Không thể tải menu. Vui lòng thử lại sau.
```

Không để trang trắng hoặc JavaScript crash toàn bộ UI.

## 7. Loading state

Trong thời gian tải CSV, hiển thị:

```text
Đang tải menu...
```

Sau khi dữ liệu tải thành công:

```text
Render products
```
