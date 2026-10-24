namespace Fin.Infrastructure.Finance.Models
{
    // Views and Favorites are lifetime counts: Etsy does not give them per period.
    public sealed record EtsyListing(
        long ListingId,
        string Title,
        string State,
        string Url,
        string? ImageUrl,
        int Views,
        int Favorites,
        int Quantity,
        decimal Price,
        string Currency);
}
