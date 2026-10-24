using FluentValidation;
using Fin.Domain.Finance.Entities;
using Fin.Service.Finance.UseCases.Translations.Commands;

namespace Fin.Service.Finance.UseCases.Translations.Validators
{
    public sealed class DiscoverTranslationsValidator : AbstractValidator<DiscoverTranslationsCommand>
    {
        public DiscoverTranslationsValidator()
        {
            RuleFor(x => x.Sources).Must(x => x.Count <= Translation.DiscoverBatchMax)
                .WithMessage($"Gửi tối đa {Translation.DiscoverBatchMax} chữ mỗi lần.");
            RuleForEach(x => x.Sources).Must(TranslationSource.IsValid).WithMessage(TranslationSource.Message);
        }
    }
}
