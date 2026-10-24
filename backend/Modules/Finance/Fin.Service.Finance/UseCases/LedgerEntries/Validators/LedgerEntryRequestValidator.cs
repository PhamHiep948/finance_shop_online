using System.Globalization;
using FluentValidation;
using Fin.Model.Dto.Finance.Requests;
using Fin.Service.Finance.Constants;

namespace Fin.Service.Finance.UseCases.LedgerEntries.Validators
{
    public sealed class LedgerEntryRequestValidator : AbstractValidator<LedgerEntryRequest>
    {
        // One combined message on purpose: the form shows a single toast, as the legacy API did.
        public const string Message = "Kiểm tra lại ngày, mô tả, danh mục, số tiền và thuế.";

        public LedgerEntryRequestValidator()
        {
            RuleFor(x => x.Date)
                .Must(date => DateOnly.TryParseExact(date, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
                .WithMessage(Message);
            RuleFor(x => x.Description)
                .Must(text => !string.IsNullOrWhiteSpace(text) && text.Length <= FinanceConstants.DescriptionMaxLength)
                .WithMessage(Message);
            RuleFor(x => x.CategoryId).GreaterThan(0).When(x => x.CategoryId is not null).WithMessage(Message);
            RuleFor(x => x.Amount).GreaterThanOrEqualTo(0).WithMessage(Message);
            RuleFor(x => x.TaxPercent).InclusiveBetween(0, 100).WithMessage(Message);
        }
    }
}
