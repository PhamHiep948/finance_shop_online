using Fin.Domain.Finance.Entities;
using Fin.Model.Dto.Finance.Requests;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.Services;
using Fin.Service.Finance.UseCases.LedgerEntries.Validators;

namespace Fin.Tests.Unit.Services
{
    /// <summary>
    /// Kiểm tra số tiền được lưu theo đúng loại tiền người dùng chọn (gõ EUR lưu EUR), không quy sang USD trước khi lưu.
    /// </summary>
    public sealed class EntryCurrencyTests
    {
        private static LedgerEntryRequest Request(decimal amount, string? currency) => new()
        {
            Date = "2026-10-12", Description = "Lily", Amount = amount, TaxPercent = 19, AmountAfterTax = amount * 1.19m, CurrencyCode = currency,
        };

        [Fact]
        public void Typed_currency_is_stored_with_the_amount_as_typed()
        {
            var entry = new LedgerEntry();
            LedgerEntryAssembler.Apply(entry, Request(100m, "eur"));

            Assert.Equal("EUR", entry.CurrencyCode);
            Assert.Equal(100m, entry.Amount);
        }

        [Fact]
        public void Missing_currency_means_usd()
        {
            var entry = new LedgerEntry();
            LedgerEntryAssembler.Apply(entry, Request(100m, null));

            Assert.Equal("USD", entry.CurrencyCode);
        }

        [Fact]
        public void Changing_only_the_currency_keeps_the_typed_numbers()
        {
            var entry = new LedgerEntry();
            LedgerEntryAssembler.Apply(entry, Request(16.81m, "USD"));
            entry.SetAmounts(16.81m, 19, 20.01m);

            LedgerEntryAssembler.Apply(entry, Request(16.81m, "EUR"));

            Assert.Equal("EUR", entry.CurrencyCode);
            Assert.Equal(16.81m, entry.Amount);
            Assert.Equal(20.01m, entry.AmountAfterTax);
        }

        [Theory]
        [InlineData("USD", true)]
        [InlineData("EUR", true)]
        [InlineData(null, true)]
        [InlineData("VND", false)]
        public void Only_usd_and_eur_are_accepted(string? currency, bool valid)
        {
            var result = new LedgerEntryRequestValidator().Validate(Request(10m, currency));

            Assert.Equal(valid, result.IsValid);
        }

        [Fact]
        public void A_changed_amount_records_its_currency_in_the_history()
        {
            var before = new LedgerEntryResponse { Amount = 10m, CurrencyCode = "EUR" };
            var after = new LedgerEntryResponse { Amount = 12m, CurrencyCode = "EUR" };

            var changes = AuditTrail.Diff(before, after);

            Assert.Equal(new AuditChange("EUR", "EUR"), changes["currencyCode"]);
        }

        [Fact]
        public void No_currency_entry_when_no_amount_changed()
        {
            var before = new LedgerEntryResponse { Amount = 10m, Description = "a", CurrencyCode = "EUR" };
            var after = new LedgerEntryResponse { Amount = 10m, Description = "b", CurrencyCode = "EUR" };

            Assert.False(AuditTrail.Diff(before, after).ContainsKey("currencyCode"));
        }
    }
}
