using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Finance.Mappers;
using Fin.Model.Dto.Finance.Requests;
using Fin.Model.Dto.Finance.Responses;

namespace Fin.Tests.Unit.Support
{
    // Unit of work keeping ledger entries, expense categories, exchange rates and audit logs in memory.
    // Only what the Etsy and exchange-rate handlers use is implemented; anything else throws.
    public sealed class InMemoryFinanceUnitOfWork : IFinanceUnitOfWork,
        ILedgerEntryRepository, ICategoryRepository, IFxMonthlyRateRepository, IFxDailyRateRepository, IAuditLogRepository,
        IEtsyListingStatRepository
    {
        private readonly List<LedgerEntry> _pendingEntries = [];
        private readonly List<FxMonthlyRate> _pendingMonthly = [];
        private readonly List<FxMonthlyRate> _removedMonthly = [];
        private readonly List<FxDailyRate> _pendingDaily = [];
        private readonly List<FxDailyRate> _removedDaily = [];
        private readonly List<EtsyListingDailyStat> _pendingListingStats = [];
        private long _nextId = 1;

        public List<LedgerEntry> Entries { get; } = [];
        public List<Category> Categories { get; } = [];
        public List<FxMonthlyRate> MonthlyRates { get; } = [];
        public List<FxDailyRate> DailyRates { get; } = [];
        public List<AuditLog> AuditLogs { get; } = [];
        public List<EtsyListingDailyStat> ListingStats { get; } = [];
        public int Commits { get; private set; }

        public ILedgerEntryRepository LedgerEntryRepository => this;
        public ICategoryRepository CategoryRepository => this;
        public IFxMonthlyRateRepository FxMonthlyRateRepository => this;
        public IFxDailyRateRepository FxDailyRateRepository => this;
        public IAuditLogRepository AuditLogRepository => this;
        public IEtsyListingStatRepository EtsyListingStatRepository => this;
        public IAttachmentRepository AttachmentRepository => throw new NotSupportedException();
        public ICategoryGroupRepository CategoryGroupRepository => throw new NotSupportedException();
        public ITranslationRepository TranslationRepository => throw new NotSupportedException();

        public InMemoryFinanceUnitOfWork WithCategory(string kind, string name)
        {
            Categories.Add(new Category { Id = _nextId++, Kind = kind, Name = name });
            return this;
        }

        public InMemoryFinanceUnitOfWork WithMonthlyRate(string month, decimal eurToUsd)
        {
            MonthlyRates.Add(new FxMonthlyRate { Month = month, EurToUsd = eurToUsd });
            return this;
        }

        public InMemoryFinanceUnitOfWork WithDailyRate(DateOnly date, decimal eurToUsd)
        {
            DailyRates.Add(new FxDailyRate { Date = date, EurToUsd = eurToUsd });
            return this;
        }

        public InMemoryFinanceUnitOfWork WithListingStat(long listingId, DateOnly date, int views, int favorites = 0)
        {
            ListingStats.Add(new EtsyListingDailyStat { ListingId = listingId, Date = date, Views = views, Favorites = favorites });
            return this;
        }

        public InMemoryFinanceUnitOfWork WithEntry(LedgerEntry entry)
        {
            entry.Id = _nextId++;
            Entries.Add(entry);
            return this;
        }

        public Task CommitAsync(CancellationToken cancellationToken = default)
        {
            foreach (var entry in _pendingEntries)
            {
                entry.Id = _nextId++;
            }
            Entries.AddRange(_pendingEntries);
            MonthlyRates.AddRange(_pendingMonthly);
            MonthlyRates.RemoveAll(_removedMonthly.Contains);
            DailyRates.AddRange(_pendingDaily);
            DailyRates.RemoveAll(_removedDaily.Contains);
            _pendingEntries.Clear();
            _pendingMonthly.Clear();
            _removedMonthly.Clear();
            _pendingDaily.Clear();
            ListingStats.AddRange(_pendingListingStats);
            _pendingListingStats.Clear();
            _removedDaily.Clear();
            Commits++;
            return Task.CompletedTask;
        }

        public Task<T> ExecuteInTransactionAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken = default) => action();

        // ---- Ledger entries
        public Task<HashSet<string>> GetExistingOrderCodesAsync(string salesChannel, IReadOnlyCollection<string> orderCodes, CancellationToken cancellationToken, string kind = "INCOME") =>
            Task.FromResult(Entries
                .Where(x => x.Kind == kind && x.SalesChannel == salesChannel && x.OrderCode != null && orderCodes.Contains(x.OrderCode))
                .Select(x => x.OrderCode!)
                .ToHashSet());

        public Task<List<LedgerEntry>> GetByOrderCodesAsync(string kind, string salesChannel, IReadOnlyCollection<string> orderCodes, CancellationToken cancellationToken) =>
            Task.FromResult(Entries
                .Where(x => x.Kind == kind && x.SalesChannel == salesChannel && x.OrderCode != null && orderCodes.Contains(x.OrderCode))
                .ToList());

        void ILedgerEntryRepository.Add(LedgerEntry entry) => _pendingEntries.Add(entry);

