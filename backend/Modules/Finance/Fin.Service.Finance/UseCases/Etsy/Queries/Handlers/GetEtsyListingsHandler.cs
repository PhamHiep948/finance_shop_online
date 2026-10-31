using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.Services;
using MediatR;

namespace Fin.Service.Finance.UseCases.Etsy.Queries.Handlers
{
    public sealed class GetEtsyListingsHandler : IRequestHandler<GetEtsyListingsQuery, Response<List<EtsyListingDto>>>
    {
        private readonly IEtsyClient _etsyClient;
        private readonly EtsyListingStats _stats;

        public GetEtsyListingsHandler(IEtsyClient etsyClient, EtsyListingStats stats)
        {
            _etsyClient = etsyClient;
            _stats = stats;
        }

        public async Task<Response<List<EtsyListingDto>>> Handle(GetEtsyListingsQuery request, CancellationToken cancellationToken)
        {
            var listings = await _etsyClient.GetListingsAsync(cancellationToken);
            // Kept as today's counts, so the views of a period can be worked out later.
            await _stats.RecordAsync(listings, cancellationToken);
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
