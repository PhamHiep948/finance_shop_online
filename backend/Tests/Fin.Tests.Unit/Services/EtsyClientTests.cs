using System.Net;
using System.Text.Json;
using Fin.Infrastructure.Finance.Exceptions;
using Fin.Infrastructure.Finance.External;
using Fin.Infrastructure.Finance.Options;
using Fin.Infrastructure.Finance.Storage;
using Fin.Tests.Unit.Support;

namespace Fin.Tests.Unit.Services
{
    // EtsyClient against a fake Etsy API answering with JSON shaped like Open API v3.
    public sealed class EtsyClientTests : IDisposable
    {
        private const string Api = "https://openapi.etsy.com/v3/application";

        private readonly TempHostEnvironment _host = new();
        private readonly FakeHttpHandler _http = new();
        private readonly FinanceStoragePaths _paths;
        private readonly EtsyClient _client;

        public EtsyClientTests()
        {
            _paths = new FinanceStoragePaths(_host, Microsoft.Extensions.Options.Options.Create(new FinanceStorageOptions()));
            // A valid token saved by an earlier "Kết nối Etsy".
            File.WriteAllText(_paths.EtsyTokenFile, JsonSerializer.Serialize(new
            {
                AccessToken = "access-1",
                RefreshToken = "refresh-1",
                ExpiresAt = new DateTime(2099, 1, 1),
                ShopId = "777",
            }));
            _client = new EtsyClient(new FakeHttpClientFactory(_http), EtsyOptionsFor.Shop(),
                _paths, new FixedTimeProvider(new DateTime(2026, 10, 24, 10, 0, 0)));
        }

        public void Dispose() => _host.Dispose();

        private static long Noon(int year, int month, int day) =>
            new DateTimeOffset(year, month, day, 12, 0, 0, TimeZoneInfo.Local.GetUtcOffset(new DateTime(year, month, day))).ToUnixTimeSeconds();

        private static string Page(IEnumerable<object> results) => JsonSerializer.Serialize(new { count = results.Count(), results });

        private static object ListingJson(long id, int views = 10) => new
        {
            listing_id = id,
            title = $"Listing {id}",
            state = "active",
            url = $"https://www.etsy.com/listing/{id}",
            views,
            num_favorers = 3,
            quantity = 2,
            price = new { amount = 2490, divisor = 100, currency_code = "eur" },
        };

        // ---- Sản phẩm

        [Fact]
        public async Task Listings_map_views_favorites_price_and_thumbnail()
        {
            _http.On("state=active", Page([new
            {
                listing_id = 1500000001L,
                title = "Häkelblumen Lilie",
                state = "active",
                url = "https://www.etsy.com/listing/1500000001",
                views = 4821,
                num_favorers = 612,
                quantity = 7,
                price = new { amount = 2490, divisor = 100, currency_code = "EUR" },
                images = new[] { new { url_75x75 = "https://i/75.jpg", url_170x135 = "https://i/170.jpg" } },
            }]));
            _http.On("state=sold_out", Page([]));

            var listing = Assert.Single(await _client.GetListingsAsync(CancellationToken.None));

            Assert.Equal((1500000001L, "Häkelblumen Lilie", "active", "https://www.etsy.com/listing/1500000001"),
                (listing.ListingId, listing.Title, listing.State, listing.Url));
            Assert.Equal((4821, 612, 7), (listing.Views, listing.Favorites, listing.Quantity));
            Assert.Equal((24.9m, "EUR", "https://i/170.jpg"), (listing.Price, listing.Currency, listing.ImageUrl));
        }

        [Fact]
        public async Task Listings_read_active_and_sold_out_with_images_for_the_shop()
        {
            _http.On("state=active", Page([ListingJson(1)]));
            _http.On("state=sold_out", Page([ListingJson(2)]));

            var listings = await _client.GetListingsAsync(CancellationToken.None);

            Assert.Equal([1L, 2L], listings.Select(l => l.ListingId));
            Assert.All(_http.Requests, r =>
            {
                Assert.StartsWith($"{Api}/shops/777/listings?", r.RequestUri!.ToString());
                Assert.Contains("includes=Images", r.RequestUri.Query);
                Assert.Equal("Bearer access-1", r.Headers.Authorization!.ToString());
                Assert.Equal("key:secret", r.Headers.GetValues("x-api-key").Single());
            });
        }

