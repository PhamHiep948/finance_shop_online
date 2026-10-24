using Fin.Service.Finance.UseCases.ExchangeRates.Commands;
using Fin.Service.Finance.UseCases.ExchangeRates.Commands.Handlers;
using Fin.Service.Finance.UseCases.ExchangeRates.Queries;
using Fin.Service.Finance.UseCases.ExchangeRates.Queries.Handlers;
using Fin.Service.Finance.UseCases.ExchangeRates.Validators;
using Fin.Tests.Unit.Support;

namespace Fin.Tests.Unit.Services
{
    public sealed class FxDailyRateTests
    {
        private readonly InMemoryFinanceUnitOfWork _unitOfWork = new();
        private readonly FakeEcbRateProvider _ecb = new();

        private async Task SetAsync(string date, decimal rate)
        {
            var result = await new SetDailyRateHandler(_unitOfWork).Handle(new SetDailyRateCommand { Date = date, EurToUsd = rate }, CancellationToken.None);
            Assert.True(result.Succeeded, result.Message);
        }

        // ---- Lưu / sửa / xóa

        [Fact]
        public async Task Setting_a_day_adds_it_and_setting_it_again_updates_it()
        {
            await SetAsync("2026-10-15", 1.1712m);
            await SetAsync("2026-10-15", 1.18m);

            var rate = Assert.Single(_unitOfWork.DailyRates);
            Assert.Equal((new DateOnly(2026, 10, 15), 1.18m), (rate.Date, rate.EurToUsd));
        }

        [Fact]
        public async Task The_rate_is_rounded_to_six_decimals()
        {
            await SetAsync("2026-10-15", 1.12345678m);

            Assert.Equal(1.123457m, _unitOfWork.DailyRates.Single().EurToUsd);
        }

        [Fact]
        public async Task Deleting_a_day_removes_only_that_day()
        {
            _unitOfWork.WithDailyRate(new DateOnly(2026, 10, 15), 1.17m).WithDailyRate(new DateOnly(2026, 10, 16), 1.18m);

            var result = await new DeleteDailyRateHandler(_unitOfWork).Handle(new DeleteDailyRateCommand { Date = "2026-10-15" }, CancellationToken.None);

            Assert.True(result.Succeeded);
            Assert.Equal(new DateOnly(2026, 10, 16), Assert.Single(_unitOfWork.DailyRates).Date);
        }

        [Theory]
        [InlineData("2026-10-15", "FX_ERR_005")]
        [InlineData("15/10/2026", "FX_ERR_004")]
        public async Task Deleting_a_missing_or_badly_written_day_fails(string date, string errorCode)
        {
            var result = await new DeleteDailyRateHandler(_unitOfWork).Handle(new DeleteDailyRateCommand { Date = date }, CancellationToken.None);

            Assert.False(result.Succeeded);
            Assert.Equal(errorCode, result.ErrorCode);
            Assert.Equal(0, _unitOfWork.Commits);
        }

        [Fact]
        public async Task All_daily_rates_are_listed_newest_first()
        {
            _unitOfWork.WithDailyRate(new DateOnly(2026, 9, 1), 1.1m).WithDailyRate(new DateOnly(2026, 10, 2), 1.2m);

            var result = await new GetDailyRatesHandler(_unitOfWork).Handle(new GetDailyRatesQuery(), CancellationToken.None);

            Assert.Equal(["2026-10-02", "2026-09-01"], result.Data!.Select(r => r.Date));
            Assert.Equal([1.2m, 1.1m], result.Data!.Select(r => r.EurToUsd));
        }

        // ---- Lịch theo ngày

