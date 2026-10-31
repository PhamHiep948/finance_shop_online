using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using MediatR;

namespace Fin.Service.Finance.UseCases.Etsy.Queries
{
    // Active and sold-out listings with their lifetime views and favorites (per period: GetEtsyListingViewsQuery).
    public sealed class GetEtsyListingsQuery : IRequest<Response<List<EtsyListingDto>>>
    {
    }
}
