using FluentValidation;
using Fin.Infrastructure.Shared.ErrorCodes;
using Fin.Infrastructure.Shared.Extensions;
using Fin.Service.Finance.Services;
using Fin.Service.Finance.UseCases.ExchangeRates.Queries;

namespace Fin.Service.Finance.UseCases.ExchangeRates.Validators
{
    public sealed class GetDayTableValidator : AbstractValidator<GetDayTableQuery>
    {
        public GetDayTableValidator()
        {
            RuleFor(x => x.Month).Must(m => MonthKey.TryParse(m, out _)).WithMessage(ErrorCodeEnum.FX_ERR_001.GetDescription());
        }
    }
}
