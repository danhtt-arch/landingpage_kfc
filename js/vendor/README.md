# Thư viện bên thứ ba

## sql.js 1.14.2 (SQLite chạy trong trình duyệt)

| | |
|---|---|
| Dùng để | Chạy SQLite (WebAssembly) trong trình duyệt để lưu đơn hàng vào `orders.db` |
| Nguồn | npm: `sql.js@1.14.2` (https://registry.npmjs.org/sql.js/-/sql.js-1.14.2.tgz) |
| Giấy phép | MIT (xem `sql.js.LICENSE`) |
| File dùng | `sql-wasm.js`, `sql-wasm.wasm` (bản gốc trong `dist/` của gói, không chỉnh sửa) |

SHA-256 để kiểm tra file không bị thay đổi:

```text
f1c84000dbc856c9d87f4f3aabc4d3654bd436165db4be3da13751db3a9c20d7  sql-wasm.js
38c14f6e379210bc942bdc4ebca44e7bfdb4318ecc1c72ca666a28fdce96670a  sql-wasm.wasm
```

Thư viện được đặt sẵn trong dự án (không tải từ CDN lúc chạy), nên trang vẫn hoạt động khi không có Internet.
Chỉ được nạp ở lần đặt hàng hoặc lưu file đầu tiên, không làm chậm lúc mở trang.
Cần chạy trang qua http (Live Server), vì WebAssembly không nạp được khi mở bằng `file://`.

Muốn nâng cấp: tải gói mới từ npm, thay hai file trên, cập nhật bảng SHA-256 và chạy lại toàn bộ test.
