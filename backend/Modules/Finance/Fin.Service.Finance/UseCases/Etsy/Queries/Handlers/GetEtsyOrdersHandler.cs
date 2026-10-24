using System.Globalization;
using Fin.Domain.Finance.Constants;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Finance.Options;
using Fin.Infrastructure.Shared.Exceptions;
using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.Constants;
using Fin.Service.Finance.Services;
using MediatR;
using Microsoft.Extensions.Options;

namespace Fin.Service.Finance.UseCases.Etsy.Queries.Handlers
{
    public sealed class GetEtsyOrdersHandler : IRequestHandler<GetEtsyOrdersQuery, Response<List<EtsyOrderDto>>>
    {
        private const int MaxDays = 366;

        private readonly IFinanceUnitOfWork _unitOfWork;
        private readonly IEtsyClient _etsyClient;
        private readonly IOptionsMonitor<EtsyOptions> _options;

        public GetEtsyOrdersHandler(IFinanceUnitOfWork unitOfWork, IEtsyClient etsyClient, IOptionsMonitor<EtsyOptions> options)
        {
            _unitOfWork = unitOfWork;
            _etsyClient = etsyClient;
            _options = options;
        }

        public async Task<Response<List<EtsyOrderDto>>> Handle(GetEtsyOrdersQuery request, CancellationToken cancellationToken)
        {
            var from = DateOnly.ParseExact(request.From!, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture);
            var to = DateOnly.ParseExact(request.To!, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture);
            if (to < from)
            {
                (from, to) = (to, from);
            }
            if (to.DayNumber - from.DayNumber > MaxDays)
            {
                throw new ApiException("Mỗi lần chỉ lấy tối đa 1 năm đơn hàng.");
            }

            var receipts = await _etsyClient.GetPaidReceiptsAsync(from, to, cancellationToken);
            var rates = await FxRateBook.LoadAsync(_unitOfWork, cancellationToken);
            var orders = receipts.Select(r => EtsyOrderMapper.Map(r, rates, _options.CurrentValue.EuVatPercent)).ToList();
            var existing = await _unitOfWork.LedgerEntryRepository.GetExistingOrderCodesAsync(
                SalesValues.ChannelEtsy, orders.Select(o => o.ReceiptId).ToList(), cancellationToken);
            orders.ForEach(o => o.Imported = existing.Contains(o.ReceiptId));

            return Response<List<EtsyOrderDto>>.Ok(orders.OrderByDescending(o => o.Date, StringComparer.Ordinal).ToList());
        }
    }
}
