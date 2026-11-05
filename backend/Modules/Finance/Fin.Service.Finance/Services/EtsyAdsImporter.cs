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
    // Keeps one expense entry of category "Quảng cáo" per month in step with the Etsy advertising of that month:
    // created as soon as there is a charge, then updated while Etsy adds charges (the running month) or credits.
    // An entry the user corrected by hand, deleted, or that lies in a locked period is left as it is.
    public sealed class EtsyAdsImporter
    {
        private const string AdsCategory = "Quảng cáo";
        private const string FallbackCategory = "Chi khác";

        private readonly IFinanceUnitOfWork _unitOfWork;
        private readonly IEtsyClient _etsyClient;
        private readonly AuditTrail _auditTrail;
        private readonly IOptionsMonitor<EtsyOptions> _options;
        private readonly TimeProvider _timeProvider;
        private readonly PeriodLockPolicy _periodLock;

        public EtsyAdsImporter(IFinanceUnitOfWork unitOfWork, IEtsyClient etsyClient, AuditTrail auditTrail, IOptionsMonitor<EtsyOptions> options,
            TimeProvider timeProvider, PeriodLockPolicy periodLock)
        {
            _unitOfWork = unitOfWork;
            _etsyClient = etsyClient;
            _auditTrail = auditTrail;
            _options = options;
            _timeProvider = timeProvider;
            _periodLock = periodLock;
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
            var expenses = await ExpensesAsync(months, cancellationToken);
            foreach (var month in months)
            {
                if (expenses.TryGetValue(EtsyAdsCalculator.OrderCode(month.Month), out var expense))
                {
                    month.Imported = true;
                    month.ExpenseId = expense.Id;
                    month.ExpenseAmount = expense.Amount;
                    month.ExpenseCurrency = expense.CurrencyCode;
                    month.Deleted = expense.IsDeleted;
                    month.Edited = IsEditedByHand(expense, month);
                }
            }

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

        /// <summary>
        /// Cập nhật khoản chi quảng cáo của các tháng <paramref name="fromMonth"/>..<paramref name="toMonth"/> theo Etsy:
        /// tháng có phí mà chưa có khoản chi thì thêm; khoản đã có thì cập nhật số tiền và loại tiền theo Etsy.
        /// Bỏ qua khoản đã xóa, khoản người dùng đã sửa tay, và khoản thuộc kỳ đã khóa sổ.
        /// Khoản cũ chưa nhớ số Etsy mà vẫn đúng số Etsy thì chỉ ghi nhớ lại (không tính là thay đổi).
        /// </summary>
        public async Task<EtsyAdsSyncResponse> SyncAsync(DateOnly fromMonth, DateOnly toMonth, string auditNote, CancellationToken cancellationToken)
        {
            var fees = await GetAsync(fromMonth, toMonth.AddMonths(1).AddDays(-1), cancellationToken);
            var expenses = await ExpensesAsync(fees.Months, cancellationToken);
            var fresh = new List<EtsyAdsMonthDto>();
            var changed = new List<(LedgerEntry Entry, LedgerEntryResponse? Before)>();
            foreach (var month in fees.Months)
            {
                if (!expenses.TryGetValue(EtsyAdsCalculator.OrderCode(month.Month), out var expense))
                {
                    if (month.StoredAmount > 0)
                    {
                        fresh.Add(month);
                    }
                    continue;
                }
                if (expense.IsDeleted || IsEditedByHand(expense, month) || _periodLock.Check(expense.Date) is not null)
                {
                    continue;
                }
                if (expense.Amount == month.StoredAmount && expense.CurrencyCode == month.StoredCurrency)
                {
                    if (expense.Details.EtsyAmount != month.StoredAmount || expense.Details.EtsyCurrency != month.StoredCurrency)
                    {
                        expense.Details = Copy(expense.Details, d => (d.EtsyAmount, d.EtsyCurrency) = (month.StoredAmount, month.StoredCurrency));
                        changed.Add((expense, null));
                    }
                    continue;
                }
                var before = LedgerEntryMapper.ToResponse(expense, 0);
                expense.CurrencyCode = month.StoredCurrency;
                expense.SetAmounts(month.StoredAmount, expense.TaxPercent);
                expense.Details = Copy(expense.Details, d =>
                {
                    (d.EtsyAmount, d.EtsyCurrency) = (month.StoredAmount, month.StoredCurrency);
                    d.Note = Note(month);
                });
                changed.Add((expense, before));
            }
            if (fresh.Count == 0 && changed.Count == 0)
            {
                return new EtsyAdsSyncResponse(0, 0);
            }

            var categoryId = await _unitOfWork.CategoryRepository.FindIdByNameAsync(CategoryKinds.Expense, AdsCategory, cancellationToken)
                ?? await _unitOfWork.CategoryRepository.FindIdByNameAsync(CategoryKinds.Expense, FallbackCategory, cancellationToken);

            // Like Etsy orders, these are source data and may be filled into a locked period.
            await _unitOfWork.ExecuteInTransactionAsync(async () =>
            {
                var created = fresh.Select(m => ToEntry(m, categoryId)).ToList();
                created.ForEach(_unitOfWork.LedgerEntryRepository.Add);
                await _unitOfWork.CommitAsync(cancellationToken);
                foreach (var entry in created)
                {
                    _auditTrail.Log(entry.Kind, entry.Id, AuditActions.Create, entry.Description, auditNote,
                        AuditTrail.Diff(null, LedgerEntryMapper.ToResponse(entry, 0)));
                }
                foreach (var (entry, before) in changed.Where(c => c.Before is not null))
                {
                    _auditTrail.Log(entry.Kind, entry.Id, AuditActions.Update, entry.Description, auditNote,
                        AuditTrail.Diff(before, LedgerEntryMapper.ToResponse(entry, 0)));
                }
                return true;
            }, cancellationToken);

            return new EtsyAdsSyncResponse(fresh.Count, changed.Count(c => c.Before is not null));
        }

        // Etsy ad expenses of these months by order code (ADS-yyyy-MM), deleted ones included.
        private async Task<Dictionary<string, LedgerEntry>> ExpensesAsync(IEnumerable<EtsyAdsMonthDto> months, CancellationToken cancellationToken)
        {
            var entries = await _unitOfWork.LedgerEntryRepository.GetByOrderCodesAsync(
                LedgerKinds.Expense, SalesValues.ChannelEtsy, months.Select(m => EtsyAdsCalculator.OrderCode(m.Month)).ToList(), cancellationToken);
            return entries
                .GroupBy(e => e.OrderCode!)
                // Two entries for one month should not exist; prefer the one still in use.
                .ToDictionary(g => g.Key, g => g.OrderBy(e => e.IsDeleted).ThenBy(e => e.Id).First());
        }

        /// <summary>
        /// Người dùng đã sửa tay khoản chi quảng cáo chưa: số tiền hoặc loại tiền không còn khớp với lần lấy từ Etsy gần
        /// nhất. Khoản ghi trước khi có trường ghi nhớ thì coi là chưa sửa nếu vẫn đúng số Etsy hiện tại, tính theo USD
        /// (cách lưu cũ) hoặc theo loại tiền gốc.
        /// </summary>
        private static bool IsEditedByHand(LedgerEntry expense, EtsyAdsMonthDto month)
        {
            if (expense.Details.EtsyAmount is { } synced)
            {
                return expense.Amount != synced || expense.CurrencyCode != (expense.Details.EtsyCurrency ?? SalesValues.DefaultCurrency);
            }
            var oldWay = expense.CurrencyCode == SalesValues.DefaultCurrency && expense.Amount == month.AdsUsd;
            var newWay = expense.CurrencyCode == month.StoredCurrency && expense.Amount == month.StoredAmount;
            return !oldWay && !newWay;
        }

        private static LedgerDetails Copy(LedgerDetails details, Action<LedgerDetails> change)
        {
            var copy = new LedgerDetails
            {
                ReferenceCode = details.ReferenceCode, UnitPrice = details.UnitPrice, ItemTotal = details.ItemTotal,
                DiscountAmount = details.DiscountAmount, DiscountCode = details.DiscountCode, Subtotal = details.Subtotal,
                ShippingAmount = details.ShippingAmount, TaxAmount = details.TaxAmount, Note = details.Note,
                InvoiceId = details.InvoiceId, EtsyAmount = details.EtsyAmount, EtsyCurrency = details.EtsyCurrency,
            };
            change(copy);
            return copy;
        }

        /// <summary>
        /// Ghi chú của khoản chi quảng cáo: tổng phí tháng theo loại tiền Etsy Payments, số đã quy sang USD (chỉ khi phải
        /// ghi bằng USD), và tháng chưa hết thì số tiền còn tự cập nhật.
        /// </summary>
        private string Note(EtsyAdsMonthDto month)
        {
            var label = $"{month.Month[5..]}/{month.Month[..4]}";
            var note = $"Tổng phí quảng cáo (Etsy Ads, Offsite Ads) tháng {label} lấy từ Etsy Payments: "
                + $"{month.Ads.ToString("0.00", CultureInfo.InvariantCulture)} {month.Currency}.";
            if (!month.StoredCurrency.Equals(month.Currency, StringComparison.OrdinalIgnoreCase))
            {
                note += $" Quy đổi ra {month.AdsUsd.ToString("0.00", CultureInfo.InvariantCulture)} USD theo tỷ giá ngày / tháng tự nhập (chưa nhập tính 1 EUR = 1 USD).";
            }
            if (!month.Complete)
            {
                note += $" Tháng chưa hết: số tiền tự cập nhật theo Etsy (lần cuối {Today.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture)}).";
            }
            return note;
        }

        private LedgerEntry ToEntry(EtsyAdsMonthDto month, long? categoryId)
        {
            var label = $"{month.Month[5..]}/{month.Month[..4]}";
            var code = EtsyAdsCalculator.OrderCode(month.Month);
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
                CurrencyCode = month.StoredCurrency,
                Details = new LedgerDetails { ReferenceCode = code, Note = Note(month), EtsyAmount = month.StoredAmount, EtsyCurrency = month.StoredCurrency },
            };
            entry.SetAmounts(month.StoredAmount, 0);
            return entry;
        }
    }
}
