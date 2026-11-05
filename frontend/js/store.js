// Trạng thái dùng chung của ứng dụng: dữ liệu khoản thu / chi, loại tiền đang xem, khóa sổ, và các hàm gọi API.

/** Cấu hình theo loại khoản: đường dẫn API, tên trường ngày, tên hiển thị. */
const KIND = {
  income: { path: "/incomes", dateKey: "incomeDate", label: "khoản thu" },
  expense: { path: "/expenses", dateKey: "expenseDate", label: "khoản chi" },
};
/**
 * Các trường tiền của một khoản. Backend lưu đúng số và loại tiền (USD / EUR) người dùng chọn; trong app mọi phép tính
 * dùng USD, nên khi tải về các trường này được quy sang USD theo tỷ giá ngày của khoản (không làm tròn, để xem lại
 * bằng EUR ra đúng số đã nhập). Số gốc giữ ở `orig`, loại tiền gốc ở `currency`.
 */
const RECORD_MONEY_FIELDS = ["amount", "amountAfterTax", "unitPrice", "itemTotal", "discountAmount", "subtotal", "shippingAmount", "taxAmount"];
/** Quy lại các trường tiền (USD) của khoản `r` từ số gốc; gọi lại khi tỷ giá đổi. */
function withUsd(r, key) {
  const out = { ...r };
  RECORD_MONEY_FIELDS.forEach((f) => { if (f in r.orig) out[f] = usdOf(r.orig[f], r.currency, r[key]); });
  return out;
}
/** Đổi một dòng backend trả về thành khoản dùng trong app (`key` = tên trường ngày): giữ số gốc, quy sang USD. */
const mapRow = (key) => (r) => withUsd({
  ...r, [key]: r.date, taxPercent: Number(r.taxPercent), currency: currencyOf(r.currencyCode),
  orig: Object.fromEntries(RECORD_MONEY_FIELDS.filter((f) => f in r).map((f) => [f, r[f] == null || r[f] === "" ? r[f] : Number(r[f])])),
  recipient: r.payee || "", source: r.source || "MANUAL",
}, key);
/** Các trường tiền của khoản `r` đúng như đã lưu (số gốc + loại tiền gốc), để lưu lại mà không đổi số nào. */
const origMoney = (r) => ({ ...r.orig, currency: r.currency });
/** Dựng body gửi lên backend từ khoản `p` trong app (`key` = tên trường ngày). */
const bodyOf = (key, p) => ({
  ...p, date: p[key], description: p.description, categoryId: p.categoryId,
  amount: p.amount, taxPercent: p.taxPercent, amountAfterTax: p.amountAfterTax,
  currencyCode: currencyOf(p.currency), orderCode: p.orderCode || null,
  saleRegion: p.saleRegion || null, salesChannel: p.salesChannel || null,
  productQty: p.productQty || null, payee: p.recipient || null,
  originScope: p.originScope || null, paymentMethod: p.paymentMethod || null,
});

/**
 * Trạng thái dùng chung: `ccy` = loại tiền đang xem, `incomes` / `expenses` = danh sách khoản,
 * `lock` = cấu hình khóa sổ (lấy từ /settings), `etsyAuto*` = trạng thái đồng bộ Etsy tự động đã báo cho người dùng.
 */
