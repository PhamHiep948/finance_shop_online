// Dữ liệu tĩnh, định dạng số/tiền/ngày và các hàm tính toán dùng chung.
// Tỷ giá USD → EUR; giá trị tạm, được thay bằng tỷ giá ECB mới nhất khi tải trang (loadFx trong store.js).
let FX_USD_TO_EUR = 0.92;
let FX_DATE = "";
// Tỷ giá tự nhập theo tháng: { "yyyy-MM": số USD của 1 EUR } (trang Tỷ giá). Tháng chưa nhập dùng FX_USD_TO_EUR.
let FX_MONTHLY = {};
// Tỷ giá tự nhập cho riêng một ngày: { "yyyy-MM-dd": số USD của 1 EUR }; ngày có số này không dùng tỷ giá tháng.
let FX_DAILY = {};
// Phạm vi khoản chi (sửa được), nhóm loại cho báo cáo: tải từ backend trong reload().
const SCOPES = [];
const CATEGORY_GROUPS = [];
const INCOME_CATEGORIES = [{ id: 1, name: "Bán hàng" }, { id: 2, name: "Thu khác" }];
const EXPENSE_CATEGORIES = [
  { id: 3, name: "Nguyên vật liệu" }, { id: 4, name: "Bao bì / đóng gói" },
  { id: 5, name: "Vận chuyển" }, { id: 6, name: "Quảng cáo" },
  { id: 7, name: "Phí dịch vụ" }, { id: 8, name: "Lương nhân viên" },
  { id: 9, name: "Điện / nước / Internet" }, { id: 10, name: "Thuê mặt bằng" },
  { id: 11, name: "Công cụ / thiết bị" }, { id: 12, name: "Chi khác" },
];

const CHART_INCOME = "#0071e3";
const CHART_EXPENSE = "#b3261e";
const CHART_PALETTE = ["#0071e3", "#b3261e", "#1d7a4c", "#9a6700", "#0058b8", "#2b93f0"];

/** Escape chuỗi trước khi chèn vào HTML. */
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const INCOME_COLS = [
  { id: "order", label: "Mã đơn", def: true },
  { id: "product", label: "Sản phẩm", def: true, lock: true },
  { id: "category", label: "Nhóm sản phẩm", def: true },
  { id: "date", label: "Ngày", def: true },
  { id: "region", label: "Khu vực", def: true },
  { id: "qty", label: "SL", def: true },
  { id: "item", label: "Giá bán", def: true },
  { id: "discount", label: "Giảm giá", def: true },
  { id: "subtotal", label: "Thành tiền", def: false },
  { id: "ship", label: "Vận chuyển", def: false },
  { id: "amount", label: "Trước thuế", def: false },
  { id: "taxPercent", label: "% thuế", def: true },
  { id: "tax", label: "Thuế (tiền)", def: false },
  { id: "afterTax", label: "Sau thuế", def: true },
  { id: "fx", label: "Tỷ giá", def: true },
  { id: "costBefore", label: "Xưởng / Ship trước thuế", def: true },
  { id: "costTax", label: "Thuế xưởng / ship", def: true },
  { id: "cost", label: "Xưởng / Ship sau thuế", def: true },
  { id: "profit", label: "Lợi nhuận", def: true },
  { id: "source", label: "Nguồn", def: true },
];
const EXPENSE_COLS = [
  { id: "product", label: "Nội dung", def: true, lock: true },
  { id: "payee", label: "Bên nhận", def: true },
  { id: "category", label: "Loại chi", def: true },
  { id: "date", label: "Ngày", def: true },
  { id: "origin", label: "Phạm vi", def: true },
  { id: "invoice", label: "ID hóa đơn", def: true },
  { id: "amount", label: "Trước thuế", def: false },
  { id: "taxPercent", label: "% thuế", def: true },
  { id: "afterTax", label: "Sau thuế", def: true },
  { id: "source", label: "Nguồn", def: true },
];

