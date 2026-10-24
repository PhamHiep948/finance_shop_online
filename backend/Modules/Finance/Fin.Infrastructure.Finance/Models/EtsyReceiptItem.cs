namespace Fin.Infrastructure.Finance.Models
{
    // ListingId is 0 when Etsy no longer knows the listing (deleted product).
    public sealed record EtsyReceiptItem(string Title, int Quantity, long ListingId = 0);
}
