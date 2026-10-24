using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using MediatR;

namespace Fin.Service.Finance.UseCases.ExchangeRates.Queries
{
    // Every day of one month (yyyy-MM) for the rate calendar.
    public sealed class GetDayTableQuery : IRequest<Response<List<FxDayRowResponse>>>
    {
        public string? Month { get; set; }
    }
}
