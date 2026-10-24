namespace Fin.Model.Dto.Finance.Responses
{
    public sealed class EtsyFeesResponse
    {
        public string From { get; set; } = string.Empty;
        public string To { get; set; } = string.Empty;
        public List<EtsyAdsMonthDto> Months { get; set; } = [];
        public List<EtsyFeeTypeDto> Types { get; set; } = [];
    }

    public sealed class EtsyAdsMonthDto
    {
        public string Month { get; set; } = string.Empty;
        // Advertising charged in the Etsy Payments currency: Etsy Ads + Offsite Ads − credits Etsy gave back.
        public decimal Ads { get; set; }
        public decimal EtsyAds { get; set; }
        public decimal OffsiteAds { get; set; }
        public decimal Refunds { get; set; }
        public string Currency { get; set; } = "USD";
        public decimal AdsUsd { get; set; }
        // A month that has not ended yet may still receive charges, so it cannot be imported.
        public bool Complete { get; set; }
        public bool Imported { get; set; }
    }

    public sealed class EtsyFeeTypeDto
    {
        public string LedgerType { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public int Count { get; set; }
        // Money in (+) and out (-) of the Etsy Payments account for this type.
        public decimal Amount { get; set; }
        public string Currency { get; set; } = "USD";
        public bool IsAds { get; set; }
    }
}
