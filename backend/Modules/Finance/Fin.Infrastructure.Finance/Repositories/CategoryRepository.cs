using System.Globalization;
using Fin.Domain.Finance.Constants;
using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Contexts;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Model.Dto.Finance.Responses;
using Microsoft.EntityFrameworkCore;

namespace Fin.Infrastructure.Finance.Repositories
{
    public sealed class CategoryRepository : ICategoryRepository
    {
        private readonly FinanceContext _dbContext;

        public CategoryRepository(FinanceContext dbContext)
        {
            _dbContext = dbContext;
        }

        public async Task<List<CategoryResponse>> GetListAsync(string kind, CancellationToken cancellationToken)
        {
            var categories = await _dbContext.Categories.AsNoTracking()
                .Where(x => x.Kind == kind)
                .OrderBy(x => x.Id)
                .ToListAsync(cancellationToken);

            // Scopes are referenced by their id stored as text in origin_scope, not by category_id.
            var usage = kind == CategoryKinds.Scope
                ? await _dbContext.LedgerEntries.AsNoTracking()
                    .Where(x => x.DeletedAt == null && x.OriginScope != null)
                    .GroupBy(x => x.OriginScope!)
                    .Select(g => new { Key = g.Key, Count = g.LongCount() })
                    .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken)
                : (await _dbContext.LedgerEntries.AsNoTracking()
                    .Where(x => x.DeletedAt == null && x.CategoryId != null)
                    .GroupBy(x => x.CategoryId!.Value)
                    .Select(g => new { Key = g.Key, Count = g.LongCount() })
                    .ToListAsync(cancellationToken))
                    .ToDictionary(x => x.Key.ToString(CultureInfo.InvariantCulture), x => x.Count);

            return categories
                .Select(c => new CategoryResponse
                {
                    Id = c.Id,
                    Name = c.Name,
                    Used = usage.GetValueOrDefault(c.Id.ToString(CultureInfo.InvariantCulture)),
                })
                .ToList();
        }

        public async Task<Category?> GetByIdAsync(long id, string kind, CancellationToken cancellationToken)
        {
            return await _dbContext.Categories.FirstOrDefaultAsync(x => x.Id == id && x.Kind == kind, cancellationToken);
        }

        public async Task<bool> ExistsAsync(long id, string kind, CancellationToken cancellationToken)
        {
            return await _dbContext.Categories.AnyAsync(x => x.Id == id && x.Kind == kind, cancellationToken);
        }

        public async Task<bool> NameExistsAsync(string kind, string name, long? excludeId, CancellationToken cancellationToken)
        {
            // The utf8mb4_general_ci collation makes the comparison case-insensitive, matching the unique index uq_kind_name.
            return await _dbContext.Categories.AnyAsync(
                x => x.Kind == kind && x.Name == name && (excludeId == null || x.Id != excludeId),
                cancellationToken);
        }

        public async Task<long?> FindIdByNameAsync(string kind, string name, CancellationToken cancellationToken)
        {
            return await _dbContext.Categories
                .Where(x => x.Kind == kind && x.Name == name)
                .Select(x => (long?)x.Id)
                .FirstOrDefaultAsync(cancellationToken);
        }


        public async Task<int> CountEntriesAsync(long id, string kind, bool deleted, CancellationToken cancellationToken)
        {
            var query = _dbContext.LedgerEntries.AsNoTracking().Where(x => deleted ? x.DeletedAt != null : x.DeletedAt == null);
            if (kind == CategoryKinds.Scope)
            {
                var scope = id.ToString(CultureInfo.InvariantCulture);
                return await query.CountAsync(x => x.OriginScope == scope, cancellationToken);
            }
            return await query.CountAsync(x => x.CategoryId == id, cancellationToken);
        }

        public async Task<int> ClearScopeAsync(long scopeId, CancellationToken cancellationToken)
        {
            var scope = scopeId.ToString(CultureInfo.InvariantCulture);
            return await _dbContext.LedgerEntries
                .Where(x => x.OriginScope == scope)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.OriginScope, (string?)null), cancellationToken);
        }

        public void Add(Category category) => _dbContext.Categories.Add(category);

        public void Remove(Category category) => _dbContext.Categories.Remove(category);
    }
}
