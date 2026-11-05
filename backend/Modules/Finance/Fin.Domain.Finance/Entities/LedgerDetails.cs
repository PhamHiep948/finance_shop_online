namespace Fin.Domain.Finance.Entities
{
    public sealed class LedgerDetails
    {
        public string? ReferenceCode { get; set; }
        public decimal? UnitPrice { get; set; }
        public decimal? ItemTotal { get; set; }
        public decimal? DiscountAmount { get; set; }
        public string? DiscountCode { get; set; }
        public decimal? Subtotal { get; set; }
        public decimal? ShippingAmount { get; set; }
        public decimal? TaxAmount { get; set; }
        public string? Note { get; set; }
        public string? InvoiceId { get; set; }
        /// <summary>
        /// Chỉ dùng cho khoản chi quảng cáo Etsy: số tiền lấy từ Etsy lần cuối. Khi khoản chi vẫn đúng số này (và đúng
        /// <see cref="EtsyCurrency"/>) thì nó tự cập nhật theo Etsy; người dùng sửa tay thì không tự cập nhật nữa.
        /// </summary>
        public decimal? EtsyAmount { get; set; }

        /// <summary>Loại tiền của <see cref="EtsyAmount"/>; để trống = USD (khoản ghi trước khi có trường này).</summary>
        public string? EtsyCurrency { get; set; }
    }
}
