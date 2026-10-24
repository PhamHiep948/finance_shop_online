using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using MediatR;

namespace Fin.Service.Finance.UseCases.Translations.Commands
{
    // Texts the web found on screen; the ones not stored yet are added (untranslated) so the admin sees them.
    public sealed class DiscoverTranslationsCommand : IRequest<Response<TranslationDiscoverResponse>>
    {
        public List<string> Sources { get; set; } = [];
    }
}
