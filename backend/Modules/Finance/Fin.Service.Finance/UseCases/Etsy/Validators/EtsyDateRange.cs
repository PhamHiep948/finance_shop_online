using System.Globalization;
using Fin.Service.Finance.Constants;

namespace Fin.Service.Finance.UseCases.Etsy.Validators
{
    // Shared rule of the Etsy pages: two days (yyyy-MM-dd), at most one year apart in either order.
    internal static class EtsyDateRange
    {
        public const int MaxDays = 366;
        public const string DateMessage = "Ngày phải có dạng yyyy-MM-dd.";
        public const string LengthMessage = "Mỗi lần xem tối đa 1 năm.";

        public static bool IsDate(string? value) => TryParse(value, out _);

        public static bool IsShortEnough(string? from, string? to) =>
            !TryParse(from, out var a) || !TryParse(to, out var b) || Math.Abs(b.DayNumber - a.DayNumber) <= MaxDays;

        private static bool TryParse(string? value, out DateOnly date) =>
            DateOnly.TryParseExact(value, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out date);
    }
}
