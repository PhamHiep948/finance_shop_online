using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using MediatR;

namespace Fin.Service.Finance.UseCases.Etsy.Queries
{
    // From / To (yyyy-MM-dd) bound the orders counted as sold; views and favorites are lifetime counts.
    public sealed class GetEtsyListingsQuery : IRequest<Response<List<EtsyListingDto>>>
    {
        public string? From { get; set; }
        public string? To { get; set; }
    }
}
