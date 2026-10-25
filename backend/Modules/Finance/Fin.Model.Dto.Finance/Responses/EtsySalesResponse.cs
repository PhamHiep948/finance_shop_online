namespace Fin.Model.Dto.Finance.Responses
{
    // Paid Etsy orders of the days From..To (yyyy-MM-dd). Money is in USD, converted like the imported orders.
    public sealed class EtsySalesResponse
    {
        public string From { get; set; } = string.Empty;
        public string To { get; set; } = string.Empty;
        public int Orders { get; set; }
        public int Items { get; set; }
        // Same figure as the orders would have in "Khoản thu": received money before tax.
        public decimal Revenue { get; set; }
        public List<EtsyListingSalesDto> Listings { get; set; } = [];
    }

    public sealed class EtsyListingSalesDto
    {
        public long ListingId { get; set; }
        public int Sold { get; set; }
        public int Orders { get; set; }
        // Price × quantity of this product's order lines (before discount and shipping).
        public decimal Revenue { get; set; }
    }
}