        Task<(List<LedgerEntryResponse> Items, long Total)> ILedgerEntryRepository.SearchAsync(string kind, LedgerSearchRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();
        Task<LedgerEntryResponse?> ILedgerEntryRepository.GetResponseAsync(string kind, long id, CancellationToken cancellationToken) =>
            Task.FromResult(Entries.FirstOrDefault(x => x.Kind == kind && x.Id == id && x.DeletedAt == null) is { } entry
                ? LedgerEntryMapper.ToResponse(entry, 0)
                : null);
        Task<LedgerEntryResponse?> ILedgerEntryRepository.GetAnyResponseAsync(long id, CancellationToken cancellationToken) => throw new NotSupportedException();
        Task<List<LedgerEntryResponse>> ILedgerEntryRepository.GetDeletedResponsesAsync(CancellationToken cancellationToken) => throw new NotSupportedException();
        Task<LedgerEntry?> ILedgerEntryRepository.GetAsync(string kind, long id, CancellationToken cancellationToken) =>
            Task.FromResult(Entries.FirstOrDefault(x => x.Kind == kind && x.Id == id && x.DeletedAt == null));
        Task<LedgerEntry?> ILedgerEntryRepository.GetAnyAsync(long id, CancellationToken cancellationToken) => throw new NotSupportedException();
        Task<List<LedgerEntry>> ILedgerEntryRepository.GetDeletedAsync(DateTime? deletedBefore, CancellationToken cancellationToken) => throw new NotSupportedException();
        Task<List<LedgerEntry>> ILedgerEntryRepository.GetLinkedExpensesAsync(long incomeId, bool deleted, CancellationToken cancellationToken) => throw new NotSupportedException();
        void ILedgerEntryRepository.Remove(LedgerEntry entry) => throw new NotSupportedException();

        // ---- Categories
        public Task<long?> FindIdByNameAsync(string kind, string name, CancellationToken cancellationToken) =>
            Task.FromResult(Categories.Where(x => x.Kind == kind && x.Name == name).Select(x => (long?)x.Id).FirstOrDefault());

        Task<List<CategoryResponse>> ICategoryRepository.GetListAsync(string kind, CancellationToken cancellationToken) => throw new NotSupportedException();
        Task<Category?> ICategoryRepository.GetByIdAsync(long id, string kind, CancellationToken cancellationToken) => throw new NotSupportedException();
        Task<bool> ICategoryRepository.ExistsAsync(long id, string kind, CancellationToken cancellationToken) =>
            Task.FromResult(Categories.Any(x => x.Id == id && x.Kind == kind));
        Task<bool> ICategoryRepository.NameExistsAsync(string kind, string name, long? excludeId, CancellationToken cancellationToken) => throw new NotSupportedException();
        Task<int> ICategoryRepository.CountEntriesAsync(long id, string kind, bool deleted, CancellationToken cancellationToken) => throw new NotSupportedException();
        Task<int> ICategoryRepository.ClearScopeAsync(long scopeId, CancellationToken cancellationToken) => throw new NotSupportedException();
        void ICategoryRepository.Add(Category category) => throw new NotSupportedException();
        void ICategoryRepository.Remove(Category category) => throw new NotSupportedException();

        // ---- Monthly rates
        Task<Dictionary<string, decimal>> IFxMonthlyRateRepository.GetAllAsync(CancellationToken cancellationToken) =>
            Task.FromResult(MonthlyRates.ToDictionary(x => x.Month, x => x.EurToUsd));

        Task<FxMonthlyRate?> IFxMonthlyRateRepository.GetAsync(string month, CancellationToken cancellationToken) =>
            Task.FromResult(MonthlyRates.FirstOrDefault(x => x.Month == month));

        void IFxMonthlyRateRepository.Add(FxMonthlyRate rate) => _pendingMonthly.Add(rate);
        void IFxMonthlyRateRepository.Remove(FxMonthlyRate rate) => _removedMonthly.Add(rate);

        // ---- Daily rates
        Task<Dictionary<DateOnly, decimal>> IFxDailyRateRepository.GetAllAsync(CancellationToken cancellationToken) =>
            Task.FromResult(DailyRates.ToDictionary(x => x.Date, x => x.EurToUsd));

        Task<FxDailyRate?> IFxDailyRateRepository.GetAsync(DateOnly date, CancellationToken cancellationToken) =>
            Task.FromResult(DailyRates.FirstOrDefault(x => x.Date == date));

        void IFxDailyRateRepository.Add(FxDailyRate rate) => _pendingDaily.Add(rate);
        void IFxDailyRateRepository.Remove(FxDailyRate rate) => _removedDaily.Add(rate);

        // ---- Etsy listing counts per day
        Task<DateOnly?> IEtsyListingStatRepository.GetFirstDateAsync(CancellationToken cancellationToken) =>
            Task.FromResult(ListingStats.Count == 0 ? (DateOnly?)null : ListingStats.Min(x => x.Date));

        Task<List<EtsyListingDailyStat>> IEtsyListingStatRepository.GetLatestAsync(DateOnly onOrBefore, CancellationToken cancellationToken) =>
            Task.FromResult(ListingStats
                .Where(x => x.Date <= onOrBefore)
                .GroupBy(x => x.ListingId)
                .Select(g => g.MaxBy(x => x.Date)!)
                .ToList());

        Task<List<EtsyListingDailyStat>> IEtsyListingStatRepository.GetByDateAsync(DateOnly date, CancellationToken cancellationToken) =>
            Task.FromResult(ListingStats.Where(x => x.Date == date).ToList());

        void IEtsyListingStatRepository.Add(EtsyListingDailyStat stat) => _pendingListingStats.Add(stat);

        // ---- Audit log
        void IAuditLogRepository.Add(AuditLog log) => AuditLogs.Add(log);

        Task<(List<AuditLog> Items, long Total)> IAuditLogRepository.SearchAsync(AuditLogSearchRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();
    }
}
