using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Requests;
using Fin.Model.Dto.Finance.Responses;
using MediatR;

namespace Fin.Service.Finance.UseCases.Translations.Commands
{
    // Sets the German text (and the "ignored" flag) of the sources sent; a source not stored yet is added.
    public sealed class SaveTranslationsCommand : IRequest<Response<List<TranslationResponse>>>
    {
        public List<TranslationRequest> Items { get; set; } = [];
    }
}
