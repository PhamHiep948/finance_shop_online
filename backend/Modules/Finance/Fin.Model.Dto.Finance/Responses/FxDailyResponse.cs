namespace Fin.Model.Dto.Finance.Responses
{
    public sealed class FxDailyResponse
    {
        public string Date { get; set; } = string.Empty;
        public decimal EurToUsd { get; set; }
    }
}
