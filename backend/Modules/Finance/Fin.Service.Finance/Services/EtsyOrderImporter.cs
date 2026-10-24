using System.Globalization;
using Fin.Domain.Finance.Constants;
using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Finance.Mappers;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.Constants;

namespace Fin.Service.Finance.Services
{
    public sealed class EtsyOrderImporter
    {
        private readonly IFinanceUnitOfWork _unitOfWork;
        private readonly AuditTrail _auditTrail;

        public EtsyOrderImporter(IFinanceUnitOfWork unitOfWork, AuditTrail auditTrail)
        {
            _unitOfWork = unitOfWork;
            _auditTrail = auditTrail;
        }

        public async Task<EtsyImportResponse> ImportAsync(IReadOnlyCollection<EtsyOrderDto> orders, string auditNote, CancellationToken cancellationToken)
        {
            if (orders.Count == 0)
            {
                return new EtsyImportResponse(0, 0);
            }

            var existing = await _unitOfWork.LedgerEntryRepository.GetExistingOrderCodesAsync(
                SalesValues.ChannelEtsy, orders.Select(o => o.ReceiptId).ToList(), cancellationToken);
            var fresh = orders
                .Where(o => !existing.Contains(o.ReceiptId) && IsUsable(o))
                .DistinctBy(o => o.ReceiptId)
                .ToList();
            if (fresh.Count == 0)
            {
                return new EtsyImportResponse(0, orders.Count);
            }

            // Etsy orders are source data (read-only, never duplicated), so they are imported even into a locked
            // period: that is how the orders of a past month or quarter get filled in.
            await _unitOfWork.ExecuteInTransactionAsync(async () =>
            {
                var entries = fresh.Select(ToEntry).ToList();
                entries.ForEach(_unitOfWork.LedgerEntryRepository.Add);
                await _unitOfWork.CommitAsync(cancellationToken);
                foreach (var entry in entries)
                {
                    _auditTrail.Log(entry.Kind, entry.Id, AuditActions.Create, entry.Description, auditNote,
                        AuditTrail.Diff(null, LedgerEntryMapper.ToResponse(entry, 0)));
                }
                return true;
            }, cancellationToken);

            return new EtsyImportResponse(fresh.Count, orders.Count - fresh.Count);
        }

        private static bool IsUsable(EtsyOrderDto order) =>
            DateOnly.TryParseExact(order.Date, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out _)
            && !string.IsNullOrWhiteSpace(order.Description)
            && order.Amount >= 0;

        private static LedgerEntry ToEntry(EtsyOrderDto order)
        {
            var description = order.Description.Trim();
            var entry = new LedgerEntry
            {
                Kind = LedgerKinds.Income,
                Date = DateOnly.ParseExact(order.Date, FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture),
                Description = description.Length > FinanceConstants.DescriptionMaxLength ? description[..FinanceConstants.DescriptionMaxLength] : description,
                // Etsy has no product group: it starts empty and is filled in by hand.
                CategoryId = null,
                OrderCode = order.ReceiptId,
                SaleRegion = order.SaleRegion,
                SalesChannel = SalesValues.ChannelEtsy,
                ProductQty = order.Quantity,
                PaymentMethod = SalesValues.PaymentCreditCard,
                Source = EntrySources.Etsy,
                Details = new LedgerDetails
                {
                    ItemTotal = order.ItemTotal,
                    DiscountAmount = order.Discount,
                    Subtotal = order.Subtotal,
                    ShippingAmount = order.Shipping,
                    TaxAmount = order.Tax,
                    ReferenceCode = $"ETSY-{order.ReceiptId}",
                    Note = string.Join(" ", new[] { $"Nhập từ Etsy ({order.Country}, {order.Currency}).", order.Note }.Where(x => !string.IsNullOrEmpty(x))),
                },
            };
            entry.SetAmounts(order.Amount, order.TaxPercent, order.AmountAfterTax);
            return entry;
        }
    }
}
