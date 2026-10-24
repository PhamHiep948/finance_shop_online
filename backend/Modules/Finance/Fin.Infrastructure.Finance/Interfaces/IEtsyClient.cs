using Fin.Infrastructure.Finance.Models;

namespace Fin.Infrastructure.Finance.Interfaces
{
    public interface IEtsyClient
    {
        bool IsReady { get; }

        Task<EtsyConnectionStatus> GetStatusAsync(CancellationToken cancellationToken);

        Task<string> CreateAuthorizeUrlAsync(CancellationToken cancellationToken);

        Task CompleteAuthorizationAsync(string code, string state, CancellationToken cancellationToken);

        void Disconnect();

        Task<IReadOnlyList<EtsyReceipt>> GetPaidReceiptsAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken);

        // Active and sold-out listings of the shop.
        Task<IReadOnlyList<EtsyListing>> GetListingsAsync(CancellationToken cancellationToken);

        // Lines of the Etsy Payments account (sales, fees, ads, payouts) created in the range.
        Task<IReadOnlyList<EtsyLedgerEntry>> GetLedgerEntriesAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken);
    }
}
