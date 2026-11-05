using System.Globalization;
using Fin.Domain.Finance.Constants;
using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Models;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.Constants;

namespace Fin.Service.Finance.Services
{
    /// <summary>Đổi một đơn Etsy (receipt) thành dữ liệu đơn để hiện trong danh sách và nhập thành khoản thu.</summary>
    public static class EtsyOrderMapper
    {
        private const int TitleMaxLength = 180;

        private static readonly HashSet<string> EuCountries =
        [
            "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
            "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
        ];

        /// <summary>
        /// Đổi đơn Etsy thành <see cref="EtsyOrderDto"/>. Mọi số tiền giữ đúng loại tiền Etsy trả về (EUR vẫn là EUR),
        /// không quy đổi; tỷ giá chỉ dùng khi hiển thị / cộng báo cáo.
        /// Tiền nhận về = thành tiền + phí ship. Đơn trong EU: Etsy đã thu VAT nên tiền nhận về là số sau thuế, phần
        /// trước thuế tính ngược theo <paramref name="euVatPercent"/>. Đơn ngoài EU: tiền nhận về là trước thuế, cộng
        /// thêm đúng số thuế Etsy thu (không tính lại từ % đã làm tròn để khỏi lệch 1 cent).
        /// </summary>
        public static EtsyOrderDto Map(EtsyReceipt receipt, decimal euVatPercent)
        {
            var currency = receipt.Currency.ToUpperInvariant();
            var subtotal = receipt.Subtotal == 0 ? receipt.TotalPrice - receipt.Discount : receipt.Subtotal;
            var received = Round(subtotal + receipt.Shipping);
            var isEu = EuCountries.Contains(receipt.Country.ToUpperInvariant());

            decimal amount, afterTax, taxPercent, tax;
            if (isEu)
            {
                taxPercent = euVatPercent;
                afterTax = received;
                amount = LedgerEntry.BeforeTax(received, taxPercent);
                tax = afterTax - amount;
            }
            else
            {
                amount = received;
                tax = Round(receipt.Tax);
                taxPercent = amount == 0 ? 0 : decimal.Round(tax / amount * 100, 2);
                afterTax = amount + tax;
            }

            return new EtsyOrderDto
            {
                ReceiptId = receipt.ReceiptId,
                Date = receipt.Created.ToString(FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture),
                Description = Title(receipt),
                Quantity = Math.Max(1, receipt.Items.Sum(i => i.Quantity)),
                Currency = currency,
                ItemTotal = Round(receipt.TotalPrice),
                Discount = Round(receipt.Discount),
                Subtotal = Round(subtotal),
                Shipping = Round(receipt.Shipping),
                Tax = tax,
                Amount = amount,
                AmountAfterTax = afterTax,
                TaxPercent = taxPercent,
                Country = receipt.Country.ToUpperInvariant(),
                SaleRegion = isEu ? SalesValues.RegionInEu : SalesValues.RegionOutsideEu,
                Note = Note(receipt, currency, isEu, taxPercent),
            };
        }

        /// <summary>
        /// Ghi chú kèm đơn: đơn bằng loại tiền khác USD / EUR (lưu số gốc, chưa quy đổi), VAT Etsy đã thu với đơn
        /// trong EU, và số tiền Etsy đã hoàn (đơn hoàn một phần vẫn giữ số tiền đơn, người dùng tự chỉnh).
        /// </summary>
        private static string? Note(EtsyReceipt receipt, string currency, bool isEu, decimal taxPercent)
        {
            var notes = new List<string>();
            if (!SalesValues.IsKnownCurrency(currency))
            {
                notes.Add($"Đơn bằng {currency}, chưa quy đổi.");
            }
            if (isEu)
            {
                notes.Add($"Trong EU: Etsy đã thu VAT {taxPercent.ToString("0.##", CultureInfo.InvariantCulture)}%, tiền nhận về ghi vào Sau thuế.");
            }
            if (receipt.Refunded > 0)
            {
                notes.Add($"Đơn đã được hoàn {receipt.Refunded.ToString("0.00", CultureInfo.InvariantCulture)} {currency}.");
            }
            return notes.Count > 0 ? string.Join(" ", notes) : null;
        }

        /// <summary>Làm tròn số tiền 2 chữ số (0.5 làm tròn lên).</summary>
        private static decimal Round(decimal value) => decimal.Round(value, 2, MidpointRounding.AwayFromZero);

        /// <summary>Tên khoản thu: tên sản phẩm đầu tiên (cắt bớt nếu quá dài), kèm "+n sản phẩm" khi đơn có nhiều sản phẩm.</summary>
        private static string Title(EtsyReceipt receipt)
        {
            if (receipt.Items.Count == 0)
            {
                return $"Đơn Etsy #{receipt.ReceiptId}";
            }

            var title = receipt.Items[0].Title;
            if (title.Length > TitleMaxLength)
            {
                title = title[..TitleMaxLength] + "…";
            }
            return receipt.Items.Count > 1 ? $"{title} (+{receipt.Items.Count - 1} sản phẩm)" : title;
        }
    }
}
