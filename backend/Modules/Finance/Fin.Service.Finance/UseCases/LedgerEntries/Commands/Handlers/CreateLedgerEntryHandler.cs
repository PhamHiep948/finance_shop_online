using Fin.Domain.Finance.Constants;
using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Shared.ErrorCodes;
using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.Services;
using MediatR;

namespace Fin.Service.Finance.UseCases.LedgerEntries.Commands.Handlers
{
    public sealed class CreateLedgerEntryHandler : IRequestHandler<CreateLedgerEntryCommand, Response<LedgerEntryResponse>>
    {
        private readonly IFinanceUnitOfWork _unitOfWork;
        private readonly PeriodLockPolicy _periodLock;
        private readonly AuditTrail _auditTrail;

        public CreateLedgerEntryHandler(IFinanceUnitOfWork unitOfWork, PeriodLockPolicy periodLock, AuditTrail auditTrail)
        {
            _unitOfWork = unitOfWork;
            _periodLock = periodLock;
            _auditTrail = auditTrail;
        }

        public async Task<Response<LedgerEntryResponse>> Handle(CreateLedgerEntryCommand request, CancellationToken cancellationToken)
        {
            var payload = request.Payload;
            // Only an income may be left without a product group; an expense always needs its category.
            if (payload.CategoryId is not { } categoryId
                    ? request.Kind != LedgerKinds.Income
                    : !await _unitOfWork.CategoryRepository.ExistsAsync(categoryId, request.Kind, cancellationToken))
            {
                return Response<LedgerEntryResponse>.Fail(ErrorCodeEnum.CAT_ERR_005);
            }
            if (_periodLock.Check(payload.Date) is { } locked)
            {
                return Response<LedgerEntryResponse>.Fail(ErrorCodeEnum.COM_ERR_001, locked);
            }

            var entry = new LedgerEntry { Kind = request.Kind };
            LedgerEntryAssembler.Apply(entry, payload);

            var created = await _unitOfWork.ExecuteInTransactionAsync(async () =>
            {
                _unitOfWork.LedgerEntryRepository.Add(entry);
                await _unitOfWork.CommitAsync(cancellationToken);
                var response = (await _unitOfWork.LedgerEntryRepository.GetResponseAsync(request.Kind, entry.Id, cancellationToken))!;
                _auditTrail.Log(request.Kind, entry.Id, AuditActions.Create, entry.Description, null, AuditTrail.Diff(null, response));
                return response;
            }, cancellationToken);

            return Response<LedgerEntryResponse>.Ok(created);
        }
    }
}
