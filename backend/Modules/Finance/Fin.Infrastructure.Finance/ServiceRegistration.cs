using Fin.Infrastructure.Finance.Contexts;
using Fin.Infrastructure.Finance.External;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Finance.Options;
using Fin.Infrastructure.Finance.Repositories;
using Fin.Infrastructure.Finance.Seed;
using Fin.Infrastructure.Finance.Storage;
using Fin.Infrastructure.Finance.UnitOfWorks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Fin.Infrastructure.Finance
{
    public static class ServiceRegistration
    {
        public static IServiceCollection AddFinanceInfrastructure(this IServiceCollection services, IConfiguration configuration)
        {
            services.Configure<EtsyOptions>(configuration.GetSection(EtsyOptions.SectionName));
            services.Configure<PeriodLockOptions>(configuration.GetSection(PeriodLockOptions.SectionName));
            services.Configure<FinanceStorageOptions>(configuration.GetSection(FinanceStorageOptions.SectionName));
            services.TryAddSingleton(TimeProvider.System);
            services.AddHttpClient();

            services.AddDbContext<FinanceContext>(options =>
            {
                var connectionString = configuration.GetConnectionString(FinanceDatabaseOptions.ConnectionStringName)
                    ?? throw new InvalidOperationException($"Connection string 'ConnectionStrings:{FinanceDatabaseOptions.ConnectionStringName}' is not configured.");
                var serverVersion = ServerVersion.Parse(configuration[FinanceDatabaseOptions.ServerVersionKey] ?? FinanceDatabaseOptions.DefaultServerVersion);
                options.UseMySql(connectionString, serverVersion, mySql => mySql.MigrationsAssembly(typeof(FinanceContext).Assembly.FullName));
            });

            services.AddScoped<ICategoryRepository, CategoryRepository>();
            services.AddScoped<ILedgerEntryRepository, LedgerEntryRepository>();
            services.AddScoped<IAttachmentRepository, AttachmentRepository>();
            services.AddScoped<IAuditLogRepository, AuditLogRepository>();
            services.AddScoped<IFxMonthlyRateRepository, FxMonthlyRateRepository>();
            services.AddScoped<IFxDailyRateRepository, FxDailyRateRepository>();
            services.AddScoped<ICategoryGroupRepository, CategoryGroupRepository>();
            services.AddScoped<ITranslationRepository, TranslationRepository>();
            services.AddScoped<IEtsyListingStatRepository, EtsyListingStatRepository>();
            services.AddScoped<IFinanceUnitOfWork, FinanceUnitOfWork>();

            services.AddSingleton<FinanceStoragePaths>();
            services.AddSingleton<IAttachmentFileStore, LocalAttachmentFileStore>();
            services.AddSingleton<IEtsyAutoSyncStateStore, FileEtsyAutoSyncStateStore>();
            services.AddSingleton<IEtsyClient, EtsyClient>();
            services.AddSingleton<IEcbRateProvider, FrankfurterEcbRateProvider>();

            services.AddScoped<LegacyDatabaseBaseline>();
            services.AddScoped<FinanceSeeder>();

            return services;
        }
    }
}
