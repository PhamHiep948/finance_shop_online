using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using MediatR;

namespace Fin.Service.Finance.UseCases.Etsy.Queries
{
    // From / To are months (yyyy-MM), both included.
    public sealed class GetEtsyFeesQuery : IRequest<Response<EtsyFeesResponse>>
    {
        public string? From { get; set; }
        public string? To { get; set; }
    }
}
