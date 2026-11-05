using Fin.Domain.Finance.Constants;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Shared.ErrorCodes;
using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.Services;
using MediatR;

namespace Fin.Service.Finance.UseCases.LedgerEntries.Commands.Handlers
{
    /// <summary>Sửa một khoản thu / khoản chi, có kiểm tra danh mục, khóa sổ và ghi lịch sử chỉnh sửa.</summary>
    public sealed class UpdateLedgerEntryHandler : IRequestHandler<UpdateLedgerEntryCommand, Response<LedgerEntryResponse>>
    {
        private readonly IFinanceUnitOfWork _unitOfWork;
        private readonly PeriodLockPolicy _periodLock;
        private readonly AuditTrail _auditTrail;

        public UpdateLedgerEntryHandler(IFinanceUnitOfWork unitOfWork, PeriodLockPolicy periodLock, AuditTrail auditTrail)
        {
            _unitOfWork = unitOfWork;
            _periodLock = periodLock;
            _auditTrail = auditTrail;
        }

        /// <summary>
        /// Lưu thay đổi của khoản. Khoản thu được để trống nhóm sản phẩm, khoản chi thì phải có loại chi. Không sửa được
        /// khoản thuộc kỳ đã khóa sổ, cũng không được chuyển khoản vào kỳ đã khóa.
        /// Đơn Etsy là dữ liệu gốc: chỉ sửa được nhóm sản phẩm (Etsy không có), số tiền và loại tiền; tên, ngày, mã đơn…
        /// giữ đúng như Etsy.
        /// Phí quảng cáo Etsy sửa được như khoản chi tay nhưng giữ mã tháng, kênh bán và số Etsy đã ghi nhớ, để tháng đó
        /// vẫn được coi là đã nhập và không bị nhập lại. Nguồn và liên kết với khoản thu không nằm trong form nên giữ nguyên.
        /// </summary>
        public async Task<Response<LedgerEntryResponse>> Handle(UpdateLedgerEntryCommand request, CancellationToken cancellationToken)
        {
            var payload = request.Payload;
            if (payload.CategoryId is not { } categoryId
                    ? request.Kind != LedgerKinds.Income
                    : !await _unitOfWork.CategoryRepository.ExistsAsync(categoryId, request.Kind, cancellationToken))
            {
                return Response<LedgerEntryResponse>.Fail(ErrorCodeEnum.CAT_ERR_005);
            }

            var entry = await _unitOfWork.LedgerEntryRepository.GetAsync(request.Kind, request.Id, cancellationToken);
            if (entry is null)
            {
                return Response<LedgerEntryResponse>.Fail(ErrorCodeEnum.LED_ERR_001);
            }
            if ((_periodLock.Check(entry.Date) ?? _periodLock.Check(payload.Date)) is { } locked)
            {
                return Response<LedgerEntryResponse>.Fail(ErrorCodeEnum.COM_ERR_001, locked);
            }

            var before = (await _unitOfWork.LedgerEntryRepository.GetResponseAsync(request.Kind, entry.Id, cancellationToken))!;
            if (entry.IsEtsyAds)
            {
                var (orderCode, salesChannel, etsyAmount, etsyCurrency) = (entry.OrderCode, entry.SalesChannel, entry.Details.EtsyAmount, entry.Details.EtsyCurrency);
                LedgerEntryAssembler.Apply(entry, payload);
                (entry.OrderCode, entry.SalesChannel) = (orderCode, salesChannel);
                (entry.Details.EtsyAmount, entry.Details.EtsyCurrency) = (etsyAmount, etsyCurrency);
            }
            else if (entry.IsFromEtsy)
            {
                entry.CategoryId = payload.CategoryId;
                LedgerEntryAssembler.ApplyMoney(entry, payload);
            }
            else
            {
                LedgerEntryAssembler.Apply(entry, payload);
            }

            var after = await _unitOfWork.ExecuteInTransactionAsync(async () =>
            {
                await _unitOfWork.CommitAsync(cancellationToken);
                var response = (await _unitOfWork.LedgerEntryRepository.GetResponseAsync(request.Kind, entry.Id, cancellationToken))!;
                var changes = AuditTrail.Diff(before, response);
                if (changes.Count > 0)
                {
                    _auditTrail.Log(request.Kind, entry.Id, AuditActions.Update, entry.Description, null, changes);
                }
                return response;
            }, cancellationToken);

            return Response<LedgerEntryResponse>.Ok(after);
        }
    }
}
