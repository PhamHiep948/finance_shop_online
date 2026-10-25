using Asp.Versioning;
using Fin.Model.Dto.Finance.Requests;
using Fin.Presentation.Shared.Controllers;
using Fin.Service.Finance.UseCases.Etsy.Commands;
using Fin.Service.Finance.UseCases.Etsy.Queries;
using Microsoft.AspNetCore.Mvc;

namespace Fin.Presentation.Finance.Controllers.v1
{
    [ApiVersion("1.0")]
    [Route("api/v{version:apiVersion}/etsy")]
    public sealed class EtsyController : BaseApiController
    {
        private const string IncomesPage = "/#/incomes";

        [HttpGet("status")]
        public async Task<IActionResult> GetStatusAsync() => Ok(await Mediator.Send(new GetEtsyStatusQuery()));

        // Opened by the browser itself (a link, not fetch), so it answers with a redirect to Etsy.
        [HttpGet("connect")]
        public async Task<IActionResult> ConnectAsync()
        {
            var result = await Mediator.Send(new GetEtsyAuthorizeUrlQuery());
            return Redirect(result.Data!);
        }

        [HttpGet("callback")]
        public async Task<IActionResult> CallbackAsync([FromQuery] string? code, [FromQuery] string? state, [FromQuery] string? error)
        {
            if (!string.IsNullOrEmpty(error))
            {
                return Redirect($"{IncomesPage}?etsy=error");
            }

            await Mediator.Send(new CompleteEtsyAuthorizationCommand { Code = code ?? string.Empty, State = state ?? string.Empty });
            return Redirect($"{IncomesPage}?etsy=connected");
        }

        [HttpPost("disconnect")]
        public async Task<IActionResult> DisconnectAsync() => Ok(await Mediator.Send(new DisconnectEtsyCommand()));

        [HttpGet("orders")]
        public async Task<IActionResult> GetOrdersAsync([FromQuery] string? from, [FromQuery] string? to) =>
            Ok(await Mediator.Send(new GetEtsyOrdersQuery { From = from, To = to }));

        [HttpPost("import")]
        public async Task<IActionResult> ImportAsync(EtsyImportRequest request) =>
            Ok(await Mediator.Send(new ImportEtsyOrdersCommand { Orders = request.Orders ?? [] }));

        [HttpGet("listings")]
        public async Task<IActionResult> GetListingsAsync() => Ok(await Mediator.Send(new GetEtsyListingsQuery()));

        [HttpGet("sales")]
        public async Task<IActionResult> GetSalesAsync([FromQuery] string? from, [FromQuery] string? to) =>
            Ok(await Mediator.Send(new GetEtsySalesQuery { From = from, To = to }));

        [HttpPost("refresh")]
        public async Task<IActionResult> RefreshAsync() => Ok(await Mediator.Send(new RefreshEtsyDataCommand()));

        [HttpGet("fees")]
        public async Task<IActionResult> GetFeesAsync([FromQuery] string? from, [FromQuery] string? to) =>
            Ok(await Mediator.Send(new GetEtsyFeesQuery { From = from, To = to }));

        [HttpGet("autosync")]
        public async Task<IActionResult> GetAutoSyncAsync() => Ok(await Mediator.Send(new GetEtsyAutoSyncQuery()));

        [HttpPut("autosync")]
        public async Task<IActionResult> ConfigureAutoSyncAsync(EtsyAutoSyncRequest request) =>
            Ok(await Mediator.Send(new ConfigureEtsyAutoSyncCommand { Enabled = request.Enabled, IntervalMinutes = request.IntervalMinutes }));

        [HttpPost("autosync/run")]
        public async Task<IActionResult> RunAutoSyncAsync() => Ok(await Mediator.Send(new RunEtsyAutoSyncCommand()));
    }
}
