using Fin.Domain.Finance.Entities;
using Fin.Model.Dto.Finance.Responses;

namespace Fin.Service.Finance.UseCases.Translations
{
    internal static class TranslationRules
    {
        // Blank means "not translated yet", so it is stored as NULL rather than an empty string.
        public static string? Clean(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();

        public static TranslationResponse ToResponse(Translation row) => new() { Source = row.Source, De = row.De, Ignored = row.Ignored };

        public static Translation NewRow(string source) => new() { SourceHash = Translation.HashOf(source), Source = source };
    }
}
