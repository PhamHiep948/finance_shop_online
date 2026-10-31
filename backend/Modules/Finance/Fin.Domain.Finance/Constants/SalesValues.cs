namespace Fin.Domain.Finance.Constants
{
    public static class SalesValues
    {
        public const string RegionInEu = "IN_EU";
        public const string RegionOutsideEu = "OUTSIDE_EU";
        public const string ChannelEtsy = "ETSY_STORE";
        public const string PaymentCreditCard = "CREDIT_CARD";
        public const string DefaultCurrency = "USD";
        public const string CurrencyEur = "EUR";

        // Entries keep the amounts in the currency they were typed in: USD or EUR. Anything else counts as USD.
        public static string CurrencyOf(string? code) =>
            string.Equals(code?.Trim(), CurrencyEur, StringComparison.OrdinalIgnoreCase) ? CurrencyEur : DefaultCurrency;

        public static bool IsKnownCurrency(string? code) =>
            string.IsNullOrWhiteSpace(code)
            || string.Equals(code.Trim(), DefaultCurrency, StringComparison.OrdinalIgnoreCase)
            || string.Equals(code.Trim(), CurrencyEur, StringComparison.OrdinalIgnoreCase);
    }
}
