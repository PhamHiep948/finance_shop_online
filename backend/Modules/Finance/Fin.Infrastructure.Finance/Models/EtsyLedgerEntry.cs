namespace Fin.Infrastructure.Finance.Models
{
    // One line of the shop's Etsy Payments account; a charge (fee, ad) has a negative amount.
    public sealed record EtsyLedgerEntry(
        long EntryId,
        DateOnly Created,
        string LedgerType,
        string Description,
        decimal Amount,
        string Currency);
}