function colDefs(kind) {
  return kind === "expense" ? EXPENSE_COLS : INCOME_COLS;
}
function defaultColMap(kind) {
  return Object.fromEntries(colDefs(kind).map((c) => [c.id, Boolean(c.def)]));
}
function loadCols(kind) {
  const base = defaultColMap(kind);
  try {
    const saved = JSON.parse(localStorage.getItem("fm_cols_v3_" + kind) || "null");
    if (!saved || typeof saved !== "object") return base;
    colDefs(kind).forEach((c) => {
      if (c.lock) base[c.id] = true;
      else if (saved[c.id] != null) base[c.id] = Boolean(saved[c.id]);
    });
  } catch {
    /* ignore */
  }
  return base;
}
function loadColOrder(kind) {
  const ids = colDefs(kind).map((c) => c.id);
  try {
    const saved = JSON.parse(localStorage.getItem("fm_col_order_v3_" + kind) || "null");
    if (!Array.isArray(saved)) return ids;
    return [...saved.filter((id) => ids.includes(id)), ...ids.filter((id) => !saved.includes(id))];
  } catch {
    return ids;
  }
}
function saveCols(kind, map, order) {
  localStorage.setItem("fm_cols_v3_" + kind, JSON.stringify(map));
  if (Array.isArray(order)) localStorage.setItem("fm_col_order_v3_" + kind, JSON.stringify(order));
}

/**
 * Làm tròn 2 chữ số, nửa xa số 0 (giống MidpointRounding.AwayFromZero của backend).
 * Bỏ sai số dấu phẩy động trước khi làm tròn: 1.005 * 100 = 100.49999… phải ra 1.01 chứ không phải 1.00.
 */
function round2(n) {
  const v = Number(n) || 0;
  return (Math.sign(v) * Math.round(Number((Math.abs(v) * 100).toPrecision(12)))) / 100;
}
function afterTax(amount, pct) {
  return round2((Number(amount) || 0) * (1 + (Number(pct) || 0) / 100));
}
const AUTO_MONEY_TITLE = "Tự tính (không có số từ Etsy / chưa nhập): đơn giá × số lượng, thành tiền + giảm giá";
/**
 * Giá bán (tổng giá sản phẩm, chưa trừ giảm giá) của khoản thu: `{ value, auto }`, không đủ dữ liệu thì null.
 * Ưu tiên số đã lưu (đơn Etsy: total_price lấy từ Etsy); thiếu thì tự tính = đơn giá × số lượng,
 * hoặc thành tiền + giảm giá. `auto` = true khi là số tự tính.
 */
function itemTotalOf(r) {
  const saved = Number(r.itemTotal);
  if (saved) return { value: saved, auto: false };
  const unit = Number(r.unitPrice);
  if (unit) return { value: round2(unit * (Number(r.productQty) || 1)), auto: true };
  const sub = Number(r.subtotal);
  if (sub) return { value: round2(sub + (Number(r.discountAmount) || 0)), auto: true };
  return null;
}
/** Giảm giá của khoản thu: số đã lưu (đơn Etsy: discount_amt), thiếu thì tự tính = giá bán − thành tiền; không có thì null. */
function discountOf(r) {
  const saved = Number(r.discountAmount);
  if (saved) return { value: saved, auto: false };
  const item = itemTotalOf(r);
  const sub = Number(r.subtotal);
  return item && sub && item.value > sub ? { value: round2(item.value - sub), auto: true } : null;
}
/** Thành tiền = giá bán − giảm giá; chưa có giá bán thì dùng số đã lưu, không có thì null. */
function subtotalOf(r) {
  const item = itemTotalOf(r);
  if (item) return round2(item.value - (discountOf(r)?.value || 0));
  const saved = Number(r.subtotal);
  return saved || null;
}
function afterTaxOf(r) {
  // Dùng số sau thuế đã lưu (đơn Etsy trong EU: tiền nhận về đã là tiền sau thuế), không có thì tự tính.
  const saved = Number(r.amountAfterTax);
  return r.amountAfterTax != null && Number.isFinite(saved) ? saved : afterTax(r.amount, r.taxPercent);
}
/**
 * Tỷ giá 1 EUR = ? USD dùng cho ngày `iso` (không truyền = hôm nay): tỷ giá tự nhập của riêng ngày đó,
 * không có thì tỷ giá tự nhập của tháng. Tháng chưa nhập (vd tháng hiện tại chưa có thông báo) mặc định là 1.
 */
