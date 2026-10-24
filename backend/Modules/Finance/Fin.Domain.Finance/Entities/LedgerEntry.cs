using Fin.Domain.Finance.Constants;
using Fin.Domain.Shared.Common;

namespace Fin.Domain.Finance.Entities
{
    public sealed class LedgerEntry : BaseEntity
    {
        // Order code of the monthly Etsy advertising expense: "ADS-yyyy-MM".
        public const string EtsyAdsCodePrefix = "ADS-";

        public string Kind { get; set; } = LedgerKinds.Income;
        public DateOnly Date { get; set; }
        public string Description { get; set; } = string.Empty;
        // Null for an income whose product group has not been picked yet (Etsy imports start empty).
        public long? CategoryId { get; set; }
        public decimal Amount { get; set; }
        public decimal TaxPercent { get; set; }
        public decimal AmountAfterTax { get; set; }
        public string CurrencyCode { get; set; } = SalesValues.DefaultCurrency;
        public string? OrderCode { get; set; }
        public string? SaleRegion { get; set; }
        public string? SalesChannel { get; set; }
        public int? ProductQty { get; set; }
        public string? Payee { get; set; }
        public string? OriginScope { get; set; }
        public string? PaymentMethod { get; set; }
        public string? Source { get; set; }
        public long? LinkedIncomeId { get; set; }
        // Legacy rows may hold NULL in the details column; EF skips the value converter for NULL, so guard here.
        public LedgerDetails Details
        {
            get => _details ??= new LedgerDetails();
            set => _details = value;
        }

        private LedgerDetails? _details;
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public DateTime? DeletedAt { get; set; }

        public ICollection<Attachment> Attachments { get; set; } = [];

        public bool IsDeleted => DeletedAt is not null;

        public bool IsFromEtsy => Source == EntrySources.Etsy;

        // The month's Etsy ad spend: imported from Etsy but, unlike an order, its amount may be corrected by hand.
        public bool IsEtsyAds => IsFromEtsy && Kind == LedgerKinds.Expense && OrderCode?.StartsWith(EtsyAdsCodePrefix, StringComparison.Ordinal) == true;

        public static decimal AfterTax(decimal amount, decimal taxPercent) =>
            decimal.Round(amount * (1 + taxPercent / 100), 2, MidpointRounding.AwayFromZero);

        public static decimal BeforeTax(decimal amountAfterTax, decimal taxPercent) =>
            decimal.Round(amountAfterTax / (1 + taxPercent / 100), 2, MidpointRounding.AwayFromZero);

        // Etsy orders and linked cost entries carry the exact amount that was actually paid / received;
        // recomputing it from the rounded pre-tax amount could shift it by a cent.
        public void SetAmounts(decimal amount, decimal taxPercent, decimal? keepAmountAfterTax = null)
        {
            Amount = amount;
            TaxPercent = taxPercent;
            AmountAfterTax = keepAmountAfterTax is > 0 ? keepAmountAfterTax.Value : AfterTax(amount, taxPercent);
        }

        public void SoftDelete(DateTime at) => DeletedAt = at;

        public void Restore() => DeletedAt = null;
    }
}
