using Fin.Infrastructure.Finance.Models;
using Fin.Service.Finance.Services;

namespace Fin.Tests.Unit.Services
{
    public sealed class EtsyOrderMapperTests
    {
        private static EtsyReceipt Receipt(string currency, string country, decimal subtotal, decimal shipping, decimal tax = 0, int items = 1) =>
            new("4136894034", new DateOnly(2026, 8, 6), currency,
                Enumerable.Range(1, items).Select(i => new EtsyReceiptItem($"Lilie Blumen {i}", 1)).ToList(),
                subtotal, 0, subtotal, shipping, tax, country, 0);

        [Fact]
        public void Eu_order_treats_received_money_as_post_tax_amount()
        {
            var order = EtsyOrderMapper.Map(Receipt("USD", "DE", 3.29m, 7m), new Dictionary<string, decimal>(), 19m);

            Assert.Equal("IN_EU", order.SaleRegion);
            Assert.Equal(10.29m, order.AmountAfterTax);
            Assert.Equal(8.65m, order.Amount);
            Assert.Equal(1.64m, order.Tax);
            Assert.Equal(19m, order.TaxPercent);
        }

        [Fact]
        public void Non_eu_order_adds_collected_sales_tax_on_top()
        {
            var order = EtsyOrderMapper.Map(Receipt("USD", "US", 20m, 5m, tax: 2m), new Dictionary<string, decimal>(), 19m);

            Assert.Equal("OUTSIDE_EU", order.SaleRegion);
            Assert.Equal(25m, order.Amount);
            Assert.Equal(8m, order.TaxPercent);
            Assert.Equal(27m, order.AmountAfterTax);
        }

        [Fact]
        public void Eur_order_uses_the_typed_monthly_rate()
        {
            var rates = new Dictionary<string, decimal> { ["2026-08"] = 1.1593m };

            var order = EtsyOrderMapper.Map(Receipt("EUR", "US", 10m, 0m), rates, 19m);

            Assert.Equal(11.59m, order.Amount);
            Assert.Contains("tỷ giá tự nhập tháng 08/2026", order.Note);
        }

        [Fact]
        public void Eur_subtotal_and_shipping_are_converted_together_and_rounded_once()
        {
            var rates = new Dictionary<string, decimal> { ["2026-08"] = 1.01m };

            var order = EtsyOrderMapper.Map(Receipt("EUR", "US", 0.5m, 0.5m), rates, 19m);

            // 1.00 EUR × 1.01 = 1.01 USD (rounding 0.505 + 0.505 separately would give 1.02).
            Assert.Equal(1.01m, order.Amount);
        }

        [Fact]
        public void Non_eu_after_tax_is_amount_plus_collected_tax_not_recomputed_from_rounded_percent()
        {
            var order = EtsyOrderMapper.Map(Receipt("USD", "US", 123.45m, 0m, tax: 10.13m), new Dictionary<string, decimal>(), 19m);

            Assert.Equal(8.21m, order.TaxPercent);
            // 123.45 × 1.0821 = 133.59 would be one cent off the money actually received.
            Assert.Equal(133.58m, order.AmountAfterTax);
            Assert.Equal(10.13m, order.Tax);
        }

        [Fact]
        public void Eur_order_without_monthly_rate_falls_back_to_one()
        {
            var order = EtsyOrderMapper.Map(Receipt("EUR", "US", 10m, 0m), new Dictionary<string, decimal>(), 19m);

            Assert.Equal(10m, order.Amount);
            Assert.Contains("tạm tính mặc định 1 EUR = 1 USD", order.Note);
        }

        [Fact]
        public void Several_items_are_summarised_in_the_title()
        {
            var order = EtsyOrderMapper.Map(Receipt("USD", "US", 10m, 0m, items: 3), new Dictionary<string, decimal>(), 19m);

            Assert.Equal("Lilie Blumen 1 (+2 sản phẩm)", order.Description);
            Assert.Equal(3, order.Quantity);
        }
    }
}
