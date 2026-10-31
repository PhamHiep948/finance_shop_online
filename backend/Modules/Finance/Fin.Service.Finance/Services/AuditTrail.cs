using System.Globalization;
using System.Text.Json;
using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Model.Dto.Finance.Responses;

namespace Fin.Service.Finance.Services
{
    public sealed class AuditTrail
    {
        private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

        private static readonly (string Field, Func<LedgerEntryResponse, object?> Value)[] TrackedFields =
        [
            ("date", x => x.Date),
            ("description", x => x.Description),
            ("categoryId", x => x.CategoryId),
            ("amount", x => x.Amount),
            ("taxPercent", x => x.TaxPercent),
            ("amountAfterTax", x => x.AmountAfterTax),
            ("currencyCode", x => x.CurrencyCode),
            ("orderCode", x => x.OrderCode),
            ("saleRegion", x => x.SaleRegion),
            ("salesChannel", x => x.SalesChannel),
            ("productQty", x => x.ProductQty),
            ("payee", x => x.Payee),
            ("originScope", x => x.OriginScope),
            ("paymentMethod", x => x.PaymentMethod),
            ("referenceCode", x => x.ReferenceCode),
            ("unitPrice", x => x.UnitPrice),
            ("itemTotal", x => x.ItemTotal),
            ("discountAmount", x => x.DiscountAmount),
            ("discountCode", x => x.DiscountCode),
            ("subtotal", x => x.Subtotal),
            ("shippingAmount", x => x.ShippingAmount),
            ("taxAmount", x => x.TaxAmount),
            ("note", x => x.Note),
            ("invoiceId", x => x.InvoiceId),
        ];

        private static readonly HashSet<string> MoneyFields =
            ["amount", "amountAfterTax", "unitPrice", "itemTotal", "discountAmount", "subtotal", "shippingAmount", "taxAmount"];

        private readonly IFinanceUnitOfWork _unitOfWork;

        public AuditTrail(IFinanceUnitOfWork unitOfWork)
        {
            _unitOfWork = unitOfWork;
        }

        public void Log(string entityType, long entityId, string action, string label, string? detail = null,
            IReadOnlyDictionary<string, AuditChange>? changes = null)
        {
            _unitOfWork.AuditLogRepository.Add(new AuditLog
            {
                EntityType = entityType,
                EntityId = entityId,
                Action = action,
                Label = label.Length > AuditLog.LabelMaxLength ? label[..AuditLog.LabelMaxLength] : label,
                Detail = detail,
                Changes = changes is { Count: > 0 } ? JsonSerializer.Serialize(changes, JsonOptions) : null,
            });
        }

        public static Dictionary<string, AuditChange> Diff(LedgerEntryResponse? before, LedgerEntryResponse? after)
        {
            var changes = new Dictionary<string, AuditChange>();
            foreach (var (field, value) in TrackedFields)
            {
                var from = Normalize(before is null ? null : value(before));
                var to = Normalize(after is null ? null : value(after));
                if (from != to)
                {
                    changes[field] = new AuditChange(from, to);
                }
            }
            // Amounts are kept in the currency they were typed in: a changed amount always says which currency it is in,
            // even when the currency itself did not change (the history page shows it as € / $, not as a change).
            if (after is not null && Normalize(after.CurrencyCode) is { } currency
                && !changes.ContainsKey("currencyCode") && changes.Keys.Any(MoneyFields.Contains))
            {
                changes["currencyCode"] = new AuditChange(currency, currency);
            }
            return changes;
        }

        public static Dictionary<string, AuditChange> NameChange(string? from, string to) => new() { ["name"] = new AuditChange(from, to) };

        // Values are compared as text: "29.00" and 29 are the same amount, and an empty string counts as no value.
        private static string? Normalize(object? value)
        {
            var text = value switch
            {
                null => null,
                IFormattable formattable => formattable.ToString(null, CultureInfo.InvariantCulture),
                _ => value.ToString(),
            };
            text = text?.Trim();
            if (string.IsNullOrEmpty(text))
            {
                return null;
            }
            return decimal.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out var number)
                ? number.ToString("0.##########", CultureInfo.InvariantCulture)
                : text;
        }
    }
}
