using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using MediatR;

namespace Fin.Service.Finance.UseCases.ExchangeRates.Commands
{
    public sealed class SetDailyRateCommand : IRequest<Response<FxDailyResponse>>
    {
        // yyyy-MM-dd
        public string Date { get; set; } = string.Empty;
        public decimal EurToUsd { get; set; }
    }
}
