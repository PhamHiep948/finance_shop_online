using Fin.Infrastructure.Shared.Wrappers;
using MediatR;

namespace Fin.Service.Finance.UseCases.ExchangeRates.Commands
{
    public sealed class DeleteDailyRateCommand : IRequest<Response<bool>>
    {
        // yyyy-MM-dd
        public string Date { get; set; } = string.Empty;
    }
}
