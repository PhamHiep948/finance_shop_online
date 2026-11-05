using Fin.Domain.Finance.Constants;
using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Options;
using Fin.Infrastructure.Shared.ErrorCodes;
using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Requests;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.Services;
using Fin.Service.Finance.UseCases.LedgerEntries.Commands;
using Fin.Service.Finance.UseCases.LedgerEntries.Commands.Handlers;
using Fin.Tests.Unit.Support;

namespace Fin.Tests.Unit.Services
{
    /// <summary>
    /// Kiểm tra tiền xưởng / tiền ship nhập ở khoản thu được lưu thành khoản chi gắn kèm, đúng loại chi người dùng chọn.
    /// </summary>
    public sealed class IncomeCostCategoryTests
    {
        private static readonly FixedTimeProvider Today = new(new DateTime(2026, 10, 24, 10, 0, 0));
        private readonly InMemoryFinanceUnitOfWork _unitOfWork = new InMemoryFinanceUnitOfWork()
            .WithCategory(CategoryKinds.Expense, "Tiền xưởng")
            .WithCategory(CategoryKinds.Expense, "Nguyên vật liệu")
            .WithCategory(CategoryKinds.Income, "Trang sức");

        /// <summary>Id của danh mục có loại <paramref name="kind"/> và tên <paramref name="name"/> trong dữ liệu giả.</summary>
        private long CategoryId(string kind, string name) => _unitOfWork.Categories.Single(x => x.Kind == kind && x.Name == name).Id;

        /// <summary>Thêm một khoản thu 100 USD vào dữ liệu giả, bán ở khu vực <paramref name="region"/>; trả về id.</summary>
        private long AddIncome(string region = SalesValues.RegionOutsideEu)
        {
            var income = new LedgerEntry { Kind = LedgerKinds.Income, Date = new DateOnly(2026, 10, 12), Description = "Lily", SaleRegion = region };
            income.SetAmounts(100m, 0, null);
            _unitOfWork.WithEntry(income);
            return income.Id;
        }

        /// <summary>Gọi handler lưu tiền xưởng / tiền ship (tắt khóa sổ) với số tiền và loại chi cho trước.</summary>
        private Task<Response<LedgerEntryResponse?>> SetCost(long incomeId, long? categoryId, decimal amount = 20m)
        {
            var periodLock = new PeriodLockPolicy(new StaticOptionsMonitor<PeriodLockOptions>(new PeriodLockOptions { Enabled = false }), Today);
            return new SetIncomeCostHandler(_unitOfWork, periodLock, new AuditTrail(_unitOfWork), Today).Handle(
                new SetIncomeCostCommand { IncomeId = incomeId, Payload = new IncomeCostRequest { Amount = amount, CategoryId = categoryId, Date = "2026-10-12" } },
                CancellationToken.None);
        }

        /// <summary>Khoản chi (chưa xóa) đang gắn với khoản thu <paramref name="incomeId"/>.</summary>
        private LedgerEntry Linked(long incomeId) => _unitOfWork.Entries.Single(x => x.LinkedIncomeId == incomeId && x.DeletedAt == null);

        [Fact]
        public async Task Picked_category_is_used_for_a_new_cost()
        {
            var incomeId = AddIncome();
            var material = CategoryId(CategoryKinds.Expense, "Nguyên vật liệu");

            var result = await SetCost(incomeId, material);

            Assert.True(result.Succeeded);
            Assert.Equal(material, Linked(incomeId).CategoryId);
        }

        [Fact]
        public async Task No_category_picked_uses_the_default_by_sale_region()
        {
            var outside = AddIncome();
            var inEu = AddIncome(SalesValues.RegionInEu);

            await SetCost(outside, null);
            await SetCost(inEu, null);

            Assert.Equal(CategoryId(CategoryKinds.Expense, "Tiền xưởng"), Linked(outside).CategoryId);
            Assert.Equal(CategoryId(CategoryKinds.Expense, "Phí ship"), Linked(inEu).CategoryId);
        }

        [Fact]
        public async Task Editing_the_cost_changes_the_category_only_when_one_is_picked()
        {
            var incomeId = AddIncome();
            var material = CategoryId(CategoryKinds.Expense, "Nguyên vật liệu");
            await SetCost(incomeId, null);

            await SetCost(incomeId, material, 25m);
            Assert.Equal(material, Linked(incomeId).CategoryId);

            await SetCost(incomeId, null, 30m);
            Assert.Equal(material, Linked(incomeId).CategoryId);
            Assert.Equal(30m, Linked(incomeId).AmountAfterTax);
        }

        [Fact]
        public async Task An_income_category_is_rejected()
        {
            var incomeId = AddIncome();

            var result = await SetCost(incomeId, CategoryId(CategoryKinds.Income, "Trang sức"));

            Assert.False(result.Succeeded);
            Assert.Equal(ErrorCodeEnum.CAT_ERR_005.ToString(), result.ErrorCode);
            Assert.DoesNotContain(_unitOfWork.Entries, x => x.LinkedIncomeId == incomeId);
        }
    }
}
