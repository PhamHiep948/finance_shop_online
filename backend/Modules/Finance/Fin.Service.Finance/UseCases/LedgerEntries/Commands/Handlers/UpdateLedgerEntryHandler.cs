using Fin.Domain.Finance.Constants;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Shared.ErrorCodes;
using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.Services;
using MediatR;

namespace Fin.Service.Finance.UseCases.LedgerEntries.Commands.Handlers
{
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

        public async Task<Response<LedgerEntryResponse>> Handle(UpdateLedgerEntryCommand request, CancellationToken cancellationToken)
        {
            var payload = request.Payload;
            // Only an income may be left without a product group; an expense always needs its category.
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
            // Neither an entry of a locked period may change, nor may an entry be moved into a locked period.
            if ((_periodLock.Check(entry.Date) ?? _periodLock.Check(payload.Date)) is { } locked)
            {
                return Response<LedgerEntryResponse>.Fail(ErrorCodeEnum.COM_ERR_001, locked);
            }

            var before = (await _unitOfWork.LedgerEntryRepository.GetResponseAsync(request.Kind, entry.Id, cancellationToken))!;
            // An Etsy order is source data: only its product group, which Etsy does not provide, may be set by hand.
            // The monthly Etsy ad spend may be corrected like a manual expense, but keeps its code and channel so the
            // month is still known as imported and never comes in twice.
            // Source and the link to an income are not part of the form, so they stay untouched here.
            if (entry.IsEtsyAds)
            {
                var (orderCode, salesChannel) = (entry.OrderCode, entry.SalesChannel);
                LedgerEntryAssembler.Apply(entry, payload);
                (entry.OrderCode, entry.SalesChannel) = (orderCode, salesChannel);
            }
            else if (entry.IsFromEtsy)
            {
                entry.CategoryId = payload.CategoryId;
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
