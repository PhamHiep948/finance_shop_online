using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Fin.Infrastructure.Finance.Exceptions;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Finance.Models;
using Fin.Infrastructure.Finance.Options;
using Fin.Infrastructure.Finance.Storage;
using Microsoft.Extensions.Options;

namespace Fin.Infrastructure.Finance.External
{
    public sealed class EtsyClient : IEtsyClient
    {
        private const string AuthorizeEndpoint = "https://www.etsy.com/oauth/connect";
        private const string TokenEndpoint = "https://api.etsy.com/v3/public/oauth/token";
        private const string ApiBase = "https://openapi.etsy.com/v3/application";
        private const string SettingsFile = "backend/Host/Fin.Host.Api/etsy.settings.json";
        private const int PageSize = 100;
        // listings_r: product views and favorites; transactions_r also covers the Etsy Payments ledger (fees, ads).
        private const string Scopes = "transactions_r shops_r listings_r";
        // Etsy Payments ledger amounts are integers in the smallest currency unit (cents).
        private const decimal LedgerDivisor = 100m;
        // The ledger endpoint accepts a min_created..max_created window of at most 31 days (2 678 400 seconds);
        // 30 days keeps a window that spans a daylight-saving change (one extra hour) under that limit.
        // Receipts are read in the same windows so the windows can be fetched side by side and cached.
        private const int WindowDays = 30;
        // Etsy allows about 10 requests per second; a few at a time keeps a page fast without hitting that.
        private const int MaxParallelRequests = 4;
        private static readonly string[] ListingStates = ["active", "sold_out"];
        // Days that are over do not change any more (a late refund aside), so their data is kept longer;
        // a window that includes today is only kept briefly, which keeps the order sync up to date.
        private static readonly TimeSpan ListingsTtl = TimeSpan.FromMinutes(10);
        private static readonly TimeSpan PastLedgerTtl = TimeSpan.FromHours(6);
        private static readonly TimeSpan PastReceiptsTtl = TimeSpan.FromMinutes(30);
        private static readonly TimeSpan CurrentWindowTtl = TimeSpan.FromMinutes(1);

        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IOptionsMonitor<EtsyOptions> _options;
        private readonly FinanceStoragePaths _paths;
        private readonly TimeProvider _timeProvider;
        private readonly SemaphoreSlim _tokenLock = new(1, 1);
        private readonly SemaphoreSlim _requestGate = new(MaxParallelRequests, MaxParallelRequests);
        private readonly Dictionary<string, (DateTime Until, object Value)> _cache = [];
        // state -> code_verifier of PKCE flows that are waiting for the Etsy callback.
        private readonly Dictionary<string, string> _pendingAuthorizations = [];
        // A valid key is remembered; a rejected key is checked again after 30 seconds so a freshly fixed key is picked up.
        private (string Key, string? Error, DateTime CheckedAt)? _keyCheck;

        public EtsyClient(IHttpClientFactory httpClientFactory, IOptionsMonitor<EtsyOptions> options, FinanceStoragePaths paths, TimeProvider timeProvider)
        {
            _httpClientFactory = httpClientFactory;
            _options = options;
            _paths = paths;
            _timeProvider = timeProvider;
        }

        public bool IsReady => HasKeys && File.Exists(_paths.EtsyTokenFile);

        private EtsyOptions Settings => _options.CurrentValue;

        private bool HasKeys => !string.IsNullOrWhiteSpace(Settings.ApiKey) && !string.IsNullOrWhiteSpace(Settings.SharedSecret);

        private string ApiKeyHeader => $"{Settings.ApiKey.Trim()}:{Settings.SharedSecret.Trim()}";

        private DateTime UtcNow => _timeProvider.GetUtcNow().UtcDateTime;

        public async Task<EtsyConnectionStatus> GetStatusAsync(CancellationToken cancellationToken)
        {
            var keyError = HasKeys ? await CheckKeysAsync(cancellationToken) : null;
            var shopId = string.IsNullOrWhiteSpace(Settings.ShopId) ? ReadToken()?.ShopId ?? string.Empty : Settings.ShopId;
            return new EtsyConnectionStatus(HasKeys, keyError, File.Exists(_paths.EtsyTokenFile), shopId, Settings.RedirectUri);
        }

