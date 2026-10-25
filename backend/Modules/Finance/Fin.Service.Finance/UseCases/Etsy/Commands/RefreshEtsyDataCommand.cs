using Fin.Infrastructure.Shared.Wrappers;
using MediatR;

namespace Fin.Service.Finance.UseCases.Etsy.Commands
{
    // "Làm mới": the next reads go to Etsy instead of the data kept from earlier views.
    public sealed class RefreshEtsyDataCommand : IRequest<Response<bool>>
    {
    }
}
