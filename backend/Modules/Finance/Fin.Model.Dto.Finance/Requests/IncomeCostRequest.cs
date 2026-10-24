namespace Fin.Model.Dto.Finance.Requests
{
    public sealed class IncomeCostRequest
    {
        public decimal Amount { get; set; }
        public decimal TaxPercent { get; set; }
        public string? InvoiceId { get; set; }
        public string? Date { get; set; }
        public string? Payee { get; set; }
        public string? OriginScope { get; set; }
    }
}
