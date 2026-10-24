using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Interfaces;

namespace Fin.Tests.Unit.Support
{
    // Unit of work holding only translations in memory; the other repositories are not used by those handlers.
    public sealed class InMemoryTranslationUnitOfWork : IFinanceUnitOfWork, ITranslationRepository
    {
        private readonly List<Translation> _pending = [];
        private readonly List<Translation> _removed = [];

        public List<Translation> Rows { get; } = [];

        public int Commits { get; private set; }

        public ITranslationRepository TranslationRepository => this;

        public ICategoryRepository CategoryRepository => throw new NotSupportedException();

        public ILedgerEntryRepository LedgerEntryRepository => throw new NotSupportedException();

        public IAttachmentRepository AttachmentRepository => throw new NotSupportedException();

        public IAuditLogRepository AuditLogRepository => throw new NotSupportedException();

        public IFxMonthlyRateRepository FxMonthlyRateRepository => throw new NotSupportedException();
        public IFxDailyRateRepository FxDailyRateRepository => throw new NotSupportedException();

        public ICategoryGroupRepository CategoryGroupRepository => throw new NotSupportedException();

        public void Seed(string source, string? de = null, bool ignored = false) =>
            Rows.Add(new Translation { SourceHash = Translation.HashOf(source), Source = source, De = de, Ignored = ignored });

        // An untracked read hands out copies, so edits to them must not reach the stored rows.
        public Task<List<Translation>> GetAllAsync(CancellationToken cancellationToken) =>
            Task.FromResult(Rows.OrderBy(x => x.Source, StringComparer.Ordinal)
                .Select(x => new Translation { SourceHash = x.SourceHash, Source = x.Source, De = x.De, Ignored = x.Ignored })
                .ToList());

        public Task<List<Translation>> GetByHashesAsync(IReadOnlyCollection<string> hashes, CancellationToken cancellationToken) =>
            Task.FromResult(Rows.Where(x => hashes.Contains(x.SourceHash)).ToList());

        public void Add(Translation translation) => _pending.Add(translation);

        public void Remove(Translation translation) => _removed.Add(translation);

        public Task CommitAsync(CancellationToken cancellationToken = default)
        {
            if (_pending.Concat(Rows).GroupBy(x => x.SourceHash).Any(g => g.Count() > 1))
            {
                throw new InvalidOperationException("Duplicate primary key.");
            }
            Rows.AddRange(_pending);
            Rows.RemoveAll(_removed.Contains);
            _pending.Clear();
            _removed.Clear();
            Commits++;
            return Task.CompletedTask;
        }

        public Task<T> ExecuteInTransactionAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken = default) => action();
    }
}
