using FluentValidation;
using Fin.Service.Finance.UseCases.Etsy.Queries;

namespace Fin.Service.Finance.UseCases.Etsy.Validators
{
    public sealed class GetEtsySalesValidator : AbstractValidator<GetEtsySalesQuery>
    {
        public GetEtsySalesValidator()
        {
            RuleFor(x => x.From).Must(EtsyDateRange.IsDate).WithMessage(EtsyDateRange.DateMessage);
            RuleFor(x => x.To).Must(EtsyDateRange.IsDate).WithMessage(EtsyDateRange.DateMessage);
            RuleFor(x => x).Must(x => EtsyDateRange.IsShortEnough(x.From, x.To)).WithMessage(EtsyDateRange.LengthMessage);
        }
    }
}
