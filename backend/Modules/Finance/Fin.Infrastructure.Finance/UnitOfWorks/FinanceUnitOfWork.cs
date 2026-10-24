using Fin.Infrastructure.Finance.Contexts;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.UnitOfWork;

namespace Fin.Infrastructure.Finance.UnitOfWorks
{
    public sealed class FinanceUnitOfWork : BaseUnitOfWork, IFinanceUnitOfWork
    {
        public FinanceUnitOfWork(
            FinanceContext context,
            ICategoryRepository categoryRepository,
            ILedgerEntryRepository ledgerEntryRepository,
            IAttachmentRepository attachmentRepository,
            IAuditLogRepository auditLogRepository,
            IFxMonthlyRateRepository fxMonthlyRateRepository,
            IFxDailyRateRepository fxDailyRateRepository,
            ICategoryGroupRepository categoryGroupRepository,
            ITranslationRepository translationRepository)
            : base(context)
        {
            CategoryRepository = categoryRepository;
            LedgerEntryRepository = ledgerEntryRepository;
            AttachmentRepository = attachmentRepository;
            AuditLogRepository = auditLogRepository;
            FxMonthlyRateRepository = fxMonthlyRateRepository;
            FxDailyRateRepository = fxDailyRateRepository;
            CategoryGroupRepository = categoryGroupRepository;
            TranslationRepository = translationRepository;
        }

        public ICategoryRepository CategoryRepository { get; }

        public ILedgerEntryRepository LedgerEntryRepository { get; }

        public IAttachmentRepository AttachmentRepository { get; }

        public IAuditLogRepository AuditLogRepository { get; }

        public IFxMonthlyRateRepository FxMonthlyRateRepository { get; }

        public IFxDailyRateRepository FxDailyRateRepository { get; }

        public ICategoryGroupRepository CategoryGroupRepository { get; }

        public ITranslationRepository TranslationRepository { get; }
    }
}
