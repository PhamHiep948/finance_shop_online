# Quy tắc nghiệp vụ

Mỗi quy tắc ghi kèm nơi cài đặt trong code để tra cứu nhanh.

## Tiền và thuế

| ID | Quy tắc | Cài đặt |
|---|---|---|
| BR-01 | Số tiền lưu theo **loại tiền lúc nhập** (USD hoặc EUR, cột `currency_code`), 2 chữ số thập phân, làm tròn `AwayFromZero`; quy đổi chỉ khi hiển thị / cộng báo cáo | `LedgerEntry.AfterTax / BeforeTax` |
| BR-02 | Khoản nhập tay: sau thuế = trước thuế × (1 + % thuế) | `LedgerEntry.SetAmounts` |
| BR-03 | Đơn Etsy **trong EU** (27 nước): tiền nhận về (tạm tính + ship) là tiền **sau thuế**; trước thuế = nhận về ÷ (1 + `EuVatPercent`, mặc định 19%) | `EtsyOrderMapper` |
| BR-04 | Đơn Etsy **ngoài EU**: trước thuế = tạm tính + ship; % thuế = thuế Etsy thu ÷ trước thuế | `EtsyOrderMapper` |
| BR-05 | Đơn Etsy và tiền xưởng / ship giữ **đúng số tiền thực nhận / thực trả**, không tính lại từ số đã làm tròn | `SetAmounts(…, keepAmountAfterTax)` |

## Tỷ giá

| ID | Quy tắc | Cài đặt |
|---|---|---|
| BR-10 | Tỷ giá nhập theo **tháng**: 1 EUR = ? USD, từ 0,5 đến 3 | `SetMonthlyRateValidator` |
| BR-11 | Tháng chưa nhập (chưa có thông báo) → **mặc định 1** cho cả hiển thị và quy đổi đơn Etsy bằng EUR | `EtsyOrderMapper`, `frontend/js/format.js` |
| BR-12 | Hiển thị EUR: mỗi khoản quy đổi theo tỷ giá **tháng của chính khoản đó**, rồi mới cộng | `frontend` (`toDisplay`) |
| BR-13 | Tỷ giá ECB chỉ để tham khảo trên trang Tỷ giá | `FrankfurterEcbRateProvider` |

## Khoản thu / chi

| ID | Quy tắc | Cài đặt |
|---|---|---|
| BR-20 | Bắt buộc: ngày `yyyy-MM-dd`, mô tả (≤ 500 ký tự), loại, số tiền ≥ 0, % thuế 0–100 | `LedgerEntryRequestValidator` |
| BR-21 | Loại phải thuộc đúng nhóm (loại thu cho khoản thu, loại chi cho khoản chi) | `Create/UpdateLedgerEntryHandler` |
| BR-22 | Khoản nhập từ **Etsy** chỉ xem / xóa, không sửa (ngoại trừ tiền xưởng / ship) | `UpdateLedgerEntryHandler` |
| BR-23 | Sửa khoản không làm mất nguồn (`source`) và liên kết khoản thu (`linked_income_id`) | `LedgerEntryAssembler` không đụng 2 trường này |

## Tiền xưởng / tiền ship

| ID | Quy tắc | Cài đặt |
|---|---|---|
| BR-30 | Mỗi khoản thu có tối đa **một** khoản chi tiền xưởng / ship gắn kèm (`source = LINKED`) | `SetIncomeCostHandler` |
| BR-31 | Ngoài EU → loại "Tiền xưởng"; trong EU → loại "Phí ship" (tự tạo loại nếu chưa có) | `SetIncomeCostHandler` |
| BR-32 | Số nhập là số **đã trả, gồm thuế**; trước thuế = số đã trả ÷ (1 + % thuế) | `SetIncomeCostHandler.SetPaidAmount` |
| BR-33 | Sửa lại tiền xưởng chỉ đổi số tiền, % thuế, ngày, ID hóa đơn, mã đơn; giữ mô tả / loại / ghi chú người dùng đã sửa | `SetIncomeCostHandler.UpdateAsync` |
| BR-34 | Số tiền 0 → khoản chi gắn kèm vào thùng rác | `SetIncomeCostHandler.RemoveAsync` |

## Loại, phạm vi, nhóm

