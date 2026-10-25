using System.Globalization;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Finance.Options;
using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.Constants;
using Fin.Service.Finance.Services;
using MediatR;
using Microsoft.Extensions.Options;

namespace Fin.Service.Finance.UseCases.Etsy.Queries.Handlers
{
    public sealed class GetEtsySalesHandler : IRequestHandler<GetEtsySalesQuery, Response<EtsySalesResponse>>
    {
        private readonly IFinanceUnitOfWork _unitOfWork;
        private readonly IEtsyClient _etsyClient;
        private readonly IOptionsMonitor<EtsyOptions> _options;

        public GetEtsySalesHandler(IFinanceUnitOfWork unitOfWork, IEtsyClient etsyClient, IOptionsMonitor<EtsyOptions> options)
        {
            _unitOfWork = unitOfWork;
            _etsyClient = etsyClient;
            _options = options;
        }

        public async Task<Response<EtsySalesResponse>> Handle(GetEtsySalesQuery request, CancellationToken cancellationToken)
        {
            var from = DateOnly.ParseExact(request.From!, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture);
            var to = DateOnly.ParseExact(request.To!, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture);
            if (to < from)
            {
                (from, to) = (to, from);
            }

            var receipts = await _etsyClient.GetPaidReceiptsAsync(from, to, cancellationToken);
            var rates = await FxRateBook.LoadAsync(_unitOfWork, cancellationToken);
            var vat = _options.CurrentValue.EuVatPercent;
            var lines = receipts
                .SelectMany(r => r.Items.Where(i => i.ListingId != 0).Select(i => (Receipt: r, Item: i)))
                .ToList();

            return Response<EtsySalesResponse>.Ok(new EtsySalesResponse
            {
                From = from.ToString(FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture),
                To = to.ToString(FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture),
                Orders = receipts.Count,
                Items = receipts.Sum(r => r.Items.Sum(i => i.Quantity)),
                // Mapped like an imported order, so the total matches what "Khoản thu" shows for these orders.
                Revenue = receipts.Sum(r => EtsyOrderMapper.Map(r, rates, vat).Amount),
                Listings = lines
                    .GroupBy(x => x.Item.ListingId)
                    .Select(g => new EtsyListingSalesDto
                    {
                        ListingId = g.Key,
                        Sold = g.Sum(x => x.Item.Quantity),
                        Orders = g.Select(x => x.Receipt.ReceiptId).Distinct().Count(),
                        Revenue = decimal.Round(
                            g.Sum(x => x.Item.Price * x.Item.Quantity * rates.ToUsdRate(x.Receipt.Currency, x.Receipt.Created)),
                            2, MidpointRounding.AwayFromZero),
                    })
                    .ToList(),
            });
        }
    }
}
