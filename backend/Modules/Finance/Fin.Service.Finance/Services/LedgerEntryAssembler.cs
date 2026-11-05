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
        /// <summary>
        /// Gán mọi trường của <paramref name="request"/> vào <paramref name="entry"/>.
        /// Số tiền lưu đúng như đã gõ theo loại tiền người dùng chọn (không quy đổi).
        /// Nếu số trước thuế và % thuế không đổi (chỉ sửa trường khác hoặc chỉ đổi loại tiền) thì giữ nguyên số sau thuế
        /// đã lưu, vì đó có thể là số thực nhận / thực trả chính xác; tính lại từ số trước thuế đã làm tròn có thể lệch 1 cent.
        /// </summary>
        public static void Apply(LedgerEntry entry, LedgerEntryRequest request)
        {
            var sameMoney = entry.Amount == request.Amount && entry.TaxPercent == request.TaxPercent;
            entry.Date = DateOnly.ParseExact(request.Date, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture);
            entry.Description = request.Description.Trim();
            entry.CategoryId = request.CategoryId;
            entry.CurrencyCode = SalesValues.CurrencyOf(request.CurrencyCode);
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
                UnitPrice = request.UnitPrice,
                ItemTotal = request.ItemTotal,
                DiscountAmount = request.DiscountAmount,
                DiscountCode = request.DiscountCode,
                Subtotal = request.Subtotal,
                ShippingAmount = request.ShippingAmount,
                TaxAmount = request.TaxAmount,
                Note = request.Note,
                InvoiceId = request.InvoiceId,
            };
            var keepAfterTax = sameMoney ? entry.AmountAfterTax : (decimal?)null;
            entry.SetAmounts(request.Amount, request.TaxPercent, keepAfterTax);
        }
    }
}
