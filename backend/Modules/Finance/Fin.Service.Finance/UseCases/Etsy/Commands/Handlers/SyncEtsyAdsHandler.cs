using System.Globalization;
using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.Constants;
using Fin.Service.Finance.Services;
using MediatR;

namespace Fin.Service.Finance.UseCases.Etsy.Commands.Handlers
{
    public sealed class SyncEtsyAdsHandler : IRequestHandler<SyncEtsyAdsCommand, Response<EtsyAdsSyncResponse>>
    {
        private readonly EtsyAdsImporter _importer;

        public SyncEtsyAdsHandler(EtsyAdsImporter importer)
        {
            _importer = importer;
        }

        public async Task<Response<EtsyAdsSyncResponse>> Handle(SyncEtsyAdsCommand request, CancellationToken cancellationToken)
        {
            var from = DateOnly.ParseExact(request.From!, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture);
            var to = DateOnly.ParseExact(request.To!, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture);
            if (to < from)
            {
                (from, to) = (to, from);
            }
            var result = await _importer.SyncAsync(new DateOnly(from.Year, from.Month, 1), new DateOnly(to.Year, to.Month, 1),
                "Cập nhật phí quảng cáo từ Etsy", cancellationToken);
            return Response<EtsyAdsSyncResponse>.Ok(result);
        }
    }
}
