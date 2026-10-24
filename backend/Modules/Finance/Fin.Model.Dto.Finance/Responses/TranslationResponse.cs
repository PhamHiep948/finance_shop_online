namespace Fin.Model.Dto.Finance.Responses
{
    public sealed class TranslationResponse
    {
        public string Source { get; set; } = string.Empty;
        public string? De { get; set; }
        public bool Ignored { get; set; }
    }
}
