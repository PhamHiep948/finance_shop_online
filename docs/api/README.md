# API

- Gốc: `http://localhost:5000/api/v1` (đường dẫn theo phiên bản `v{version}`; hiện chỉ có `v1`).
- Kiểm tra sống: `GET http://localhost:5000/health` → `{"status":"healthy"}`.
- Swagger (chỉ môi trường Development): `http://localhost:5000/swagger`.
- Không cần đăng nhập. CORS mở cho các origin trong `Cors:Origins` (Vite 5173, Live Server 5500).

## Định dạng kết quả — `Response<T>`

```json
{ "succeeded": true, "message": null, "errorCode": null, "errors": null, "data": { } }
```

| Tình huống | HTTP | Body |
|---|---|---|
| Thành công | 200 | `succeeded: true`, kết quả trong `data` |
| Lỗi nghiệp vụ (trùng tên, khóa sổ, không tìm thấy…) | 200 | `succeeded: false`, `errorCode`, `message` tiếng Việt |
| Dữ liệu gửi lên sai | 400 | `succeeded: false`, `errors: ["…"]`, `message` = các lỗi ghép lại |
| Lỗi Etsy / lỗi ứng dụng có chủ đích | 400 | `message` |
| Không kết nối được MySQL | 500 | `message: "Không kết nối được MySQL…"` |

Ngoại lệ không bọc `Response<T>`: `GET /attachments/{id}` (trả file), `GET /etsy/connect` và `GET /etsy/callback` (chuyển hướng), `GET /health`.

## Danh sách endpoint

### Cài đặt

| Method | Đường dẫn | Use case | `data` |
|---|---|---|---|
| GET | `/settings` | `GetSettingsQuery` | `{ periodLock: { enabled, period, graceDays, today } }` |

### Loại thu / loại chi / phạm vi — `{type}` = `income` · `expense` · `scope`

| Method | Đường dẫn | Use case | Ghi chú |
|---|---|---|---|
| GET | `/categories/{type}` | `GetCategoriesQuery` | `[{ id, name, used }]` — `used` = số khoản đang dùng |
| POST | `/categories/{type}` | `CreateCategoryCommand` | body `{ name }` (1–150 ký tự) |
| PUT | `/categories/{type}/{id}` | `RenameCategoryCommand` | body `{ name }` |
| DELETE | `/categories/{type}/{id}` | `DeleteCategoryCommand` | loại đang dùng → `CAT_ERR_003`; phạm vi xóa tự do |

### Nhóm loại (báo cáo)

| Method | Đường dẫn | Use case | Ghi chú |
|---|---|---|---|
| GET | `/category-groups` | `GetCategoryGroupsQuery` | `[{ id, name, categoryIds }]` |
| POST | `/category-groups` | `CreateCategoryGroupCommand` | body `{ name, categoryIds }` → `{ id }` |
| PUT | `/category-groups/{id}` | `UpdateCategoryGroupCommand` | body `{ name? , categoryIds? }` (gửi trường nào sửa trường đó) |
| DELETE | `/category-groups/{id}` | `DeleteCategoryGroupCommand` | |

### Khoản thu (`/incomes`) và khoản chi (`/expenses`)

| Method | Đường dẫn | Use case | Ghi chú |
|---|---|---|---|
| GET | `/{incomes|expenses}?page&pageSize&search&dateFrom&dateTo` | `GetLedgerEntriesQuery` | `{ items, page, pageSize, totalItems, totalPages }`, `pageSize` ≤ 100 |
| GET | `/{…}/{id}` | `GetLedgerEntryByIdQuery` | |
| POST | `/{…}` | `CreateLedgerEntryCommand` | body: `date, description, categoryId, amount, taxPercent, orderCode, saleRegion, salesChannel, productQty, payee, originScope, paymentMethod, referenceCode, unitPrice, itemTotal, discountAmount, discountCode, subtotal, shippingAmount, taxAmount, note, invoiceId` |
| PUT | `/{…}/{id}` | `UpdateLedgerEntryCommand` | khoản Etsy → `LED_ERR_002` |
| DELETE | `/{…}/{id}` | `DeleteLedgerEntryCommand` | chuyển vào thùng rác |
| PUT | `/incomes/{id}/cost` | `SetIncomeCostCommand` | body `{ amount, taxPercent, invoiceId, date }`; `amount` = 0 → bỏ; trả khoản chi hoặc `null` |
| GET | `/{…}/{id}/attachments` | `GetAttachmentsQuery` | `[{ id, entryId, originalName, contentType, size, createdAt }]` |
| POST | `/{…}/{id}/attachments` | `UploadAttachmentsCommand` | `multipart/form-data`, trường `files`, tối đa 10 file × 10 MB |

