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
    /// <summary>
    /// Lưu tiền xưởng / tiền ship của một khoản thu. Số tiền này được lưu thành một khoản chi gắn với khoản thu
    /// (thêm mới, cập nhật, hoặc bỏ khi số tiền = 0), có kiểm tra khóa sổ và ghi lịch sử chỉnh sửa.
    /// </summary>
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

        /// <summary>
        /// Xử lý yêu cầu lưu tiền xưởng / tiền ship: kiểm tra khoản thu, khóa sổ (ngày cũ và ngày mới), loại chi được chọn,
        /// rồi thêm / sửa / bỏ khoản chi gắn kèm. Trả về khoản chi sau khi lưu (null nếu đã bỏ).
        /// </summary>
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
            if (payload.CategoryId is { } categoryId
                && !await _unitOfWork.CategoryRepository.ExistsAsync(categoryId, CategoryKinds.Expense, cancellationToken))
            {
                return Response<LedgerEntryResponse?>.Fail(ErrorCodeEnum.CAT_ERR_005);
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

        /// <summary>Bỏ tiền xưởng / tiền ship: chuyển khoản chi gắn kèm vào thùng rác (nếu có) và ghi lịch sử.</summary>
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

        /// <summary>
        /// Tạo khoản chi mới gắn với khoản thu. Mô tả là "Tiền xưởng · tên sản phẩm" (bán ngoài EU) hoặc
        /// "Tiền ship · tên sản phẩm" (bán trong EU). Loại chi lấy theo người dùng chọn; không chọn thì lấy
        /// "Tiền xưởng" / "Phí ship" theo khu vực (tự tạo loại chi nếu chưa có).
        /// </summary>
        private async Task<LedgerEntryResponse> CreateAsync(LedgerEntryResponse income, IncomeCostRequest payload, DateOnly date, CancellationToken cancellationToken)
        {
            var inEu = income.SaleRegion == SalesValues.RegionInEu;
            var description = $"{(inEu ? "Tiền ship" : "Tiền xưởng")} · {income.Description}";
            var expense = new LedgerEntry
            {
                Kind = LedgerKinds.Expense,
                Date = date,
                Description = description.Length > FinanceConstants.DescriptionMaxLength ? description[..FinanceConstants.DescriptionMaxLength] : description,
                CategoryId = payload.CategoryId ?? await CostCategoryIdAsync(inEu ? ShippingCategory : FactoryCategory, cancellationToken),
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

        /// <summary>
        /// Cập nhật khoản chi đã gắn với khoản thu: chỉ đổi các trường tiền xưởng / ship (ngày, bên nhận, phạm vi, hóa đơn,
        /// số tiền) và loại chi khi người dùng có chọn. Mô tả, ghi chú có thể đã sửa ở trang Khoản chi nên giữ nguyên.
        /// Ghi lịch sử nếu có trường thay đổi.
        /// </summary>
        private async Task<LedgerEntryResponse> UpdateAsync(LedgerEntryResponse income, LedgerEntry expense, IncomeCostRequest payload, DateOnly date, CancellationToken cancellationToken)
        {
            var before = (await _unitOfWork.LedgerEntryRepository.GetResponseAsync(LedgerKinds.Expense, expense.Id, cancellationToken))!;
            expense.Date = date;
            expense.CategoryId = payload.CategoryId ?? expense.CategoryId;
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

        /// <summary>Mã hóa đơn đã bỏ khoảng trắng hai đầu; không nhập thì là chuỗi rỗng.</summary>
        private static string InvoiceIdOf(IncomeCostRequest payload) => payload.InvoiceId?.Trim() ?? string.Empty;

        /// <summary>Chuỗi đã bỏ khoảng trắng hai đầu; rỗng thì trả về null.</summary>
        private static string? TextOrNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

        /// <summary>
        /// Gán số tiền cho khoản chi: số đã gõ là số đã trả (gồm thuế), lưu theo loại tiền đã chọn. Phần trước thuế
        /// được tính ra từ số đã trả, còn số đã trả giữ đúng như đã gõ.
        /// </summary>
        private static void SetPaidAmount(LedgerEntry expense, IncomeCostRequest payload)
        {
            expense.CurrencyCode = SalesValues.CurrencyOf(payload.CurrencyCode);
            expense.SetAmounts(LedgerEntry.BeforeTax(payload.Amount, payload.TaxPercent), payload.TaxPercent, payload.Amount);
        }

        /// <summary>Id của loại chi có tên <paramref name="name"/>; chưa có thì tạo mới rồi trả về id.</summary>
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
