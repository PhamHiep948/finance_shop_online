// Trạng thái dùng chung của ứng dụng (thay cho FinanceProvider/useFinance).
const KIND = {
  income: { path: "/incomes", dateKey: "incomeDate", label: "khoản thu" },
  expense: { path: "/expenses", dateKey: "expenseDate", label: "khoản chi" },
};
// Các trường tiền của một khoản. Backend lưu đúng số và loại tiền (USD / EUR) lúc nhập; trong app mọi phép tính
// dùng USD, nên khi tải về các trường này được quy sang USD theo tỷ giá ngày của khoản (không làm tròn, để xem lại
// bằng EUR ra đúng số đã nhập). Số gốc giữ ở `orig`, loại tiền gốc ở `currency`.
const RECORD_MONEY_FIELDS = ["amount", "amountAfterTax", "unitPrice", "itemTotal", "discountAmount", "subtotal", "shippingAmount", "taxAmount"];
/** Quy lại các trường tiền (USD) của khoản `r` từ số gốc; gọi lại khi tỷ giá đổi. */
function withUsd(r, key) {
  const out = { ...r };
  RECORD_MONEY_FIELDS.forEach((f) => { if (f in r.orig) out[f] = usdOf(r.orig[f], r.currency, r[key]); });
  return out;
}
const mapRow = (key) => (r) => withUsd({
  ...r, [key]: r.date, taxPercent: Number(r.taxPercent), currency: currencyOf(r.currencyCode),
  orig: Object.fromEntries(RECORD_MONEY_FIELDS.filter((f) => f in r).map((f) => [f, r[f] == null || r[f] === "" ? r[f] : Number(r[f])])),
  recipient: r.payee || "", source: r.source || "MANUAL",
}, key);
/** Các trường tiền của khoản `r` đúng như đã lưu (số gốc + loại tiền gốc), để lưu lại mà không đổi số nào. */
const origMoney = (r) => ({ ...r.orig, currency: r.currency });
/** Các trường tiền của khoản `r` theo loại tiền `ccy` như đang hiện trên màn hình (cùng loại tiền gốc thì là số gốc). */
function shownMoney(r, ccy, iso) {
  if (r.currency === ccy) return origMoney(r);
  const out = { currency: ccy };
  RECORD_MONEY_FIELDS.forEach((f) => { if (f in r.orig) out[f] = r[f] == null || r[f] === "" ? r[f] : toDisplay(r[f], ccy, iso); });
  return out;
}
const bodyOf = (key, p) => ({
  ...p, date: p[key], description: p.description, categoryId: p.categoryId,
  amount: p.amount, taxPercent: p.taxPercent, amountAfterTax: p.amountAfterTax,
  currencyCode: currencyOf(p.currency), orderCode: p.orderCode || null,
  saleRegion: p.saleRegion || null, salesChannel: p.salesChannel || null,
  productQty: p.productQty || null, payee: p.recipient || null,
  originScope: p.originScope || null, paymentMethod: p.paymentMethod || null,
});

const store = {
  ccy: (() => { try { return localStorage.getItem("fm_ccy") === "EUR" ? "EUR" : "USD"; } catch { return "USD"; } })(),
  incomes: [], expenses: [], loading: true,
  // Khóa sổ theo quý hoặc tháng (lấy từ backend /settings).
  lock: { enabled: false, period: "QUARTER", graceDays: 1, today: localISO(new Date()) },
  // Trạng thái đồng bộ Etsy tự động (app.js hỏi backend mỗi phút); autoSeen = lần chạy đã báo cho người dùng.
  etsyAuto: null, etsyAutoSeen: undefined, etsyAdsSeen: undefined,
};

