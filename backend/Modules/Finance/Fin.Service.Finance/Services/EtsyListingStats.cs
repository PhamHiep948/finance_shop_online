using System.Globalization;
using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Finance.Models;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.Constants;

namespace Fin.Service.Finance.Services
{
    // Etsy only reports lifetime views / favorites, so every read of the listings is kept as that day's counts;
    // the views of a period are the counts at its last day minus the counts the day before it starts.
    public sealed class EtsyListingStats
    {
        // The listings page reads the listings and the period views at the same time: one writer at a time,
        // so both do not insert the same (listing, day) row.
        private static readonly SemaphoreSlim WriteLock = new(1, 1);

        private readonly IFinanceUnitOfWork _unitOfWork;
        private readonly TimeProvider _timeProvider;

        public EtsyListingStats(IFinanceUnitOfWork unitOfWork, TimeProvider timeProvider)
        {
            _unitOfWork = unitOfWork;
            _timeProvider = timeProvider;
        }

        private DateOnly Today => DateOnly.FromDateTime(_timeProvider.GetLocalNow().DateTime);

        public async Task RecordAsync(IReadOnlyCollection<EtsyListing> listings, CancellationToken cancellationToken)
        {
            if (listings.Count == 0)
            {
                return;
            }

            await WriteLock.WaitAsync(cancellationToken);
            try
            {
                var today = Today;
                var repository = _unitOfWork.EtsyListingStatRepository;
                var rows = (await repository.GetByDateAsync(today, cancellationToken)).ToDictionary(x => x.ListingId);
                foreach (var listing in listings.DistinctBy(l => l.ListingId))
                {
                    if (rows.TryGetValue(listing.ListingId, out var row))
                    {
                        row.Views = listing.Views;
                        row.Favorites = listing.Favorites;
                    }
                    else
                    {
                        repository.Add(new EtsyListingDailyStat
                        {
                            ListingId = listing.ListingId,
                            Date = today,
                            Views = listing.Views,
                            Favorites = listing.Favorites,
                        });
                    }
                }
                await _unitOfWork.CommitAsync(cancellationToken);
            }
            finally
            {
                WriteLock.Release();
            }
        }

        public async Task<EtsyListingViewsResponse> GetPeriodAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken)
        {
            var repository = _unitOfWork.EtsyListingStatRepository;
            var first = await repository.GetFirstDateAsync(cancellationToken);
            var response = new EtsyListingViewsResponse
            {
                From = Iso(from),
                To = Iso(to),
                TrackedSince = first is { } f ? Iso(f) : null,
                Complete = first < from,
            };
            if (first is not { } firstDay || to < firstDay)
            {
                return response;
            }

            // The counts just before the period; when recording started inside the period, its first day stands in.
            // A listing missing from that day was published later, so all its views fall in the period.
            var baseDay = from.AddDays(-1) > firstDay ? from.AddDays(-1) : firstDay;
            var before = (await repository.GetLatestAsync(baseDay, cancellationToken)).ToDictionary(x => x.ListingId);
            var end = await repository.GetLatestAsync(to, cancellationToken);

            response.Listings = end
                .Select(e =>
                {
                    before.TryGetValue(e.ListingId, out var b);
                    return new EtsyListingPeriodViewsDto
                    {
                        ListingId = e.ListingId,
                        // A count Etsy lowered (e.g. spam views removed) gives 0, never a negative number.
                        Views = Math.Max(0, e.Views - (b?.Views ?? 0)),
                        Favorites = Math.Max(0, e.Favorites - (b?.Favorites ?? 0)),
                    };
                })
                .OrderByDescending(x => x.Views)
                .ThenByDescending(x => x.Favorites)
                .ToList();
            response.Views = response.Listings.Sum(x => x.Views);
            response.Favorites = response.Listings.Sum(x => x.Favorites);
            return response;
        }

        private static string Iso(DateOnly date) => date.ToString(FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture);
    }
}
