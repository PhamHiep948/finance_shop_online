using FluentValidation;
using Fin.Domain.Finance.Constants;
using Fin.Service.Finance.UseCases.LedgerEntries.Commands;

namespace Fin.Service.Finance.UseCases.LedgerEntries.Validators
{
    public sealed class SetIncomeCostValidator : AbstractValidator<SetIncomeCostCommand>
    {
        private const string Message = "Kiểm tra lại số tiền và % thuế.";

        public SetIncomeCostValidator()
        {
            RuleFor(x => x.Payload.Amount).GreaterThanOrEqualTo(0).WithMessage(Message);
            RuleFor(x => x.Payload.TaxPercent).InclusiveBetween(0, 100).WithMessage(Message);
            RuleFor(x => x.Payload.CurrencyCode).Must(SalesValues.IsKnownCurrency).WithMessage("Loại tiền chỉ được là USD hoặc EUR.");
        }
    }
}
