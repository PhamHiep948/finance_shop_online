// Trạng thái dùng chung của ứng dụng (thay cho FinanceProvider/useFinance).
const KIND = {
  income: { path: "/incomes", dateKey: "incomeDate", label: "khoản thu" },
  expense: { path: "/expenses", dateKey: "expenseDate", label: "khoản chi" },
};
const mapRow = (key) => (r) => ({
  ...r, [key]: r.date, amount: Number(r.amount), taxPercent: Number(r.taxPercent),
  amountAfterTax: Number(r.amountAfterTax), currency: r.currencyCode,
  recipient: r.payee || "", source: r.source || "MANUAL",
});
const bodyOf = (key, p) => ({
  ...p, date: p[key], description: p.description, categoryId: p.categoryId,
  amount: p.amount, taxPercent: p.taxPercent, amountAfterTax: p.amountAfterTax,
  currencyCode: "USD", orderCode: p.orderCode || null,
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

const RECORD_MONEY_FIELDS = ["amount", "unitPrice", "itemTotal", "discountAmount", "subtotal", "shippingAmount", "taxAmount"];

/**
 * Số tiền người dùng không sửa thì giữ đúng số USD đã lưu. Xem bằng EUR, số hiện ra đã làm tròn theo EUR;
 * đổi ngược sang USD rồi làm tròn lần nữa có thể lệch 1 cent dù không ai sửa gì.
 * Số trước thuế và % thuế không đổi thì giữ luôn số sau thuế đã lưu (có thể là số tiền thực nhận / thực trả).
 */
function keepUnchangedMoney(previous, payload, dateKey) {
  const date = payload[dateKey] || previous[dateKey];
  const next = { ...payload };
  RECORD_MONEY_FIELDS.forEach((f) => {
    if (!(f in next) || previous[f] == null || previous[f] === "") return;
    const shown = fromDisplay(toDisplay(previous[f], store.ccy, date), store.ccy, date);
    if (next[f] != null && Number(next[f]) === shown) next[f] = Number(previous[f]);
  });
  if (Number(next.amount) === Number(previous.amount) && Number(next.taxPercent) === Number(previous.taxPercent)) {
    next.amountAfterTax = afterTaxOf(previous);
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
// `cost` = { amount (đã trả, gồm thuế, USD), taxPercent, invoiceId, payee, originScope, date }; amount 0 = bỏ.
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
const etsyListings = (from, to) => api(`/etsy/listings?from=${from}&to=${to}`);
const etsyFees = (from, to) => api(`/etsy/fees?from=${from}&to=${to}`);
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

function incomePayload(fd, ccy) {
  // Quy đổi theo tỷ giá của tháng chứa ngày thu / ngày chi (giống lúc hiển thị).
  const d = fd.get("incomeDate");
  return {
    incomeDate: fd.get("incomeDate"),
    description: fd.get("description"),
    categoryId: null, // nhóm sản phẩm: trang đổi tên nhóm gõ vào thành id rồi gán (resolveProductGroup)
    amount: fromDisplayNum(fd.get("amount"), ccy, 0, d),
    currency: "USD",
    referenceCode: fd.get("referenceCode"),
    orderCode: String(fd.get("orderCode") || "").trim(),
    saleRegion: String(fd.get("saleRegion") || ""),
    productQty: fd.get("productQty") ? Number(fd.get("productQty")) : null,
    unitPrice: fromDisplay(fd.get("unitPrice"), ccy, d),
    itemTotal: fromDisplay(fd.get("itemTotal"), ccy, d),
    discountAmount: fromDisplayNum(fd.get("discountAmount"), ccy, 0, d),
    discountCode: String(fd.get("discountCode") || "").trim(),
    subtotal: fromDisplay(fd.get("subtotal"), ccy, d),
    shippingAmount: fromDisplayNum(fd.get("shippingAmount"), ccy, 0, d),
    taxAmount: fromDisplayNum(fd.get("taxAmount"), ccy, 0, d),
    taxPercent: Number(fd.get("taxPercent") || 0),
    amountAfterTax: afterTax(fromDisplayNum(fd.get("amount"), ccy, 0, d), fd.get("taxPercent")),
    source: "MANUAL",
    note: fd.get("note"),
  };
}

function expensePayload(fd, ccy) {
  const d = fd.get("expenseDate");
  return {
    expenseDate: fd.get("expenseDate"),
    description: fd.get("description"),
    categoryId: Number(fd.get("categoryId")),
    amount: fromDisplayNum(fd.get("amount"), ccy, 0, d),
    currency: "USD",
    recipient: fd.get("recipient"),
    originScope: String(fd.get("originScope") || ""),
    invoiceId: String(fd.get("invoiceId") || "").trim(),
    taxPercent: Number(fd.get("taxPercent") || 0),
    amountAfterTax: afterTax(fromDisplayNum(fd.get("amount"), ccy, 0, d), fd.get("taxPercent")),
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
