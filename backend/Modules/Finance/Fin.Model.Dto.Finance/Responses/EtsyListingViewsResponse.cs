namespace Fin.Model.Dto.Finance.Responses
{
    // Views and favorites gained within From..To, worked out from the counts the app recorded each day.
    public sealed class EtsyListingViewsResponse
    {
        public string From { get; set; } = string.Empty;
        public string To { get; set; } = string.Empty;
        // First day the app recorded the counts (yyyy-MM-dd); null when nothing was recorded yet.
        public string? TrackedSince { get; set; }
        // False when recording started after From: the days before TrackedSince are not counted.
        public bool Complete { get; set; }
        public int Views { get; set; }
        public int Favorites { get; set; }
        public List<EtsyListingPeriodViewsDto> Listings { get; set; } = [];
    }

    public sealed class EtsyListingPeriodViewsDto
    {
        public long ListingId { get; set; }
        public int Views { get; set; }
        public int Favorites { get; set; }
    }
}
