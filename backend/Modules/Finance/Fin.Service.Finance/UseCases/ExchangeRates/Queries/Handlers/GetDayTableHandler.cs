using System.Globalization;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.Constants;
using Fin.Service.Finance.Services;
using MediatR;

namespace Fin.Service.Finance.UseCases.ExchangeRates.Queries.Handlers
{
    public sealed class GetDayTableHandler : IRequestHandler<GetDayTableQuery, Response<List<FxDayRowResponse>>>
    {
        private readonly IFinanceUnitOfWork _unitOfWork;
        private readonly IEcbRateProvider _ecbRates;

        public GetDayTableHandler(IFinanceUnitOfWork unitOfWork, IEcbRateProvider ecbRates)
        {
            _unitOfWork = unitOfWork;
            _ecbRates = ecbRates;
        }

        public async Task<Response<List<FxDayRowResponse>>> Handle(GetDayTableQuery request, CancellationToken cancellationToken)
        {
            MonthKey.TryParse(request.Month, out var first);
            var last = first.AddMonths(1).AddDays(-1);
            var monthly = await _unitOfWork.FxMonthlyRateRepository.GetAllAsync(cancellationToken);
            var daily = await _unitOfWork.FxDailyRateRepository.GetAllAsync(cancellationToken);
            var book = new FxRateBook(monthly, daily);
            var ecb = await _ecbRates.GetDailyAsync(first, last, cancellationToken);
            var monthRate = monthly.TryGetValue(MonthKey.Of(first), out var typed) && typed > 0 ? typed : (decimal?)null;

            var rows = new List<FxDayRowResponse>();
            for (var day = first; day <= last; day = day.AddDays(1))
            {
                var (used, source) = book.EurToUsd(day);
                rows.Add(new FxDayRowResponse
                {
                    Date = day.ToString(FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture),
                    Manual = daily.TryGetValue(day, out var own) ? own : null,
                    Monthly = monthRate,
                    Ecb = ecb.TryGetValue(day, out var reference) ? reference : null,
                    Used = used,
                    Source = source.ToString().ToUpperInvariant(),
                });
            }
            return Response<List<FxDayRowResponse>>.Ok(rows);
        }
    }
}