Mỗi khoản (`LedgerEntryResponse`) gồm: `id, kind, date, description, categoryId, amount, taxPercent, amountAfterTax, currencyCode, orderCode, saleRegion, salesChannel, productQty, payee, originScope, paymentMethod, source, linkedIncomeId, referenceCode, unitPrice, itemTotal, discountAmount, discountCode, subtotal, shippingAmount, taxAmount, note, invoiceId, attachmentCount, createdAt, updatedAt, deletedAt`.

### Chứng từ

| Method | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/attachments/{id}` | trả file; ảnh / PDF / TXT mở trên trình duyệt, `?download=1` để tải về |
| DELETE | `/attachments/{id}` | `DeleteAttachmentCommand` |

### Thùng rác

| Method | Đường dẫn | Use case | Ghi chú |
|---|---|---|---|
| GET | `/trash` | `GetTrashQuery` | `{ retentionDays: 30, items }`; tự dọn khoản quá hạn trước khi trả |
| POST | `/trash/{id}/restore` | `RestoreEntryCommand` | khôi phục cả tiền xưởng / ship đi kèm |
| DELETE | `/trash/{id}` | `PurgeEntryCommand` | xóa vĩnh viễn (dòng + file) |
| DELETE | `/trash` | `EmptyTrashCommand` | `{ purged }` |

### Lịch sử

| Method | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/audit?page&pageSize&entityType&action&entityId&search&dateFrom&dateTo` | `entityType`: `ENTRY` (thu + chi), `INCOME`, `EXPENSE`, `CATEGORY`; `action`: `CREATE`, `UPDATE`, `DELETE`, `RESTORE`, `PURGE`, `ATTACH` (thêm + xóa chứng từ) |

### Tỷ giá

| Method | Đường dẫn | Use case | Ghi chú |
|---|---|---|---|
| GET | `/fx` | `GetCurrentRateQuery` | `{ eurToUsd, usdToEur, date, auto, manual }` — tỷ giá tự nhập riêng hôm nay, rồi tỷ giá tự nhập tháng này, không có thì ECB |
| GET | `/fx/monthly` | `GetMonthlyRatesQuery` | `[{ month, eurToUsd }]` |
| GET | `/fx/months?from=yyyy-MM&to=yyyy-MM` | `GetRateTableQuery` | `[{ month, manual, ecb }]`, tối đa 36 tháng |
| PUT | `/fx/monthly/{yyyy-MM}` | `SetMonthlyRateCommand` | body `{ eurToUsd }` trong khoảng 0,5 – 3 |
| DELETE | `/fx/monthly/{yyyy-MM}` | `DeleteMonthlyRateCommand` | |
| GET | `/fx/daily` | `GetDailyRatesQuery` | `[{ date, eurToUsd }]` — mọi tỷ giá tự nhập riêng theo ngày |
| GET | `/fx/days?month=yyyy-MM` | `GetDayTableQuery` | `[{ date, manual, monthly, ecb, used, source }]` từng ngày của tháng; `source` = `DAILY` / `MONTHLY` / `DEFAULT` |
| PUT | `/fx/daily/{yyyy-MM-dd}` | `SetDailyRateCommand` | body `{ eurToUsd }` trong khoảng 0,5 – 3; ngày này quy đổi theo số này thay cho tỷ giá tháng |
| DELETE | `/fx/daily/{yyyy-MM-dd}` | `DeleteDailyRateCommand` | quay về tỷ giá tháng; không có → `FX_ERR_005` |

### Etsy

