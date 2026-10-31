using Fin.Infrastructure.Finance.Models;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.Services;
using Fin.Service.Finance.UseCases.Etsy.Commands;
using Fin.Service.Finance.UseCases.Etsy.Commands.Handlers;
using Fin.Service.Finance.UseCases.Etsy.Queries;
using Fin.Service.Finance.UseCases.Etsy.Queries.Handlers;
using Fin.Service.Finance.UseCases.Etsy.Validators;
using Fin.Tests.Unit.Support;

namespace Fin.Tests.Unit.Services
{
    public sealed class EtsyListingsAndOrdersTests
    {
        private readonly FakeEtsyClient _etsy = new();
        private readonly InMemoryFinanceUnitOfWork _unitOfWork = new();
        private static readonly DateOnly Today = new(2026, 10, 24);

        private EtsyListingStats Stats() => new(_unitOfWork, new FixedTimeProvider(Today.ToDateTime(new TimeOnly(10, 0))));

        private async Task<EtsyListingViewsResponse> ViewsAsync(string from, string to = "2026-10-24")
        {
            var result = await new GetEtsyListingViewsHandler(_etsy, Stats())
                .Handle(new GetEtsyListingViewsQuery { From = from, To = to }, CancellationToken.None);
            Assert.True(result.Succeeded);
            return result.Data!;
        }

        private static EtsyListing Listing(long id, int views, int favorites = 0, string state = "active") =>
            new(id, $"Sản phẩm {id}", state, $"https://etsy.com/listing/{id}", null, views, favorites, 3, 12.5m, "EUR");

        // Each line: (listing, quantity, unit price in EUR). Subtotal = sum of the lines; shipping 0; buyer in the US.
        private static EtsyReceipt Receipt(string id, DateOnly date, params (long ListingId, int Quantity, decimal Price)[] items) =>
            new(id, date, "EUR", items.Select(i => new EtsyReceiptItem($"Sản phẩm {i.ListingId}", i.Quantity, i.ListingId, i.Price)).ToList(),
                items.Sum(i => i.Price * i.Quantity), 0, items.Sum(i => i.Price * i.Quantity), 0, 0, "US", 0);

        private async Task<List<EtsyListingDto>> ListingsAsync()
        {
            var result = await new GetEtsyListingsHandler(_etsy, Stats()).Handle(new GetEtsyListingsQuery(), CancellationToken.None);
            Assert.True(result.Succeeded);
            return result.Data!;
        }

        private async Task<EtsySalesResponse> SalesAsync(string from = "2026-08-01", string to = "2026-10-24")
        {
            var result = await new GetEtsySalesHandler(_unitOfWork, _etsy, EtsyOptionsFor.Shop())
                .Handle(new GetEtsySalesQuery { From = from, To = to }, CancellationToken.None);
            Assert.True(result.Succeeded);
            return result.Data!;
        }

        // ---- Danh sách sản phẩm

        [Fact]
        public async Task Listings_are_sorted_by_views_then_favorites()
        {
            _etsy.Listings.AddRange([Listing(1, 50, 2), Listing(2, 900), Listing(3, 50, 9)]);

            var list = await ListingsAsync();

            Assert.Equal([2L, 3L, 1L], list.Select(l => l.ListingId));
        }

        [Fact]
        public async Task Listing_fields_are_passed_through()
        {
            _etsy.Listings.Add(new EtsyListing(7, "Lilie", "sold_out", "https://etsy.com/listing/7", "https://img/7.jpg", 120, 14, 0, 24.9m, "EUR"));

            var item = Assert.Single(await ListingsAsync());

            Assert.Equal(("Lilie", "sold_out", "https://etsy.com/listing/7", "https://img/7.jpg"), (item.Title, item.State, item.Url, item.ImageUrl));
            Assert.Equal((120, 14, 0, 24.9m, "EUR"), (item.Views, item.Favorites, item.Stock, item.Price, item.Currency));
        }

        [Fact]
        public async Task A_listing_returned_twice_is_shown_once()
        {
            _etsy.Listings.AddRange([Listing(1, 10), Listing(1, 10, state: "sold_out")]);

            Assert.Single(await ListingsAsync());
        }

        [Fact]
        public async Task Listings_do_not_read_any_orders()
        {
            await ListingsAsync();

            Assert.Empty(_etsy.ReceiptRanges);
        }

        // ---- Lượt xem theo khoảng ngày (từ số app ghi lại mỗi ngày)

