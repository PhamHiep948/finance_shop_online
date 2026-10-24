using System.Globalization;
using Fin.Domain.Finance.Constants;
using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Models;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.Constants;

namespace Fin.Service.Finance.Services
{
    public static class EtsyOrderMapper
    {
        private const int TitleMaxLength = 180;

        private static readonly HashSet<string> EuCountries =
        [
            "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
            "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
        ];

        public static EtsyOrderDto Map(EtsyReceipt receipt, IReadOnlyDictionary<string, decimal> monthlyRates, decimal euVatPercent) =>
            Map(receipt, new FxRateBook(monthlyRates), euVatPercent);

        public static EtsyOrderDto Map(EtsyReceipt receipt, FxRateBook rates, decimal euVatPercent)
        {
            var isEur = receipt.Currency.Equals("EUR", StringComparison.OrdinalIgnoreCase);
            var monthLabel = receipt.Created.ToString("MM/yyyy", CultureInfo.InvariantCulture);
            var dayLabel = receipt.Created.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            // A day with its own typed rate uses it; otherwise the month's rate; a month without one converts at
            // 1 EUR = 1 USD until the user enters it.
            var (bookRate, source) = rates.EurToUsd(receipt.Created);
            var rate = isEur ? bookRate : 1m;
            decimal Usd(decimal value) => decimal.Round(value * rate, 2, MidpointRounding.AwayFromZero);

            var subtotal = receipt.Subtotal == 0 ? receipt.TotalPrice - receipt.Discount : receipt.Subtotal;
            // Convert the sum once: rounding subtotal and shipping separately could add a stray cent.
            var received = Usd(subtotal + receipt.Shipping);
            var isEu = EuCountries.Contains(receipt.Country.ToUpperInvariant());

            decimal amount, afterTax, taxPercent, taxUsd;
            if (isEu)
            {
                // Inside the EU Etsy collects the VAT, so the money received is already the post-tax amount.
                taxPercent = euVatPercent;
                afterTax = received;
                amount = LedgerEntry.BeforeTax(received, taxPercent);
                taxUsd = afterTax - amount;
            }
            else
            {
                amount = received;
                taxUsd = Usd(receipt.Tax);
                taxPercent = amount == 0 ? 0 : decimal.Round(taxUsd / amount * 100, 2);
                // The tax Etsy collected is exact; recomputing it from the rounded percent would round twice.
                afterTax = amount + taxUsd;
            }

            var notes = new List<string>();
            if (isEur && source == FxRateSource.Daily)
            {
                notes.Add($"Quy đổi từ EUR theo tỷ giá tự nhập ngày {dayLabel}: 1 EUR = {rate.ToString(CultureInfo.InvariantCulture)} USD.");
            }
            else if (isEur && source == FxRateSource.Monthly)
            {
                notes.Add($"Quy đổi từ EUR theo tỷ giá tự nhập tháng {monthLabel}: 1 EUR = {rate.ToString(CultureInfo.InvariantCulture)} USD.");
            }
            else if (isEur)
            {
                notes.Add($"Chưa nhập tỷ giá tháng {monthLabel}: tạm tính mặc định 1 EUR = 1 USD.");
            }
            else if (!receipt.Currency.Equals("USD", StringComparison.OrdinalIgnoreCase))
            {
                notes.Add($"Đơn bằng {receipt.Currency}, chưa quy đổi.");
            }
            if (isEu)
            {
                notes.Add($"Trong EU: Etsy đã thu VAT {taxPercent.ToString("0.##", CultureInfo.InvariantCulture)}%, tiền nhận về ghi vào Sau thuế.");
            }
            if (receipt.Refunded > 0)
            {
                // A partial refund keeps the order amount; the note lets the user adjust it by hand.
                notes.Add($"Đơn đã được hoàn {receipt.Refunded.ToString("0.00", CultureInfo.InvariantCulture)} {receipt.Currency.ToUpperInvariant()}.");
            }

            return new EtsyOrderDto
            {
                ReceiptId = receipt.ReceiptId,
                Date = receipt.Created.ToString(FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture),
                Description = Title(receipt),
                Quantity = Math.Max(1, receipt.Items.Sum(i => i.Quantity)),
                Currency = receipt.Currency.ToUpperInvariant(),
                ItemTotal = Usd(receipt.TotalPrice),
                Discount = Usd(receipt.Discount),
                Subtotal = Usd(subtotal),
                Shipping = Usd(receipt.Shipping),
                Tax = taxUsd,
                Amount = amount,
                AmountAfterTax = afterTax,
                TaxPercent = taxPercent,
                Country = receipt.Country.ToUpperInvariant(),
                SaleRegion = isEu ? SalesValues.RegionInEu : SalesValues.RegionOutsideEu,
                Note = notes.Count > 0 ? string.Join(" ", notes) : null,
            };
        }

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
