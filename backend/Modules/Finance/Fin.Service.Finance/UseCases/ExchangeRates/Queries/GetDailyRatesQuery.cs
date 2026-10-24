using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using MediatR;

namespace Fin.Service.Finance.UseCases.ExchangeRates.Queries
{
    // Every typed daily rate (the frontend converts amounts with them).
    public sealed class GetDailyRatesQuery : IRequest<Response<List<FxDailyResponse>>>
    {
    }
}