        [Fact]
        public async Task Reading_the_listings_records_todays_counts_once_per_day()
        {
            _etsy.Listings.Add(Listing(1, 100, 5));
            await ListingsAsync();
            _etsy.Listings[0] = Listing(1, 130, 6);
            await ListingsAsync();

            var row = Assert.Single(_unitOfWork.ListingStats);
            Assert.Equal((1L, Today, 130, 6), (row.ListingId, row.Date, row.Views, row.Favorites));
        }

        [Fact]
        public async Task Period_views_are_the_counts_at_the_end_minus_the_day_before_the_start()
        {
            _unitOfWork
                .WithListingStat(1, new DateOnly(2026, 9, 20), 40, 1)
                .WithListingStat(1, new DateOnly(2026, 9, 30), 100, 4)
                .WithListingStat(1, new DateOnly(2026, 10, 15), 160, 6)
                .WithListingStat(2, new DateOnly(2026, 9, 30), 10);
            _etsy.Listings.AddRange([Listing(1, 200, 9), Listing(2, 10)]);

            var october = await ViewsAsync("2026-10-01", "2026-10-15");
            var toToday = await ViewsAsync("2026-10-01");

            Assert.True(october.Complete);
            Assert.Equal("2026-09-20", october.TrackedSince);
            var byId = october.Listings.ToDictionary(l => l.ListingId);
            Assert.Equal((60, 2), (byId[1].Views, byId[1].Favorites));
            Assert.Equal(0, byId[2].Views);
            // Today's counts were recorded before working out a period ending today.
            Assert.Equal((100, 5), (toToday.Views, toToday.Favorites));
        }

        [Fact]
        public async Task A_listing_published_after_recording_started_counts_all_its_views()
        {
            _unitOfWork.WithListingStat(1, new DateOnly(2026, 9, 1), 50).WithListingStat(2, new DateOnly(2026, 10, 10), 30);
            _etsy.Listings.AddRange([Listing(1, 50), Listing(2, 30)]);

            var views = await ViewsAsync("2026-10-01");

            Assert.Equal(30, views.Listings.Single(l => l.ListingId == 2).Views);
        }

        [Fact]
        public async Task Recording_started_inside_the_period_counts_from_that_day_and_says_so()
        {
            _unitOfWork.WithListingStat(1, new DateOnly(2026, 10, 10), 500);
            _etsy.Listings.Add(Listing(1, 540));

            var views = await ViewsAsync("2026-10-01");

            Assert.False(views.Complete);
            Assert.Equal("2026-10-10", views.TrackedSince);
            Assert.Equal(40, views.Views);
        }

        [Fact]
        public async Task A_period_before_recording_started_has_no_views()
        {
            _unitOfWork.WithListingStat(1, new DateOnly(2026, 10, 10), 500);

            var views = await ViewsAsync("2026-08-01", "2026-09-30");

            Assert.Empty(views.Listings);
            Assert.Equal(0, views.Views);
        }

        [Fact]
        public async Task A_count_etsy_lowered_gives_zero_views()
        {
            _unitOfWork.WithListingStat(1, new DateOnly(2026, 9, 30), 500).WithListingStat(1, new DateOnly(2026, 10, 20), 480);

            var views = await ViewsAsync("2026-10-01", "2026-10-20");

            Assert.Equal(0, views.Views);
        }

        // ---- Số bán / doanh thu theo khoảng ngày

        [Fact]
        public async Task Sales_count_quantity_orders_and_line_revenue_per_listing_in_the_period()
        {
            _unitOfWork.WithMonthlyRate("2026-09", 1.2m);
            _etsy.Receipts.AddRange([
                Receipt("A", new DateOnly(2026, 9, 1), (1, 2, 10m), (2, 1, 5m)),
                Receipt("B", new DateOnly(2026, 9, 5), (1, 3, 10m)),
                // Two lines of the same listing in one order count as one order.
                Receipt("C", new DateOnly(2026, 9, 9), (2, 1, 5m), (2, 4, 5m)),
                // A deleted listing (id 0) is not given to any product.
                Receipt("D", new DateOnly(2026, 9, 9), (0, 5, 1m)),
                // Outside the period.
                Receipt("E", new DateOnly(2026, 7, 1), (3, 9, 1m)),
            ]);

            var sales = await SalesAsync();

            var byId = sales.Listings.ToDictionary(l => l.ListingId);
            Assert.Equal((5, 2, 60m), (byId[1].Sold, byId[1].Orders, byId[1].Revenue)); // 5 × 10 € × 1.2
            Assert.Equal((6, 2, 36m), (byId[2].Sold, byId[2].Orders, byId[2].Revenue)); // 6 × 5 € × 1.2
            Assert.False(byId.ContainsKey(3));
            Assert.Equal((4, 16), (sales.Orders, sales.Items));
        }

