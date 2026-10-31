# Tài liệu — Finance Shop Etsy

Bộ tài liệu của ứng dụng quản lý thu chi cho shop bán hàng trên Etsy. Đọc theo thứ tự nếu mới tham gia dự án; tra cứu theo bảng nếu đã quen.

| # | Tài liệu | Nội dung |
|---|---|---|
| 1 | [01-pham-vi.md](01-pham-vi.md) | Bài toán, mục tiêu, những gì **không** làm |
| 2 | [02-danh-sach-chuc-nang.md](02-danh-sach-chuc-nang.md) | Danh mục chức năng F01–F12 và trạng thái |
| 3 | [03-tac-nhan-va-use-case.md](03-tac-nhan-va-use-case.md) | Người dùng, use case, luồng chính |
| 4 | [04-kien-truc-thong-tin.md](04-kien-truc-thong-tin.md) | Màn hình, điều hướng, thành phần giao diện |
| 5 | [05-mo-hinh-du-lieu.md](05-mo-hinh-du-lieu.md) | Entity, ý nghĩa từng trường, quan hệ |
| 6 | [06-tieu-chi-nghiem-thu.md](06-tieu-chi-nghiem-thu.md) | Tiêu chí nghiệm thu theo chức năng |
| 7 | [07-cau-truc-thu-muc.md](07-cau-truc-thu-muc.md) | Cây thư mục toàn dự án |
| 8 | [08-kien-truc-backend.md](08-kien-truc-backend.md) | Clean Architecture, CQRS, luồng một request, quy ước code |
| — | [DATABASE.md](DATABASE.md) | Sơ đồ bảng, migration, chuyển từ database cũ |
| — | [api/README.md](api/README.md) | Danh sách API, định dạng `Response<T>`, mã lỗi |
| — | [requirements/quy-tac-nghiep-vu.md](requirements/quy-tac-nghiep-vu.md) | Các quy tắc nghiệp vụ (BR-xx) |
| — | [requirements/yeu-cau-phi-chuc-nang.md](requirements/yeu-cau-phi-chuc-nang.md) | Hiệu năng, bảo mật, dữ liệu, vận hành |
| — | [huong-dan/chay-du-an.md](huong-dan/chay-du-an.md) | Cài đặt, chạy, kiểm thử |
| — | [huong-dan/them-chuc-nang-moi.md](huong-dan/them-chuc-nang-moi.md) | Các bước thêm một chức năng theo đúng kiến trúc |

## Tóm tắt nhanh

- **Backend:** ASP.NET Core 9, Clean Architecture theo module (dựa trên khung CMS_VSF), CQRS bằng MediatR + FluentValidation, EF Core 9 + Pomelo trên MySQL / MariaDB (XAMPP).
- **Frontend:** HTML + CSS + JavaScript thuần trong `frontend/`, được chính API phục vụ tại `http://localhost:5000`.
- **Dữ liệu:** một database `finance`, schema do migration EF quản lý; chương trình `Fin.Migration` là nơi duy nhất tạo / nâng cấp bảng và nạp dữ liệu mặc định.
- **Tiền tệ:** số tiền lưu đúng **loại tiền lúc nhập** (gõ EUR lưu EUR, gõ USD lưu USD); khi hiển thị / cộng báo cáo, khoản EUR quy sang USD (và ngược lại) theo **tỷ giá tự nhập của ngày / tháng** của khoản (tháng chưa nhập tạm tính 1 EUR = 1 USD). Đơn và phí quảng cáo nhập từ Etsy lưu USD.
