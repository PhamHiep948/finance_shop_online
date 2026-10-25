using System.Net;
using System.Text;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace Fin.Tests.Unit.Support
{
    // Answers HTTP requests from a list of (url part → status, body) rules and records every request.
    public sealed class FakeHttpHandler : HttpMessageHandler
    {
        private readonly List<(Func<string, bool> Match, Func<HttpRequestMessage, (HttpStatusCode Status, string Body)> Reply)> _rules = [];

        public List<HttpRequestMessage> Requests { get; } = [];

        public FakeHttpHandler On(string urlPart, string body, HttpStatusCode status = HttpStatusCode.OK)
        {
            _rules.Add((url => url.Contains(urlPart, StringComparison.Ordinal), _ => (status, body)));
            return this;
        }

        public FakeHttpHandler On(Func<string, bool> match, Func<HttpRequestMessage, (HttpStatusCode, string)> reply)
        {
            _rules.Add((match, reply));
            return this;
        }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            lock (Requests)
            {
                Requests.Add(request);
            }
            var url = request.RequestUri!.ToString();
            // The last matching rule wins, so a test can override a general rule with a specific one.
            var rule = _rules.LastOrDefault(r => r.Match(url));
            // Answered on another thread, like a real network call, so requests sent together really overlap.
            var (status, body) = rule.Reply is null
                ? (HttpStatusCode.NotFound, "{\"error\":\"no fake for " + url + "\"}")
                : await Task.Run(() => rule.Reply(request), cancellationToken);
            return new HttpResponseMessage(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        }
    }

    public sealed class FakeHttpClientFactory : IHttpClientFactory
    {
        private readonly HttpMessageHandler _handler;

        public FakeHttpClientFactory(HttpMessageHandler handler)
        {
            _handler = handler;
        }

        // This is the factory itself, the one place where a client is built around a handler.
#pragma warning disable RS0030
        public HttpClient CreateClient(string name) => new(_handler, disposeHandler: false);
#pragma warning restore RS0030
    }

    public sealed class TempHostEnvironment : IHostEnvironment, IDisposable
    {
        public TempHostEnvironment()
        {
            ContentRootPath = Path.Combine(Path.GetTempPath(), "fin-tests-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(ContentRootPath);
        }

        public string EnvironmentName { get; set; } = "Test";
        public string ApplicationName { get; set; } = "Fin.Tests";
        public string ContentRootPath { get; set; }
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();

        public void Dispose()
        {
            try
            {
                Directory.Delete(ContentRootPath, recursive: true);
            }
            catch (IOException)
            {
                // A leftover temp folder is harmless.
            }
        }
    }
}