| ID | Quy tắc | Cài đặt |
|---|---|---|
| BR-40 | Tên loại / phạm vi / nhóm: 1–150 ký tự, không trùng (không phân biệt hoa thường) | Validators, `NameExistsAsync` |
| BR-41 | Loại thu / chi chỉ xóa được khi không còn khoản nào dùng, **kể cả trong thùng rác** | `DeleteCategoryHandler` |
| BR-42 | Phạm vi khoản chi **xóa tự do**: mọi khoản đang dùng (cả thùng rác) chuyển về để trống | `DeleteCategoryHandler.DeleteScopeAsync` |
| BR-43 | Nhóm loại chỉ là danh sách id loại để chọn nhanh trong báo cáo; xóa nhóm không ảnh hưởng loại | `CategoryGroup` |

## Etsy

| ID | Quy tắc | Cài đặt |
|---|---|---|
| BR-50 | Chỉ lấy đơn **đã thanh toán**, bỏ đơn đã hủy và đơn hoàn tiền toàn bộ | `EtsyClient.GetPaidReceiptsAsync` |
| BR-51 | Đơn hoàn tiền **một phần** giữ nguyên số tiền, thêm ghi chú số tiền đã hoàn | `EtsyOrderMapper` |
| BR-52 | Không nhập trùng: so mã đơn với mọi khoản thu kênh `ETSY_STORE`, **kể cả trong thùng rác** | `GetExistingOrderCodesAsync` |
| BR-53 | Đơn Etsy được nhập cả vào kỳ đã khóa sổ (để bổ sung đơn tháng / quý trước) | `EtsyOrderImporter` |
| BR-54 | Loại gán cho đơn Etsy: `Etsy:DefaultCategoryId`; không còn thì lấy loại thu đầu tiên | `EtsyOrderImporter.ResolveCategoryAsync` |
| BR-55 | Mỗi lần lấy tối đa 1 năm đơn; đồng bộ tự động lấy 14 ngày gần nhất | `GetEtsyOrdersHandler`, `EtsyAutoSyncRunner` |
| BR-56 | Đồng bộ tự động chỉ chạy khi đã bật **và** đã kết nối Etsy; lỗi ghi vào `lastError`, không làm dừng tác vụ nền | `EtsyAutoSyncRunner` |

## Khóa sổ, thùng rác, lịch sử

| ID | Quy tắc | Cài đặt |
|---|---|---|
| BR-60 | Khóa sổ theo **quý** (mặc định) hoặc **tháng**; kỳ X còn sửa được tới hết ngày thứ `GraceDays` (mặc định 1) của kỳ sau | `PeriodLockPolicy` |
| BR-61 | Kỳ đã khóa: không thêm / sửa / xóa / khôi phục khoản, không thêm / xóa chứng từ, không chuyển khoản sang kỳ đã khóa | Các handler gọi `PeriodLockPolicy.Check` |
| BR-62 | Xóa = chuyển vào thùng rác; xóa khoản thu kéo theo tiền xưởng / ship (trừ khi kỳ của khoản chi đã khóa) | `DeleteLedgerEntryHandler` |
| BR-63 | Thùng rác giữ **30 ngày**; quá hạn tự xóa vĩnh viễn (khi khởi động API và khi mở thùng rác) | `TrashPurger`, `TrashCleanupWorker` |
| BR-64 | Xóa vĩnh viễn xóa dòng, chứng từ (dòng + file); lịch sử vẫn giữ | `TrashPurger` |
| BR-65 | Lịch sử ghi mọi thao tác; với sửa khoản, chỉ ghi khi có ít nhất một trường đổi | `AuditTrail` |

## Chứng từ

| ID | Quy tắc | Cài đặt |
|---|---|---|
| BR-70 | Định dạng: jpg, jpeg, png, gif, webp, pdf, txt, csv, doc, docx, xls, xlsx, zip | `AttachmentRules` |
| BR-71 | Tối đa 10 file / lần, 10 MB / file, không nhận file rỗng; một file sai → cả lần tải bị từ chối | `UploadAttachmentsHandler` |
| BR-72 | File lưu với tên ngẫu nhiên trong `uploads/`; tên gốc chỉ lưu trong database | `LocalAttachmentFileStore` |