/** Số tháng của một kỳ khóa sổ (quý = 3, tháng = 1). */
function lockMonths() {
  return store.lock.period === "MONTH" ? 1 : 3;
}
/** [năm, tháng (0-11)] đầu kỳ chứa ngày `iso`. */
function periodStart(iso) {
  const [y, m] = String(iso).split("-").map(Number);
  const n = lockMonths();
  return [y, Math.floor((m - 1) / n) * n];
}
/** Ngày cuối cùng còn được sửa các khoản thuộc kỳ của `iso` (ngày GraceDays của kỳ sau). */
function lastEditableDay(iso) {
  const [y, m0] = periodStart(iso);
  return localISO(new Date(y, m0 + lockMonths(), store.lock.graceDays));
}
/** Khoản có ngày `iso` thuộc kỳ đã khóa sổ? */
function isLocked(iso) {
  return Boolean(store.lock.enabled && iso && store.lock.today > lastEditableDay(iso));
}
/** Ngày sớm nhất còn được nhập khoản mới. */
function firstOpenDate() {
  const [y, m0] = periodStart(store.lock.today);
  const prevPeriod = localISO(new Date(y, m0 - lockMonths(), 1));
  return isLocked(prevPeriod) ? localISO(new Date(y, m0, 1)) : prevPeriod;
}
/** Tên kỳ khóa sổ của ngày `iso`, ví dụ "Quý 3/2026" hoặc "Tháng 7/2026". */
function periodName(iso) {
  const [y, m] = String(iso).split("-").map(Number);
  return store.lock.period === "MONTH" ? `Tháng ${m}/${y}` : `Quý ${Math.floor((m - 1) / 3) + 1}/${y}`;
}
function lockMessage(iso) {
  return `${periodName(iso)} đã khóa sổ (hạn chỉnh sửa: ${dmy(lastEditableDay(iso))}).`;
}
const storeListeners = [];

/** Đăng ký hàm được gọi mỗi khi dữ liệu / tiền tệ thay đổi. */
function onStoreChange(fn) {
  storeListeners.push(fn);
}
function emitStore() {
  storeListeners.forEach((fn) => fn());
}
function setCcy(v) {
  store.ccy = v === "EUR" ? "EUR" : "USD";
  try { localStorage.setItem("fm_ccy", store.ccy); } catch { /* bỏ qua */ }
  emitStore();
}

/** Hiện thông báo góc màn hình. `action` = { label, onClick } để thêm nút (ví dụ "Hoàn tác"). */
function toast(msg, action) {
  const wrap = document.querySelector(".toast-wrap");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = "toast";
  const text = document.createElement("span");
  text.textContent = msg;
  el.appendChild(text);
  if (action) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = action.label;
    btn.addEventListener("click", () => { el.remove(); action.onClick(); });
    el.appendChild(btn);
  }
  wrap.appendChild(el);
  setTimeout(() => el.remove(), action ? 6000 : 3000);
}

/** Lấy tỷ giá USD/EUR mới nhất từ backend; lỗi thì giữ tỷ giá tạm. */
async function loadFx() {
  const [fx, monthly, daily] = await Promise.all([api("/fx").catch(() => null), api("/fx/monthly").catch(() => null), api("/fx/daily").catch(() => null)]);
  // Không có mạng / backend chưa chạy: giữ tỷ giá tạm.
  if (fx?.usdToEur > 0) {
    FX_USD_TO_EUR = fx.usdToEur;
    FX_DATE = fx.auto ? fx.date : "";
  }
  if (Array.isArray(monthly)) FX_MONTHLY = Object.fromEntries(monthly.map((r) => [r.month, Number(r.eurToUsd)]));
  if (Array.isArray(daily)) FX_DAILY = Object.fromEntries(daily.map((r) => [r.date, Number(r.eurToUsd)]));
  // Khoản nhập bằng EUR: quy lại sang USD theo tỷ giá mới.
  store.incomes = store.incomes.map((r) => withUsd(r, "incomeDate"));
  store.expenses = store.expenses.map((r) => withUsd(r, "expenseDate"));
  emitStore();
}

async function reload() {
  store.loading = true;
  try {
    const [incomeCats, expenseCats, scopes, groups, incomeRows, expenseRows, settings] = await Promise.all([
      api("/categories/income"), api("/categories/expense"),
      api("/categories/scope").catch(() => []), api("/category-groups").catch(() => []),
      fetchAllPages("/incomes"), fetchAllPages("/expenses"),
      api("/settings").catch(() => null),
    ]);
    if (settings?.periodLock) store.lock = settings.periodLock;
    INCOME_CATEGORIES.splice(0, INCOME_CATEGORIES.length, ...incomeCats);
    EXPENSE_CATEGORIES.splice(0, EXPENSE_CATEGORIES.length, ...expenseCats);
    SCOPES.splice(0, SCOPES.length, ...scopes);
    CATEGORY_GROUPS.splice(0, CATEGORY_GROUPS.length, ...groups);
    store.incomes = incomeRows.map(mapRow("incomeDate"));
    store.expenses = expenseRows.map(mapRow("expenseDate"));
  } catch (e) {
    toast(e.message);
  } finally {
    store.loading = false;
    emitStore();
  }
}

