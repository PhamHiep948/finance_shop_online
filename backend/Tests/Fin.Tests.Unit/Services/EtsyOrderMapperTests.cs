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
            var order = EtsyOrderMapper.Map(Receipt("USD", "DE", 3.29m, 7m), 19m);

            Assert.Equal("IN_EU", order.SaleRegion);
            Assert.Equal(10.29m, order.AmountAfterTax);
            Assert.Equal(8.65m, order.Amount);
            Assert.Equal(1.64m, order.Tax);
            Assert.Equal(19m, order.TaxPercent);
        }

        [Fact]
        public void Non_eu_order_adds_collected_sales_tax_on_top()
        {
            var order = EtsyOrderMapper.Map(Receipt("USD", "US", 20m, 5m, tax: 2m), 19m);

            Assert.Equal("OUTSIDE_EU", order.SaleRegion);
            Assert.Equal(25m, order.Amount);
            Assert.Equal(8m, order.TaxPercent);
            Assert.Equal(27m, order.AmountAfterTax);
        }

        [Fact]
        public void Eur_order_keeps_the_euro_amounts_without_converting()
        {
            var order = EtsyOrderMapper.Map(Receipt("EUR", "US", 10m, 2.5m, tax: 1m), 19m);

            Assert.Equal("EUR", order.Currency);
            Assert.Equal(12.5m, order.Amount);
            Assert.Equal(13.5m, order.AmountAfterTax);
            Assert.Null(order.Note);
        }

        [Fact]
        public void Order_in_another_currency_is_noted_as_not_converted()
        {
            var order = EtsyOrderMapper.Map(Receipt("GBP", "US", 10m, 0m), 19m);

            Assert.Equal(10m, order.Amount);
            Assert.Contains("Đơn bằng GBP, chưa quy đổi.", order.Note);
        }

        [Fact]
        public void Non_eu_after_tax_is_amount_plus_collected_tax_not_recomputed_from_rounded_percent()
        {
            var order = EtsyOrderMapper.Map(Receipt("USD", "US", 123.45m, 0m, tax: 10.13m), 19m);

            Assert.Equal(8.21m, order.TaxPercent);
            // 123.45 × 1.0821 = 133.59 would be one cent off the money actually received.
            Assert.Equal(133.58m, order.AmountAfterTax);
            Assert.Equal(10.13m, order.Tax);
        }

        [Fact]
        public void Several_items_are_summarised_in_the_title()
        {
            var order = EtsyOrderMapper.Map(Receipt("USD", "US", 10m, 0m, items: 3), 19m);

            Assert.Equal("Lilie Blumen 1 (+2 sản phẩm)", order.Description);
            Assert.Equal(3, order.Quantity);
        }
    }
}
