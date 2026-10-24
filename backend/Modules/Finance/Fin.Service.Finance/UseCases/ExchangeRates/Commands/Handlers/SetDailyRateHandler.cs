using System.Globalization;
using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.Constants;
using MediatR;

namespace Fin.Service.Finance.UseCases.ExchangeRates.Commands.Handlers
{
    public sealed class SetDailyRateHandler : IRequestHandler<SetDailyRateCommand, Response<FxDailyResponse>>
    {
        private readonly IFinanceUnitOfWork _unitOfWork;

        public SetDailyRateHandler(IFinanceUnitOfWork unitOfWork)
        {
            _unitOfWork = unitOfWork;
        }

        public async Task<Response<FxDailyResponse>> Handle(SetDailyRateCommand request, CancellationToken cancellationToken)
        {
            var date = DateOnly.ParseExact(request.Date, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture);
            var rate = decimal.Round(request.EurToUsd, 6);
            var existing = await _unitOfWork.FxDailyRateRepository.GetAsync(date, cancellationToken);
            if (existing is null)
            {
                _unitOfWork.FxDailyRateRepository.Add(new FxDailyRate { Date = date, EurToUsd = rate });
            }
            else
            {
                existing.EurToUsd = rate;
            }
            await _unitOfWork.CommitAsync(cancellationToken);
            return Response<FxDailyResponse>.Ok(new FxDailyResponse { Date = request.Date, EurToUsd = rate });
        }
    }
}
