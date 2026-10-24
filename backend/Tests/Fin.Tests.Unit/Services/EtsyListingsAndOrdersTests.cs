using Fin.Infrastructure.Finance.Models;
using Fin.Infrastructure.Shared.Exceptions;
using Fin.Service.Finance.UseCases.Etsy.Queries;
using Fin.Service.Finance.UseCases.Etsy.Queries.Handlers;
using Fin.Service.Finance.UseCases.Etsy.Validators;
using Fin.Tests.Unit.Support;

namespace Fin.Tests.Unit.Services
{
    public sealed class EtsyListingsAndOrdersTests
    {
        private readonly FakeEtsyClient _etsy = new();

        private static EtsyListing Listing(long id, int views, int favorites = 0, string state = "active") =>
            new(id, $"Sản phẩm {id}", state, $"https://etsy.com/listing/{id}", null, views, favorites, 3, 12.5m, "EUR");

        private static EtsyReceipt Receipt(string id, DateOnly date, params (long ListingId, int Quantity)[] items) =>
            new(id, date, "EUR", items.Select(i => new EtsyReceiptItem($"Sản phẩm {i.ListingId}", i.Quantity, i.ListingId)).ToList(),
                10m, 0, 10m, 0, 0, "US", 0);

        private async Task<List<Fin.Model.Dto.Finance.Responses.EtsyListingDto>> ListingsAsync(string from = "2026-08-01", string to = "2026-10-24")
        {
            var result = await new GetEtsyListingsHandler(_etsy).Handle(new GetEtsyListingsQuery { From = from, To = to }, CancellationToken.None);
            Assert.True(result.Succeeded);
            return result.Data!;
        }

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
        public async Task Sold_counts_quantity_and_orders_per_listing_in_the_period()
        {
            _etsy.Listings.AddRange([Listing(1, 10), Listing(2, 10), Listing(3, 10)]);
            _etsy.Receipts.AddRange([
                Receipt("A", new DateOnly(2026, 9, 1), (1, 2), (2, 1)),
                Receipt("B", new DateOnly(2026, 9, 5), (1, 3)),
                // Two lines of the same listing in one order count as one order.
                Receipt("C", new DateOnly(2026, 9, 9), (2, 1), (2, 4)),
                // A deleted listing (id 0) is ignored.
                Receipt("D", new DateOnly(2026, 9, 9), (0, 5)),
                // Outside the period.
                Receipt("E", new DateOnly(2026, 7, 1), (3, 9)),
            ]);

            var list = (await ListingsAsync()).ToDictionary(l => l.ListingId);

            Assert.Equal((5, 2), (list[1].Sold, list[1].Orders));
            Assert.Equal((6, 2), (list[2].Sold, list[2].Orders));
            Assert.Equal((0, 0), (list[3].Sold, list[3].Orders));
        }

        [Fact]
        public async Task A_listing_returned_twice_is_shown_once()
        {
            _etsy.Listings.AddRange([Listing(1, 10), Listing(1, 10, state: "sold_out")]);

            Assert.Single(await ListingsAsync());
        }

        [Fact]
        public async Task Dates_given_the_wrong_way_round_are_swapped()
        {
            await ListingsAsync(from: "2026-10-24", to: "2026-08-01");

            Assert.Equal((new DateOnly(2026, 8, 1), new DateOnly(2026, 10, 24)), Assert.Single(_etsy.ReceiptRanges));
        }

        [Fact]
        public async Task More_than_one_year_is_refused()
        {
            await Assert.ThrowsAsync<ApiException>(() => ListingsAsync(from: "2025-01-01", to: "2026-10-24"));
            Assert.Empty(_etsy.ReceiptRanges);
        }

        [Theory]
        [InlineData("2026-08-01", "2026-10-24", true)]
        [InlineData("01/08/2026", "2026-10-24", false)]
        [InlineData(null, "2026-10-24", false)]
        [InlineData("2026-02-30", "2026-10-24", false)]
        public void Listings_need_two_iso_dates(string? from, string to, bool valid)
        {
            Assert.Equal(valid, new GetEtsyListingsValidator().Validate(new GetEtsyListingsQuery { From = from, To = to }).IsValid);
        }

        [Theory]
        [InlineData("2026-01", "2026-10", true)]
        [InlineData("2024-11", "2026-10", true)]   // 24 months
        [InlineData("2024-10", "2026-10", false)]  // 25 months
        [InlineData("2026-10", "2024-10", false)]  // also when reversed
        [InlineData("2026-1", "2026-10", false)]
        [InlineData("2026-10", null, false)]
        public void Fees_take_at_most_24_months(string from, string? to, bool valid)
        {
            Assert.Equal(valid, new GetEtsyFeesValidator().Validate(new GetEtsyFeesQuery { From = from, To = to }).IsValid);
        }

        [Fact]
        public async Task Orders_of_a_day_with_its_own_rate_use_that_rate()
        {
            var unitOfWork = new InMemoryFinanceUnitOfWork()
                .WithMonthlyRate("2026-09", 1.1m)
                .WithDailyRate(new DateOnly(2026, 9, 2), 1.3m);
            _etsy.Receipts.AddRange([Receipt("1", new DateOnly(2026, 9, 1), (1, 1)), Receipt("2", new DateOnly(2026, 9, 2), (1, 1))]);

            var result = await new GetEtsyOrdersHandler(unitOfWork, _etsy, EtsyOptionsFor.Shop())
                .Handle(new GetEtsyOrdersQuery { From = "2026-09-01", To = "2026-09-30" }, CancellationToken.None);

            var orders = result.Data!.ToDictionary(o => o.ReceiptId);
            Assert.Equal(11m, orders["1"].Amount);
            Assert.Equal(13m, orders["2"].Amount);
            Assert.Contains("ngày 02/09/2026", orders["2"].Note);
        }
    }
}
