using Fin.Domain.Finance.Entities;

namespace Fin.Service.Finance.UseCases.Translations.Validators
{
    internal static class TranslationSource
    {
        public const string Message = "Chữ gốc cần dịch không được để trống và dài tối đa 1000 ký tự.";

        public static bool IsValid(string? source)
        {
            var text = Translation.Normalize(source);
            return text.Length > 0 && text.Length <= Translation.SourceMaxLength;
        }
    }
}
