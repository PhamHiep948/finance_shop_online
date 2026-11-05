using System.Globalization;
using Fin.Domain.Finance.Constants;
using Fin.Domain.Finance.Entities;
using Fin.Model.Dto.Finance.Requests;
using Fin.Service.Finance.Constants;

namespace Fin.Service.Finance.Services
{
    /// <summary>Chép dữ liệu từ request thêm / sửa khoản thu, khoản chi vào entity <see cref="LedgerEntry"/>.</summary>
    public static class LedgerEntryAssembler
    {
        /// <summary>Gán mọi trường của <paramref name="request"/> vào <paramref name="entry"/> (thông tin chung và số tiền).</summary>
        public static void Apply(LedgerEntry entry, LedgerEntryRequest request)
        {
            entry.Date = DateOnly.ParseExact(request.Date, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture);
            entry.Description = request.Description.Trim();
            entry.CategoryId = request.CategoryId;
            entry.OrderCode = request.OrderCode;
            entry.SaleRegion = request.SaleRegion;
            entry.SalesChannel = request.SalesChannel;
            entry.ProductQty = request.ProductQty;
            entry.Payee = request.Payee;
            entry.OriginScope = request.OriginScope;
            entry.PaymentMethod = request.PaymentMethod;
            entry.Details = new LedgerDetails
            {
                ReferenceCode = request.ReferenceCode,
                DiscountCode = request.DiscountCode,
                Note = request.Note,
                InvoiceId = request.InvoiceId,
            };
            ApplyMoney(entry, request);
        }

        /// <summary>
        /// Chỉ gán phần tiền của <paramref name="request"/>: loại tiền, đơn giá, giá bán, giảm giá, thành tiền, ship, thuế,
        /// số trước thuế, % thuế. Dùng riêng cho đơn Etsy (các trường khác giữ đúng như Etsy).
        /// Số tiền lưu đúng như đã gõ theo loại tiền người dùng chọn (không quy đổi). Nếu số trước thuế và % thuế không đổi
        /// (chỉ sửa trường khác hoặc chỉ đổi loại tiền) thì giữ nguyên số sau thuế đã lưu, vì đó có thể là số thực nhận /
        /// thực trả chính xác; tính lại từ số trước thuế đã làm tròn có thể lệch 1 cent.
        /// </summary>
        public static void ApplyMoney(LedgerEntry entry, LedgerEntryRequest request)
        {
            var sameMoney = entry.Amount == request.Amount && entry.TaxPercent == request.TaxPercent;
            entry.CurrencyCode = SalesValues.CurrencyOf(request.CurrencyCode);
            entry.Details.UnitPrice = request.UnitPrice;
            entry.Details.ItemTotal = request.ItemTotal;
            entry.Details.DiscountAmount = request.DiscountAmount;
            entry.Details.Subtotal = request.Subtotal;
            entry.Details.ShippingAmount = request.ShippingAmount;
            entry.Details.TaxAmount = request.TaxAmount;
            var keepAfterTax = sameMoney ? entry.AmountAfterTax : (decimal?)null;
            entry.SetAmounts(request.Amount, request.TaxPercent, keepAfterTax);
        }
    }
}
