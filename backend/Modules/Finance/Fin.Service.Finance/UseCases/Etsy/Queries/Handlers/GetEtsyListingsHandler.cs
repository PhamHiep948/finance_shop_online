using System.Globalization;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Shared.Exceptions;
using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.Constants;
using MediatR;

namespace Fin.Service.Finance.UseCases.Etsy.Queries.Handlers
{
    public sealed class GetEtsyListingsHandler : IRequestHandler<GetEtsyListingsQuery, Response<List<EtsyListingDto>>>
    {
        private const int MaxDays = 366;

        private readonly IEtsyClient _etsyClient;

        public GetEtsyListingsHandler(IEtsyClient etsyClient)
        {
            _etsyClient = etsyClient;
        }

        public async Task<Response<List<EtsyListingDto>>> Handle(GetEtsyListingsQuery request, CancellationToken cancellationToken)
        {
            var from = DateOnly.ParseExact(request.From!, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture);
            var to = DateOnly.ParseExact(request.To!, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture);
            if (to < from)
            {
                (from, to) = (to, from);
            }
            if (to.DayNumber - from.DayNumber > MaxDays)
            {
                throw new ApiException("Mỗi lần chỉ tính số bán tối đa 1 năm.");
            }

            var listings = await _etsyClient.GetListingsAsync(cancellationToken);
            var receipts = await _etsyClient.GetPaidReceiptsAsync(from, to, cancellationToken);
            var sold = receipts
                .SelectMany(r => r.Items.Where(i => i.ListingId != 0).Select(i => (r.ReceiptId, i.ListingId, i.Quantity)))
                .GroupBy(x => x.ListingId)
                .ToDictionary(g => g.Key, g => (Quantity: g.Sum(x => x.Quantity), Orders: g.Select(x => x.ReceiptId).Distinct().Count()));

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
                    Sold = sold.TryGetValue(l.ListingId, out var s) ? s.Quantity : 0,
                    Orders = sold.TryGetValue(l.ListingId, out var o) ? o.Orders : 0,
                })
                .OrderByDescending(l => l.Views)
                .ThenByDescending(l => l.Favorites)
                .ToList();
            return Response<List<EtsyListingDto>>.Ok(result);
        }
    }
}
