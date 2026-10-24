using System.Globalization;
using FluentValidation;
using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Shared.ErrorCodes;
using Fin.Infrastructure.Shared.Extensions;
using Fin.Service.Finance.Constants;
using Fin.Service.Finance.UseCases.ExchangeRates.Commands;

namespace Fin.Service.Finance.UseCases.ExchangeRates.Validators
{
    public sealed class SetDailyRateValidator : AbstractValidator<SetDailyRateCommand>
    {
        public SetDailyRateValidator()
        {
            RuleFor(x => x.Date)
                .Must(d => DateOnly.TryParseExact(d, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
                .WithMessage(ErrorCodeEnum.FX_ERR_004.GetDescription());
            // Same bounds as the monthly rate: catches typos such as 0,0005 or 11513.
            RuleFor(x => x.EurToUsd)
                .InclusiveBetween(FxMonthlyRate.MinEurToUsd, FxMonthlyRate.MaxEurToUsd)
                .WithMessage("Tỷ giá 1 EUR = ? USD phải trong khoảng 0,5 – 3 (ví dụ 1,1593). Kiểm tra lại dấu phẩy / dấu chấm.");
        }
    }
}
