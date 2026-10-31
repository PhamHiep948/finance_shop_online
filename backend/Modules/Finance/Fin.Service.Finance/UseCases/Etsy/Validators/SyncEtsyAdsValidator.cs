using FluentValidation;
using Fin.Service.Finance.UseCases.Etsy.Commands;

namespace Fin.Service.Finance.UseCases.Etsy.Validators
{
    public sealed class SyncEtsyAdsValidator : AbstractValidator<SyncEtsyAdsCommand>
    {
        public SyncEtsyAdsValidator()
        {
            RuleFor(x => x.From).Must(EtsyDateRange.IsDate).WithMessage(EtsyDateRange.DateMessage);
            RuleFor(x => x.To).Must(EtsyDateRange.IsDate).WithMessage(EtsyDateRange.DateMessage);
            RuleFor(x => x).Must(x => EtsyDateRange.IsShortEnough(x.From, x.To)).WithMessage(EtsyDateRange.LengthMessage);
        }
    }
}
