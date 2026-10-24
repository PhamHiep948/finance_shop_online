using Fin.Domain.Finance.Entities;
using Microsoft.EntityFrameworkCore;

namespace Fin.Infrastructure.Finance.Contexts
{
    public sealed class FinanceContext : DbContext
    {
        public FinanceContext(DbContextOptions<FinanceContext> options)
            : base(options)
        {
        }

        public DbSet<Category> Categories => Set<Category>();
        public DbSet<LedgerEntry> LedgerEntries => Set<LedgerEntry>();
        public DbSet<Attachment> Attachments => Set<Attachment>();
        public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
        public DbSet<FxMonthlyRate> FxMonthlyRates => Set<FxMonthlyRate>();
        public DbSet<FxDailyRate> FxDailyRates => Set<FxDailyRate>();
        public DbSet<CategoryGroup> CategoryGroups => Set<CategoryGroup>();
        public DbSet<Translation> Translations => Set<Translation>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.ApplyConfigurationsFromAssembly(typeof(FinanceContext).Assembly);
            base.OnModelCreating(modelBuilder);
        }
    }
}
