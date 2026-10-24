using System.Globalization;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.Constants;
using MediatR;

namespace Fin.Service.Finance.UseCases.ExchangeRates.Queries.Handlers
{
    public sealed class GetDailyRatesHandler : IRequestHandler<GetDailyRatesQuery, Response<List<FxDailyResponse>>>
    {
        private readonly IFinanceUnitOfWork _unitOfWork;

        public GetDailyRatesHandler(IFinanceUnitOfWork unitOfWork)
        {
            _unitOfWork = unitOfWork;
        }

        public async Task<Response<List<FxDailyResponse>>> Handle(GetDailyRatesQuery request, CancellationToken cancellationToken)
        {
            var rates = await _unitOfWork.FxDailyRateRepository.GetAllAsync(cancellationToken);
            return Response<List<FxDailyResponse>>.Ok(rates
                .OrderByDescending(p => p.Key)
                .Select(p => new FxDailyResponse { Date = p.Key.ToString(FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture), EurToUsd = p.Value })
                .ToList());
        }
    }
}