/** Hai số tiền bằng nhau (ô trống = 0, như lúc lưu). */
const sameMoney = (a, b) => (Number(a) || 0) === (Number(b) || 0);

/**
 * Số tiền trong `payload` là số gõ theo loại tiền `payload.currency` và được lưu đúng như vậy (gõ EUR lưu EUR).
 * Khoản đang lưu bằng loại tiền khác mà người dùng không đổi số tiền nào (chỉ sửa mô tả, ngày…) thì giữ nguyên
 * số gốc và loại tiền gốc: số đang hiện chỉ là số quy đổi, lưu lại sẽ đổi loại tiền và lệch vài cent.
 * Số trước thuế và % thuế không đổi thì giữ luôn số sau thuế đã lưu (có thể là số tiền thực nhận / thực trả).
 */
function keepUnchangedMoney(previous, payload, dateKey) {
  const next = { ...payload, currency: currencyOf(payload.currency) };
  if (next.currency !== previous.currency) {
    const shown = shownMoney(previous, next.currency, previous[dateKey]);
    const untouched = RECORD_MONEY_FIELDS.filter((f) => f !== "amountAfterTax" && f in next)
      .every((f) => sameMoney(next[f], shown[f]));
    if (!untouched) return next;
    RECORD_MONEY_FIELDS.forEach((f) => { if (f in next && f in previous.orig) next[f] = previous.orig[f]; });
    next.currency = previous.currency;
    next.amountAfterTax = Number(next.taxPercent) === Number(previous.taxPercent)
      ? previous.orig.amountAfterTax : afterTax(next.amount, next.taxPercent);
    return next;
  }
  if (Number(next.amount) === Number(previous.orig.amount) && Number(next.taxPercent) === Number(previous.taxPercent)) {
    next.amountAfterTax = previous.orig.amountAfterTax;
  }
  return next;
}

/** Lưu khoản thu/chi, rồi tải lên các chứng từ `files` (nếu có). Trả về bản ghi đã lưu hoặc null. */
async function saveRecord(kind, payload, id, files = []) {
  const config = KIND[kind];
  const previous = id ? (kind === "income" ? store.incomes : store.expenses).find((r) => r.id === id) : null;
  if (previous) payload = keepUnchangedMoney(previous, payload, config.dateKey);
  const body = bodyOf(config.dateKey, { salesChannel: previous?.salesChannel, paymentMethod: previous?.paymentMethod, ...payload });
  let saved;
  try {
    saved = await api(`${config.path}${id ? `/${id}` : ""}`, { method: id ? "PUT" : "POST", body });
  } catch (e) {
    toast(e.message);
    return null;
  }
  let uploadError = "";
  if (files.length) {
    try { await uploadAttachments(kind, saved.id, files); }
    catch (e) { uploadError = e.message; }
  }
  await reload();
  toast(uploadError
    ? `Đã lưu ${config.label} nhưng tải chứng từ lỗi: ${uploadError}`
    : `${id ? "Đã cập nhật" : "Đã thêm"} ${config.label}${files.length ? ` kèm ${files.length} chứng từ` : ""}`);
  return saved;
}

// ---- Chứng từ đính kèm
function listAttachments(kind, id) {
  return api(`${KIND[kind].path}/${id}/attachments`);
}
function uploadAttachments(kind, id, files) {
  const fd = new FormData();
  [...files].forEach((f) => fd.append("files", f));
  return api(`${KIND[kind].path}/${id}/attachments`, { method: "POST", body: fd });
}
function deleteAttachment(attachmentId) {
  return api(`/attachments/${attachmentId}`, { method: "DELETE" });
}

