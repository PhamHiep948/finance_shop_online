using FluentValidation;
using Fin.Service.Finance.Services;
using Fin.Service.Finance.UseCases.Etsy.Queries;

namespace Fin.Service.Finance.UseCases.Etsy.Validators
{
    public sealed class GetEtsyFeesValidator : AbstractValidator<GetEtsyFeesQuery>
    {
        private const int MaxMonths = 24;

        public GetEtsyFeesValidator()
        {
            RuleFor(x => x.From).Must(m => MonthKey.TryParse(m, out _)).WithMessage("Tháng phải có dạng yyyy-MM.");
            RuleFor(x => x.To).Must(m => MonthKey.TryParse(m, out _)).WithMessage("Tháng phải có dạng yyyy-MM.");
            RuleFor(x => x).Must(BeShortEnough).WithMessage($"Mỗi lần xem tối đa {MaxMonths} tháng.")
                .When(x => MonthKey.TryParse(x.From, out _) && MonthKey.TryParse(x.To, out _));
        }

        private static bool BeShortEnough(GetEtsyFeesQuery query)
        {
            MonthKey.TryParse(query.From, out var from);
            MonthKey.TryParse(query.To, out var to);
            var months = Math.Abs((to.Year - from.Year) * 12 + to.Month - from.Month) + 1;
            return months <= MaxMonths;
        }
    }
}
