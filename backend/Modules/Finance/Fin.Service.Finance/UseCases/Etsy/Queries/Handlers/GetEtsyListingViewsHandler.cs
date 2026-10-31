using System.Globalization;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.Constants;
using Fin.Service.Finance.Services;
using MediatR;

namespace Fin.Service.Finance.UseCases.Etsy.Queries.Handlers
{
    public sealed class GetEtsyListingViewsHandler : IRequestHandler<GetEtsyListingViewsQuery, Response<EtsyListingViewsResponse>>
    {
        private readonly IEtsyClient _etsyClient;
        private readonly EtsyListingStats _stats;

        public GetEtsyListingViewsHandler(IEtsyClient etsyClient, EtsyListingStats stats)
        {
            _etsyClient = etsyClient;
            _stats = stats;
        }

        public async Task<Response<EtsyListingViewsResponse>> Handle(GetEtsyListingViewsQuery request, CancellationToken cancellationToken)
        {
            var from = DateOnly.ParseExact(request.From!, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture);
            var to = DateOnly.ParseExact(request.To!, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture);
            if (to < from)
            {
                (from, to) = (to, from);
            }

            // Today's counts are recorded first, so a period ending today is up to date.
            await _stats.RecordAsync(await _etsyClient.GetListingsAsync(cancellationToken), cancellationToken);
            return Response<EtsyListingViewsResponse>.Ok(await _stats.GetPeriodAsync(from, to, cancellationToken));
        }
    }
}
