using System.Globalization;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Shared.ErrorCodes;
using Fin.Infrastructure.Shared.Wrappers;
using Fin.Service.Finance.Constants;
using MediatR;

namespace Fin.Service.Finance.UseCases.ExchangeRates.Commands.Handlers
{
    public sealed class DeleteDailyRateHandler : IRequestHandler<DeleteDailyRateCommand, Response<bool>>
    {
        private readonly IFinanceUnitOfWork _unitOfWork;

        public DeleteDailyRateHandler(IFinanceUnitOfWork unitOfWork)
        {
            _unitOfWork = unitOfWork;
        }

        public async Task<Response<bool>> Handle(DeleteDailyRateCommand request, CancellationToken cancellationToken)
        {
            if (!DateOnly.TryParseExact(request.Date, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
            {
                return Response<bool>.Fail(ErrorCodeEnum.FX_ERR_004);
            }
            var existing = await _unitOfWork.FxDailyRateRepository.GetAsync(date, cancellationToken);
            if (existing is null)
            {
                return Response<bool>.Fail(ErrorCodeEnum.FX_ERR_005);
            }

            _unitOfWork.FxDailyRateRepository.Remove(existing);
            await _unitOfWork.CommitAsync(cancellationToken);
            return Response<bool>.Ok(true);
        }
    }
}
