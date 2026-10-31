namespace Fin.Domain.Finance.Entities
{
    public sealed class LedgerDetails
    {
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
        // Etsy ad expense only: the USD amount last taken from Etsy. While the entry still has this amount it follows
        // Etsy; once the user changes it, the entry is left alone.
        public decimal? EtsyAmount { get; set; }
    }
}
