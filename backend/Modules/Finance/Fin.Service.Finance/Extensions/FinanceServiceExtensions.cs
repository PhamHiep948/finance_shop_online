using FluentValidation;
using Fin.Infrastructure.Shared.Behaviours;
using Fin.Service.Finance.Services;
using Fin.Service.Finance.Workers;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Fin.Service.Finance.Extensions
{
    public static class FinanceServiceExtensions
    {
        public static IServiceCollection AddFinanceServiceLayer(this IServiceCollection services)
        {
            var assembly = typeof(FinanceServiceExtensions).Assembly;

            services.AddMediatR(cfg =>
            {
                cfg.RegisterServicesFromAssembly(assembly);
                cfg.AddOpenBehavior(typeof(ValidationBehavior<,>));
            });
            services.AddValidatorsFromAssembly(assembly);
            services.TryAddSingleton(TimeProvider.System);

            services.AddSingleton<PeriodLockPolicy>();
            services.AddScoped<AuditTrail>();
            services.AddScoped<EtsyOrderImporter>();
            services.AddScoped<EtsyAdsImporter>();
            services.AddScoped<TrashPurger>();
            services.AddSingleton<EtsyAutoSyncRunner>();

            services.AddHostedService<EtsyAutoSyncWorker>();
            services.AddHostedService<TrashCleanupWorker>();

            return services;
        }
    }
}
