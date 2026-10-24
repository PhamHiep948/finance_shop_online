using System.Globalization;
using FluentValidation;
using Fin.Service.Finance.Constants;
using Fin.Service.Finance.UseCases.Etsy.Queries;

namespace Fin.Service.Finance.UseCases.Etsy.Validators
{
    public sealed class GetEtsyListingsValidator : AbstractValidator<GetEtsyListingsQuery>
    {
        private const string Message = "Hãy chọn khoảng ngày cần tính số bán.";

        public GetEtsyListingsValidator()
        {
            RuleFor(x => x.From).Must(IsDate).WithMessage(Message);
            RuleFor(x => x.To).Must(IsDate).WithMessage(Message);
        }

        private static bool IsDate(string? value) =>
            DateOnly.TryParseExact(value, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
    }
}
