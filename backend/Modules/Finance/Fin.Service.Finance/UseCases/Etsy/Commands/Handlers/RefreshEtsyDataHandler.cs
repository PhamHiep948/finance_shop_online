using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Shared.Wrappers;
using MediatR;

namespace Fin.Service.Finance.UseCases.Etsy.Commands.Handlers
{
    public sealed class RefreshEtsyDataHandler : IRequestHandler<RefreshEtsyDataCommand, Response<bool>>
    {
        private readonly IEtsyClient _etsyClient;

        public RefreshEtsyDataHandler(IEtsyClient etsyClient)
        {
            _etsyClient = etsyClient;
        }

        public Task<Response<bool>> Handle(RefreshEtsyDataCommand request, CancellationToken cancellationToken)
        {
            _etsyClient.InvalidateCache();
            return Task.FromResult(Response<bool>.Ok(true));
        }
    }
}