        [Fact]
        public async Task A_listing_with_missing_fields_still_maps()
        {
            _http.On("state=active", Page([new { listing_id = 9L }]));
            _http.On("state=sold_out", Page([]));

            var listing = Assert.Single(await _client.GetListingsAsync(CancellationToken.None));

            Assert.Equal((string.Empty, 0, 0, 0m, "USD", (string?)null), (listing.Title, listing.Views, listing.Favorites, listing.Price, listing.Currency, listing.ImageUrl));
        }

        [Fact]
        public async Task Every_page_is_read_until_a_short_one()
        {
            _http.On("state=active&includes=Images&limit=100&offset=0", Page(Enumerable.Range(1, 100).Select(i => ListingJson(i))));
            _http.On("state=active&includes=Images&limit=100&offset=100", Page([ListingJson(101)]));
            _http.On("state=sold_out", Page([]));

            var listings = await _client.GetListingsAsync(CancellationToken.None);

            Assert.Equal(101, listings.Count);
            Assert.Equal(3, _http.Requests.Count);
        }

        // ---- Sổ Etsy Payments

        [Fact]
        public async Task Ledger_amounts_are_cents_and_keep_their_sign()
        {
            _http.On("/payment-account/ledger-entries?", Page([
                new { entry_id = 1L, ledger_type = "PROLIST", description = "Etsy Ads", amount = -520, currency = "eur", created_timestamp = Noon(2026, 9, 15) },
                new { entry_id = 2L, ledger_type = "offsite_ads_fee_refund", description = "Refund", amount = 105, currency = "EUR", created_timestamp = Noon(2026, 9, 16) },
            ]));

            var entries = await _client.GetLedgerEntriesAsync(new DateOnly(2026, 9, 1), new DateOnly(2026, 9, 30), CancellationToken.None);

            Assert.Equal(2, entries.Count);
            Assert.Equal((1L, new DateOnly(2026, 9, 15), "PROLIST", "Etsy Ads", -5.20m, "EUR"),
                (entries[0].EntryId, entries[0].Created, entries[0].LedgerType, entries[0].Description, entries[0].Amount, entries[0].Currency));
            Assert.Equal(1.05m, entries[1].Amount);
        }

        [Fact]
        public async Task Ledger_falls_back_to_create_date_and_tolerates_missing_fields()
        {
            _http.On("/payment-account/ledger-entries?", Page([new { entry_id = 3L, create_date = Noon(2026, 9, 2) }]));

            var entry = Assert.Single(await _client.GetLedgerEntriesAsync(new DateOnly(2026, 9, 1), new DateOnly(2026, 9, 30), CancellationToken.None));

            Assert.Equal((new DateOnly(2026, 9, 2), string.Empty, string.Empty, 0m, "USD"), (entry.Created, entry.LedgerType, entry.Description, entry.Amount, entry.Currency));
        }

        [Fact]
        public async Task Ledger_is_asked_for_the_whole_range()
        {
            _http.On("/payment-account/ledger-entries?", Page([]));

            await _client.GetLedgerEntriesAsync(new DateOnly(2026, 9, 1), new DateOnly(2026, 9, 30), CancellationToken.None);

            var query = Assert.Single(_http.Requests).RequestUri!.Query;
            Assert.Contains($"min_created={new DateTimeOffset(new DateTime(2026, 9, 1)).ToUnixTimeSeconds()}", query);
            Assert.Contains($"max_created={new DateTimeOffset(new DateTime(2026, 9, 30).AddDays(1).AddTicks(-1)).ToUnixTimeSeconds()}", query);
        }

