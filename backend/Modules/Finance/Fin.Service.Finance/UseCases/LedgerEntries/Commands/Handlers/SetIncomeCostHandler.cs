using System.Globalization;
using Fin.Domain.Finance.Constants;
using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Shared.ErrorCodes;
using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Requests;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.Constants;
using Fin.Service.Finance.Services;
using MediatR;

namespace Fin.Service.Finance.UseCases.LedgerEntries.Commands.Handlers
{
    public sealed class SetIncomeCostHandler : IRequestHandler<SetIncomeCostCommand, Response<LedgerEntryResponse?>>
    {
        private const string FactoryCategory = "Tiền xưởng";
        private const string ShippingCategory = "Phí ship";

        private readonly IFinanceUnitOfWork _unitOfWork;
        private readonly PeriodLockPolicy _periodLock;
        private readonly AuditTrail _auditTrail;
        private readonly TimeProvider _timeProvider;

        public SetIncomeCostHandler(IFinanceUnitOfWork unitOfWork, PeriodLockPolicy periodLock, AuditTrail auditTrail, TimeProvider timeProvider)
        {
            _unitOfWork = unitOfWork;
            _periodLock = periodLock;
            _auditTrail = auditTrail;
            _timeProvider = timeProvider;
        }

        public async Task<Response<LedgerEntryResponse?>> Handle(SetIncomeCostCommand request, CancellationToken cancellationToken)
        {
            var income = await _unitOfWork.LedgerEntryRepository.GetResponseAsync(LedgerKinds.Income, request.IncomeId, cancellationToken);
            if (income is null)
            {
                return Response<LedgerEntryResponse?>.Fail(ErrorCodeEnum.LED_ERR_001);
            }

            var payload = request.Payload;
            var linked = (await _unitOfWork.LedgerEntryRepository.GetLinkedExpensesAsync(income.Id, false, cancellationToken)).FirstOrDefault();
            if (linked is not null && _periodLock.Check(linked.Date) is { } lockedOld)
            {
                return Response<LedgerEntryResponse?>.Fail(ErrorCodeEnum.COM_ERR_001, lockedOld);
            }

            if (payload.Amount == 0)
            {
                return await RemoveAsync(linked, cancellationToken);
            }

            var date = DateOnly.TryParseExact(payload.Date, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var picked)
                ? picked
                : linked?.Date ?? DateOnly.ParseExact(income.Date, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture);
            if (_periodLock.Check(date) is { } locked)
            {
                return Response<LedgerEntryResponse?>.Fail(ErrorCodeEnum.COM_ERR_001, locked);
            }

            var result = await _unitOfWork.ExecuteInTransactionAsync(
                () => linked is null ? CreateAsync(income, payload, date, cancellationToken) : UpdateAsync(income, linked, payload, date, cancellationToken),
                cancellationToken);
            return Response<LedgerEntryResponse?>.Ok(result);
        }

        private async Task<Response<LedgerEntryResponse?>> RemoveAsync(LedgerEntry? linked, CancellationToken cancellationToken)
        {
            if (linked is null)
            {
                return Response<LedgerEntryResponse?>.Ok(null);
            }

            linked.SoftDelete(_timeProvider.GetLocalNow().DateTime);
            _auditTrail.Log(linked.Kind, linked.Id, AuditActions.Delete, linked.Description, "Bỏ tiền xưởng / tiền ship khỏi khoản thu");
            await _unitOfWork.CommitAsync(cancellationToken);
            return Response<LedgerEntryResponse?>.Ok(null);
        }

        private async Task<LedgerEntryResponse> CreateAsync(LedgerEntryResponse income, IncomeCostRequest payload, DateOnly date, CancellationToken cancellationToken)
        {
            // Outside the EU the cost is the factory bill; inside the EU it is the shipping label the shop pays.
            var inEu = income.SaleRegion == SalesValues.RegionInEu;
            var description = $"{(inEu ? "Tiền ship" : "Tiền xưởng")} · {income.Description}";
            var expense = new LedgerEntry
            {
                Kind = LedgerKinds.Expense,
                Date = date,
                Description = description.Length > FinanceConstants.DescriptionMaxLength ? description[..FinanceConstants.DescriptionMaxLength] : description,
                CategoryId = await CostCategoryIdAsync(inEu ? ShippingCategory : FactoryCategory, cancellationToken),
                OrderCode = income.OrderCode,
                Source = EntrySources.LinkedCost,
                LinkedIncomeId = income.Id,
                Payee = TextOrNull(payload.Payee),
                OriginScope = TextOrNull(payload.OriginScope),
                Details = new LedgerDetails { InvoiceId = InvoiceIdOf(payload) },
            };
            SetPaidAmount(expense, payload);
            _unitOfWork.LedgerEntryRepository.Add(expense);
            await _unitOfWork.CommitAsync(cancellationToken);

            var created = (await _unitOfWork.LedgerEntryRepository.GetResponseAsync(LedgerKinds.Expense, expense.Id, cancellationToken))!;
            _auditTrail.Log(expense.Kind, expense.Id, AuditActions.Create, expense.Description,
                $"Tiền xưởng / tiền ship của khoản thu #{income.Id}", AuditTrail.Diff(null, created));
            return created;
        }

        private async Task<LedgerEntryResponse> UpdateAsync(LedgerEntryResponse income, LedgerEntry expense, IncomeCostRequest payload, DateOnly date, CancellationToken cancellationToken)
        {
            var before = (await _unitOfWork.LedgerEntryRepository.GetResponseAsync(LedgerKinds.Expense, expense.Id, cancellationToken))!;
            // Description, category and note may have been edited on the expense page; only the cost fields change here.
            expense.Date = date;
            expense.OrderCode = income.OrderCode;
            expense.Payee = TextOrNull(payload.Payee);
            expense.OriginScope = TextOrNull(payload.OriginScope);
            expense.Details.InvoiceId = InvoiceIdOf(payload);
            SetPaidAmount(expense, payload);
            await _unitOfWork.CommitAsync(cancellationToken);

            var after = (await _unitOfWork.LedgerEntryRepository.GetResponseAsync(LedgerKinds.Expense, expense.Id, cancellationToken))!;
            var changes = AuditTrail.Diff(before, after);
            if (changes.Count > 0)
            {
                _auditTrail.Log(expense.Kind, expense.Id, AuditActions.Update, expense.Description,
                    $"Tiền xưởng / tiền ship của khoản thu #{income.Id}", changes);
            }
            return after;
        }

        private static string InvoiceIdOf(IncomeCostRequest payload) => payload.InvoiceId?.Trim() ?? string.Empty;

        private static string? TextOrNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

        // The amount typed is what was paid (tax included), kept in the currency it was typed in; the pre-tax part is
        // derived and the paid sum kept exact.
        private static void SetPaidAmount(LedgerEntry expense, IncomeCostRequest payload)
        {
            expense.CurrencyCode = SalesValues.CurrencyOf(payload.CurrencyCode);
            expense.SetAmounts(LedgerEntry.BeforeTax(payload.Amount, payload.TaxPercent), payload.TaxPercent, payload.Amount);
        }

        private async Task<long> CostCategoryIdAsync(string name, CancellationToken cancellationToken)
        {
            var existing = await _unitOfWork.CategoryRepository.FindIdByNameAsync(CategoryKinds.Expense, name, cancellationToken);
            if (existing is not null)
            {
                return existing.Value;
            }

            var category = new Category { Kind = CategoryKinds.Expense, Name = name };
            _unitOfWork.CategoryRepository.Add(category);
            await _unitOfWork.CommitAsync(cancellationToken);
            return category.Id;
        }
    }
}
