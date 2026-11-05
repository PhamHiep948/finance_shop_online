namespace Fin.Model.Dto.Finance.Requests
{
    /// <summary>
    /// Dữ liệu tiền xưởng / tiền ship người dùng nhập ở khoản thu; backend lưu thành một khoản chi gắn với khoản thu đó.
    /// </summary>
    public sealed class IncomeCostRequest
    {
        /// <summary>Số tiền đã trả (đã gồm thuế). 0 = bỏ tiền xưởng / tiền ship của khoản thu.</summary>
        public decimal Amount { get; set; }

        /// <summary>% thuế nằm trong số tiền đã trả.</summary>
        public decimal TaxPercent { get; set; }

        /// <summary>Loại tiền của số tiền đã gõ (USD / EUR); để trống = USD. Lưu đúng số đã gõ, không quy đổi.</summary>
        public string? CurrencyCode { get; set; }

        /// <summary>Mã hóa đơn xưởng / mã vận đơn.</summary>
        public string? InvoiceId { get; set; }

        /// <summary>Ngày chi (yyyy-MM-dd); để trống = giữ ngày cũ, chưa có thì lấy ngày của khoản thu.</summary>
        public string? Date { get; set; }

        /// <summary>Bên nhận tiền (xưởng sản xuất, hãng vận chuyển…).</summary>
        public string? Payee { get; set; }

        /// <summary>Phạm vi nguồn (id phạm vi của khoản chi).</summary>
        public string? OriginScope { get; set; }

        /// <summary>
        /// Loại chi của khoản chi. Để trống: khoản mới tự lấy "Tiền xưởng" (ngoài EU) / "Phí ship" (trong EU),
        /// khoản đã có giữ nguyên loại chi.
        /// </summary>
        public long? CategoryId { get; set; }
    }
}