        [Fact]
        public async Task A_long_range_is_read_in_windows_etsy_accepts()
        {
            const long MaxWindowSeconds = 2678400; // 31 days, Etsy's limit
            var windows = new List<(long Min, long Max)>();
            _http.On(url => url.Contains("/payment-account/ledger-entries?", StringComparison.Ordinal), request =>
            {
                var query = System.Web.HttpUtility.ParseQueryString(request.RequestUri!.Query);
                var (min, max) = (long.Parse(query["min_created"]!), long.Parse(query["max_created"]!));
                if (max - min > MaxWindowSeconds)
                {
                    return (HttpStatusCode.BadRequest, "{\"error\":\"Time window between min_created and max_created must be no more than 2678400 seconds (31 days).\"}");
                }
                windows.Add((min, max));
                // The same entry in every window: the client must not count it twice.
                return (HttpStatusCode.OK, Page([new { entry_id = 7L, ledger_type = "PROLIST", amount = -100, currency = "EUR", created_timestamp = Noon(2026, 9, 15) }]));
            });

            // Includes the end of daylight saving time (25/10/2026 in Europe).
            var entries = await _client.GetLedgerEntriesAsync(new DateOnly(2026, 8, 1), new DateOnly(2026, 10, 31), CancellationToken.None);

            Assert.Single(entries);
            Assert.Equal(4, windows.Count);
            Assert.Equal(new DateTimeOffset(new DateTime(2026, 8, 1)).ToUnixTimeSeconds(), windows[0].Min);
            Assert.Equal(new DateTimeOffset(new DateTime(2026, 10, 31).AddDays(1).AddTicks(-1)).ToUnixTimeSeconds(), windows[^1].Max);
            // Windows follow each other without a gap or an overlap.
            for (var i = 1; i < windows.Count; i++)
            {
                Assert.Equal(windows[i - 1].Max + 1, windows[i].Min);
            }
        }

        // ---- Đơn hàng

        [Fact]
        public async Task Receipts_keep_the_listing_id_of_each_line_and_drop_canceled_orders()
        {
            _http.On("/receipts?", Page([
                new
                {
                    receipt_id = 11L, status = "paid", created_timestamp = Noon(2026, 9, 3), country_iso = "US",
                    grandtotal = new { amount = 2490, divisor = 100, currency_code = "EUR" },
                    transactions = new object[] { new { title = "Lilie", quantity = 2, listing_id = 1500000001L }, new { title = "Gone", quantity = 1, listing_id = (long?)null } },
                },
                new
                {
                    receipt_id = 12L, status = "Canceled", created_timestamp = Noon(2026, 9, 4), country_iso = "US",
                    grandtotal = new { amount = 100, divisor = 100, currency_code = "EUR" },
                    transactions = Array.Empty<object>(),
                },
            ]));

            var receipt = Assert.Single(await _client.GetPaidReceiptsAsync(new DateOnly(2026, 9, 1), new DateOnly(2026, 9, 30), CancellationToken.None));

            Assert.Equal("11", receipt.ReceiptId);
            Assert.Equal([(1500000001L, 2), (0L, 1)], receipt.Items.Select(i => (i.ListingId, i.Quantity)));
        }

        // ---- Lỗi và quyền

        [Fact]
        public async Task Forbidden_asks_to_connect_again_for_the_new_permission()
        {
            _http.On("state=active", "{\"error\":\"Missing scope listings_r\"}", HttpStatusCode.Forbidden);

            var error = await Assert.ThrowsAsync<EtsyException>(() => _client.GetListingsAsync(CancellationToken.None));

            Assert.Contains("sản phẩm", error.Message);
            Assert.Contains("Missing scope listings_r", error.Message);
            Assert.Contains("Kết nối Etsy\" lại", error.Message);
            Assert.True(File.Exists(_paths.EtsyTokenFile));
        }

        [Fact]
        public async Task Unauthorized_drops_the_saved_token()
        {
            _http.On("/payment-account/ledger-entries?", "{\"error\":\"invalid_token\"}", HttpStatusCode.Unauthorized);

            var error = await Assert.ThrowsAsync<EtsyException>(() =>
                _client.GetLedgerEntriesAsync(new DateOnly(2026, 9, 1), new DateOnly(2026, 9, 30), CancellationToken.None));

            Assert.Contains("hết hạn", error.Message);
            Assert.False(File.Exists(_paths.EtsyTokenFile));
        }

        [Fact]
        public async Task Without_a_token_nothing_is_sent()
        {
            File.Delete(_paths.EtsyTokenFile);

            await Assert.ThrowsAsync<EtsyException>(() => _client.GetListingsAsync(CancellationToken.None));

            Assert.Empty(_http.Requests);
        }

        [Fact]
        public async Task Connecting_asks_for_the_listings_permission()
        {
            _http.On("/openapi-ping", "{\"application_id\":1}");

            var url = await _client.CreateAuthorizeUrlAsync(CancellationToken.None);

            Assert.Contains("scope=transactions_r%20shops_r%20listings_r", url);
        }
    }
}
