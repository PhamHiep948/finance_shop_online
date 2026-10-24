using System.Globalization;
using Fin.Domain.Finance.Constants;
using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Fin.Infrastructure.Finance.Seed
{
    public sealed class FinanceSeeder
    {
        private const string LegacyDomestic = "DOMESTIC";
        private const string LegacyInternational = "INTERNATIONAL";
        private const string ScopeDomestic = "Nội địa";
        private const string ScopeInternational = "Quốc tế";

        private static readonly string[] IncomeCategories = ["Bán hàng", "Thu khác"];

        private static readonly string[] ExpenseCategories =
        [
            "Nguyên vật liệu", "Bao bì / đóng gói", "Vận chuyển", "Quảng cáo", "Phí dịch vụ",
            "Lương nhân viên", "Điện / nước / Internet", "Thuê mặt bằng", "Công cụ / thiết bị", "Chi khác",
        ];

        private readonly FinanceContext _context;
        private readonly ILogger<FinanceSeeder> _logger;

        public FinanceSeeder(FinanceContext context, ILogger<FinanceSeeder> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async Task SeedAsync(CancellationToken cancellationToken)
        {
            await SeedKindAsync(CategoryKinds.Income, IncomeCategories, cancellationToken);
            await SeedKindAsync(CategoryKinds.Expense, ExpenseCategories, cancellationToken);
            // Scopes are seeded only once: a user who deletes "Nội địa" must not see it come back on the next run.
            await SeedKindAsync(CategoryKinds.Scope, [ScopeDomestic, ScopeInternational], cancellationToken);
            await ConvertLegacyScopesAsync(cancellationToken);
        }

        private async Task SeedKindAsync(string kind, IReadOnlyList<string> names, CancellationToken cancellationToken)
        {
            if (await _context.Categories.AnyAsync(x => x.Kind == kind, cancellationToken))
            {
                return;
            }

            foreach (var name in names)
            {
                _context.Categories.Add(new Category { Kind = kind, Name = name });
                // One SaveChanges per row keeps the auto-increment ids in the declared order.
                await _context.SaveChangesAsync(cancellationToken);
            }
            _logger.LogInformation("Seeded {Count} default categories of kind {Kind}", names.Count, kind);
        }

        private async Task ConvertLegacyScopesAsync(CancellationToken cancellationToken)
        {
            // Old rows stored the scope as DOMESTIC / INTERNATIONAL; scopes are now editable rows referenced by id.
            foreach (var (legacyCode, scopeName) in new[] { (LegacyDomestic, ScopeDomestic), (LegacyInternational, ScopeInternational) })
            {
                var scopeId = await _context.Categories
                    .Where(x => x.Kind == CategoryKinds.Scope && x.Name == scopeName)
                    .Select(x => (long?)x.Id)
                    .FirstOrDefaultAsync(cancellationToken);
                if (scopeId is null)
                {
                    continue;
                }

                var value = scopeId.Value.ToString(CultureInfo.InvariantCulture);
                var converted = await _context.LedgerEntries
                    .Where(x => x.OriginScope == legacyCode)
                    .ExecuteUpdateAsync(s => s.SetProperty(x => x.OriginScope, value), cancellationToken);
                if (converted > 0)
                {
                    _logger.LogInformation("Converted {Count} entries from scope code {Code} to scope id {Id}", converted, legacyCode, value);
                }
            }
        }
    }
}