        [Fact]
        public async Task Total_revenue_matches_the_imported_orders()
        {
            _unitOfWork.WithMonthlyRate("2026-09", 1.2m);
            _etsy.Receipts.AddRange([Receipt("A", new DateOnly(2026, 9, 1), (1, 2, 10m)), Receipt("B", new DateOnly(2026, 9, 2), (1, 1, 5m))]);

            var sales = await SalesAsync();

            // (20 € + 5 €) × 1.2, outside the EU so no VAT is taken out.
            Assert.Equal(30m, sales.Revenue);
        }

        [Fact]
        public async Task Changing_the_period_changes_the_totals()
        {
            _etsy.Receipts.AddRange([Receipt("A", new DateOnly(2026, 9, 1), (1, 2, 10m)), Receipt("B", new DateOnly(2026, 10, 2), (1, 1, 5m))]);

            var september = await SalesAsync("2026-09-01", "2026-09-30");
            var both = await SalesAsync("2026-09-01", "2026-10-31");

            Assert.Equal((1, 2, 20m), (september.Orders, september.Items, september.Revenue));
            Assert.Equal((2, 3, 25m), (both.Orders, both.Items, both.Revenue));
        }

        [Fact]
        public async Task Dates_given_the_wrong_way_round_are_swapped()
        {
            var sales = await SalesAsync(from: "2026-10-24", to: "2026-08-01");

            Assert.Equal((new DateOnly(2026, 8, 1), new DateOnly(2026, 10, 24)), Assert.Single(_etsy.ReceiptRanges));
            Assert.Equal(("2026-08-01", "2026-10-24"), (sales.From, sales.To));
        }

        [Theory]
        [InlineData("2026-08-01", "2026-10-24", true)]
        [InlineData("2025-10-24", "2026-10-24", true)]   // 365 days
        [InlineData("2025-01-01", "2026-10-24", false)]  // more than a year
        [InlineData("2026-10-24", "2025-01-01", false)]  // also when reversed
        [InlineData("01/08/2026", "2026-10-24", false)]
        [InlineData(null, "2026-10-24", false)]
        [InlineData("2026-02-30", "2026-10-24", false)]
        public void Sales_and_fees_take_two_days_at_most_a_year_apart(string? from, string to, bool valid)
        {
            Assert.Equal(valid, new GetEtsySalesValidator().Validate(new GetEtsySalesQuery { From = from, To = to }).IsValid);
            Assert.Equal(valid, new GetEtsyFeesValidator().Validate(new GetEtsyFeesQuery { From = from, To = to }).IsValid);
        }

        [Fact]
        public async Task Refresh_forgets_the_kept_etsy_data()
        {
            var result = await new RefreshEtsyDataHandler(_etsy).Handle(new RefreshEtsyDataCommand(), CancellationToken.None);

            Assert.True(result.Succeeded);
            Assert.Equal(1, _etsy.Invalidations);
        }

        // ---- Đơn nhập vào Khoản thu

        [Fact]
        public async Task Orders_of_a_day_with_its_own_rate_use_that_rate()
        {
            var unitOfWork = new InMemoryFinanceUnitOfWork()
                .WithMonthlyRate("2026-09", 1.1m)
                .WithDailyRate(new DateOnly(2026, 9, 2), 1.3m);
            _etsy.Receipts.AddRange([Receipt("1", new DateOnly(2026, 9, 1), (1, 1, 10m)), Receipt("2", new DateOnly(2026, 9, 2), (1, 1, 10m))]);

            var result = await new GetEtsyOrdersHandler(unitOfWork, _etsy, EtsyOptionsFor.Shop())
                .Handle(new GetEtsyOrdersQuery { From = "2026-09-01", To = "2026-09-30" }, CancellationToken.None);

            var orders = result.Data!.ToDictionary(o => o.ReceiptId);
            Assert.Equal(11m, orders["1"].Amount);
            Assert.Equal(13m, orders["2"].Amount);
            Assert.Contains("ngày 02/09/2026", orders["2"].Note);
        }
    }
}
