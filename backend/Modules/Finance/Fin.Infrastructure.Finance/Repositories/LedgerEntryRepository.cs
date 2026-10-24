using System.Globalization;
using Fin.Domain.Finance.Constants;
using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Contexts;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Finance.Mappers;
using Fin.Model.Dto.Finance.Requests;
using Fin.Model.Dto.Finance.Responses;
using Microsoft.EntityFrameworkCore;

namespace Fin.Infrastructure.Finance.Repositories
{
    public sealed class LedgerEntryRepository : ILedgerEntryRepository
    {
        private readonly FinanceContext _dbContext;

        public LedgerEntryRepository(FinanceContext dbContext)
        {
            _dbContext = dbContext;
        }

        public async Task<(List<LedgerEntryResponse> Items, long Total)> SearchAsync(string kind, LedgerSearchRequest request, CancellationToken cancellationToken)
        {
            var query = _dbContext.LedgerEntries.AsNoTracking().Where(x => x.Kind == kind && x.DeletedAt == null);
            if (!string.IsNullOrWhiteSpace(request.Search))
            {
                var search = request.Search.Trim();
                query = query.Where(x => x.Description.Contains(search));
            }
            if (TryParseDate(request.DateFrom, out var from))
            {
                query = query.Where(x => x.Date >= from);
            }
            if (TryParseDate(request.DateTo, out var to))
            {
                query = query.Where(x => x.Date <= to);
            }

            var total = await query.LongCountAsync(cancellationToken);
            var rows = await query
                .OrderByDescending(x => x.Date)
                .ThenByDescending(x => x.Id)
                .Skip((request.Page - 1) * request.PageSize)
                .Take(request.PageSize)
                .Select(x => new { Entry = x, AttachmentCount = x.Attachments.Count })
                .ToListAsync(cancellationToken);

            return (rows.Select(r => LedgerEntryMapper.ToResponse(r.Entry, r.AttachmentCount)).ToList(), total);
        }

        public async Task<LedgerEntryResponse?> GetResponseAsync(string kind, long id, CancellationToken cancellationToken)
        {
            var row = await _dbContext.LedgerEntries.AsNoTracking()
                .Where(x => x.Kind == kind && x.Id == id && x.DeletedAt == null)
                .Select(x => new { Entry = x, AttachmentCount = x.Attachments.Count })
                .FirstOrDefaultAsync(cancellationToken);
            return row is null ? null : LedgerEntryMapper.ToResponse(row.Entry, row.AttachmentCount);
        }

        public async Task<LedgerEntryResponse?> GetAnyResponseAsync(long id, CancellationToken cancellationToken)
        {
            var row = await _dbContext.LedgerEntries.AsNoTracking()
                .Where(x => x.Id == id)
                .Select(x => new { Entry = x, AttachmentCount = x.Attachments.Count })
                .FirstOrDefaultAsync(cancellationToken);
            return row is null ? null : LedgerEntryMapper.ToResponse(row.Entry, row.AttachmentCount);
        }

        public async Task<List<LedgerEntryResponse>> GetDeletedResponsesAsync(CancellationToken cancellationToken)
        {
            var rows = await _dbContext.LedgerEntries.AsNoTracking()
                .Where(x => x.DeletedAt != null)
                .OrderByDescending(x => x.DeletedAt)
                .ThenByDescending(x => x.Id)
                .Select(x => new { Entry = x, AttachmentCount = x.Attachments.Count })
                .ToListAsync(cancellationToken);
            return rows.Select(r => LedgerEntryMapper.ToResponse(r.Entry, r.AttachmentCount)).ToList();
        }

        public async Task<LedgerEntry?> GetAsync(string kind, long id, CancellationToken cancellationToken)
        {
            return await _dbContext.LedgerEntries.FirstOrDefaultAsync(x => x.Kind == kind && x.Id == id && x.DeletedAt == null, cancellationToken);
        }

        public async Task<LedgerEntry?> GetAnyAsync(long id, CancellationToken cancellationToken)
        {
            return await _dbContext.LedgerEntries.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        }

        public async Task<List<LedgerEntry>> GetDeletedAsync(DateTime? deletedBefore, CancellationToken cancellationToken)
        {
            var query = _dbContext.LedgerEntries.Where(x => x.DeletedAt != null);
            if (deletedBefore is not null)
            {
                query = query.Where(x => x.DeletedAt < deletedBefore);
            }
            return await query.ToListAsync(cancellationToken);
        }

        public async Task<List<LedgerEntry>> GetLinkedExpensesAsync(long incomeId, bool deleted, CancellationToken cancellationToken)
        {
            return await _dbContext.LedgerEntries
                .Where(x => x.Kind == LedgerKinds.Expense && x.LinkedIncomeId == incomeId && (deleted ? x.DeletedAt != null : x.DeletedAt == null))
                .OrderBy(x => x.Id)
                .ToListAsync(cancellationToken);
        }

        public async Task<HashSet<string>> GetExistingOrderCodesAsync(string salesChannel, IReadOnlyCollection<string> orderCodes, CancellationToken cancellationToken, string kind = LedgerKinds.Income)
        {
            if (orderCodes.Count == 0)
            {
                return [];
            }

            // Trashed orders count as existing so a deleted Etsy order is not silently imported again.
            var codes = await _dbContext.LedgerEntries.AsNoTracking()
                .Where(x => x.Kind == kind && x.SalesChannel == salesChannel && x.OrderCode != null && orderCodes.Contains(x.OrderCode))
                .Select(x => x.OrderCode!)
                .ToListAsync(cancellationToken);
            return codes.ToHashSet();
        }

        public void Add(LedgerEntry entry) => _dbContext.LedgerEntries.Add(entry);

        public void Remove(LedgerEntry entry) => _dbContext.LedgerEntries.Remove(entry);

        private static bool TryParseDate(string? value, out DateOnly date) =>
            DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date);
    }
}
