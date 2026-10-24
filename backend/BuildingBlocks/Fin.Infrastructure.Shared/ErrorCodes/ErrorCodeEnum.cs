using System.ComponentModel;

namespace Fin.Infrastructure.Shared.ErrorCodes
{
    public enum ErrorCodeEnum
    {
        #region Common
        [Description("Có lỗi xảy ra, vui lòng thử lại.")]
        COM_ERR_000,
        [Description("Kỳ này đã khóa sổ.")]
        COM_ERR_001,
        #endregion

        #region Category
        [Description("Không tìm thấy loại.")]
        CAT_ERR_001,
        [Description("Loại này đã tồn tại.")]
        CAT_ERR_002,
        [Description("Loại này đang được sử dụng.")]
        CAT_ERR_003,
        [Description("Thùng rác còn khoản thuộc loại này.")]
        CAT_ERR_004,
        [Description("Danh mục không thuộc loại thu/chi đã chọn.")]
        CAT_ERR_005,
        #endregion

        #region Category group
        [Description("Không tìm thấy nhóm.")]
        GRP_ERR_001,
        [Description("Nhóm này đã tồn tại.")]
        GRP_ERR_002,
        #endregion

        #region Ledger entry
        [Description("Không tìm thấy khoản thu / chi.")]
        LED_ERR_001,
        [Description("Khoản nhập từ Etsy không được sửa, chỉ có thể xóa.")]
        LED_ERR_002,
        [Description("Kiểm tra lại số tiền và % thuế.")]
        LED_ERR_003,
        #endregion

        #region Attachment
        [Description("Không tìm thấy chứng từ.")]
        ATT_ERR_001,
        [Description("Chưa chọn file nào.")]
        ATT_ERR_002,
        [Description("Hãy gửi file dạng multipart/form-data.")]
        ATT_ERR_003,
        [Description("File không hợp lệ.")]
        ATT_ERR_004,
        #endregion

        #region Trash
        [Description("Không tìm thấy khoản trong thùng rác.")]
        TRS_ERR_001,
        #endregion

        #region Exchange rate
        [Description("Tháng phải có dạng yyyy-MM.")]
        FX_ERR_001,
        [Description("Mỗi lần xem tối đa 36 tháng.")]
        FX_ERR_002,
        [Description("Không tìm thấy tỷ giá của tháng này.")]
        FX_ERR_003,
        [Description("Ngày phải có dạng yyyy-MM-dd.")]
        FX_ERR_004,
        [Description("Không tìm thấy tỷ giá của ngày này.")]
        FX_ERR_005,
        #endregion

        #region Etsy
        [Description("Chưa kết nối Etsy: điền key và bấm \"Kết nối Etsy\" trước.")]
        ETS_ERR_001,
        [Description("Chưa chọn đơn nào để nhập.")]
        ETS_ERR_002,
        #endregion
    }
}