        public async Task<string> CreateAuthorizeUrlAsync(CancellationToken cancellationToken)
        {
            EnsureKeys();
            if (await CheckKeysAsync(cancellationToken) is { } keyError)
            {
                throw new EtsyException(keyError);
            }

            var verifier = Base64Url(RandomNumberGenerator.GetBytes(32));
            var challenge = Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
            var state = Base64Url(RandomNumberGenerator.GetBytes(16));
            lock (_pendingAuthorizations)
            {
                _pendingAuthorizations[state] = verifier;
            }

            var query = new Dictionary<string, string>
            {
                ["response_type"] = "code",
                ["redirect_uri"] = Settings.RedirectUri,
                ["scope"] = Scopes,
                ["client_id"] = Settings.ApiKey.Trim(),
                ["state"] = state,
                ["code_challenge"] = challenge,
                ["code_challenge_method"] = "S256",
            };
            return AuthorizeEndpoint + "?" + string.Join("&", query.Select(p => $"{p.Key}={Uri.EscapeDataString(p.Value)}"));
        }

        public async Task CompleteAuthorizationAsync(string code, string state, CancellationToken cancellationToken)
        {
            string? verifier;
            lock (_pendingAuthorizations)
            {
                _pendingAuthorizations.Remove(state, out verifier);
            }
            if (verifier is null)
            {
                throw new EtsyException("Phiên kết nối Etsy không hợp lệ hoặc đã hết hạn. Hãy bấm Kết nối lại.");
            }

            var token = await RequestTokenAsync(new Dictionary<string, string>
            {
                ["grant_type"] = "authorization_code",
                ["client_id"] = Settings.ApiKey.Trim(),
                ["redirect_uri"] = Settings.RedirectUri,
                ["code"] = code,
                ["code_verifier"] = verifier,
            }, null, cancellationToken);

            InvalidateCache();
            if (string.IsNullOrWhiteSpace(Settings.ShopId))
            {
                await DetectShopIdAsync(token, cancellationToken);
            }
        }

        public void Disconnect()
        {
            InvalidateCache();
            if (File.Exists(_paths.EtsyTokenFile))
            {
                File.Delete(_paths.EtsyTokenFile);
            }
        }

        public void InvalidateCache()
        {
            lock (_cache)
            {
                _cache.Clear();
            }
        }

        public async Task<IReadOnlyList<EtsyReceipt>> GetPaidReceiptsAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken)
        {
            var windows = await Task.WhenAll(Windows(from, to).Select(w => CachedAsync($"receipts:{w.Start}:{w.End}",
                w.End < Today ? PastReceiptsTtl : CurrentWindowTtl,
                async () =>
                {
                    var (min, max) = UnixRange(w.Start, w.End);
                    var items = await ReadAllAsync("đơn",
                        (shopId, offset) => $"{ApiBase}/shops/{shopId}/receipts?min_created={min}&max_created={max}&was_paid=true&was_canceled=false&limit={PageSize}&offset={offset}",
                        cancellationToken);
                    // Canceled and fully refunded orders are no longer revenue.
                    return items
                        .Where(r => (r.TryGetProperty("status", out var st) ? st.GetString()?.ToLowerInvariant() : null) is not ("canceled" or "fully refunded"))
                        .Select(MapReceipt)
                        .ToList();
                })));
            return windows.SelectMany(w => w).DistinctBy(r => r.ReceiptId).ToList();
        }

        public Task<IReadOnlyList<EtsyListing>> GetListingsAsync(CancellationToken cancellationToken) =>
            CachedAsync<IReadOnlyList<EtsyListing>>("listings", ListingsTtl, async () =>
            {
                var states = await Task.WhenAll(ListingStates.Select(state => ReadAllAsync("sản phẩm",
                    (shopId, offset) => $"{ApiBase}/shops/{shopId}/listings?state={state}&includes=Images&limit={PageSize}&offset={offset}",
                    cancellationToken)));
                return states.SelectMany(items => items).Select(MapListing).ToList();
            });

