using System.Globalization;
using Fin.Domain.Finance.Constants;
using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Finance.Mappers;
using Fin.Infrastructure.Finance.Options;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.Constants;
using Microsoft.Extensions.Options;

namespace Fin.Service.Finance.Services
{
    // Turns the Etsy advertising of each finished month into one expense entry of category "Quảng cáo".
    public sealed class EtsyAdsImporter
    {
        private const string AdsCategory = "Quảng cáo";
        private const string FallbackCategory = "Chi khác";

        private readonly IFinanceUnitOfWork _unitOfWork;
        private readonly IEtsyClient _etsyClient;
        private readonly AuditTrail _auditTrail;
        private readonly IOptionsMonitor<EtsyOptions> _options;
        private readonly TimeProvider _timeProvider;

        public EtsyAdsImporter(IFinanceUnitOfWork unitOfWork, IEtsyClient etsyClient, AuditTrail auditTrail, IOptionsMonitor<EtsyOptions> options, TimeProvider timeProvider)
        {
            _unitOfWork = unitOfWork;
            _etsyClient = etsyClient;
            _auditTrail = auditTrail;
            _options = options;
            _timeProvider = timeProvider;
        }

        private DateOnly Today => DateOnly.FromDateTime(_timeProvider.GetLocalNow().DateTime);

        // Months lists every month that from..to touches (whole months); the Range* totals count only the days from..to.
        public async Task<EtsyFeesResponse> GetAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken)
        {
            var extraTypes = _options.CurrentValue.AdLedgerTypes;
            var monthStart = new DateOnly(from.Year, from.Month, 1);
            var monthEnd = new DateOnly(to.Year, to.Month, 1).AddMonths(1).AddDays(-1);
            var entries = await _etsyClient.GetLedgerEntriesAsync(monthStart, monthEnd, cancellationToken);
            var rates = await FxRateBook.LoadAsync(_unitOfWork, cancellationToken);
            var months = EtsyAdsCalculator.Months(entries, monthStart, monthEnd, Today, rates, extraTypes);
            var range = EtsyAdsCalculator.Range(entries, from, to, rates, extraTypes);
            var existing = await _unitOfWork.LedgerEntryRepository.GetExistingOrderCodesAsync(
                SalesValues.ChannelEtsy, months.Select(m => EtsyAdsCalculator.OrderCode(m.Month)).ToList(), cancellationToken, LedgerKinds.Expense);
            months.ForEach(m => m.Imported = existing.Contains(EtsyAdsCalculator.OrderCode(m.Month)));

            return new EtsyFeesResponse
            {
                From = from.ToString(FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture),
                To = to.ToString(FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture),
                RangeAds = range.Ads,
                RangeAdsUsd = range.AdsUsd,
                Currency = range.Currency,
                Months = months.OrderByDescending(m => m.Month, StringComparer.Ordinal).ToList(),
                Types = EtsyAdsCalculator.Types(entries, extraTypes),
            };
        }

        // `months` are the first days of the months to import.
        public async Task<EtsyImportResponse> ImportAsync(IReadOnlyCollection<DateOnly> months, string auditNote, CancellationToken cancellationToken)
        {
            var fees = await GetAsync(months.Min(), months.Max().AddMonths(1).AddDays(-1), cancellationToken);
            var wanted = months.Select(MonthKey.Of).ToHashSet();
            // Only finished months with a real charge become entries; one already imported (even if trashed) is skipped.
            var fresh = fees.Months.Where(m => wanted.Contains(m.Month) && m.Complete && !m.Imported && m.AdsUsd > 0).ToList();
            if (fresh.Count == 0)
            {
                return new EtsyImportResponse(0, wanted.Count);
            }

            var categoryId = await _unitOfWork.CategoryRepository.FindIdByNameAsync(CategoryKinds.Expense, AdsCategory, cancellationToken)
                ?? await _unitOfWork.CategoryRepository.FindIdByNameAsync(CategoryKinds.Expense, FallbackCategory, cancellationToken);

            // Like Etsy orders, these are source data and may be filled into a locked period.
            await _unitOfWork.ExecuteInTransactionAsync(async () =>
            {
                var entries = fresh.Select(m => ToEntry(m, categoryId)).ToList();
                entries.ForEach(_unitOfWork.LedgerEntryRepository.Add);
                await _unitOfWork.CommitAsync(cancellationToken);
                foreach (var entry in entries)
                {
                    _auditTrail.Log(entry.Kind, entry.Id, AuditActions.Create, entry.Description, auditNote,
                        AuditTrail.Diff(null, LedgerEntryMapper.ToResponse(entry, 0)));
                }
                return true;
            }, cancellationToken);

            return new EtsyImportResponse(fresh.Count, wanted.Count - fresh.Count);
        }

        private static LedgerEntry ToEntry(EtsyAdsMonthDto month, long? categoryId)
        {
            var label = $"{month.Month[5..]}/{month.Month[..4]}";
            var code = EtsyAdsCalculator.OrderCode(month.Month);
            var note = $"Tổng phí quảng cáo (Etsy Ads, Offsite Ads) tháng {label} lấy từ Etsy Payments: "
                + $"{month.Ads.ToString("0.00", CultureInfo.InvariantCulture)} {month.Currency}.";
            if (!month.Currency.Equals("USD", StringComparison.OrdinalIgnoreCase))
            {
                note += $" Quy đổi ra {month.AdsUsd.ToString("0.00", CultureInfo.InvariantCulture)} USD theo tỷ giá ngày / tháng tự nhập (chưa nhập tính 1 EUR = 1 USD).";
            }

            var entry = new LedgerEntry
            {
                Kind = LedgerKinds.Expense,
                Date = EtsyAdsCalculator.LastDay(month.Month),
                Description = $"Quảng cáo Etsy tháng {label}",
                CategoryId = categoryId,
                OrderCode = code,
                SalesChannel = SalesValues.ChannelEtsy,
                Payee = "Etsy",
                Source = EntrySources.Etsy,
                Details = new LedgerDetails { ReferenceCode = code, Note = note },
            };
            entry.SetAmounts(month.AdsUsd, 0);
            return entry;
        }
    }
}
