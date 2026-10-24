using Fin.Domain.Finance.Constants;
using Fin.Domain.Finance.Entities;
using Fin.Model.Dto.Finance.Requests;
using Fin.Model.Dto.Finance.Responses;

namespace Fin.Infrastructure.Finance.Interfaces
{
    public interface ILedgerEntryRepository
    {
        Task<(List<LedgerEntryResponse> Items, long Total)> SearchAsync(string kind, LedgerSearchRequest request, CancellationToken cancellationToken);

        Task<LedgerEntryResponse?> GetResponseAsync(string kind, long id, CancellationToken cancellationToken);

        Task<LedgerEntryResponse?> GetAnyResponseAsync(long id, CancellationToken cancellationToken);

        Task<List<LedgerEntryResponse>> GetDeletedResponsesAsync(CancellationToken cancellationToken);

        Task<LedgerEntry?> GetAsync(string kind, long id, CancellationToken cancellationToken);

        Task<LedgerEntry?> GetAnyAsync(long id, CancellationToken cancellationToken);

        Task<List<LedgerEntry>> GetDeletedAsync(DateTime? deletedBefore, CancellationToken cancellationToken);

        Task<List<LedgerEntry>> GetLinkedExpensesAsync(long incomeId, bool deleted, CancellationToken cancellationToken);

        Task<HashSet<string>> GetExistingOrderCodesAsync(string salesChannel, IReadOnlyCollection<string> orderCodes, CancellationToken cancellationToken, string kind = LedgerKinds.Income);

        void Add(LedgerEntry entry);

        void Remove(LedgerEntry entry);
    }
}
