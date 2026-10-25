using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using MediatR;

namespace Fin.Service.Finance.UseCases.Etsy.Queries
{
    // Active and sold-out listings; views and favorites are lifetime counts, so no period applies.
    public sealed class GetEtsyListingsQuery : IRequest<Response<List<EtsyListingDto>>>
    {
    }
}
