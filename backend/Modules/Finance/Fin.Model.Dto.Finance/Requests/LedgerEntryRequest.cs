namespace Fin.Model.Dto.Finance.Requests
{
    public sealed class LedgerEntryRequest
    {
        public string Date { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public long? CategoryId { get; set; }
        public decimal Amount { get; set; }
        public decimal TaxPercent { get; set; }
        public decimal AmountAfterTax { get; set; }
        // Currency the amounts were typed in (USD / EUR); they are stored as typed, not converted. Empty = USD.
        public string? CurrencyCode { get; set; }
        public string? OrderCode { get; set; }
        public string? SaleRegion { get; set; }
        public string? SalesChannel { get; set; }
        public int? ProductQty { get; set; }
        public string? Payee { get; set; }
        public string? OriginScope { get; set; }
        public string? PaymentMethod { get; set; }
        public string? ReferenceCode { get; set; }
        public decimal? UnitPrice { get; set; }
        public decimal? ItemTotal { get; set; }
        public decimal? DiscountAmount { get; set; }
        public string? DiscountCode { get; set; }
        public decimal? Subtotal { get; set; }
        public decimal? ShippingAmount { get; set; }
        public decimal? TaxAmount { get; set; }
        public string? Note { get; set; }
        public string? InvoiceId { get; set; }
    }
}