function eurToUsdOn(iso) {
  const day = String(iso || localISO(new Date()));
  const daily = Number(FX_DAILY[day.slice(0, 10)]);
  if (daily > 0) return daily;
  const manual = Number(FX_MONTHLY[day.slice(0, 7)]);
  return manual > 0 ? manual : 1;
}
/** Ngày `iso` có tỷ giá tự nhập riêng không. */
const hasDailyRate = (iso) => Number(FX_DAILY[String(iso || "").slice(0, 10)]) > 0;
/** Tháng của `iso` đã tự nhập tỷ giá chưa. */
const hasMonthlyRate = (iso) => Number(FX_MONTHLY[String(iso || "").slice(0, 7)]) > 0;
/** USD → tiền hiển thị. Có `iso` thì quy đổi theo tỷ giá của tháng đó (như Excel: USD ÷ tỷ giá tháng). */
function toDisplay(n, ccy, iso) {
  const v = Number(n) || 0;
  return ccy === "EUR" ? round2(v / eurToUsdOn(iso)) : v;
}
function fromDisplay(n, ccy, iso) {
  if (n === "" || n == null) return null;
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return ccy === "EUR" ? round2(v * eurToUsdOn(iso)) : round2(v);
}
function fromDisplayNum(n, ccy, fallback = 0, iso) {
  const v = fromDisplay(n, ccy, iso);
  return v == null ? fallback : v;
}
function money(n, ccy, iso) {
  return fmtCcy(toDisplay(n, ccy, iso), ccy);
}
/** Định dạng số đã ở đúng loại tiền `ccy` (không quy đổi). */
function fmtCcy(v, ccy) {
  if (ccy === "EUR") return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(v) || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v) || 0);
}
function usd(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n) || 0);
}
const pctLabel = (n) => `${Number(n) || 0}%`;
const dmy = (iso) => (iso || "").split("-").reverse().join("/");
const sourceLabel = (v) => (v === "ETSY" ? "Etsy" : v === "EXCEL_IMPORT" ? "Excel" : v === "LINKED" ? "Từ khoản thu" : "Nhập tay");
const ETSY_READONLY = "Khoản nhập từ Etsy không được sửa, chỉ có thể xóa.";
/** Khoản chi phí quảng cáo Etsy của một tháng (mã ADS-yyyy-MM): nhập từ Etsy nhưng sửa được số tiền. */
const isEtsyAds = (r) => r?.source === "ETSY" && String(r.orderCode || "").startsWith("ADS-");
/** Khoản Etsy bị khóa sửa (đơn hàng); phí quảng cáo thì không. */
const isEtsyLocked = (r) => r?.source === "ETSY" && !isEtsyAds(r);
/** Mã đơn dạng link mở trang chi tiết đơn trong Shop Manager của Etsy (tab mới). Không phải đơn Etsy thì chỉ hiện mã. */
function orderCodeHtml(code, isEtsy) {
  if (!code) return '<span class="cell-code">—</span>';
  if (!isEtsy || !/^\d+$/.test(String(code))) return `<span class="cell-code">${esc(code)}</span>`;
  const url = `https://www.etsy.com/your/orders/sold?order_id=${encodeURIComponent(code)}`;
  return `<a class="cell-code etsy-order-link" href="${url}" target="_blank" rel="noopener" data-action="open-link"
    title="Mở đơn này trong Shop Manager của Etsy">${esc(code)}${icon("external-link", 11)}</a>`;
}
const saleRegionLabel = (v) => (v === "IN_EU" ? "Trong EU" : v === "OUTSIDE_EU" ? "Ngoài EU" : "—");
/** Tên phạm vi khoản chi; `v` là id phạm vi (dạng chuỗi). Dữ liệu cũ có thể còn mã DOMESTIC / INTERNATIONAL. */
const originScopeLabel = (v) =>
  SCOPES.find((x) => String(x.id) === String(v))?.name || (v === "INTERNATIONAL" ? "Quốc tế" : v === "DOMESTIC" ? "Nội địa" : "—");