        [Fact]
        public async Task The_calendar_has_every_day_of_the_month_with_the_rate_in_use()
        {
            _unitOfWork.WithMonthlyRate("2026-10", 1.16m)
                .WithDailyRate(new DateOnly(2026, 10, 15), 1.17m)
                .WithDailyRate(new DateOnly(2026, 11, 1), 1.5m);
            _ecb.Daily[new DateOnly(2026, 10, 15)] = 1.1208m;
            _ecb.Daily[new DateOnly(2026, 9, 30)] = 1.1m;

            var result = await new GetDayTableHandler(_unitOfWork, _ecb).Handle(new GetDayTableQuery { Month = "2026-10" }, CancellationToken.None);

            var days = result.Data!;
            Assert.Equal(31, days.Count);
            Assert.Equal("2026-10-01", days[0].Date);
            Assert.Equal("2026-10-31", days[^1].Date);
            var own = days.Single(d => d.Date == "2026-10-15");
            Assert.Equal((1.17m, 1.16m, 1.1208m, 1.17m, "DAILY"), (own.Manual, own.Monthly, own.Ecb, own.Used, own.Source));
            var other = days.Single(d => d.Date == "2026-10-16");
            Assert.Equal(((decimal?)null, (decimal?)null, 1.16m, "MONTHLY"), (other.Manual, other.Ecb, other.Used, other.Source));
        }

        [Fact]
        public async Task A_month_without_any_typed_rate_uses_one_to_one()
        {
            var result = await new GetDayTableHandler(_unitOfWork, _ecb).Handle(new GetDayTableQuery { Month = "2026-02" }, CancellationToken.None);

            Assert.Equal(28, result.Data!.Count);
            Assert.All(result.Data, d => Assert.Equal((null, 1m, "DEFAULT"), (d.Monthly, d.Used, d.Source)));
        }

        // ---- Tỷ giá hôm nay (24/10/2026)

        private async Task<Fin.Model.Dto.Finance.Responses.FxCurrentResponse> CurrentAsync()
        {
            var result = await new GetCurrentRateHandler(_unitOfWork, _ecb, new FixedTimeProvider(new DateTime(2026, 10, 24, 10, 0, 0)))
                .Handle(new GetCurrentRateQuery(), CancellationToken.None);
            return result.Data!;
        }

        [Fact]
        public async Task Today_uses_its_own_rate_first()
        {
            _unitOfWork.WithMonthlyRate("2026-10", 1.16m).WithDailyRate(new DateOnly(2026, 10, 24), 1.25m);

            var current = await CurrentAsync();

            Assert.Equal((1.25m, 0.8m, "2026-10-24", true, false), (current.EurToUsd, current.UsdToEur, current.Date, current.Manual, current.Auto));
        }

        [Fact]
        public async Task Today_without_its_own_rate_uses_the_month()
        {
            _unitOfWork.WithMonthlyRate("2026-10", 1.16m).WithDailyRate(new DateOnly(2026, 10, 23), 1.25m);

            var current = await CurrentAsync();

            Assert.Equal((1.16m, "2026-10", true), (current.EurToUsd, current.Date, current.Manual));
        }

        [Fact]
        public async Task Without_any_typed_rate_today_uses_ecb()
        {
            _ecb.Latest = new(1.12m, "2026-10-23", true);

            var current = await CurrentAsync();

            Assert.Equal((1.12m, "2026-10-23", false, true), (current.EurToUsd, current.Date, current.Manual, current.Auto));
        }

        // ---- Kiểm tra dữ liệu nhập

        [Theory]
        [InlineData("2026-10-15", 1.1712, true)]
        [InlineData("2026-10-15", 0.5, true)]
        [InlineData("2026-10-15", 3, true)]
        [InlineData("2026-10-15", 0.49, false)]
        [InlineData("2026-10-15", 11712, false)]
        [InlineData("2026-10-15", 0, false)]
        [InlineData("15/10/2026", 1.17, false)]
        [InlineData("2026-02-30", 1.17, false)]
        [InlineData("", 1.17, false)]
        public void A_daily_rate_needs_an_iso_day_and_a_sane_value(string date, double rate, bool valid)
        {
            var command = new SetDailyRateCommand { Date = date, EurToUsd = (decimal)rate };

            Assert.Equal(valid, new SetDailyRateValidator().Validate(command).IsValid);
        }

        [Theory]
        [InlineData("2026-10", true)]
        [InlineData("2026-13", false)]
        [InlineData("10/2026", false)]
        [InlineData(null, false)]
        public void The_calendar_needs_a_month(string? month, bool valid)
        {
            Assert.Equal(valid, new GetDayTableValidator().Validate(new GetDayTableQuery { Month = month }).IsValid);
        }
    }
}