const store = {
  ccy: (() => { try { return localStorage.getItem("fm_ccy") === "EUR" ? "EUR" : "USD"; } catch { return "USD"; } })(),
  incomes: [], expenses: [], loading: true,
  lock: { enabled: false, period: "QUARTER", graceDays: 1, today: localISO(new Date()) },
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
/** Câu báo kỳ của ngày `iso` đã khóa sổ, kèm hạn chỉnh sửa. */
function lockMessage(iso) {
  return `${periodName(iso)} đã khóa sổ (hạn chỉnh sửa: ${dmy(lastEditableDay(iso))}).`;
}
const storeListeners = [];

/** Đăng ký hàm được gọi mỗi khi dữ liệu / tiền tệ thay đổi. */
function onStoreChange(fn) {
  storeListeners.push(fn);
}
/** Gọi mọi hàm đã đăng ký bằng onStoreChange (vẽ lại trang). */
function emitStore() {
  storeListeners.forEach((fn) => fn());
}
/** Đổi loại tiền đang xem (USD / EUR), nhớ vào localStorage rồi vẽ lại trang. */
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

/**
 * Lấy tỷ giá USD/EUR mới nhất, tỷ giá tự nhập theo tháng và theo ngày từ backend (lỗi / mất mạng thì giữ tỷ giá tạm),
 * rồi quy lại số USD của mọi khoản theo tỷ giá mới.
 */
async function loadFx() {
  const [fx, monthly, daily] = await Promise.all([api("/fx").catch(() => null), api("/fx/monthly").catch(() => null), api("/fx/daily").catch(() => null)]);
  if (fx?.usdToEur > 0) {
    FX_USD_TO_EUR = fx.usdToEur;
    FX_DATE = fx.auto ? fx.date : "";
  }
  if (Array.isArray(monthly)) FX_MONTHLY = Object.fromEntries(monthly.map((r) => [r.month, Number(r.eurToUsd)]));
  if (Array.isArray(daily)) FX_DAILY = Object.fromEntries(daily.map((r) => [r.date, Number(r.eurToUsd)]));
  store.incomes = store.incomes.map((r) => withUsd(r, "incomeDate"));
  store.expenses = store.expenses.map((r) => withUsd(r, "expenseDate"));
  emitStore();
}

/** Tải lại toàn bộ dữ liệu từ backend: danh mục, phạm vi, nhóm báo cáo, khoản thu / chi, cấu hình khóa sổ. */
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

/**
 * Số tiền trong `payload` là số gõ theo loại tiền người dùng chọn ở `payload.currency` và được lưu đúng như vậy
 * (gõ EUR lưu EUR); đổi loại tiền thì các số giữ nguyên, chỉ đổi loại tiền. Số trước thuế và % thuế không đổi
 * thì giữ luôn số sau thuế đã lưu (có thể là số tiền thực nhận / thực trả).
 */
function keepUnchangedMoney(previous, payload) {
  const next = { ...payload, currency: currencyOf(payload.currency) };
  if (Number(next.amount) === Number(previous.orig.amount) && Number(next.taxPercent) === Number(previous.taxPercent)) {
    next.amountAfterTax = previous.orig.amountAfterTax;
  }
  return next;
}

/** Lưu khoản thu/chi, rồi tải lên các chứng từ `files` (nếu có). Trả về bản ghi đã lưu hoặc null. */
async function saveRecord(kind, payload, id, files = []) {
  const config = KIND[kind];
  const previous = id ? (kind === "income" ? store.incomes : store.expenses).find((r) => r.id === id) : null;
  if (previous) payload = keepUnchangedMoney(previous, payload);
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
/** Danh sách chứng từ của khoản `id` (`kind` = "income" / "expense"). */
function listAttachments(kind, id) {
  return api(`${KIND[kind].path}/${id}/attachments`);
}
/** Tải các file `files` lên làm chứng từ của khoản `id`. */
function uploadAttachments(kind, id, files) {
  const fd = new FormData();
  [...files].forEach((f) => fd.append("files", f));
  return api(`${KIND[kind].path}/${id}/attachments`, { method: "POST", body: fd });
}
/** Xóa một chứng từ. */
function deleteAttachment(attachmentId) {
  return api(`/attachments/${attachmentId}`, { method: "DELETE" });
}

// ---- Nhóm sản phẩm (khoản thu) / loại chi
/**
 * Thêm / đổi tên / xóa một danh mục rồi tải lại dữ liệu. `kind`: "income", "expense" hoặc "scope" (phạm vi khoản chi).
 * Trả về true nếu thành công, lỗi thì hiện thông báo và trả về false.
 */
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
/** Thêm / đổi tên / xóa danh mục (`kind` = "income", "expense" hoặc "scope"). */
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
/** Thêm / sửa / xóa một nhóm báo cáo rồi tải lại dữ liệu. Trả về kết quả backend (hoặc true), lỗi thì null. */
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
/** Thêm / sửa / xóa nhóm loại thu / loại chi dùng để lọc báo cáo. */
const addGroup = (name, categoryIds) => groupAction("POST", null, { name, categoryIds });
const updateGroup = (id, patch) => groupAction("PUT", id, patch);
const removeGroup = (id) => groupAction("DELETE", id);

// ---- Tiền xưởng / tiền ship của khoản thu
/**
 * Lưu tiền xưởng / tiền ship của khoản thu `incomeId` (backend lưu thành khoản chi gắn với khoản thu).
 * `cost` = { amount (đã trả, gồm thuế; 0 = bỏ), currencyCode (loại tiền đã gõ), taxPercent,
 * categoryId (loại chi; null = tự chọn theo khu vực), invoiceId, payee, originScope, date }.
 */
const setIncomeCost = (incomeId, cost) => api(`/incomes/${incomeId}/cost`, { method: "PUT", body: cost });

// ---- Thùng rác
/** Thùng rác: xem danh sách, khôi phục, xóa hẳn một khoản, dọn sạch. */
const listTrash = () => api("/trash");
/** Khôi phục khoản `id` từ thùng rác rồi tải lại dữ liệu; `quiet` = không hiện thông báo. Trả về true nếu thành công. */
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
/** Tìm lịch sử chỉnh sửa theo bộ lọc `params` (bỏ qua các điều kiện để trống). */
function listAudit(params) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null));
  return api(`/audit?${qs}`);
}

