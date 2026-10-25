using System.Globalization;
using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.Constants;
using Fin.Service.Finance.Services;
using MediatR;

namespace Fin.Service.Finance.UseCases.Etsy.Queries.Handlers
{
    public sealed class GetEtsyFeesHandler : IRequestHandler<GetEtsyFeesQuery, Response<EtsyFeesResponse>>
    {
        private readonly EtsyAdsImporter _importer;

        public GetEtsyFeesHandler(EtsyAdsImporter importer)
        {
            _importer = importer;
        }

        public async Task<Response<EtsyFeesResponse>> Handle(GetEtsyFeesQuery request, CancellationToken cancellationToken)
        {
            var from = DateOnly.ParseExact(request.From!, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture);
            var to = DateOnly.ParseExact(request.To!, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture);
            if (to < from)
            {
                (from, to) = (to, from);
            }
            return Response<EtsyFeesResponse>.Ok(await _importer.GetAsync(from, to, cancellationToken));
        }
    }
}
