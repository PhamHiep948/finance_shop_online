using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using MediatR;

namespace Fin.Service.Finance.UseCases.Etsy.Commands
{
    // Brings the ad expenses of every month touched by From..To (yyyy-MM-dd) in step with Etsy right away.
    public sealed class SyncEtsyAdsCommand : IRequest<Response<EtsyAdsSyncResponse>>
    {
        public string? From { get; set; }
        public string? To { get; set; }
    }
}