// ---- Nhóm sản phẩm (khoản thu) / loại chi
async function categoryAction(kind, method, id, name) {
  try {
    await api(`/categories/${kind}${id ? `/${id}` : ""}`, { method, body: name === undefined ? undefined : { name } });
    await reload();
    return true;
  } catch (e) {
    toast(e.message);
    return false;
  }
}
// `kind`: "income", "expense" hoặc "scope" (phạm vi khoản chi).
const addCategory = (kind, name) => categoryAction(kind, "POST", null, name);
const renameCategory = (kind, id, name) => categoryAction(kind, "PUT", id, name);
const removeCategory = (kind, id) => categoryAction(kind, "DELETE", id);

/** Chuyển khoản vào thùng rác, kèm nút "Hoàn tác" trên thông báo. */
async function softDelete(kind, id) {
  try {
    await api(`${KIND[kind].path}/${id}`, { method: "DELETE" });
    await reload();
    toast(`Đã chuyển ${KIND[kind].label} vào thùng rác`, { label: "Hoàn tác", onClick: () => restoreEntry(id) });
  } catch (e) {
    toast(e.message);
  }
}

// ---- Nhóm loại thu / loại chi (bộ lọc báo cáo)
async function groupAction(method, id, body) {
  try {
    const res = await api(`/category-groups${id ? `/${id}` : ""}`, { method, body });
    await reload();
    return res ?? true;
  } catch (e) {
    toast(e.message);
    return null;
  }
}
const addGroup = (name, categoryIds) => groupAction("POST", null, { name, categoryIds });
const updateGroup = (id, patch) => groupAction("PUT", id, patch);
const removeGroup = (id) => groupAction("DELETE", id);

// ---- Tiền xưởng / tiền ship của khoản thu (lưu thành khoản chi gắn với khoản thu)
// `cost` = { amount (đã trả, gồm thuế), currencyCode (loại tiền đã gõ), taxPercent, invoiceId, payee, originScope, date };
// amount 0 = bỏ.
const setIncomeCost = (incomeId, cost) => api(`/incomes/${incomeId}/cost`, { method: "PUT", body: cost });

// ---- Thùng rác
const listTrash = () => api("/trash");
async function restoreEntry(id, quiet = false) {
  try {
    await api(`/trash/${id}/restore`, { method: "POST" });
    await reload();
    if (!quiet) toast("Đã khôi phục khoản");
    return true;
  } catch (e) {
    toast(e.message);
    return false;
  }
}
const purgeEntry = (id) => api(`/trash/${id}`, { method: "DELETE" });
const emptyTrash = () => api("/trash", { method: "DELETE" });

// ---- Lịch sử chỉnh sửa
function listAudit(params) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null));
  return api(`/audit?${qs}`);
}

// ---- Etsy
const etsyStatus = () => api("/etsy/status");
const etsyOrders = (from, to) => api(`/etsy/orders?from=${from}&to=${to}`);
const etsyImport = (orders) => api("/etsy/import", { method: "POST", body: { orders } });
const etsyListings = () => api("/etsy/listings");
// Lượt xem / yêu thích trong khoảng ngày, tính từ số backend ghi lại mỗi ngày.
const etsyListingViews = (from, to) => api(`/etsy/listings/views?from=${from}&to=${to}`);
const etsySales = (from, to) => api(`/etsy/sales?from=${from}&to=${to}`);
const etsyFees = (from, to) => api(`/etsy/fees?from=${from}&to=${to}`);
const etsyRefresh = () => api("/etsy/refresh", { method: "POST" });
const etsySyncAds = (from, to) => api(`/etsy/fees/sync?from=${from}&to=${to}`, { method: "POST" });
const etsyDisconnect = () => api("/etsy/disconnect", { method: "POST" });
// Đồng bộ tự động (backend tự lấy đơn mới theo chu kỳ).
const etsyAutoSync = () => api("/etsy/autosync");
const setEtsyAutoSync = (enabled, intervalMinutes) => api("/etsy/autosync", { method: "PUT", body: { enabled, intervalMinutes } });
const runEtsyAutoSync = () => api("/etsy/autosync/run", { method: "POST" });

