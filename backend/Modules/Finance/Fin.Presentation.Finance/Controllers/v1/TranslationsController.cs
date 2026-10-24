using Asp.Versioning;
using Fin.Model.Dto.Finance.Requests;
using Fin.Presentation.Shared.Controllers;
using Fin.Service.Finance.UseCases.Translations.Commands;
using Fin.Service.Finance.UseCases.Translations.Queries;
using Microsoft.AspNetCore.Mvc;

namespace Fin.Presentation.Finance.Controllers.v1
{
    [ApiVersion("1.0")]
    [Route("api/v{version:apiVersion}/translations")]
    public sealed class TranslationsController : BaseApiController
    {
        [HttpGet]
        public async Task<IActionResult> GetAsync() => Ok(await Mediator.Send(new GetTranslationsQuery()));

        [HttpPut]
        public async Task<IActionResult> SaveAsync(List<TranslationRequest> items) =>
            Ok(await Mediator.Send(new SaveTranslationsCommand { Items = items }));

        [HttpPost("discover")]
        public async Task<IActionResult> DiscoverAsync(TranslationDiscoverRequest request) =>
            Ok(await Mediator.Send(new DiscoverTranslationsCommand { Sources = request.Sources }));

        [HttpPost("delete")]
        public async Task<IActionResult> DeleteAsync(TranslationDiscoverRequest request) =>
            Ok(await Mediator.Send(new DeleteTranslationsCommand { Sources = request.Sources }));
    }
}