// ---- Etsy
/** Gọi API Etsy: trạng thái kết nối, đơn hàng, nhập đơn, sản phẩm, doanh số, phí, ngắt kết nối. */
const etsyStatus = () => api("/etsy/status");
const etsyOrders = (from, to) => api(`/etsy/orders?from=${from}&to=${to}`);
const etsyImport = (orders) => api("/etsy/import", { method: "POST", body: { orders } });
const etsyListings = () => api("/etsy/listings");
/** Lượt xem / yêu thích của sản phẩm trong khoảng ngày, tính từ số backend ghi lại mỗi ngày. */
const etsyListingViews = (from, to) => api(`/etsy/listings/views?from=${from}&to=${to}`);
const etsySales = (from, to) => api(`/etsy/sales?from=${from}&to=${to}`);
const etsyFees = (from, to) => api(`/etsy/fees?from=${from}&to=${to}`);
const etsyRefresh = () => api("/etsy/refresh", { method: "POST" });
const etsySyncAds = (from, to) => api(`/etsy/fees/sync?from=${from}&to=${to}`, { method: "POST" });
const etsyDisconnect = () => api("/etsy/disconnect", { method: "POST" });
/** Trạng thái đồng bộ Etsy tự động (backend tự lấy đơn mới theo chu kỳ). */
const etsyAutoSync = () => api("/etsy/autosync");
/** Bật / tắt đồng bộ tự động và chạy đồng bộ ngay. */
const setEtsyAutoSync = (enabled, intervalMinutes) => api("/etsy/autosync", { method: "PUT", body: { enabled, intervalMinutes } });
const runEtsyAutoSync = () => api("/etsy/autosync/run", { method: "POST" });

// ---- Tỷ giá EUR → USD tự nhập theo tháng
/** Tỷ giá tự nhập theo tháng và theo ngày: xem, lưu, xóa. */
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

/**
 * Đọc form khoản thu `fd` thành dữ liệu để lưu. Số tiền lưu đúng như gõ, theo loại tiền chọn ở ô "Lưu bằng"
 * (không có ô đó thì theo `ccy`), không quy đổi. Nhóm sản phẩm để null: trang tự đổi tên nhóm gõ vào thành id.
 */
function incomePayload(fd, ccy) {
  return {
    incomeDate: fd.get("incomeDate"),
    description: fd.get("description"),
    categoryId: null,
    amount: typedMoney(fd.get("amount")) ?? 0,
    currency: currencyOf(fd.get("currency") || ccy),
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

/** Đọc form khoản chi `fd` thành dữ liệu để lưu; số tiền theo loại tiền chọn ở ô "Lưu bằng" (không có thì theo `ccy`). */
function expensePayload(fd, ccy) {
  return {
    expenseDate: fd.get("expenseDate"),
    description: fd.get("description"),
    categoryId: Number(fd.get("categoryId")),
    amount: typedMoney(fd.get("amount")) ?? 0,
    currency: currencyOf(fd.get("currency") || ccy),
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

/** Dung lượng file dễ đọc: B, KB hoặc MB. */
function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
/** Đuôi file chứng từ được phép tải lên và dung lượng tối đa mỗi file (10 MB). */
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
