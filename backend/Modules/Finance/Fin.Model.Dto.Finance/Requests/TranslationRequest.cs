namespace Fin.Model.Dto.Finance.Requests
{
    public sealed class TranslationRequest
    {
        public string Source { get; set; } = string.Empty;
        public string? De { get; set; }
        public bool Ignored { get; set; }
    }
}
