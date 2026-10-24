using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using MediatR;

namespace Fin.Service.Finance.UseCases.Translations.Commands
{
    // Removes the sources sent (with their translation); text still shown on the web is picked up again when seen.
    public sealed class DeleteTranslationsCommand : IRequest<Response<TranslationDeleteResponse>>
    {
        public List<string> Sources { get; set; } = [];
    }
}
