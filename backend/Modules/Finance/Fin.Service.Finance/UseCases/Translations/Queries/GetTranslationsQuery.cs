using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using MediatR;

namespace Fin.Service.Finance.UseCases.Translations.Queries
{
    public sealed class GetTranslationsQuery : IRequest<Response<List<TranslationResponse>>>
    {
    }
}