/**
 * Các khoản chi tiền xưởng / tiền ship gắn với khoản thu `income` (USD): `total` = đã trả (gồm thuế),
 * `before` = trước thuế, `tax` = phần thuế (lấy total − before để trước thuế + thuế luôn khớp số đã trả).
 */
function costOf(income, expenses) {
  const items = expenses.filter((x) => x.linkedIncomeId != null && String(x.linkedIncomeId) === String(income.id));
  const total = round2(items.reduce((t, x) => t + afterTaxOf(x), 0));
  const before = round2(items.reduce((t, x) => t + Number(x.amount), 0));
  return { items, total, before, tax: round2(total - before) };
}
/**
 * Lợi nhuận của đơn (USD) = trước thuế − tiền xưởng trước thuế (ngoài EU) / tiền ship trước thuế (trong EU).
 * Phần thuế trong tiền xưởng / tiền ship được khấu trừ nên không trừ vào lợi nhuận.
 */
function profitOf(income, expenses) {
  return round2(Number(income.amount) - costOf(income, expenses).before);
}
/** Tên chi phí gắn với đơn: trong EU là tiền ship, ngoài EU là tiền xưởng. */
const costKindLabel = (income) => (income?.saleRegion === "IN_EU" ? "Tiền ship" : "Tiền xưởng");
const NO_GROUP = "Chưa phân nhóm";
function catName(list, id) {
  return list.find((c) => c.id === id)?.name || "—";
}
function catTone(id) {
  return `cat-tone-${Math.abs((Number(id) || 0) - 1) % 8}`;
}
function monthKey(iso) {
  return (iso || "").slice(0, 7);
}
function lastDayOfMonth(ym) {
  const [y, m] = String(ym).split("-").map(Number);
  const d = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function monthLabel(key) {
  const m = Number(key.slice(5));
  return Number.isFinite(m) ? `T${m}` : key;
}
function monthlyFrom(inc, exp) {
  const map = {};
  inc.forEach((x) => {
    const k = monthKey(x.incomeDate);
    if (!k) return;
    map[k] = map[k] || { key: k, m: monthLabel(k), income: 0, expense: 0 };
    map[k].income += Number(x.amount);
  });
  exp.forEach((x) => {
    const k = monthKey(x.expenseDate);
    if (!k) return;
    map[k] = map[k] || { key: k, m: monthLabel(k), income: 0, expense: 0 };
    map[k].expense += Number(x.amount);
  });
  return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
}
function groupByCat(list, cats) {
  const map = {};
  list.forEach((e) => {
    const n = e.categoryId == null ? NO_GROUP : catName(cats, e.categoryId);
    map[n] = (map[n] || 0) + e.amount;
  });
  const total = Object.values(map).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(map).map(([name, amount]) => ({
    name,
    amount,
    pct: Number(((amount / total) * 100).toFixed(1)),
  }));
}
function sum(list) {
  return list.reduce((a, x) => a + Number(x.amount), 0);
}
function inRange(date, from, to) {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}
function recStatus(id, kind, rec) {
  const code = rec?.recordStatus;
  if (code === "PENDING") return { k: "pending", t: "Chờ xử lý" };
  if (code === "DRAFT") return { k: "draft", t: "Bản nháp" };
  // Chưa lưu trạng thái riêng: khoản đã ghi vào sổ là đã hoàn thành.
  return { k: "done", t: kind === "expense" ? "Hoàn tất" : "Hoàn thành" };
}
function salesChannelLabel(v) {
  const map = {
    ETSY_STORE: "Etsy Store",
    WEBSITE_DIRECT: "Website Direct",
    INSTAGRAM_SHOP: "Instagram Shop",
    LOCAL_MARKET: "Local Market",
    B2B_WHOLESALE: "B2B Wholesale",
  };
  return map[v] || "—";
}
function paymentMethodLabel(v) {
  const map = {
    CREDIT_CARD: "Thẻ tín dụng",
    BANK_TRANSFER: "Chuyển khoản",
    CASH: "Tiền mặt",
    PAYPAL: "PayPal",
  };
  return map[v] || "—";
}
function valNum(v) {
  return v === 0 || v ? v : "";
}
/** Ngày theo giờ máy, dạng YYYY-MM-DD. */
function localISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** Sinh các <option>; `selected` so sánh dạng chuỗi. */
function optionsHtml(items, selected) {
  return items
    .map(([v, label]) => `<option value="${esc(v)}"${String(v) === String(selected ?? "") ? " selected" : ""}>${esc(label)}</option>`)
    .join("");
}
const CCY_OPTIONS = [["USD", "USD ($)"], ["EUR", "EUR (€)"]];

/**
 * Card "Phân bổ ngoại tệ": ước tính tỷ trọng doanh thu theo loại tiền dựa trên khu vực bán
 * (đơn bán trong EU coi là thu bằng EUR, còn lại USD). `cls` = class của khung card.
 */
function fxCardHtml(incomes, ccy, cls = "card") {
  const total = sum(incomes);
  const eur = sum(incomes.filter((x) => x.saleRegion === "IN_EU"));
  const eurPct = total ? Math.round((eur / total) * 100) : 0;
  const usdPct = total ? 100 - eurPct : 0;
  const row = (label, pct, amount, barCls, extra = "") => `
    <div class="fx-line"><span>${label}</span><b>${pct}% <em>· ${esc(money(amount, ccy))}</em></b></div>
    <div class="fx-bar"><div class="${barCls}" style="width: ${pct}%;${extra}"></div></div>`;
  return `
    <article class="${cls} fx-card">
      <h3 class="section-title">Phân bổ ngoại tệ</h3>
      <p class="muted">Tỷ trọng doanh thu theo loại tiền · ước tính theo khu vực bán (trong EU = EUR)</p>
      <div class="fx-row">
        ${row("$ USD (Đô la Mỹ)", usdPct, total - eur, "fx-usd")}
        ${row("€ EUR (Euro)", eurPct, eur, "fx-eur", " margin-left: auto")}
      </div>
    </article>`;
}

/**
 * Ô ngày gõ số dạng dd/mm/yyyy + nút lịch. Ô ngày có sẵn của trình duyệt báo "change" ngay khi gõ 1 chữ số
 * (gõ "2" đã thành 02) nên trang vẽ lại và mất số gõ tiếp; ô này chỉ áp dụng khi gõ xong (Enter / bấm ra ngoài).
 * Giá trị thật vẫn nằm trong <input type="date"> ẩn mang `nativeAttrs` (data-field, data-filter, name…),
 * nên các trang giữ nguyên cách đọc giá trị và bắt sự kiện "change" như cũ. Xử lý gõ phím: app.js.
 */
function dateFieldHtml(key, iso, nativeAttrs, label, cls = "") {
  return `
    <span class="date-field${cls ? ` ${cls}` : ""}">
      <input type="text" class="date-text" data-date-key="${esc(key)}" value="${esc(dmy(iso || ""))}" placeholder="dd/mm/yyyy"
        inputmode="numeric" maxlength="10" autocomplete="off" aria-label="${esc(label)}" />
      <button type="button" class="date-pick-btn" tabindex="-1" aria-label="Chọn ${esc(label.toLowerCase())} trên lịch">${icon("calendar", 15)}</button>
      <input type="date" class="date-native" ${nativeAttrs} value="${esc(iso || "")}" tabindex="-1" aria-hidden="true" />
    </span>`;
}

/** "29/9/2026", "29.09.26", "29092026" → "2026-09-29"; rỗng → ""; sai → null. */
function parseDmy(text) {
  const t = String(text || "").trim();
  if (!t) return "";
  const m = t.match(/^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{2}|\d{4})$/) || t.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]), y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? localISO(dt) : null;
}