// ---- Tỷ giá EUR → USD tự nhập theo tháng
const fxMonthly = () => api("/fx/monthly");
const fxMonths = (from, to) => api(`/fx/months?from=${from}&to=${to}`);
const setFxMonthly = (month, eurToUsd) => api(`/fx/monthly/${month}`, { method: "PUT", body: { eurToUsd } });
const deleteFxMonthly = (month) => api(`/fx/monthly/${month}`, { method: "DELETE" });
const fxDays = (month) => api(`/fx/days?month=${month}`);
const setFxDaily = (date, eurToUsd) => api(`/fx/daily/${date}`, { method: "PUT", body: { eurToUsd } });
const deleteFxDaily = (date) => api(`/fx/daily/${date}`, { method: "DELETE" });

/** Số tiền gõ trong ô (chuỗi) → số làm tròn 2 chữ số; ô trống / không phải số → null. */
function typedMoney(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? round2(n) : null;
}

function incomePayload(fd, ccy) {
  // Số tiền lưu đúng như gõ, theo loại tiền đang chọn `ccy` (gõ EUR lưu EUR, gõ USD lưu USD).
  return {
    incomeDate: fd.get("incomeDate"),
    description: fd.get("description"),
    categoryId: null, // nhóm sản phẩm: trang đổi tên nhóm gõ vào thành id rồi gán (resolveProductGroup)
    amount: typedMoney(fd.get("amount")) ?? 0,
    currency: ccy,
    referenceCode: fd.get("referenceCode"),
    orderCode: String(fd.get("orderCode") || "").trim(),
    saleRegion: String(fd.get("saleRegion") || ""),
    productQty: fd.get("productQty") ? Number(fd.get("productQty")) : null,
    unitPrice: typedMoney(fd.get("unitPrice")),
    itemTotal: typedMoney(fd.get("itemTotal")),
    discountAmount: typedMoney(fd.get("discountAmount")) ?? 0,
    discountCode: String(fd.get("discountCode") || "").trim(),
    subtotal: typedMoney(fd.get("subtotal")),
    shippingAmount: typedMoney(fd.get("shippingAmount")) ?? 0,
    taxAmount: typedMoney(fd.get("taxAmount")) ?? 0,
    taxPercent: Number(fd.get("taxPercent") || 0),
    amountAfterTax: afterTax(typedMoney(fd.get("amount")) ?? 0, fd.get("taxPercent")),
    source: "MANUAL",
    note: fd.get("note"),
  };
}

function expensePayload(fd, ccy) {
  return {
    expenseDate: fd.get("expenseDate"),
    description: fd.get("description"),
    categoryId: Number(fd.get("categoryId")),
    amount: typedMoney(fd.get("amount")) ?? 0,
    currency: ccy,
    recipient: fd.get("recipient"),
    originScope: String(fd.get("originScope") || ""),
    invoiceId: String(fd.get("invoiceId") || "").trim(),
    taxPercent: Number(fd.get("taxPercent") || 0),
    amountAfterTax: afterTax(typedMoney(fd.get("amount")) ?? 0, fd.get("taxPercent")),
    source: "MANUAL",
    note: fd.get("note"),
  };
}

/** Gán các trình xử lý sự kiện cho vùng trang (ghi đè các trình xử lý của trang trước). */
function bindRoot(root, handlers = {}) {
  root.onclick = handlers.click || null;
  root.ondblclick = handlers.dblclick || null;
  root.onchange = handlers.change || null;
  root.oninput = handlers.input || null;
  root.onsubmit = handlers.submit || null;
  root.onkeydown = handlers.keydown || null;
  root.ondragover = handlers.dragover || null;
  root.ondragleave = handlers.dragleave || null;
  root.ondrop = handlers.drop || null;
}

function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
const ATTACH_ACCEPT = ".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip";
const ATTACH_MAX = 10 * 1024 * 1024;

/** Lọc file hợp lệ (đuôi + dung lượng), báo lỗi các file bị bỏ qua. */
function acceptFiles(fileList) {
  const allowed = ATTACH_ACCEPT.split(",");
  const ok = [];
  [...fileList].forEach((f) => {
    const ext = (f.name.match(/\.[^.]+$/)?.[0] || "").toLowerCase();
    if (!allowed.includes(ext)) toast(`Bỏ qua "${f.name}": định dạng không hỗ trợ.`);
    else if (f.size > ATTACH_MAX) toast(`Bỏ qua "${f.name}": vượt quá 10 MB.`);
    else ok.push(f);
  });
  return ok;
}
