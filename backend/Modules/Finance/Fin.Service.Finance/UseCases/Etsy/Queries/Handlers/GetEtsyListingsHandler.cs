using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using MediatR;

namespace Fin.Service.Finance.UseCases.Etsy.Queries.Handlers
{
    public sealed class GetEtsyListingsHandler : IRequestHandler<GetEtsyListingsQuery, Response<List<EtsyListingDto>>>
    {
        private readonly IEtsyClient _etsyClient;

        public GetEtsyListingsHandler(IEtsyClient etsyClient)
        {
            _etsyClient = etsyClient;
        }

        public async Task<Response<List<EtsyListingDto>>> Handle(GetEtsyListingsQuery request, CancellationToken cancellationToken)
        {
            var listings = await _etsyClient.GetListingsAsync(cancellationToken);
            var result = listings
                .DistinctBy(l => l.ListingId)
                .Select(l => new EtsyListingDto
                {
                    ListingId = l.ListingId,
                    Title = l.Title,
                    State = l.State,
                    Url = l.Url,
                    ImageUrl = l.ImageUrl,
                    Views = l.Views,
                    Favorites = l.Favorites,
                    Stock = l.Quantity,
                    Price = l.Price,
                    Currency = l.Currency,
                })
                .OrderByDescending(l => l.Views)
                .ThenByDescending(l => l.Favorites)
                .ToList();
            return Response<List<EtsyListingDto>>.Ok(result);
        }
    }
}