        public async Task<IReadOnlyList<EtsyLedgerEntry>> GetLedgerEntriesAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken)
        {
            // Etsy refuses a ledger window longer than 31 days, so a longer range is read window by window.
            var windows = await Task.WhenAll(Windows(from, to).Select(w => CachedAsync($"ledger:{w.Start}:{w.End}",
                w.End < Today ? PastLedgerTtl : CurrentWindowTtl,
                async () =>
                {
                    var (min, max) = UnixRange(w.Start, w.End);
                    var items = await ReadAllAsync("sổ thu chi Etsy Payments",
                        (shopId, offset) => $"{ApiBase}/shops/{shopId}/payment-account/ledger-entries?min_created={min}&max_created={max}&limit={PageSize}&offset={offset}",
                        cancellationToken);
                    return items.Select(MapLedgerEntry).ToList();
                })));
            return windows.SelectMany(w => w).DistinctBy(e => e.EntryId).ToList();
        }

        private DateOnly Today => DateOnly.FromDateTime(_timeProvider.GetLocalNow().DateTime);

        // Consecutive windows of at most WindowDays days covering from..to.
        private static IEnumerable<(DateOnly Start, DateOnly End)> Windows(DateOnly from, DateOnly to)
        {
            for (var start = from; start <= to; start = start.AddDays(WindowDays))
            {
                var end = start.AddDays(WindowDays - 1);
                yield return (start, end < to ? end : to);
            }
        }

        private async Task<T> CachedAsync<T>(string key, TimeSpan ttl, Func<Task<T>> load)
        {
            lock (_cache)
            {
                if (_cache.TryGetValue(key, out var hit) && hit.Until > UtcNow)
                {
                    return (T)hit.Value;
                }
            }
            var value = await load();
            lock (_cache)
            {
                _cache[key] = (UtcNow + ttl, value!);
            }
            return value;
        }

        private static (long Min, long Max) UnixRange(DateOnly from, DateOnly to) =>
            (new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue)).ToUnixTimeSeconds(),
             new DateTimeOffset(to.ToDateTime(TimeOnly.MaxValue)).ToUnixTimeSeconds());

        // Reads every page of a shop collection, in order; `what` names the data in error messages.
        // Etsy tells the total on the first page, so the other pages are then read side by side.
        private async Task<List<JsonElement>> ReadAllAsync(string what, Func<string, int, string> url, CancellationToken cancellationToken)
        {
            EnsureKeys();
            var token = await GetTokenAsync(cancellationToken);
            var shopId = !string.IsNullOrWhiteSpace(Settings.ShopId) ? Settings.ShopId : token.ShopId ?? await DetectShopIdAsync(token, cancellationToken);
            using var client = CreateApiClient(token.AccessToken);
            var shop = Uri.EscapeDataString(shopId);

            var (items, total) = await ReadPageAsync(client, url(shop, 0), shopId, what, cancellationToken);
            var last = items.Count;
            var offset = PageSize;
            if (last == PageSize && total > PageSize)
            {
                var offsets = Enumerable.Range(1, (total - 1) / PageSize).Select(i => i * PageSize).ToList();
                var pages = await Task.WhenAll(offsets.Select(o => ReadPageAsync(client, url(shop, o), shopId, what, cancellationToken)));
                foreach (var page in pages)
                {
                    items.AddRange(page.Items);
                }
                last = pages[^1].Items.Count;
                offset = (offsets[^1]) + PageSize;
            }
            // No total given, or items were added meanwhile: keep reading until a page is not full.
            while (last == PageSize)
            {
                var page = await ReadPageAsync(client, url(shop, offset), shopId, what, cancellationToken);
                items.AddRange(page.Items);
                last = page.Items.Count;
                offset += PageSize;
            }
            return items;
        }

        private async Task<(List<JsonElement> Items, int Total)> ReadPageAsync(HttpClient client, string url, string shopId, string what, CancellationToken cancellationToken)
        {
            await _requestGate.WaitAsync(cancellationToken);
            try
            {
                using var response = await client.GetAsync(url, cancellationToken);
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                if (!response.IsSuccessStatusCode)
                {
                    throw ApiError(response.StatusCode, body, shopId, what);
                }

                using var doc = JsonDocument.Parse(body);
                var total = doc.RootElement.TryGetProperty("count", out var count) && count.ValueKind == JsonValueKind.Number ? count.GetInt32() : 0;
                return (doc.RootElement.GetProperty("results").EnumerateArray().Select(e => e.Clone()).ToList(), total);
            }
            finally
            {
                _requestGate.Release();
            }
        }

        private EtsyException ApiError(HttpStatusCode status, string body, string shopId, string what)
        {
            if (status == HttpStatusCode.Unauthorized)
            {
                Disconnect();
                return new EtsyException("Phiên đăng nhập Etsy đã hết hạn hoặc bị thu hồi. Hãy bấm \"Kết nối Etsy\" lại.");
            }
            if (status == HttpStatusCode.Forbidden)
            {
                // A token issued before listings_r was added lacks that scope: connecting again grants it.
                return new EtsyException($"Etsy không cho đọc {what} của shop {shopId}: {EtsyError(body).TrimEnd('.')}. "
                    + "Nếu đã kết nối Etsy từ trước, hãy bấm \"Kết nối Etsy\" lại một lần để cấp thêm quyền. "
                    + $"Kiểm tra cả việc đăng nhập đúng tài khoản chủ shop, và ShopId trong {SettingsFile} (nếu có điền) là đúng.");
            }
            return new EtsyException($"Etsy API lỗi ({(int)status}): {EtsyError(body)}");
        }

        private static EtsyListing MapListing(JsonElement listing)
        {
            string? image = null;
            if (listing.TryGetProperty("images", out var images) && images.ValueKind == JsonValueKind.Array && images.GetArrayLength() > 0
                && images[0].TryGetProperty("url_170x135", out var thumb))
            {
                image = thumb.GetString();
            }
            var currency = listing.TryGetProperty("price", out var price) && price.ValueKind == JsonValueKind.Object
                && price.TryGetProperty("currency_code", out var code)
                ? code.GetString() ?? "USD"
                : "USD";

            return new EtsyListing(
                listing.GetProperty("listing_id").GetInt64(),
                Text(listing, "title"),
                Text(listing, "state"),
                Text(listing, "url"),
                image,
                Int(listing, "views"),
                Int(listing, "num_favorers"),
                Int(listing, "quantity"),
                Money(listing, "price"),
                currency.ToUpperInvariant());
        }

        private static EtsyLedgerEntry MapLedgerEntry(JsonElement entry)
        {
            var created = entry.TryGetProperty("created_timestamp", out var ts) && ts.ValueKind == JsonValueKind.Number
                ? ts.GetInt64()
                : entry.GetProperty("create_date").GetInt64();
            var amount = entry.TryGetProperty("amount", out var a) && a.ValueKind == JsonValueKind.Number ? a.GetDecimal() / LedgerDivisor : 0;
            var currency = Text(entry, "currency");
            return new EtsyLedgerEntry(
                entry.GetProperty("entry_id").GetInt64(),
                DateOnly.FromDateTime(DateTimeOffset.FromUnixTimeSeconds(created).LocalDateTime),
                Text(entry, "ledger_type"),
                Text(entry, "description"),
                amount,
                string.IsNullOrEmpty(currency) ? "USD" : currency.ToUpperInvariant());
        }

        private static string Text(JsonElement parent, string name) =>
            parent.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString()! : string.Empty;

        private static int Int(JsonElement parent, string name) =>
            parent.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number ? value.GetInt32() : 0;

        private static EtsyReceipt MapReceipt(JsonElement receipt)
        {
            var currency = receipt.TryGetProperty("grandtotal", out var grandTotal) && grandTotal.TryGetProperty("currency_code", out var code)
                ? code.GetString() ?? "USD"
                : "USD";
            var items = receipt.TryGetProperty("transactions", out var transactions)
                ? transactions.EnumerateArray()
                    .Select(t => new EtsyReceiptItem(
                        t.GetProperty("title").GetString() ?? string.Empty,
                        t.TryGetProperty("quantity", out var q) ? q.GetInt32() : 1,
                        t.TryGetProperty("listing_id", out var l) && l.ValueKind == JsonValueKind.Number ? l.GetInt64() : 0,
                        Money(t, "price")))
                    .ToList()
                : [];
            var created = DateOnly.FromDateTime(DateTimeOffset.FromUnixTimeSeconds(receipt.GetProperty("created_timestamp").GetInt64()).LocalDateTime);
            var refunded = receipt.TryGetProperty("refunds", out var refunds) && refunds.ValueKind == JsonValueKind.Array
                ? refunds.EnumerateArray().Sum(x => Money(x, "amount"))
                : 0;

            return new EtsyReceipt(
                receipt.GetProperty("receipt_id").GetInt64().ToString(CultureInfo.InvariantCulture),
                created,
                currency,
                items,
                Money(receipt, "total_price"),
                Money(receipt, "discount_amt"),
                Money(receipt, "subtotal"),
                Money(receipt, "total_shipping_cost"),
                Money(receipt, "total_tax_cost") + Money(receipt, "total_vat_cost"),
                receipt.TryGetProperty("country_iso", out var country) ? country.GetString() ?? string.Empty : string.Empty,
                refunded);
        }

        private static decimal Money(JsonElement parent, string name)
        {
            if (!parent.TryGetProperty(name, out var money) || money.ValueKind != JsonValueKind.Object)
            {
                return 0;
            }
            var divisor = money.GetProperty("divisor").GetDecimal();
            return divisor == 0 ? 0 : money.GetProperty("amount").GetDecimal() / divisor;
        }

        private void EnsureKeys()
        {
            if (!HasKeys)
            {
                throw new EtsyException($"Chưa điền ApiKey và SharedSecret trong {SettingsFile}.");
            }
        }

        private async Task<string?> CheckKeysAsync(CancellationToken cancellationToken)
        {
            var key = ApiKeyHeader;
            if (_keyCheck is { } cached && cached.Key == key && (cached.Error is null || UtcNow - cached.CheckedAt < TimeSpan.FromSeconds(30)))
            {
                return cached.Error;
            }

            string? error = null;
            try
            {
                using var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(10);
                client.DefaultRequestHeaders.Add("x-api-key", key);
                using var response = await client.GetAsync($"{ApiBase}/openapi-ping", cancellationToken);
                if (!response.IsSuccessStatusCode)
                {
                    var body = await response.Content.ReadAsStringAsync(cancellationToken);
                    error = (int)response.StatusCode is 401 or 403
                        ? "Etsy từ chối ApiKey / SharedSecret. Kiểm tra: (1) app trên etsy.com/developers/your-apps đã được duyệt (không còn Pending), "
                          + "(2) copy lại đúng Keystring và Shared Secret. Etsy trả lời: " + EtsyError(body)
                        : $"Etsy API lỗi ({(int)response.StatusCode}): {EtsyError(body)}";
                }
            }
            catch (Exception e) when (e is HttpRequestException or TaskCanceledException)
            {
                // Offline: do not conclude that the key is wrong, and do not cache the result.
                return "Không kết nối được tới Etsy (kiểm tra Internet).";
            }

            _keyCheck = (key, error, UtcNow);
            return error;
        }

        private sealed record TokenData(string AccessToken, string RefreshToken, DateTime ExpiresAt, string? ShopId = null);

        private TokenData? ReadToken()
        {
            try
            {
                return File.Exists(_paths.EtsyTokenFile) ? JsonSerializer.Deserialize<TokenData>(File.ReadAllText(_paths.EtsyTokenFile)) : null;
            }
            catch (Exception e) when (e is IOException or JsonException)
            {
                return null;
            }
        }

        private async Task<TokenData> RequestTokenAsync(Dictionary<string, string> form, string? shopId, CancellationToken cancellationToken)
        {
            using var client = _httpClientFactory.CreateClient();
            using var content = new FormUrlEncodedContent(form);
            using var response = await client.PostAsync(TokenEndpoint, content, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                // An expired or revoked refresh token cannot be recovered; dropping it makes the UI ask to connect again.
                if (form["grant_type"] == "refresh_token")
                {
                    Disconnect();
                }
                throw new EtsyException($"Etsy từ chối cấp token ({(int)response.StatusCode}): {EtsyError(body)}. Hãy bấm \"Kết nối Etsy\" lại.");
            }

            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            var token = new TokenData(
                root.GetProperty("access_token").GetString()!,
                root.GetProperty("refresh_token").GetString()!,
                UtcNow.AddSeconds(root.GetProperty("expires_in").GetInt32() - 60),
                shopId);
            await File.WriteAllTextAsync(_paths.EtsyTokenFile, JsonSerializer.Serialize(token), cancellationToken);
            return token;
        }

        private async Task<TokenData> GetTokenAsync(CancellationToken cancellationToken)
        {
            await _tokenLock.WaitAsync(cancellationToken);
            try
            {
                if (!File.Exists(_paths.EtsyTokenFile))
                {
                    throw new EtsyException("Chưa kết nối tài khoản Etsy. Bấm \"Kết nối Etsy\" để đăng nhập.");
                }
                var token = JsonSerializer.Deserialize<TokenData>(await File.ReadAllTextAsync(_paths.EtsyTokenFile, cancellationToken))
                    ?? throw new EtsyException("File token Etsy bị hỏng, hãy kết nối lại.");
                if (token.ExpiresAt > UtcNow)
                {
                    return token;
                }

                return await RequestTokenAsync(new Dictionary<string, string>
                {
                    ["grant_type"] = "refresh_token",
                    ["client_id"] = Settings.ApiKey.Trim(),
                    ["refresh_token"] = token.RefreshToken,
                }, token.ShopId, cancellationToken);
            }
            finally
            {
                _tokenLock.Release();
            }
        }

        private HttpClient CreateApiClient(string accessToken)
        {
            var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Add("x-api-key", ApiKeyHeader);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            return client;
        }

        private async Task<string> DetectShopIdAsync(TokenData token, CancellationToken cancellationToken)
        {
            using var client = CreateApiClient(token.AccessToken);
            using var response = await client.GetAsync($"{ApiBase}/users/me", cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                throw new EtsyException($"Không lấy được shop của tài khoản Etsy ({(int)response.StatusCode}): {EtsyError(body)}");
            }

            using var doc = JsonDocument.Parse(body);
            if (!doc.RootElement.TryGetProperty("shop_id", out var id) || id.ValueKind != JsonValueKind.Number)
            {
                throw new EtsyException("Tài khoản Etsy này chưa có shop. Hãy đăng nhập đúng tài khoản chủ shop.");
            }

            var shopId = id.GetInt64().ToString(CultureInfo.InvariantCulture);
            await _tokenLock.WaitAsync(cancellationToken);
            try
            {
                var saved = ReadToken() ?? token;
                await File.WriteAllTextAsync(_paths.EtsyTokenFile, JsonSerializer.Serialize(saved with { ShopId = shopId }), cancellationToken);
            }
            finally
            {
                _tokenLock.Release();
            }
            return shopId;
        }

        private static string EtsyError(string body)
        {
            try
            {
                using var doc = JsonDocument.Parse(body);
                if (doc.RootElement.TryGetProperty("error", out var error) && error.ValueKind == JsonValueKind.String)
                {
                    return error.GetString()!;
                }
            }
            catch (JsonException)
            {
                // Not JSON (HTML error page, proxy message): fall through and show the raw text.
            }
            return body.Length > 300 ? body[..300] : body;
        }

        private static string Base64Url(byte[] bytes) =>
            Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
}
