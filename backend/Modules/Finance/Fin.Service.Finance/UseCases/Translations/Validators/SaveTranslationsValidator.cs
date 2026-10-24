using FluentValidation;
using Fin.Domain.Finance.Entities;
using Fin.Service.Finance.UseCases.Translations.Commands;

namespace Fin.Service.Finance.UseCases.Translations.Validators
{
    public sealed class SaveTranslationsValidator : AbstractValidator<SaveTranslationsCommand>
    {
        public SaveTranslationsValidator()
        {
            RuleForEach(x => x.Items).ChildRules(item =>
            {
                item.RuleFor(x => x.Source).Must(TranslationSource.IsValid).WithMessage(TranslationSource.Message);
                item.RuleFor(x => x.De).MaximumLength(Translation.TextMaxLength)
                    .WithMessage($"Bản dịch dài tối đa {Translation.TextMaxLength} ký tự.");
            });
        }
    }
}