| Method | Đường dẫn | Use case | Ghi chú |
|---|---|---|---|
| GET | `/etsy/status` | `GetEtsyStatusQuery` | `{ configured, keyError, connected, shopId, redirectUri, ready }` |
| GET | `/etsy/connect` | `GetEtsyAuthorizeUrlQuery` | chuyển hướng sang trang cấp quyền của Etsy |
| GET | `/etsy/callback` | `CompleteEtsyAuthorizationCommand` | Etsy gọi về; chuyển về `/#/incomes?etsy=connected` |
| POST | `/etsy/disconnect` | `DisconnectEtsyCommand` | |
| GET | `/etsy/orders?from&to` | `GetEtsyOrdersQuery` | ngày `yyyy-MM-dd`, tối đa 1 năm; mỗi đơn có `imported` |
| POST | `/etsy/import` | `ImportEtsyOrdersCommand` | body `{ orders }` → `{ imported, skipped }` |
| GET | `/etsy/listings` | `GetEtsyListingsQuery` | sản phẩm đang bán / hết hàng, xếp theo lượt xem; `views`, `favorites` là tổng từ lúc đăng. Backend nhớ 10 phút. Cần quyền `listings_r` |
| GET | `/etsy/sales?from&to` | `GetEtsySalesQuery` | ngày yyyy-MM-dd (≤ 1 năm) → `{ orders, items, revenue, listings: [{ listingId, sold, orders, revenue }] }`; `revenue` (USD, trước thuế) tính như Khoản thu |
| POST | `/etsy/refresh` | `RefreshEtsyDataCommand` | bỏ dữ liệu Etsy backend đang nhớ (nút "Làm mới") |
| GET | `/etsy/fees?from&to` | `GetEtsyFeesQuery` | ngày yyyy-MM-dd (≤ 1 năm) → `{ rangeAds, rangeAdsUsd, currency, months: [{ month, etsyAds, offsiteAds, refunds, ads, currency, adsUsd, complete, imported }], types: [{ ledgerType, description, count, amount, isAds }] }` lấy từ sổ Etsy Payments; `range*` chỉ tính đúng các ngày đã chọn, `months` là trọn các tháng có trong khoảng |
| GET | `/etsy/autosync` | `GetEtsyAutoSyncQuery` | `{ enabled, intervalMinutes, lookbackDays, lastRunAt, lastImported, totalImported, lastError, running, ready, nextRunAt, intervals }` |
| PUT | `/etsy/autosync` | `ConfigureEtsyAutoSyncCommand` | body `{ enabled, intervalMinutes }` (15, 30, 60, 360, 1440) |
| POST | `/etsy/autosync/run` | `RunEtsyAutoSyncCommand` | chạy ngay; chưa kết nối → `ETS_ERR_001`. Mỗi lần chạy nhập đơn mới (`lastImported`). Riêng tiền quảng cáo: hễ Etsy đã kết nối, sang tháng mới backend tự ghi tháng vừa hết thành một khoản chi "Quảng cáo" (mã `ADS-yyyy-MM`, sửa được ở Khoản chi), lỗi thì thử lại mỗi giờ (`adsMonthDone`, `lastAdsImported`, `adsError`) |

## Mã lỗi (`ErrorCodeEnum`)

| Mã | Ý nghĩa |
|---|---|
| `COM_ERR_000` | Lỗi chung / dữ liệu không hợp lệ |
| `COM_ERR_001` | Kỳ đã khóa sổ (message ghi rõ kỳ và hạn) |
| `CAT_ERR_001` … `CAT_ERR_005` | Loại: không tìm thấy, trùng tên, đang dùng, còn trong thùng rác, sai nhóm thu / chi |
| `GRP_ERR_001`, `GRP_ERR_002` | Nhóm: không tìm thấy, trùng tên |
| `LED_ERR_001` … `LED_ERR_003` | Khoản: không tìm thấy, khoản Etsy không sửa được, số tiền / % thuế sai |
| `ATT_ERR_001` … `ATT_ERR_004` | Chứng từ: không tìm thấy, chưa chọn file, sai định dạng request, file không hợp lệ |
| `TRS_ERR_001` | Không có trong thùng rác |
| `FX_ERR_001` … `FX_ERR_003` | Tỷ giá: sai định dạng tháng, quá 36 tháng, không tìm thấy |
| `ETS_ERR_001`, `ETS_ERR_002` | Etsy: chưa kết nối, chưa chọn đơn |
