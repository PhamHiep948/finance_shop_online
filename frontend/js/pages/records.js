// Trang danh sách Khoản thu (#/incomes) và Khoản chi (#/expenses),
// gồm modal chi tiết, form thêm/sửa và hộp chọn cột.
const PAGE_SIZE = 10;

function kpiCardHtml({ label, value, delta }) {
  const deltaCls = String(delta || "").startsWith("-") ? "down" : "up";
  return `
    <article class="card kpi">
      <div class="label">${esc(label)}</div>
      <div class="value num">${esc(value)}</div>
      ${delta ? `<div class="chg ${deltaCls}">${esc(delta)}</div>` : ""}
    </article>`;
}

// ---------------------------------------------------------------- Panel bên phải (dùng chung cho chi tiết và form)

/**
 * Một dòng "nhãn | giá trị" trong panel. `value` là HTML đã escape.
 * `opts.edit`: tên trường sửa được khi nhấp đúp; `opts.required`: hiện dấu * (trường bắt buộc).
 */
function drRow(iconName, label, value, extraCls = "", opts = {}) {
  return `
    <div class="dr-row${extraCls ? ` ${extraCls}` : ""}${opts.edit ? " is-editable" : ""}"${opts.edit ? ` data-edit="${opts.edit}" title="Nhấp đúp để sửa"` : ""}>
      <span class="dr-label">${icon(iconName, 15)}<span>${label}${opts.required ? ' <span class="req">*</span>' : ""}</span></span>
      <span class="dr-value">${value}</span>
    </div>`;
}

/** Một dòng nhập liệu: nhãn bên trái, ô nhập bên phải. `control` là HTML của input/select/textarea. */
function drInput(iconName, label, control, { required = false, hint = "", cls = "" } = {}) {
  return `
    <label class="dr-row dr-input${cls ? ` ${cls}` : ""}">
      <span class="dr-label">${icon(iconName, 15)}<span>${label}${required ? ' <span class="req">*</span>' : ""}</span></span>
      <span class="dr-value">${control}${hint ? `<small class="dr-hint">${hint}</small>` : ""}</span>
    </label>`;
}

const dash = '<span class="muted">—</span>';
const regionText = (v) => (v ? `<span class="tag-text ${v === "IN_EU" ? "tx-eu" : "tx-out"}">${saleRegionLabel(v)}</span>` : dash);
const scopeText = (v) => (v ? `<span class="cat-text ${catTone(Number(v) || (v === "INTERNATIONAL" ? 2 : 1))}">${esc(originScopeLabel(v))}</span>` : dash);

/**
 * Tách số đã trả (gồm thuế) thành trước thuế + thuế, như backend (LedgerEntry.BeforeTax): chỉ làm tròn một lần
 * ở số trước thuế, phần thuế = đã trả − trước thuế nên cộng lại luôn đúng số đã trả.
 */
function splitPaid(paid, pct) {
  if (paid === "" || paid == null) return { before: "", tax: "" };
  const before = round2(Number(paid) / (1 + (Number(pct) || 0) / 100));
  return { before, tax: round2(Number(paid) - before) };
}

/** Ô nhập tiền xưởng / tiền ship của khoản thu (dùng trong form thêm/sửa và trong panel chi tiết). */
function costFieldsHtml(rec) {
  const { ccy } = store;
  const inEu = rec?.saleRegion === "IN_EU";
  const linked = rec?.id ? costOf(rec, store.expenses).items[0] : null;
  const date = linked?.expenseDate || rec?.incomeDate || store.lock.today;
  const paid = linked ? toDisplay(afterTaxOf(linked), ccy, date) : "";
  const tax = linked ? valNum(linked.taxPercent) : inEu ? 19 : "";
  const split = splitPaid(paid, tax);
  const computed = (name, value) => `<input name="${name}" type="number" step="0.01" readonly tabindex="-1" class="is-computed" value="${esc(value)}" />`;
  return [
    drInput("truck", `Số tiền đã trả (${ccy})`,
      `<input name="costAmount" type="number" step="0.01" min="0" value="${esc(paid)}" placeholder="0.00" />`, { hint: "Số tiền thực trả, đã gồm thuế." }),
    drInput("percent", "% thuế trong số tiền", `<input name="costTax" type="number" step="0.01" min="0" max="100" value="${esc(tax)}" placeholder="0" />`),
    drInput("circle-dollar-sign", `Trước thuế (${ccy})`, computed("costBefore", split.before), { cls: "is-readonly", hint: "Tự tính: đã trả ÷ (1 + % thuế)." }),
    drInput("receipt", `Tiền thuế (${ccy})`, computed("costTaxAmount", split.tax), { cls: "is-readonly" }),
    drInput("user", "Bên nhận", `<input name="costPayee" value="${esc(linked?.recipient || "")}" placeholder="${inEu ? "Hãng vận chuyển" : "Xưởng sản xuất"}" />`),
    drInput("map-pin", "Phạm vi",
      `<select name="costScope">${optionsHtml([["", "—"], ...SCOPES.map((x) => [x.id, x.name])], linked?.originScope)}</select>`),
    drInput("hash", "ID hóa đơn", `<input name="costInvoiceId" value="${esc(linked?.invoiceId || "")}" placeholder="Mã hóa đơn xưởng / mã vận đơn" />`),
    drInput("calendar", "Ngày chi", `<input name="costDate" type="date" value="${esc(date)}" />`),
  ].join("");
}

/** Cập nhật ô trước thuế / tiền thuế (chỉ đọc) khi gõ số đã trả hoặc % thuế. */
function refreshCostSplit(form) {
  if (!form.elements.costBefore) return;
  const split = splitPaid(form.elements.costAmount.value, form.elements.costTax.value);
  form.elements.costBefore.value = split.before;
  form.elements.costTaxAmount.value = split.tax;
}

/** Các ô người dùng gõ được trong form tiền xưởng / tiền ship (các ô còn lại tự tính). */
const COST_DRAFT_FIELDS = ["costAmount", "costTax", "costPayee", "costScope", "costInvoiceId", "costDate"];

/** Đọc các ô tiền xưởng / tiền ship từ form; null nếu form không có các ô này. */
function costInputOf(form, ccy) {
  if (!form.elements.costAmount) return null;
  const date = form.elements.costDate.value;
  return {
    amount: fromDisplayNum(form.elements.costAmount.value, ccy, 0, date),
    taxPercent: Number(form.elements.costTax.value || 0),
    invoiceId: form.elements.costInvoiceId.value.trim(),
    payee: form.elements.costPayee.value.trim(),
    originScope: form.elements.costScope.value,
    date,
  };
}

/** Danh sách gợi ý cho ô "Nhóm sản phẩm" (gõ tên mới được, lưu sẽ tự thêm nhóm). */
function productGroupListHtml() {
  return `<datalist id="product-groups">${INCOME_CATEGORIES.map((c) => `<option value="${esc(c.name)}"></option>`).join("")}</datalist>`;
}

/**
 * Tên nhóm sản phẩm người dùng gõ → id. Rỗng = null (chưa phân nhóm); tên chưa có thì thêm nhóm mới.
 * Trả về undefined nếu thêm nhóm lỗi (đã báo lỗi).
 */
async function resolveProductGroup(name) {
  const text = String(name || "").trim();
  if (!text) return null;
  const find = () => INCOME_CATEGORIES.find((c) => c.name.trim().toLowerCase() === text.toLowerCase())?.id;
  if (find() != null) return find();
  if (!(await addCategory("income", text))) return undefined;
  return find();
}

// ---------------------------------------------------------------- Form thêm / sửa

function sectionPrefs() {
  try {
    return JSON.parse(localStorage.getItem("fm_form_sections") || "{}") || {};
  } catch {
    return {};
  }
}

/** Mục có thể thu gọn trong form (kiểu "Form · Kitchen Staff  ⌄"). */
function formSectionHtml({ id, title, sub, defaultOpen, body }) {
  const p = sectionPrefs();
  const open = p[id] == null ? defaultOpen : Boolean(p[id]);
  return `
    <div class="form-section dr-accordion${open ? "" : " is-collapsed"}" data-section="${id}">
      <button type="button" class="form-section-head${open ? "" : " is-closed"}" data-action="toggle-section"
        aria-expanded="${open}" aria-controls="${id}-body">
        <span class="dr-acc-title"><b>${esc(title)}</b><span class="muted"> · ${esc(sub)}</span></span>
        <span class="section-toggle-btn" aria-hidden="true">
          <span class="section-toggle-label">${open ? "Thu gọn" : "Mở rộng"}</span>
          ${icon(open ? "chevron-up" : "chevron-down", 18)}
        </span>
      </button>
      <div class="form-section-body" id="${id}-body"><div class="dr-rows">${body}</div></div>
    </div>`;
}

function toggleFormSection(btn) {
  const section = btn.closest(".form-section");
  const id = section.dataset.section;
  const open = section.classList.contains("is-collapsed");
  section.classList.toggle("is-collapsed", !open);
  btn.classList.toggle("is-closed", !open);
  btn.setAttribute("aria-expanded", String(open));
  btn.querySelector(".section-toggle-label").textContent = open ? "Thu gọn" : "Mở rộng";
  btn.querySelector("svg").outerHTML = icon(open ? "chevron-up" : "chevron-down", 18);
  const p = sectionPrefs();
  p[id] = open;
  localStorage.setItem("fm_form_sections", JSON.stringify(p));
}

function recordFormHtml(kind, rec, animate) {
  const { ccy } = store;
  const isIncome = kind === "income";
  const today = store.lock.today;
  const cats = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const firstCat = cats[0]?.id ?? "";
  const r = rec || (isIncome
    ? { incomeDate: today, description: "", categoryId: null, amount: "", taxPercent: "", orderCode: "", saleRegion: "", productQty: "", unitPrice: "", itemTotal: "", discountAmount: "", discountCode: "", subtotal: "", shippingAmount: "", taxAmount: "", referenceCode: "", note: "" }
    : { expenseDate: today, description: "", categoryId: firstCat, amount: "", recipient: "", originScope: String(SCOPES[0]?.id ?? ""), invoiceId: "", taxPercent: "", note: "" });
  const dateName = isIncome ? "incomeDate" : "expenseDate";
  // Số tiền hiển thị theo tỷ giá của tháng chứa ngày thu / ngày chi.
  const disp = (v) => (v === 0 || v ? toDisplay(v, ccy, r[dateName]) : "");
  const amount = r.amount === "" ? "" : toDisplay(r.amount, ccy, r[dateName]);
  const taxPercent = valNum(r.taxPercent);
  const after = amount === "" ? "" : afterTax(amount, taxPercent);
  const catOptions = optionsHtml(cats.map((c) => [c.id, c.name]), r.categoryId);
  const typeLabel = isIncome ? "Khoản thu" : "Khoản chi";
  const minDate = store.lock.enabled ? firstOpenDate() : "";
  const num = (name, value, extra = "") => `<input name="${name}" type="number" step="0.01" min="0" value="${esc(value)}" ${extra}/>`;

  const main = [
    drInput("calendar", isIncome ? "Ngày thu" : "Ngày chi",
      `<input name="${dateName}" type="date" required value="${esc(r[dateName])}"${minDate ? ` min="${minDate}"` : ""} />`,
      { required: true, hint: minDate ? `${store.lock.period === "MONTH" ? "Tháng" : "Quý"} đã khóa sổ không nhập được. Ngày sớm nhất: ${dmy(minDate)}.` : "" }),
    isIncome
      ? drInput("tags", "Nhóm sản phẩm",
          `<input name="productGroup" list="product-groups" autocomplete="off" value="${esc(r.categoryId == null ? "" : catName(cats, r.categoryId))}" placeholder="Để trống hoặc gõ tên nhóm" />${productGroupListHtml()}`,
          { hint: "Chọn nhóm có sẵn hoặc gõ tên mới (tự thêm khi lưu)." })
      : drInput("tags", "Loại chi", `<select name="categoryId">${catOptions}</select>`, { required: true }),
    drInput("file-text", isIncome ? "Tên sản phẩm" : "Nội dung",
      `<input name="description" required value="${esc(r.description)}"${isIncome ? ' placeholder="VD: Lily Flower"' : ""} />`, { required: true }),
    isIncome ? "" : drInput("user", "Bên nhận", `<input name="recipient" value="${esc(r.recipient)}" placeholder="Cửa hàng, nhà cung cấp…" />`),
    drInput("circle-dollar-sign", `Trước thuế (${ccy})`, `<input name="amount" type="number" step="0.01" required value="${esc(amount)}" />`, { required: true }),
    drInput("percent", "% thuế", `<input name="taxPercent" type="number" step="0.01" min="0" max="100" value="${esc(taxPercent)}" placeholder="0" />`),
    drInput("receipt", `Sau thuế (${ccy})`,
      `<input name="amountAfterTax" type="number" step="0.01" readonly tabindex="-1" class="is-computed" value="${esc(after)}" />`,
      { hint: "Tự tính từ số tiền trước thuế và % thuế.", cls: "is-readonly" }),
  ].join("");

  const sections = isIncome
    ? formSectionHtml({
        id: "income-source", title: "Nguồn thu", sub: "Mã đơn, khu vực, số lượng",
        defaultOpen: !!(r.orderCode || r.saleRegion || r.productQty || r.unitPrice),
        body: [
          drInput("hash", "Mã đơn hàng", `<input name="orderCode" value="${esc(r.orderCode)}" placeholder="VD: 4154185113" />`),
          drInput("globe", "Khu vực bán", `<select name="saleRegion">${optionsHtml([["", "—"], ["IN_EU", "Trong EU"], ["OUTSIDE_EU", "Ngoài EU"]], r.saleRegion)}</select>`),
          drInput("package", "Số lượng", `<input name="productQty" type="number" min="1" step="1" value="${esc(r.productQty || "")}" />`),
          drInput("circle-dollar-sign", `Đơn giá (${ccy})`, num("unitPrice", disp(r.unitPrice), 'placeholder="5.49" ')),
        ].join(""),
      })
      + formSectionHtml({
        id: "income-fees", title: "Chi tiết phí", sub: "Giá bán, giảm giá, vận chuyển, thuế",
        defaultOpen: !!(r.itemTotal || r.discountAmount || r.discountCode || r.subtotal || r.shippingAmount || r.taxAmount),
        body: [
          drInput("circle-dollar-sign", `Giá bán (${ccy})`, num("itemTotal", disp(r.itemTotal))),
          drInput("tags", `Giảm giá (${ccy})`, num("discountAmount", disp(r.discountAmount))),
          drInput("hash", "Mã giảm giá", `<input name="discountCode" value="${esc(r.discountCode)}" placeholder="AGSALE43" translate="no" />`),
          drInput("circle-dollar-sign", `Thành tiền (${ccy})`,
            `<input name="subtotal" type="number" step="0.01" readonly tabindex="-1" class="is-computed" value="${esc(rec ? disp(subtotalOf(r)) : "")}" />`,
            { hint: "Tự tính: giá bán − giảm giá.", cls: "is-readonly" }),
          drInput("truck", `Vận chuyển (${ccy})`, num("shippingAmount", disp(r.shippingAmount))),
          drInput("receipt", `Thuế (${ccy})`, num("taxAmount", disp(r.taxAmount))),
        ].join(""),
      })
      + formSectionHtml({
        id: "income-cost", title: "Tiền xưởng / Tiền ship", sub: "Tự thêm thành khoản chi gắn với khoản thu này",
        defaultOpen: true,
        body: costFieldsHtml(rec),
      })
      + formSectionHtml({
        id: "income-extra", title: "Ghi chú", sub: "Mã tham chiếu, ghi chú",
        defaultOpen: !!(r.referenceCode || r.note),
        body: [
          drInput("hash", "Mã tham chiếu", `<input name="referenceCode" value="${esc(r.referenceCode)}" />`),
          drInput("sticky-note", "Ghi chú", `<textarea name="note" rows="3">${esc(r.note)}</textarea>`, { cls: "is-multiline" }),
        ].join(""),
      })
    : formSectionHtml({
        id: "expense-detail", title: "Phạm vi & hóa đơn", sub: "Phạm vi nguồn, ID hóa đơn", defaultOpen: true,
        body: [
          drInput("map-pin", "Phạm vi nguồn",
            `<select name="originScope">${optionsHtml([["", "—"], ...SCOPES.map((x) => [x.id, x.name])], r.originScope)}</select>`,
            { hint: 'Thêm / sửa / xóa phạm vi bằng nút <b>Phạm vi</b> trên danh sách khoản chi.' }),
          drInput("hash", "ID hóa đơn", `<input name="invoiceId" value="${esc(r.invoiceId || "")}" placeholder="Không bắt buộc" />`),
        ].join(""),
      })
      + formSectionHtml({
        id: "expense-extra", title: "Ghi chú", sub: "Ghi chú khoản chi", defaultOpen: !!r.note,
        body: drInput("sticky-note", "Ghi chú", `<textarea name="note" rows="3">${esc(r.note)}</textarea>`, { cls: "is-multiline" }),
      });

  return `
    <aside class="drawer${animate ? " is-entering" : ""}" role="dialog" aria-label="${rec ? "Sửa" : "Thêm"} ${typeLabel.toLowerCase()}">
      <button class="drawer-close" type="button" aria-label="Đóng" data-action="close-form">${icon("x", 18)}</button>
      <form class="record-form drawer-form">
        <div class="drawer-nav">
          <span class="drawer-kicker">${rec ? `${icon("pencil", 14)} Cập nhật` : `${icon("plus-circle", 14)} Giao dịch mới`} <span class="muted">/ ${typeLabel}</span></span>
        </div>
        <div class="drawer-head">
          <div>
            <h2${rec ? ' translate="no"' : ""}>${rec ? esc(rec.description) : (isIncome ? "Thêm khoản thu" : "Thêm khoản chi")}</h2>
            <p class="muted">${rec ? `Sửa ${typeLabel.toLowerCase()} #${rec.id} rồi bấm Cập nhật.` : "Nhập các trường có dấu *. Chi tiết bổ sung có thể thêm sau."}</p>
          </div>
        </div>
        <div class="drawer-body">
          <section class="dr-section">
            <h4>Thông tin chính</h4>
            <div class="dr-rows">${main}</div>
          </section>
          <section class="dr-section">
            <h4>Chi tiết bổ sung</h4>
            ${sections}
          </section>
          <section class="dr-section">
            <h4>${icon("paperclip", 13)} Chứng từ đính kèm</h4>
            ${rec?.attachmentCount ? `<p class="attach-note">Khoản này đã có ${rec.attachmentCount} chứng từ (xem trong màn hình chi tiết). File chọn dưới đây sẽ được thêm vào.</p>` : ""}
            <label class="attach-drop" data-drop="form">
              ${icon("upload", 20)}
              <span><b>Chọn file</b> hoặc kéo thả vào đây · ảnh, PDF, Word, Excel · tối đa 10 MB</span>
              <input type="file" multiple accept="${ATTACH_ACCEPT}" data-upload="form" hidden />
            </label>
            <ul class="attach-pending" data-slot="pending"></ul>
          </section>
        </div>
        <div class="drawer-foot">
          <button type="button" class="btn secondary" data-action="close-form">Hủy</button>
          <button class="btn primary" type="submit">${rec ? "Cập nhật" : isIncome ? "Lưu khoản thu" : "Lưu khoản chi"}</button>
        </div>
      </form>
    </aside>`;
}

// ---------------------------------------------------------------- Chứng từ

/** Danh sách file đã chọn trong form (chưa tải lên). */
function pendingFilesHtml(files) {
  return files.map((f, i) => `
    <li>
      ${icon(f.type.startsWith("image/") ? "image" : "file", 15)}
      <span class="attach-pending-name">${esc(f.name)}</span>
      <span class="muted">${fileSize(f.size)}</span>
      <button type="button" class="icon-ghost" aria-label="Bỏ file này" data-action="pending-remove" data-index="${i}">${icon("x", 14)}</button>
    </li>`).join("");
}

/** Lưới chứng từ đã lưu trong panel chi tiết. `att` = { loading, error, items }. */
function attachmentsHtml(att, locked) {
  if (!att || att.loading) return '<div class="attach-empty">Đang tải chứng từ…</div>';
  if (att.error) return `<div class="attach-empty">${esc(att.error)}</div>`;
  if (!att.items.length) {
    return `<div class="attach-empty">${icon("paperclip", 18)}<span>${locked ? "Không có chứng từ." : "Chưa có chứng từ. Bấm <b>Tải lên</b> hoặc kéo thả file vào đây."}</span></div>`;
  }
  return `<div class="attach-grid">${att.items.map((a) => {
    const isImage = a.contentType.startsWith("image/");
    const ext = (a.originalName.match(/\.([^.]+)$/)?.[1] || "file").toUpperCase();
    const created = new Date(a.createdAt).toLocaleDateString("vi-VN");
    return `
      <div class="attach-card">
        <a class="attach-thumb" href="${attachmentUrl(a.id)}" target="_blank" rel="noopener" title="Xem chứng từ">
          ${isImage ? `<img src="${attachmentUrl(a.id)}" alt="${esc(a.originalName)}" loading="lazy" />` : `<span class="attach-ext">${esc(ext)}</span>`}
        </a>
        <div class="attach-meta">
          <span class="attach-name" title="${esc(a.originalName)}" translate="no">${esc(a.originalName)}</span>
          <span class="muted">${fileSize(a.size)} · ${created}</span>
        </div>
        <div class="attach-actions">
          <a class="icon-ghost" href="${attachmentUrl(a.id)}" target="_blank" rel="noopener" title="Xem">${icon("eye", 15)}</a>
          <a class="icon-ghost" href="${attachmentUrl(a.id, true)}" title="Tải về">${icon("download", 15)}</a>
          ${locked ? "" : `<button type="button" class="icon-ghost danger" title="Xóa" data-action="att-delete" data-id="${a.id}" data-name="${esc(a.originalName)}">${icon("trash-2", 15)}</button>`}
        </div>
      </div>`;
  }).join("")}</div>`;
}

// ---------------------------------------------------------------- Panel chi tiết

/** `nav` = { index, total } để hiện nút Trước / Sau trong danh sách đang lọc. */
function recordDetailHtml(kind, rec, att, nav, animate) {
  const isIncome = kind === "income";
  const close = `<button class="drawer-close" type="button" aria-label="Đóng" data-action="close-view">${icon("x", 18)}</button>`;
  if (!rec) {
    return `
      <aside class="drawer" role="dialog">
        ${close}
        <div class="drawer-head"><div><h2>Không tìm thấy bản ghi</h2><p class="muted">Khoản này có thể đã bị xóa.</p></div></div>
      </aside>`;
  }
  const date = rec[isIncome ? "incomeDate" : "expenseDate"];
  const locked = isLocked(date);
  const st = recStatus(rec.id, kind, rec);
  const statusCls = st.k === "done" ? "ok" : st.k === "pending" ? "warn" : "neutral";
  const cats = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const catLabel = esc(rec.categoryId == null ? NO_GROUP : catName(cats, rec.categoryId));
  const amount = Number(rec.amount) || 0;
  const taxAmt = round2(afterTaxOf(rec) - amount);
  const total = afterTaxOf(rec);
  const item = itemTotalOf(rec);
  const discInfo = discountOf(rec);
  const disc = discInfo?.value || 0;
  const autoTag = (x) => (x?.auto ? ` <span class="muted" title="${AUTO_MONEY_TITLE}">(tự tính)</span>` : "");
  const subtotal = isIncome ? subtotalOf(rec) : null;
  const ship = Number(rec.shippingAmount) || 0;
  const code = isIncome ? rec.orderCode || rec.referenceCode || `IN-${String(rec.id).padStart(3, "0")}` : `EXP-${String(rec.id).padStart(3, "0")}`;
  const when = (v) => (v ? new Date(v).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
  const lockedTitle = locked ? ` title="${esc(lockMessage(date))}" disabled` : "";
  const fromEtsy = isEtsyLocked(rec);
  const editTitle = locked ? lockedTitle : fromEtsy ? ` title="${esc(ETSY_READONLY)}" disabled` : "";

  // Nhấp đúp vào dòng để sửa nhanh (trừ khoản Etsy và khoản thuộc kỳ đã khóa); * = trường bắt buộc.
  const canEdit = !locked && !fromEtsy;
  const ed = (field, required = false) => ({ edit: canEdit ? field : "", required });
  // Nhóm sản phẩm không có từ Etsy nên đơn Etsy vẫn sửa được ô này.
  const edGroup = { edit: !locked ? "categoryId" : "" };
  const basic = isIncome
    ? [
        drRow("file-text", "Tên sản phẩm", `<span translate="no">${esc(rec.description)}</span>`, "", ed("description", true)),
        drRow("calendar", "Ngày thu", esc(dmy(date)), "", ed("date", true)),
        drRow("tags", "Nhóm sản phẩm", rec.categoryId == null
          ? `<span class="muted">${NO_GROUP}</span>`
          : `<span class="badge record-list-label ${catTone(rec.categoryId)}">${catLabel}</span>`, "", edGroup),
        drRow("hash", "Mã đơn", rec.orderCode ? orderCodeHtml(rec.orderCode, rec.salesChannel === "ETSY_STORE") : dash, "", ed("orderCode")),
        drRow("store", "Kênh bán", esc(salesChannelLabel(rec.salesChannel))),
        drRow("globe", "Khu vực", regionText(rec.saleRegion), "", ed("saleRegion")),
        drRow("package", "Số lượng", esc(rec.productQty || "—"), "", ed("productQty")),
        drRow("hash", "Mã tham chiếu", rec.referenceCode ? `<span class="cell-code">${esc(rec.referenceCode)}</span>` : dash, "", ed("referenceCode")),
        drRow("sticky-note", "Ghi chú", rec.note ? `<span translate="no">${esc(rec.note)}</span>` : dash, "is-multiline", ed("note")),
      ]
    : [
        drRow("file-text", "Nội dung", `<span translate="no">${esc(rec.description)}</span>`, "", ed("description", true)),
        drRow("calendar", "Ngày chi", esc(dmy(date)), "", ed("date", true)),
        drRow("tags", "Loại chi", `<span class="cat-text ${catTone(rec.categoryId)}">${catLabel}</span>`, "", ed("categoryId", true)),
        drRow("user", "Bên nhận", `<span translate="no">${esc(rec.recipient || "—")}</span>`, "", ed("recipient")),
        drRow("map-pin", "Phạm vi", scopeText(rec.originScope), "", ed("originScope")),
        drRow("hash", "ID hóa đơn", rec.invoiceId ? `<span class="cell-code">${esc(rec.invoiceId)}</span>` : dash, "", ed("invoiceId")),
        rec.linkedIncomeId ? drRow("link", "Của khoản thu", (() => {
          const inc = store.incomes.find((x) => String(x.id) === String(rec.linkedIncomeId));
          return inc
            ? `<a class="dr-link" href="#/incomes?view=${inc.id}" translate="no">${esc(inc.description)}</a>${inc.orderCode ? ` <span class="muted" translate="no">· ${esc(inc.orderCode)}</span>` : ""}`
            : '<span class="muted">Khoản thu đã bị xóa</span>';
        })()) : "",
        drRow("credit-card", "Phương thức", esc(paymentMethodLabel(rec.paymentMethod))),
        drRow("sticky-note", "Ghi chú", rec.note ? `<span translate="no">${esc(rec.note)}</span>` : dash, "is-multiline", ed("note")),
      ];

  const money2 = (v) => esc(usd(v));
  const finance = isIncome
    ? [
        drRow("circle-dollar-sign", "Giá bán", item ? `${money2(item.value)}${autoTag(item)}` : dash, "", ed("itemTotal")),
        drRow("tags", "Giảm giá", disc ? `<span class="minus">− ${money2(disc)}</span>${rec.discountCode ? ` <span class="muted" translate="no">(${esc(rec.discountCode)})</span>` : ""}${autoTag(discInfo)}` : dash, "", ed("discountAmount")),
        drRow("circle-dollar-sign", "Thành tiền", subtotal != null ? `${money2(subtotal)} <span class="muted">(giá bán − giảm giá)</span>` : dash),
        drRow("truck", "Vận chuyển", ship ? money2(ship) : dash, "", ed("shippingAmount")),
        drRow("circle-dollar-sign", "Trước thuế", money2(amount), "", ed("amount", true)),
        drRow("percent", `Thuế (${pctLabel(rec.taxPercent)})`, money2(taxAmt), "", ed("taxPercent")),
        drRow("receipt", "Tổng thu", `<b class="plus">${money2(total)}</b> <span class="muted">≈ ${esc(money(total, "EUR", date))}</span>`, "is-total income"),
      ]
    : [
        drRow("circle-dollar-sign", "Trước thuế", money2(amount), "", ed("amount", true)),
        drRow("percent", `Thuế (${pctLabel(rec.taxPercent)})`, money2(taxAmt), "", ed("taxPercent")),
        drRow("receipt", "Tổng thanh toán", `<b class="minus">${money2(total)}</b> <span class="muted">≈ ${esc(money(total, "EUR", date))}</span>`, "is-total expense"),
      ];

  return `
    <aside class="drawer${animate ? " is-entering" : ""}" role="dialog" aria-label="Chi tiết ${isIncome ? "khoản thu" : "khoản chi"}">
      ${close}
      <div class="drawer-nav">
        <button type="button" class="drawer-nav-btn" data-action="view-prev"${nav.index <= 0 ? " disabled" : ""}>${icon("arrow-left", 16)} Trước</button>
        <span class="drawer-pos muted">${nav.index >= 0 ? `${nav.index + 1} / ${nav.total}` : ""}</span>
        <button type="button" class="drawer-nav-btn" data-action="view-next"${nav.index < 0 || nav.index >= nav.total - 1 ? " disabled" : ""}>Sau ${icon("arrow-right", 16)}</button>
      </div>
      <div class="drawer-head">
        <div class="drawer-title">
          <h2 translate="no">${esc(rec.description)}</h2>
          <p class="muted">${isIncome ? "Khoản thu" : "Khoản chi"} · <span class="dr-link">${catLabel}</span> · <span translate="no">${esc(code)}</span></p>
        </div>
        <div class="drawer-actions">
          <a class="dr-icon-btn" href="#/history?type=${rec.kind}&id=${rec.id}" title="Lịch sử chỉnh sửa">${icon("history", 16)}</a>
          <button class="dr-icon-btn danger" type="button" data-action="delete"${locked ? lockedTitle : ' title="Xóa (chuyển vào thùng rác)"'}>${icon("trash-2", 16)}</button>
          <button class="btn dr-main-btn" type="button" data-action="edit"${editTitle}>${icon(locked || fromEtsy ? "lock" : "pencil", 15)} ${locked ? "Đã khóa" : fromEtsy ? "Không sửa được" : "Sửa"}</button>
        </div>
      </div>
      <div class="drawer-body">
        <section class="dr-section">
          <h4>Trạng thái</h4>
          <div class="dr-rows">
            ${drRow("circle-check", "Trạng thái", `<span class="badge ${statusCls}">${st.t}</span>`)}
            ${store.lock.enabled ? drRow(locked ? "lock" : "lock-open", "Khóa sổ", locked
              ? `<span class="lock-text locked">Đã khóa sổ ${esc(periodName(date).toLowerCase())}</span>`
              : `<span class="lock-text open">Đang mở · sửa được đến hết ${esc(dmy(lastEditableDay(date)))}</span>`) : ""}
            ${fromEtsy ? drRow("store", "Nguồn", '<span class="lock-text locked">Nhập từ Etsy · chỉ sửa được nhóm sản phẩm và tiền xưởng / ship</span>') : ""}
            ${isEtsyAds(rec) ? drRow("store", "Nguồn", '<span class="lock-text open">Phí quảng cáo nhập từ Etsy · sửa được, Lịch sử giữ số Etsy ban đầu</span>') : ""}
            ${drRow("clock", "Tạo lúc", esc(when(rec.createdAt)))}
            ${rec.updatedAt && rec.updatedAt !== rec.createdAt ? drRow("pencil", "Cập nhật", esc(when(rec.updatedAt))) : ""}
          </div>
        </section>
        <section class="dr-section">
          <h4>Thông tin chi tiết</h4>
          <p class="dr-edit-hint muted">${canEdit ? "Nhấp đúp vào ô để sửa nhanh · " : isIncome && !locked ? "Nhấp đúp vào nhóm sản phẩm để sửa · " : ""}<span class="req">*</span> là trường bắt buộc</p>
          <div class="dr-rows">${basic.join("")}</div>
        </section>
        <section class="dr-section">
          <h4>Chi tiết tài chính</h4>
          <div class="dr-rows">${finance.join("")}</div>
          <p class="dr-foot-note muted">${hasDailyRate(date)
            ? `Tỷ giá quy đổi ngày ${esc(dmy(date))}: 1 EUR = ${fmtRate(eurToUsdOn(date))} USD (tự nhập riêng ngày này)`
            : `Tỷ giá quy đổi tháng ${esc(String(date).slice(5, 7))}/${esc(String(date).slice(0, 4))}: 1 EUR = ${fmtRate(eurToUsdOn(date))} USD
            ${hasMonthlyRate(date) ? "(tự nhập)" : `(chưa nhập tỷ giá tháng này, đang dùng mặc định 1 · <a class="dr-link" href="#/fx">Nhập tỷ giá</a>)`}`}</p>
        </section>
        ${isIncome ? costSectionHtml(rec) : ""}
        <section class="dr-section dr-attach"${locked ? "" : ' data-drop="detail"'}>
          <div class="dr-section-head">
            <h4>${icon("paperclip", 13)} Chứng từ đính kèm${att?.items?.length ? ` (${att.items.length})` : ""}</h4>
            ${locked ? "" : `
              <label class="btn secondary sm attach-upload-btn">
                ${icon("upload", 14)} Tải lên
                <input type="file" multiple accept="${ATTACH_ACCEPT}" data-upload="detail" hidden />
              </label>`}
          </div>
          <div data-slot="attachments">${attachmentsHtml(att, locked)}</div>
        </section>
      </div>
    </aside>`;
}

/** Mục "Tiền xưởng / Tiền ship" trong panel chi tiết khoản thu: sửa được ngay, kể cả đơn nhập từ Etsy. */
function costSectionHtml(rec) {
  const cost = costOf(rec, store.expenses);
  const linked = cost.items[0];
  const kindLabel = costKindLabel(rec);
  const date = rec.incomeDate;
  // Quy đổi một lần từ số USD đã cộng (không cộng các số đã làm tròn theo EUR) để hạn chế sai số.
  const m = (v) => esc(money(v, store.ccy, date));
  const before = toDisplay(cost.before, store.ccy, linked?.expenseDate || date);
  const after = toDisplay(cost.total, store.ccy, linked?.expenseDate || date);
  // Như Excel: tiền trước thuế của đơn − tiền xưởng (ngoài EU) / tiền ship (trong EU) trước thuế.
  const profit = profitOf(rec, store.expenses);
  return `
    <section class="dr-section">
      <div class="dr-section-head">
        <h4>${icon("truck", 13)} Tiền xưởng / Tiền ship</h4>
        ${linked ? `<a class="btn ghost sm" href="#/expenses?view=${linked.id}">${icon("external-link", 13)} Xem khoản chi</a>` : ""}
      </div>
      ${linked ? `<div class="dr-rows">
        ${drRow("circle-dollar-sign", `${kindLabel} trước thuế`, esc(fmtCcy(before, store.ccy)))}
        ${drRow("percent", `Thuế (${pctLabel(linked.taxPercent)})`, esc(fmtCcy(round2(after - before), store.ccy)))}
        ${drRow("receipt", `${kindLabel} sau thuế`, `<b class="minus">${esc(fmtCcy(after, store.ccy))}</b>`)}
      </div>` : ""}
      <div class="dr-rows">
        ${drRow("trending-up", "Lợi nhuận", `<b class="${profit < 0 ? "minus" : "plus"}">${m(profit)}</b>
          <span class="muted">= trước thuế − ${kindLabel.toLowerCase()} trước thuế</span>`, "is-total income")}
      </div>
      <form class="cost-form" data-form="cost">
        <div class="dr-rows">${costFieldsHtml(rec)}</div>
        <div class="cost-form-foot">
          <span class="muted">Lưu xong, số tiền này hiện ở trang Khoản chi và được tính vào báo cáo.</span>
          <button class="btn primary sm" type="submit">${icon("check", 14)} Lưu</button>
        </div>
      </form>
    </section>`;
}

// ---------------------------------------------------------------- Trang danh sách

function createRecordsPage(kind) {
  const isIncome = kind === "income";
  const basePath = isIncome ? "/incomes" : "/expenses";
  const dateKey = isIncome ? "incomeDate" : "expenseDate";
  const defsById = Object.fromEntries(colDefs(kind).map((c) => [c.id, c]));
  let s = null;

  const list = () => (isIncome ? store.incomes : store.expenses);
  const cats = () => (isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES);

  function filtered() {
    const qq = s.q.toLowerCase().trim();
    // Khoản thu tìm được cả theo ID hóa đơn tiền xưởng / tiền ship gắn với nó (lưu ở khoản chi).
    const costIds = {};
    if (isIncome && qq) {
      store.expenses.forEach((x) => {
        if (x.linkedIncomeId != null && x.invoiceId) costIds[x.linkedIncomeId] = `${costIds[x.linkedIncomeId] || ""} ${x.invoiceId}`;
      });
    }
    return list().filter((r) => {
      const text = isIncome
        ? `${r.description} ${r.referenceCode || ""} ${r.orderCode || ""} ${costIds[r.id] || ""}`
        : `${r.description} ${r.recipient || ""} ${r.invoiceId || ""} ${r.orderCode || ""}`;
      const date = r[dateKey];
      return (
        (!qq || text.toLowerCase().includes(qq)) &&
        (!s.cat || (s.cat === "none" ? r.categoryId == null : String(r.categoryId) === s.cat)) &&
        (!s.src || r.source === s.src) &&
        (!s.region || r.saleRegion === s.region) &&
        (!s.origin || r.originScope === s.origin) &&
        (!s.from || date >= s.from) &&
        (!s.to || date <= s.to)
      );
    }).sort((a, b) => String(b[dateKey]).localeCompare(String(a[dateKey])) || b.id - a.id);
  }

  /** 3 ô tổng theo đúng danh sách đang lọc (khoảng ngày, loại, nguồn, tìm kiếm…). */
  function kpis() {
    const { ccy } = store;
    const rows = filtered();
    // Đổi sang EUR thì quy từng khoản theo tỷ giá tháng của nó rồi mới cộng (giống Excel).
    const total = (pick) => rows.reduce((t, x) => t + toDisplay(pick(x), ccy, x[dateKey]), 0);
    const fmt = (v) => fmtCcy(v, ccy);
    const period = s.from || s.to
      ? `${s.from ? dmy(s.from) : "…"} → ${s.to ? dmy(s.to) : "…"}`
      : "Toàn bộ thời gian";
    const before = total((x) => x.amount);
    const after = total(afterTaxOf);
    // Lợi nhuận: quy đổi từng đơn theo tỷ giá tháng của đơn, mỗi đơn chỉ làm tròn một lần.
    const profit = isIncome ? total((x) => profitOf(x, store.expenses)) : 0;
    return isIncome
      ? [
          { label: "Số đơn hàng", value: String(rows.length), delta: period },
          { label: "Tổng doanh thu (trước thuế)", value: fmt(before), delta: period },
          { label: "Tổng sau thuế", value: fmt(after), delta: `Thuế: ${fmt(after - before)}` },
          { label: "Lợi nhuận", value: fmt(profit), delta: "Trước thuế − xưởng / ship trước thuế" },
        ]
      : [
          { label: "Số khoản chi", value: String(rows.length), delta: period },
          { label: "Tổng chi phí (trước thuế)", value: fmt(before), delta: period },
          { label: "Tổng sau thuế", value: fmt(after), delta: `Thuế: ${fmt(after - before)}` },
        ];
  }

  function headerCell(id) {
    const numeric = ["qty", "amount", "taxPercent", "afterTax", "item", "discount", "subtotal", "ship", "tax", "fx", "costBefore", "costTax", "cost", "profit"].includes(id);
    return `<th${numeric ? ' class="amount"' : ""}>${esc(defsById[id]?.label)}</th>`;
  }

  function bodyCell(id, r) {
    const { ccy } = store;
    const st = recStatus(r.id, kind, r);
    const statusCls = st.k === "done" ? "ok" : st.k === "pending" ? "warn" : "neutral";
    const srcCls = r.source === "ETSY" ? "src-etsy" : r.source === "EXCEL_IMPORT" ? "src-excel" : "src-manual";
    const sign = isIncome ? "plus" : "minus";
    const date = r[dateKey];
    // Số tiền của dòng quy đổi theo tỷ giá tháng của chính dòng đó.
    const m = (v) => money(v, ccy, date);
    switch (id) {
      case "date": return `<td><span class="cell-date">${esc(dmy(r[dateKey]))}</span></td>`;
      case "product": return `
        <td>
          <div class="cell-product-wrap">
            <button type="button" class="cell-link cell-product-name" translate="no">${esc(r.description)}</button>
            <span class="badge cell-status-badge ${statusCls}">${st.t}</span>
            ${r.attachmentCount ? `<span class="cell-attach" title="${r.attachmentCount} chứng từ">${icon("paperclip", 12)}${r.attachmentCount}</span>` : ""}
            ${r.source === "ETSY" ? `<span class="cell-src-etsy" title="${isEtsyAds(r) ? "Phí quảng cáo nhập từ Etsy · sửa được" : "Nhập từ Etsy · chỉ xem / xóa"}">Etsy</span>` : ""}
            ${r.linkedIncomeId ? '<span class="cell-src-linked" title="Tiền xưởng / tiền ship nhập từ khoản thu">Từ khoản thu</span>' : ""}
            ${isLocked(r[dateKey]) ? `<span class="cell-lock" title="${esc(lockMessage(r[dateKey]))}">${icon("lock", 12)}</span>` : ""}
          </div>
        </td>`;
      case "category": return isIncome
        ? (r.categoryId == null ? `<td>${dash}</td>` : `<td><span class="badge record-list-label ${catTone(r.categoryId)}">${esc(catName(cats(), r.categoryId))}</span></td>`)
        : `<td><span class="cat-text ${catTone(r.categoryId)}">${esc(catName(cats(), r.categoryId))}</span></td>`;
      case "order": return `<td>${orderCodeHtml(r.orderCode, r.salesChannel === "ETSY_STORE")}</td>`;
      case "payee": return `<td><span class="cell-payee" translate="no">${esc(r.recipient || "—")}</span></td>`;
      case "qty": return `<td class="amount"><span class="cell-qty">${esc(r.productQty || "—")}</span></td>`;
      case "amount": return `<td class="amount"><span class="${sign}">${isIncome ? "+" : "−"}${m(r.amount)}</span></td>`;
      case "taxPercent": return `<td class="amount"><span class="cell-tax-pct">${pctLabel(r.taxPercent)}</span></td>`;
      case "afterTax": return `<td class="amount"><strong class="${sign}">${m(afterTaxOf(r))}</strong></td>`;
      case "region": return `<td>${regionText(r.saleRegion)}</td>`;
      case "origin": return `<td>${scopeText(r.originScope)}</td>`;
      case "invoice": return `<td>${r.invoiceId ? `<span class="cell-code">${esc(r.invoiceId)}</span>` : dash}</td>`;
      case "source": return `<td><span class="badge ${srcCls}">${sourceLabel(r.source)}</span></td>`;
      case "item": {
        const item = itemTotalOf(r);
        return `<td class="amount">${item ? m(item.value) : dash}</td>`;
      }
      case "discount": {
        const disc = discountOf(r);
        return `<td class="amount">${disc ? `<span class="minus">−${m(disc.value)}</span>` : dash}</td>`;
      }
      case "subtotal": {
        const sub = subtotalOf(r);
        return `<td class="amount">${sub != null ? m(sub) : dash}</td>`;
      }
      case "ship": return `<td class="amount">${Number(r.shippingAmount) ? m(r.shippingAmount) : dash}</td>`;
      case "tax": return `<td class="amount">${m(Number(r.taxAmount) || 0)}</td>`;
      case "fx": {
        // Tỷ giá tháng của khoản này + số sau thuế quy sang loại tiền còn lại.
        const manual = hasMonthlyRate(date);
        const other = ccy === "EUR" ? "USD" : "EUR";
        return `<td class="amount">
          <span class="cell-fx${manual ? "" : " is-auto"}" title="${manual ? "Tỷ giá tự nhập" : "Chưa nhập tỷ giá tháng này · đang dùng mặc định 1"}">${fmtRate(eurToUsdOn(date))}${manual ? "" : " *"}</span>
          <div class="cell-sub">≈ ${money(afterTaxOf(r), other, date)}</div>
        </td>`;
      }
      case "costBefore":
      case "costTax":
      case "cost": {
        const cost = costOf(r, store.expenses);
        if (!cost.items.length) return `<td class="amount">${dash}</td>`;
        // Quy theo tỷ giá tháng của ngày chi; thuế = sau thuế − trước thuế (đã quy đổi) để 3 cột luôn khớp nhau.
        const d = cost.items[0].expenseDate || date;
        const before = toDisplay(cost.before, ccy, d);
        const after = toDisplay(cost.total, ccy, d);
        if (id === "costBefore") return `<td class="amount">${fmtCcy(before, ccy)}<div class="cell-sub">${costKindLabel(r)}</div></td>`;
        if (id === "costTax") return `<td class="amount">${fmtCcy(round2(after - before), ccy)}<div class="cell-sub">${pctLabel(cost.items[0].taxPercent)}</div></td>`;
        const ids = cost.items.map((x) => x.invoiceId).filter(Boolean);
        return `<td class="amount">
          <span class="minus">−${fmtCcy(after, ccy)}</span>
          <div class="cell-sub">${r.saleRegion === "IN_EU" ? "Ship" : "Xưởng"}${ids.length ? ` · <span translate="no">${esc(ids.join(", "))}</span>` : ""}</div>
        </td>`;
      }
      case "profit": {
        const profit = profitOf(r, store.expenses);
        return `<td class="amount"><strong class="${profit < 0 ? "minus" : "plus"}">${m(profit)}</strong></td>`;
      }
      default: return "<td></td>";
    }
  }

  /** Bảng + phân trang (vẽ lại riêng khi gõ tìm kiếm để ô tìm kiếm không mất focus). */
  function tableHtml() {
    const rowsAll = filtered();
    const pages = Math.max(1, Math.ceil(rowsAll.length / PAGE_SIZE));
    const p = Math.min(s.page, pages);
    const rows = rowsAll.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
    const visibleOrder = s.colOrder.filter((id) => s.cols[id]);

    const body = rows.length
      ? rows.map((r) => `<tr class="clickable" data-action="view" data-id="${r.id}">${visibleOrder.map((id) => bodyCell(id, r)).join("")}</tr>`).join("")
      : `<tr>
          <td colspan="${visibleOrder.length}">
            <div class="empty-state">
              <div class="empty-state-icon">${icon(isIncome ? "trending-up" : "receipt")}</div>
              <strong>${isIncome ? "Chưa có khoản thu nào" : "Chưa có khoản chi nào"}</strong>
              <p>${s.q || s.cat || s.src ? "Không có kết quả khớp với bộ lọc hiện tại." : isIncome ? "Bắt đầu bằng cách thêm khoản thu đầu tiên." : "Bắt đầu bằng cách thêm khoản chi đầu tiên."}</p>
            </div>
          </td>
        </tr>`;

    const pageNums = Array.from({ length: pages }, (_, i) => i + 1).filter((i) => i === 1 || i === pages || Math.abs(i - p) <= 2);
    const pager = rowsAll.length
      ? `<div class="pager">
          <span class="muted">Hiển thị ${(p - 1) * PAGE_SIZE + 1} – ${Math.min(p * PAGE_SIZE, rowsAll.length)} trên tổng số ${rowsAll.length} bản ghi</span>
          <div class="pager-pages">
            <button type="button" class="btn ghost pager-btn" data-action="page" data-page="${p - 1}"${p <= 1 ? " disabled" : ""}>Trước</button>
            ${pageNums.map((i) => `<button type="button" class="btn ${i === p ? "primary" : "ghost"} pager-btn" data-action="page" data-page="${i}">${i}</button>`).join("")}
            <button type="button" class="btn ghost pager-btn" data-action="page" data-page="${p + 1}"${p >= pages ? " disabled" : ""}>Sau</button>
          </div>
        </div>`
      : "";

    return `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>${visibleOrder.map(headerCell).join("")}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      ${pager}`;
  }

  /** Hàng bộ lọc: nhãn ở trên từng mục, lựa chọn ngắn dạng nút bấm (giống trang Báo cáo). */
  function filtersHtml() {
    const seg = (key, items) => `
      <div class="rpt-seg" role="group">
        ${items.map(([v, l]) => `<button type="button" class="rpt-seg-btn${String(s[key]) === String(v) ? " on" : ""}" data-action="set-filter" data-key="${key}" data-value="${esc(v)}">${esc(l)}</button>`).join("")}
      </div>`;
    const sources = [["", "Tất cả"], ["MANUAL", "Nhập tay"], isIncome ? ["ETSY", "Etsy"] : ["LINKED", "Từ khoản thu"]];
    if (!isIncome && list().some((r) => r.source === "ETSY")) sources.push(["ETSY", "Etsy"]); // phí quảng cáo nhập từ Etsy
    if (list().some((r) => r.source === "EXCEL_IMPORT")) sources.push(["EXCEL_IMPORT", "Excel"]);
    return `
      <div class="record-filters">
        <div class="rpt-ctl">
          <span>Thời gian</span>
          <div class="rpt-range${s.from || s.to ? " is-active" : ""}">
            ${dateFieldHtml(`${kind}-from`, s.from, 'data-filter="from"', "Từ ngày")}
            <span class="rpt-range-sep">→</span>
            ${dateFieldHtml(`${kind}-to`, s.to, 'data-filter="to"', "Đến ngày")}
          </div>
        </div>
        <div class="rpt-ctl">
          <span>${isIncome ? "Nhóm sản phẩm" : "Loại chi"}</span>
          <select class="rpt-select${s.cat ? " is-active" : ""}" data-filter="cat">
            ${optionsHtml([["", "Tất cả"], ...(isIncome ? [["none", NO_GROUP]] : []), ...cats().map((c) => [c.id, c.name])], s.cat)}
          </select>
        </div>
        <div class="rpt-ctl"><span>Nguồn</span>${seg("src", sources)}</div>
        ${isIncome
          ? `<div class="rpt-ctl"><span>Khu vực</span>${seg("region", [["", "Tất cả"], ["IN_EU", "Trong EU"], ["OUTSIDE_EU", "Ngoài EU"]])}</div>`
          : `<div class="rpt-ctl">
              <span>Phạm vi</span>
              <select class="rpt-select${s.origin ? " is-active" : ""}" data-filter="origin">${optionsHtml([["", "Tất cả"], ...SCOPES.map((x) => [x.id, x.name])], s.origin)}</select>
            </div>`}
      </div>`;
  }

  function colsModalHtml() {
    if (!s.colsOpen) return `<div class="modal-back" data-close="cols"></div>`;
    return `
      <div class="modal-back open" data-close="cols">
        <div class="modal cols-modal">
          <h3>${isIncome ? "Cột danh sách khoản thu" : "Cột danh sách khoản chi"}</h3>
          <p>Chọn cột cần hiển thị và dùng mũi tên để thay đổi thứ tự từ trái sang phải.</p>
          <div class="col-picker-actions">
            <button class="btn ghost" type="button" data-action="cols-all">Chọn tất cả</button>
            <button class="btn ghost" type="button" data-action="cols-none">Bỏ chọn</button>
          </div>
          <div class="col-picker">
            ${s.draftOrder.map((id, index) => {
              const c = defsById[id];
              return `
                <div class="col-pick${c.lock ? " is-lock" : ""}">
                  <label>
                    <input type="checkbox" data-col="${c.id}"${s.draftCols[c.id] ? " checked" : ""}${c.lock ? " disabled" : ""} />
                    <span>${esc(c.label)}${c.lock ? " · luôn hiện" : ""}</span>
                  </label>
                  <span class="col-order-actions">
                    <button type="button" aria-label="Đưa cột sang trái" data-action="col-move" data-id="${c.id}" data-step="-1"${index === 0 ? " disabled" : ""}>←</button>
                    <button type="button" aria-label="Đưa cột sang phải" data-action="col-move" data-id="${c.id}" data-step="1"${index === s.draftOrder.length - 1 ? " disabled" : ""}>→</button>
                  </span>
                </div>`;
            }).join("")}
          </div>
          <div class="modal-actions">
            <button class="btn ghost" type="button" data-action="cols-default">Mặc định</button>
            <button class="btn secondary" type="button" data-action="cols-cancel">Hủy</button>
            <button class="btn primary" type="button" data-action="cols-apply">Áp dụng</button>
          </div>
        </div>
      </div>`;
  }

  // ---------------------------------------------------------------- Đồng bộ Etsy

  function etsyStatusHtml(st) {
    if (!st) return '<div class="etsy-status">Đang kiểm tra kết nối…</div>';
    // Thiếu / sai key là việc cấu hình phía máy chủ: không hiện lỗi kỹ thuật cho người dùng (chi tiết ghi ra console khi tải trạng thái).
    if (!st.configured || st.keyError) {
      return `
        <div class="etsy-status">
          ${icon("link", 16)}
          <div>Đồng bộ Etsy chưa sẵn sàng.</div>
        </div>`;
    }
    if (!st.connected) {
      return `
        <div class="etsy-status">
          ${icon("link", 16)}
          <div><b>Đã có key, chưa đăng nhập Etsy.</b> Bấm nút bên phải để cấp quyền đọc đơn hàng của shop${st.shopId ? ` <code>${esc(st.shopId)}</code>` : ""}.</div>
          <a class="btn primary sm" href="${API_BASE}/api/v1/etsy/connect">${icon("link", 14)} Kết nối Etsy</a>
        </div>`;
    }
    return `
      <div class="etsy-status ok">
        ${icon("check", 16)}
        <div><b>Đã kết nối shop${st.shopId ? ` <span translate="no">${esc(st.shopId)}</span>` : " Etsy"}.</b> Đơn đã nhập sẽ không bị nhập trùng.</div>
        <button class="btn ghost sm" type="button" data-action="etsy-disconnect">Ngắt kết nối</button>
      </div>`;
  }

  function etsyModalHtml() {
    const e = s.etsy;
    if (!e.open) return `<div class="modal-back" data-close="etsy"></div>`;
    const orders = e.orders || [];
    const picked = orders.filter((o) => e.selected.has(o.receiptId));
    const pickedTotal = picked.reduce((t, o) => t + Number(o.amountAfterTax), 0);
    const selectable = orders.filter((o) => !o.imported);
    const allPicked = selectable.length > 0 && selectable.every((o) => e.selected.has(o.receiptId));
    let body;
    if (e.loading) body = '<div class="etsy-empty">Đang tải đơn hàng từ Etsy…</div>';
    else if (e.error) body = `<div class="etsy-empty error">${esc(e.error)}</div>`;
    else if (!e.orders) body = '<div class="etsy-empty"><span>Chọn khoảng ngày rồi bấm <b>Tải đơn hàng</b>.</span></div>';
    else if (!orders.length) body = '<div class="etsy-empty">Không có đơn nào trong khoảng ngày này.</div>';
    else {
      body = `
        <div class="table-wrap etsy-table-wrap">
          <table class="etsy-table">
            <thead><tr>
              <th><input type="checkbox" data-etsy-all${allPicked ? " checked" : ""}${selectable.length ? "" : " disabled"} aria-label="Chọn tất cả" /></th>
              <th>Ngày</th><th>Mã đơn</th><th>Sản phẩm</th><th class="amount">SL</th><th>Nơi nhận</th>
              <th class="amount">Trước thuế</th><th class="amount">Thuế</th><th class="amount">Sau thuế</th>
            </tr></thead>
            <tbody>
              ${orders.map((o) => `
                <tr class="${o.imported ? "is-imported" : ""}">
                  <td><input type="checkbox" data-etsy-pick="${esc(o.receiptId)}"${e.selected.has(o.receiptId) ? " checked" : ""}${o.imported ? " disabled" : ""} /></td>
                  <td>${esc(dmy(o.date))}</td>
                  <td>${orderCodeHtml(o.receiptId, true)}</td>
                  <td><span translate="no">${esc(o.description)}</span>${o.imported ? ' <span class="badge ok">Đã nhập</span>' : ""}${o.note ? `<div class="muted etsy-note">${esc(o.note)}</div>` : ""}</td>
                  <td class="amount">${o.quantity}</td>
                  <td>${esc(o.country)} · <span class="muted">${o.saleRegion === "IN_EU" ? "EU" : "Ngoài EU"}</span></td>
                  <td class="amount">${esc(usd(o.amount))}</td>
                  <td class="amount muted">${esc(usd(Number(o.amountAfterTax) - Number(o.amount)))}<div class="etsy-note">${esc(pctLabel(o.taxPercent))}</div></td>
                  <td class="amount"><b>${esc(usd(o.amountAfterTax))}</b></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>`;
    }
    return `
      <div class="modal-back open" data-close="etsy">
        <div class="modal etsy-modal">
          <div class="etsy-head">
            <h3>${icon("store", 18)} Đồng bộ đơn hàng Etsy</h3>
            <button class="icon-ghost" type="button" aria-label="Đóng" data-action="etsy-close">${icon("x")}</button>
          </div>
          ${etsyStatusHtml(e.status)}
          ${etsyAutoHtml(store.etsyAuto)}
          <form class="etsy-range" data-form="etsy-load">
            <label>Từ ngày ${dateFieldHtml("etsy-from", e.from, 'name="from" required', "Từ ngày")}</label>
            <label>Đến ngày ${dateFieldHtml("etsy-to", e.to, 'name="to" required', "Đến ngày")}</label>
            <button class="btn secondary sm" type="submit"${e.loading || !e.status?.ready ? " disabled" : ""}>${icon("refresh-cw", 14)} Tải đơn hàng</button>
            <span class="etsy-quick">
              ${ETSY_RANGES.map(([id, label]) => `<button class="btn ghost sm" type="button" data-action="etsy-range" data-range="${id}">${label}</button>`).join("")}
            </span>
            ${orders.length ? `<span class="muted etsy-count">${orders.length} đơn · ${orders.filter((o) => o.imported).length} đã nhập</span>` : ""}
          </form>
          ${etsyRatesHtml()}
          ${body}
          <div class="modal-actions etsy-foot">
            <span class="muted">${picked.length ? `Đã chọn ${picked.length} đơn · ${esc(usd(pickedTotal))} (gồm thuế)` : "Đơn nhập vào để trống nhóm sản phẩm (nhập sau), kênh bán Etsy Store."}</span>
            <button class="btn secondary" type="button" data-action="etsy-close">Đóng</button>
            <button class="btn primary" type="button" data-action="etsy-import"${picked.length && !e.importing ? "" : " disabled"}>
              ${e.importing ? "Đang nhập…" : `Nhập ${picked.length || ""} đơn`}
            </button>
          </div>
        </div>
      </div>`;
  }

  /** Mục "Tự động đồng bộ" trong hộp Đồng bộ Etsy: bật / tắt, chu kỳ, kết quả lần chạy gần nhất, nút chạy ngay. */
  function etsyAutoHtml(a) {
    if (!a) return "";
    const intervals = [[15, "15 phút"], [30, "30 phút"], [60, "1 giờ"], [360, "6 giờ"], [1440, "1 ngày"]];
    const when = (v) => new Date(v).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
    const last = a.lastRunAt
      ? `Lần cuối ${when(a.lastRunAt)}: ${a.lastError ? `<span class="minus">${esc(a.lastError)}</span>` : `nhập ${a.lastImported} đơn mới`}`
      : "Chưa chạy lần nào";
    return `
      <div class="etsy-auto${a.enabled ? " on" : ""}">
        <label class="etsy-auto-toggle">
          <input type="checkbox" data-etsy-auto${a.enabled ? " checked" : ""}${a.ready ? "" : " disabled"} />
          <span class="etsy-switch" aria-hidden="true"></span>
          <b>Tự động đồng bộ</b>
        </label>
        <label class="etsy-auto-every">mỗi
          <select data-etsy-interval>${optionsHtml(intervals, a.intervalMinutes)}</select>
        </label>
        <span class="etsy-auto-info muted">${a.ready ? `Lấy đơn ${a.lookbackDays} ngày gần nhất, đơn đã nhập thì bỏ qua · ${last}` : "Kết nối Etsy để bật tự động đồng bộ."}</span>
        <button class="btn ghost sm" type="button" data-action="etsy-auto-run"${a.ready && !a.running && !s.etsy.autoRunning ? "" : " disabled"}>
          ${icon("refresh-cw", 14)} ${a.running || s.etsy.autoRunning ? "Đang đồng bộ…" : "Đồng bộ ngay"}
        </button>
      </div>`;
  }

  async function saveEtsyAuto(enabled, interval) {
    try {
      store.etsyAuto = await setEtsyAutoSync(enabled, interval);
      toast(enabled ? `Đã bật tự động đồng bộ Etsy (mỗi ${interval >= 60 ? `${interval / 60} giờ` : `${interval} phút`})` : "Đã tắt tự động đồng bộ Etsy");
    } catch (err) {
      toast(err.message);
    }
    render(root);
  }

  async function runEtsyAuto() {
    s.etsy.autoRunning = true;
    render(root);
    try {
      const a = await runEtsyAutoSync();
      store.etsyAuto = a;
      store.etsyAutoSeen = a.lastRunAt;
      if (a.lastError) toast(a.lastError);
      else toast(a.lastImported ? `Đã nhập ${a.lastImported} đơn Etsy mới` : "Không có đơn Etsy mới");
      if (a.lastImported) await reload();
    } catch (err) {
      toast(err.message);
    }
    s.etsy.autoRunning = false;
    if (s.etsy.orders) loadEtsyOrders(); // cập nhật nhãn "Đã nhập" trong danh sách đang xem
    else render(root);
  }

  const ETSY_RANGES = [["month", "Tháng này"], ["prev-month", "Tháng trước"], ["quarter", "Quý này"], ["prev-quarter", "Quý trước"]];

  /** Khoảng ngày [from, to] của nút chọn nhanh. Kỳ đã qua lấy trọn kỳ, kỳ hiện tại lấy đến hôm nay. */
  function etsyRange(id) {
    const now = new Date();
    const months = id.endsWith("quarter") ? 3 : 1;
    const start = Math.floor(now.getMonth() / months) * months - (id.startsWith("prev") ? months : 0);
    const from = new Date(now.getFullYear(), start, 1);
    const end = new Date(now.getFullYear(), start + months, 0);
    return [localISO(from), localISO(end < now ? end : now)];
  }

  /** Các tháng (yyyy-MM) nằm trong khoảng ngày đang chọn, tối đa 13 tháng. */
  function monthsBetween(from, to) {
    if (!from || !to) return [];
    const [a, b] = from <= to ? [from, to] : [to, from];
    const out = [];
    let [y, m] = a.split("-").map(Number);
    while (out.length < 13) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (key > b.slice(0, 7)) break;
      out.push(key);
      if (++m > 12) { m = 1; y++; }
    }
    return out;
  }

  /** Ô nhập tỷ giá EUR → USD cho từng tháng trong khoảng ngày; để trống = mặc định 1. */
  function etsyRatesHtml() {
    const months = monthsBetween(s.etsy.from, s.etsy.to);
    if (!months.length) return "";
    const rates = s.etsy.rates || {};
    return `
      <div class="etsy-rates">
        <span class="etsy-rates-title">${icon("refresh-cw", 13)} Tỷ giá 1 EUR = ? USD theo tháng
          <span class="muted">(tự nhập; để trống = mặc định 1)</span></span>
        <div class="etsy-rates-list">
          ${months.map((m) => `
            <label>${esc(m.slice(5))}/${esc(m.slice(0, 4))}
              <input type="number" step="0.0001" min="0" data-fx-month="${m}" value="${rates[m] ?? ""}" placeholder="1" />
            </label>`).join("")}
        </div>
      </div>`;
  }

  async function saveEtsyRate(month, value) {
    const rate = Number(value);
    try {
      if (value === "" || !(rate > 0)) {
        if (s.etsy.rates?.[month] != null) await deleteFxMonthly(month);
        delete s.etsy.rates[month];
        toast(`Tháng ${month.slice(5)}/${month.slice(0, 4)}: dùng mặc định 1 EUR = 1 USD`);
      } else {
        const saved = await setFxMonthly(month, rate);
        s.etsy.rates[month] = saved.eurToUsd;
        toast(`Đã lưu tỷ giá tháng ${month.slice(5)}/${month.slice(0, 4)}: 1 EUR = ${saved.eurToUsd} USD`);
      }
    } catch (err) {
      toast(err.message);
      return;
    }
    loadFx();
    // Đơn đang hiện được tính lại theo tỷ giá mới.
    if (s.etsy.orders) loadEtsyOrders();
    else render(root);
  }

  async function openEtsy() {
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 30);
    s.etsy = { ...s.etsy, open: true, status: null, error: "", from: s.etsy.from || localISO(from), to: s.etsy.to || localISO(today) };
    render(root);
    try {
      const [status, rates, auto] = await Promise.all([etsyStatus(), fxMonthly().catch(() => []), etsyAutoSync().catch(() => null)]);
      if (auto) store.etsyAuto = auto;
      s.etsy.status = status;
      if (status && (!status.configured || status.keyError)) {
        console.warn(status.keyError
          ? `Key Etsy chưa dùng được: ${status.keyError}`
          : `Chưa cấu hình key Etsy (backend/Host/Fin.Host.Api/etsy.settings.json). Callback URL: ${status.redirectUri}`);
      }
      s.etsy.rates = Object.fromEntries((rates || []).map((r) => [r.month, r.eurToUsd]));
    } catch (err) {
      s.etsy.status = { ready: false, configured: false, redirectUri: "" };
      s.etsy.error = err.message;
    }
    if (s.etsy.open) render(root);
  }

  async function loadEtsyOrders() {
    s.etsy = { ...s.etsy, loading: true, error: "", orders: null, selected: new Set() };
    render(root);
    try {
      const orders = await etsyOrders(s.etsy.from, s.etsy.to);
      s.etsy.orders = orders;
      s.etsy.selected = new Set(orders.filter((o) => !o.imported).map((o) => o.receiptId));
    } catch (err) {
      s.etsy.error = err.message;
    }
    s.etsy.loading = false;
    if (s.etsy.open) render(root);
  }

  async function importEtsy() {
    const picked = (s.etsy.orders || []).filter((o) => s.etsy.selected.has(o.receiptId));
    if (!picked.length) return;
    s.etsy.importing = true;
    render(root);
    try {
      const res = await etsyImport(picked);
      toast(`Đã nhập ${res.imported} đơn Etsy${res.skipped ? `, bỏ qua ${res.skipped} đơn trùng` : ""}`);
      s.etsy.importing = false;
      await reload();
      await loadEtsyOrders();
    } catch (err) {
      toast(err.message);
      s.etsy.importing = false;
      render(root);
    }
  }

  // Modal quản lý dùng chung: loại thu / loại chi, hoặc phạm vi khoản chi (s.catsMode === "scope").
  const catsList = () => (s.catsMode === "scope" ? SCOPES : cats());
  const catsApiKind = () => (s.catsMode === "scope" ? "scope" : kind);
  const catsLabel = () => (s.catsMode === "scope" ? "phạm vi" : isIncome ? "nhóm sản phẩm" : "loại chi");

  /** Modal thêm / đổi tên / xóa loại thu, loại chi hoặc phạm vi khoản chi. */
  function catsModalHtml() {
    if (!s.catsOpen) return `<div class="modal-back" data-close="cats"></div>`;
    const label = catsLabel();
    // Phạm vi xóa được cả khi đang dùng (backend để trống phạm vi của các khoản đó); loại thu / chi thì không.
    const freeDelete = s.catsMode === "scope";
    const rows = catsList().map((c) => {
      const used = Number(c.used) || 0;
      if (s.catEditId === c.id) {
        return `
          <li class="cat-row is-editing">
            <form class="cat-inline-form" data-form="cat-edit" data-id="${c.id}">
              <input name="name" value="${esc(c.name)}" maxlength="150" required aria-label="Tên ${label}" />
              <button class="btn primary sm" type="submit">${icon("check", 14)} Lưu</button>
              <button class="btn ghost sm" type="button" data-action="cat-edit-cancel">Hủy</button>
            </form>
          </li>`;
      }
      return `
        <li class="cat-row">
          <span class="badge record-list-label ${catTone(c.id)}">${esc(c.name)}</span>
          <span class="cat-used muted">${used ? `${used} khoản` : "Chưa dùng"}</span>
          <span class="cat-row-actions">
            <button type="button" class="icon-ghost" title="Đổi tên" data-action="cat-edit" data-id="${c.id}">${icon("pencil", 15)}</button>
            <button type="button" class="icon-ghost danger" data-action="cat-delete" data-id="${c.id}"
              title="${used && !freeDelete ? `Đang dùng bởi ${used} khoản, không thể xóa` : "Xóa"}"${used && !freeDelete ? " disabled" : ""}>${icon("trash-2", 15)}</button>
          </span>
        </li>`;
    }).join("");
    return `
      <div class="modal-back open" data-close="cats">
        <div class="modal cats-modal">
          <h3>${icon(s.catsMode === "scope" ? "map-pin" : "tags", 17)} Quản lý ${label}</h3>
          <p>${freeDelete
            ? "Thêm, đổi tên hoặc xóa phạm vi tự do. Xóa phạm vi đang dùng thì các khoản đó chuyển về để trống phạm vi."
            : `Thêm, đổi tên hoặc xóa ${label}. Chỉ xóa được ${label} chưa có khoản nào sử dụng.`}</p>
          <form class="cat-inline-form cat-add-form" data-form="cat-add">
            <input name="name" placeholder="Tên ${label} mới, ví dụ: ${s.catsMode === "scope" ? "Trong EU" : isIncome ? "Trang sức" : "Phí Etsy"}" maxlength="150" required aria-label="Tên ${label} mới" />
            <button class="btn primary sm" type="submit">${icon("plus", 14)} Thêm</button>
          </form>
          <ul class="cat-list">${rows || `<li class="cat-row muted">Chưa có ${label} nào.</li>`}</ul>
          <div class="modal-actions">
            <button class="btn secondary" type="button" data-action="cats-close">Đóng</button>
          </div>
        </div>
      </div>`;
  }

  let root = null;
  let query = new URLSearchParams();

  function formTarget() {
    const formNew = query.get("new") === "1";
    const formEdit = query.get("edit");
    if (!formNew && !formEdit) return null;
    const rec = formEdit ? list().find((x) => x.id === Number(formEdit)) || null : null;
    if (isEtsyLocked(rec)) return null; // Đơn Etsy không có form sửa (phí quảng cáo Etsy thì có).
    return { rec };
  }

  /**
   * Đóng form thêm / sửa. `backToId`: id khoản cần mở lại panel chi tiết (Hủy / Cập nhật quay về chi tiết của khoản đó);
   * không truyền = đóng hẳn (bấm ra ngoài).
   */
  function closeForm(backToId = null) {
    navigate(basePath, true);
    if (backToId) openView(backToId, false);
  }

  function render(el, q) {
    root = el;
    if (q) query = q;
    const hasFilters = Boolean(s.cat || s.src || s.region || s.origin || s.from || s.to);
    const form = formTarget();
    const viewRec = s.viewId ? list().find((x) => x.id === s.viewId) : null;
    // Quay về từ trang đăng nhập Etsy (?etsy=connected / ?etsy=error).
    const etsyResult = query.get("etsy");
    if (etsyResult) {
      toast(etsyResult === "connected" ? "Đã kết nối tài khoản Etsy" : "Kết nối Etsy không thành công");
      navigate(basePath, true);
      openEtsy();
      return;
    }
    // Mở thẳng chi tiết một khoản (?view=id), ví dụ bấm từ khoản chi sang khoản thu gắn với nó.
    const viewParam = Number(query.get("view"));
    if (viewParam) {
      navigate(basePath, true);
      openView(viewParam);
      return;
    }
    // Mở form khác (thêm mới / sửa bản ghi khác) thì bỏ danh sách file đang chọn.
    const formKey = form ? query.toString() : "";
    if (formKey !== s.formKey) { s.formKey = formKey; s.pendingFiles = []; s.formAnim = Boolean(form); }

    const scroll = detailScroll();
    root.innerHTML = `
      <div class="kpis${isIncome ? "" : " kpis-3"}" data-slot="kpis">${kpis().map(kpiCardHtml).join("")}</div>
      <article class="card" style="padding: 0">
        <div class="card-head list-card-head">
          <div class="list-card-left">
            <label class="search-box list-search">
              ${icon("search")}
              <input type="search" data-filter="q" placeholder="${isIncome ? "Tìm sản phẩm, mã đơn, mã xưởng / ship..." : "Tìm nội dung, bên nhận, ID hóa đơn..."}" value="${esc(s.q)}" />
            </label>
            <button class="btn ghost sm list-filter-btn${s.showFilters ? " active" : ""}${hasFilters ? " has-filter" : ""}" type="button" data-action="toggle-filters">
              ${icon("sliders-horizontal", 14)}
              <span>Bộ lọc</span>
              ${hasFilters ? '<span class="filter-active-dot"></span>' : ""}
              ${icon(s.showFilters ? "chevron-up" : "chevron-down", 12)}
            </button>
          </div>
          <div class="list-card-actions">
            ${isIncome ? `<button class="btn ghost sm etsy-btn" type="button" data-action="etsy-open">${icon("store")} Đồng bộ Etsy${store.etsyAuto?.enabled ? '<span class="etsy-auto-badge" title="Đang bật đồng bộ tự động">Tự động</span>' : ""}</button>` : ""}
            <button class="btn ghost sm" type="button" data-action="open-cats">${icon("tags")} ${isIncome ? "Nhóm sản phẩm" : "Loại chi"}</button>
            ${isIncome ? "" : `<button class="btn ghost sm" type="button" data-action="open-scopes">${icon("map-pin")} Phạm vi</button>`}
            <button class="btn ghost sm" type="button" data-action="open-cols">${icon("columns-3")} Cột hiển thị</button>
            <button class="btn ghost sm" type="button" data-action="clear-filters">${icon("rotate-ccw")} Xóa bộ lọc</button>
            <button class="btn primary sm" type="button" data-action="new">
              ${icon("plus", 14)} ${isIncome ? "Thêm khoản thu" : "Thêm khoản chi"}
            </button>
          </div>
        </div>
        ${s.showFilters ? filtersHtml() : ""}
        <div data-slot="table">${tableHtml()}</div>
      </article>

      ${colsModalHtml()}
      ${catsModalHtml()}
      ${etsyModalHtml()}

      <div class="drawer-back${s.viewId ? " open" : ""}" data-close="view">
        <div data-slot="detail">${s.viewId ? recordDetailHtml(kind, viewRec, s.att, viewNav(), s.viewAnim) : ""}</div>
      </div>

      <div class="drawer-back${form ? " open" : ""}" data-close="form">
        <div>${form ? recordFormHtml(kind, form.rec, s.formAnim) : ""}</div>
      </div>`;
    restoreDetailScroll(scroll);
    s.viewAnim = false;
    s.formAnim = false;

    if (form) refreshPending();
    applyCostDraft();
    bindRoot(root, {
      click: onClick, dblclick: onDblClick, change: onChange, input: onInput, submit: onSubmit,
      dragover: onDragOver, dragleave: onDragLeave, drop: onDrop,
    });
  }

  function refreshTable() {
    root.querySelector('[data-slot="table"]').innerHTML = tableHtml();
    root.querySelector('[data-slot="kpis"]').innerHTML = kpis().map(kpiCardHtml).join("");
  }

  function refreshPending() {
    const slot = root.querySelector('[data-slot="pending"]');
    if (slot) slot.innerHTML = pendingFilesHtml(s.pendingFiles);
  }

  function refreshDetail() {
    const slot = root.querySelector('[data-slot="detail"]');
    if (!slot || !s.viewId) return;
    const scroll = detailScroll();
    slot.innerHTML = recordDetailHtml(kind, list().find((x) => x.id === s.viewId), s.att, viewNav(), false);
    applyCostDraft();
    restoreDetailScroll(scroll);
  }

  // Tiền xưởng / ship đang gõ dở (chưa bấm Lưu) được giữ lại khi panel chi tiết vẽ lại: tải chứng từ lên,
  // dữ liệu tải lại, sửa nhanh ô khác… Chỉ áp dụng cho đúng khoản đang xem và đúng loại tiền lúc gõ.
  function rememberCostDraft(form) {
    s.costDraft = {
      id: s.viewId,
      ccy: store.ccy,
      values: Object.fromEntries(COST_DRAFT_FIELDS.map((name) => [name, form.elements[name]?.value ?? ""])),
    };
  }
  function applyCostDraft() {
    const d = s.costDraft;
    if (!d || d.id !== s.viewId || d.ccy !== store.ccy) return;
    const form = root.querySelector('form[data-form="cost"]');
    if (!form) return;
    for (const [name, value] of Object.entries(d.values)) {
      if (form.elements[name]) form.elements[name].value = value;
    }
    refreshCostSplit(form);
  }

  // Vẽ lại panel chi tiết (sau khi sửa nhanh, lưu, tải chứng từ…) vẫn giữ nguyên chỗ đang cuộn tới.
  function detailScroll() {
    const body = root?.querySelector('[data-slot="detail"] .drawer-body');
    return body && s.viewId ? { id: s.viewId, top: body.scrollTop } : null;
  }
  function restoreDetailScroll(scroll) {
    if (!scroll || scroll.id !== s.viewId) return;
    const body = root.querySelector('[data-slot="detail"] .drawer-body');
    if (body) body.scrollTop = scroll.top;
  }

  /** Vị trí của khoản đang xem trong danh sách đang lọc (cho nút Trước / Sau). */
  function viewNav() {
    const ids = filtered().map((r) => r.id);
    return { ids, index: ids.indexOf(s.viewId), total: ids.length };
  }

  /** Mở panel chi tiết và tải danh sách chứng từ của bản ghi. */
  async function openView(id, animate = true) {
    if (s.costDraft?.id !== id) s.costDraft = null;
    s.viewId = id;
    s.viewAnim = animate;
    s.att = { id, loading: true, items: [] };
    render(root);
    await loadAttachments(id);
  }

  async function loadAttachments(id) {
    try {
      const items = await listAttachments(kind, id);
      if (s.viewId === id) s.att = { id, items };
    } catch (e) {
      if (s.viewId === id) s.att = { id, items: [], error: e.message };
    }
    refreshDetail();
  }

  async function uploadToDetail(files) {
    const ok = acceptFiles(files);
    if (!ok.length || !s.viewId) return;
    const id = s.viewId;
    s.att = { ...s.att, loading: true };
    refreshDetail();
    try {
      await uploadAttachments(kind, id, ok);
      toast(`Đã tải lên ${ok.length} chứng từ`);
    } catch (e) {
      toast(e.message);
    }
    await loadAttachments(id);
    reload();
  }

  function addPending(files) {
    s.pendingFiles = [...s.pendingFiles, ...acceptFiles(files)];
    refreshPending();
  }

  // ---- Kéo thả file vào vùng chứng từ (form hoặc chi tiết)
  function onDragOver(e) {
    const zone = e.target.closest("[data-drop]");
    if (!zone) return;
    e.preventDefault();
    zone.classList.add("is-dragover");
  }
  function onDragLeave(e) {
    const zone = e.target.closest("[data-drop]");
    if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove("is-dragover");
  }
  function onDrop(e) {
    const zone = e.target.closest("[data-drop]");
    if (!zone) return;
    e.preventDefault();
    zone.classList.remove("is-dragover");
    if (zone.dataset.drop === "form") addPending(e.dataTransfer.files);
    else uploadToDetail(e.dataTransfer.files);
  }

  function onClick(e) {
    if (e.target.closest(".cell-editor")) return; // đang sửa trong ô
    // Bấm ra ngoài (vào nền mờ) để đóng modal.
    if (e.target.classList.contains("modal-back") || e.target.classList.contains("drawer-back")) {
      const which = e.target.dataset.close;
      if (which === "cols") { s.colsOpen = false; render(root); }
      else if (which === "cats") { s.catsOpen = false; s.catEditId = null; render(root); }
      else if (which === "etsy") { s.etsy.open = false; render(root); }
      else if (which === "view") { s.viewId = null; render(root); }
      else if (which === "form") closeForm(); // bấm ra ngoài: đóng hẳn
      return;
    }
    const el = e.target.closest("[data-action]");
    if (!el || !root.contains(el)) return;
    switch (el.dataset.action) {
      case "open-link": break; // để trình duyệt mở link, không mở chi tiết dòng
      case "toggle-filters": s.showFilters = !s.showFilters; render(root); break;
      case "set-filter": s[el.dataset.key] = el.dataset.value; s.page = 1; render(root); break;
      case "clear-filters":
        Object.assign(s, { q: "", cat: "", src: "", region: "", origin: "", from: "", to: "", page: 1 });
        render(root);
        break;
      case "new": navigate(`${basePath}?new=1`); break;
      case "page": s.page = Number(el.dataset.page); refreshTable(); break;
      case "view": if (e.detail === 1) openView(Number(el.dataset.id)); break; // bấm vào dòng = xem chi tiết
      case "view-prev":
      case "view-next": {
        const n = viewNav();
        const next = n.ids[n.index + (el.dataset.action === "view-next" ? 1 : -1)];
        if (next) openView(next, false);
        break;
      }
      case "pending-remove":
        s.pendingFiles = s.pendingFiles.filter((_, i) => i !== Number(el.dataset.index));
        refreshPending();
        break;
      case "att-delete": {
        const attId = Number(el.dataset.id);
        const recId = s.viewId;
        openConfirm(`Xóa chứng từ "${el.dataset.name}"? File sẽ bị xóa vĩnh viễn.`, async () => {
          try {
            await deleteAttachment(attId);
            toast("Đã xóa chứng từ");
          } catch (err) {
            toast(err.message);
          }
          await loadAttachments(recId);
          reload();
        }, { title: "Xóa chứng từ", okLabel: "Xóa chứng từ", note: "File chứng từ bị xóa sẽ không khôi phục được." });
        break;
      }
      case "etsy-open": openEtsy(); break;
      case "etsy-close": s.etsy.open = false; render(root); break;
      case "etsy-range": {
        [s.etsy.from, s.etsy.to] = etsyRange(el.dataset.range);
        if (s.etsy.status?.ready) loadEtsyOrders();
        else render(root);
        break;
      }
      case "etsy-import": importEtsy(); break;
      case "etsy-auto-run": runEtsyAuto(); break;
      case "etsy-disconnect":
        openConfirm("Ngắt kết nối tài khoản Etsy? Bạn có thể kết nối lại bất cứ lúc nào.", async () => {
          try { await etsyDisconnect(); toast("Đã ngắt kết nối Etsy"); } catch (err) { toast(err.message); }
          openEtsy();
        }, { title: "Ngắt kết nối Etsy", okLabel: "Ngắt kết nối", icon: "link" });
        break;
      case "open-cats": s.catsOpen = true; s.catsMode = "category"; s.catEditId = null; render(root); break;
      case "open-scopes": s.catsOpen = true; s.catsMode = "scope"; s.catEditId = null; render(root); break;
      case "cats-close": s.catsOpen = false; s.catEditId = null; render(root); break;
      case "cat-edit":
        s.catEditId = Number(el.dataset.id);
        render(root);
        root.querySelector('[data-form="cat-edit"] input')?.select();
        break;
      case "cat-edit-cancel": s.catEditId = null; render(root); break;
      case "cat-delete": {
        const cat = catsList().find((c) => c.id === Number(el.dataset.id));
        const used = Number(cat?.used) || 0;
        openConfirm(`Xóa ${catsLabel()} "${cat?.name}"?`, async () => {
          if (await removeCategory(catsApiKind(), cat.id)) toast(`Đã xóa "${cat.name}"`);
        }, {
          title: `Xóa ${catsLabel()}`,
          note: s.catsMode === "scope" && used ? `${used} khoản chi đang dùng phạm vi này sẽ chuyển về để trống phạm vi.` : "",
        });
        break;
      }
      case "close-view": s.viewId = null; render(root); break;
      case "edit": {
        const id = s.viewId;
        if (isEtsyLocked(list().find((x) => x.id === id))) { toast(ETSY_READONLY); break; }
        s.viewId = null;
        navigate(`${basePath}?edit=${id}`);
        break;
      }
      case "delete": {
        const id = s.viewId;
        openConfirm(isIncome ? "Bạn có chắc muốn xóa khoản thu này?" : "Bạn có chắc muốn xóa khoản chi này?", () => {
          s.viewId = null;
          softDelete(kind, id);
        }, { note: TRASH_NOTE });
        break;
      }
      case "close-form": closeForm(formTarget()?.rec?.id); break; // Hủy: quay lại chi tiết khoản đang sửa
      case "toggle-section": toggleFormSection(el); break;
      case "open-cols":
        s.draftCols = loadCols(kind);
        s.draftOrder = loadColOrder(kind);
        s.colsOpen = true;
        render(root);
        break;
      case "cols-all": s.draftCols = Object.fromEntries(colDefs(kind).map((c) => [c.id, true])); render(root); break;
      case "cols-none": s.draftCols = Object.fromEntries(colDefs(kind).map((c) => [c.id, Boolean(c.lock)])); render(root); break;
      case "col-move": {
        const order = [...s.draftOrder];
        const from = order.indexOf(el.dataset.id);
        const to = from + Number(el.dataset.step);
        if (from >= 0 && to >= 0 && to < order.length) {
          [order[from], order[to]] = [order[to], order[from]];
          s.draftOrder = order;
        }
        render(root);
        break;
      }
      case "cols-default":
        localStorage.removeItem("fm_cols_v3_" + kind);
        localStorage.removeItem("fm_col_order_v3_" + kind);
        s.cols = defaultColMap(kind);
        s.colOrder = colDefs(kind).map((c) => c.id);
        s.colsOpen = false;
        render(root);
        break;
      case "cols-cancel": s.colsOpen = false; render(root); break;
      case "cols-apply":
        saveCols(kind, s.draftCols, s.draftOrder);
        s.cols = s.draftCols;
        s.colOrder = s.draftOrder;
        s.colsOpen = false;
        render(root);
        break;
    }
  }

  function onChange(e) {
    const t = e.target;
    const draftForm = t.closest?.('form[data-form="cost"]');
    if (draftForm) rememberCostDraft(draftForm);
    if (t.classList.contains("date-text")) return; // ô gõ ngày: chỉ áp dụng khi gõ xong (xem app.js)
    if (t.dataset.action === "ccy") { setCcy(t.value); return; }
    if (t.dataset.col) { s.draftCols = { ...s.draftCols, [t.dataset.col]: t.checked }; return; }
    if (t.dataset.etsyPick !== undefined) {
      if (t.checked) s.etsy.selected.add(t.dataset.etsyPick);
      else s.etsy.selected.delete(t.dataset.etsyPick);
      render(root);
      return;
    }
    if (t.dataset.etsyAll !== undefined) {
      const selectable = (s.etsy.orders || []).filter((o) => !o.imported).map((o) => o.receiptId);
      s.etsy.selected = new Set(t.checked ? selectable : []);
      render(root);
      return;
    }
    if (t.dataset.fxMonth) { saveEtsyRate(t.dataset.fxMonth, t.value.trim()); return; }
    if (t.dataset.etsyAuto !== undefined || t.dataset.etsyInterval !== undefined) {
      const box = t.closest(".etsy-auto");
      saveEtsyAuto(box.querySelector("[data-etsy-auto]").checked, Number(box.querySelector("[data-etsy-interval]").value));
      return;
    }
    if (t.closest('[data-form="etsy-load"]')) { s.etsy[t.name] = t.value; render(root); return; }
    if (t.dataset.upload) {
      if (t.dataset.upload === "form") addPending(t.files);
      else uploadToDetail(t.files);
      t.value = "";
      return;
    }
    const key = t.dataset.filter;
    if (key && key !== "q") {
      s[key] = t.value;
      s.page = 1;
      render(root);
    }
  }

  function onInput(e) {
    const t = e.target;
    const draftForm = t.closest?.('form[data-form="cost"]');
    if (draftForm) rememberCostDraft(draftForm);
    if (t.dataset.filter === "q") {
      s.q = t.value;
      s.page = 1;
      refreshTable();
      return;
    }
    // Tự tính tiền sau thuế, subtotal và phần trước thuế / thuế của tiền xưởng / ship trong form.
    const costForm = t.closest('form.record-form, form[data-form="cost"]');
    if (costForm && (t.name === "costAmount" || t.name === "costTax")) refreshCostSplit(costForm);
    const form = t.closest("form.record-form");
    if (form && (t.name === "amount" || t.name === "taxPercent")) {
      const amount = form.elements.amount.value;
      form.elements.amountAfterTax.value = amount === "" ? "" : afterTax(amount, form.elements.taxPercent.value);
    }
    if (form?.elements.subtotal && (t.name === "itemTotal" || t.name === "discountAmount")) {
      const item = form.elements.itemTotal.value;
      if (item !== "") form.elements.subtotal.value = round2(Number(item) - (Number(form.elements.discountAmount.value) || 0));
    }
  }

  async function onSubmit(e) {
    const form = e.target;
    if (form.dataset.form === "etsy-load") {
      e.preventDefault();
      s.etsy.from = form.elements.from.value;
      s.etsy.to = form.elements.to.value;
      loadEtsyOrders();
      return;
    }
    const catForm = form.dataset.form;
    if (catForm === "cat-add" || catForm === "cat-edit") {
      e.preventDefault();
      const name = form.elements.name.value.trim();
      if (!name) return;
      if (catForm === "cat-add") {
        if (await addCategory(catsApiKind(), name)) toast(`Đã thêm "${name}"`);
      } else {
        s.catEditId = null;
        if (await renameCategory(catsApiKind(), Number(form.dataset.id), name)) toast(`Đã đổi tên thành "${name}"`);
        else render(root);
      }
      return;
    }
    if (form.dataset.form === "cost") {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      if (await saveCost(s.viewId, costInputOf(form, store.ccy))) {
        s.costDraft = null;
        await reload();
      } else btn.disabled = false;
      return;
    }
    if (!form.matches("form.record-form")) return;
    e.preventDefault();
    const rec = formTarget()?.rec;
    const fd = new FormData(form);
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    const payload = isIncome ? incomePayload(fd, store.ccy) : expensePayload(fd, store.ccy);
    if (isIncome) {
      payload.categoryId = await resolveProductGroup(fd.get("productGroup"));
      if (payload.categoryId === undefined) { submitBtn.disabled = false; return; }
    }
    const cost = isIncome ? costInputOf(form, store.ccy) : null;
    const saved = await saveRecord(kind, { ...payload, source: rec?.source || "MANUAL" }, rec?.id, s.pendingFiles);
    // Tiền xưởng / tiền ship: lưu sau khi đã có khoản thu (chỉ khi có nhập, hoặc khi bỏ số đã có).
    if (saved && cost && (cost.amount > 0 || (rec && costOf(rec, store.expenses).items.length))) {
      if (await saveCost(saved.id, cost)) await reload();
    }
    if (saved) {
      s.pendingFiles = [];
      closeForm(saved.id); // lưu xong mở chi tiết của khoản vừa thêm / sửa
    } else {
      submitBtn.disabled = false;
    }
  }

  // ---------------------------------------------------------------- Sửa nhanh: nhấp đúp vào trường trong panel chi tiết
  const MONEY_FIELDS = ["amount", "itemTotal", "discountAmount", "shippingAmount", "taxAmount"];
  const REQUIRED_FIELDS = ["date", "description", "categoryId", "amount"];

  /** Giá trị đang hiện của trường (tiền theo loại tiền đang xem) — dùng làm giá trị ban đầu của ô sửa. */
  function editValue(r, field) {
    const v = field === "date" ? r[dateKey] : r[field];
    if (field === "categoryId" && isIncome) return r.categoryId == null ? "" : catName(cats(), r.categoryId);
    if (MONEY_FIELDS.includes(field)) return v === 0 || v ? String(toDisplay(v, store.ccy, r[dateKey])) : "";
    if (field === "cost") {
      const cost = costOf(r, store.expenses);
      return cost.total ? String(toDisplay(cost.total, store.ccy, cost.items[0]?.expenseDate || r[dateKey])) : "";
    }
    return v == null ? "" : String(v);
  }

  function editorHtml(r, field) {
    const v = esc(editValue(r, field));
    const num = (extra = "") => `<input class="cell-editor" type="number" step="0.01" min="0" value="${v}" ${extra}/>`;
    switch (field) {
      case "date": return `<input class="cell-editor" type="date" value="${v}" />`;
      case "categoryId": return isIncome
        ? `<input class="cell-editor" list="product-groups" autocomplete="off" value="${v}" placeholder="Để trống = ${NO_GROUP}" />${productGroupListHtml()}`
        : `<select class="cell-editor">${optionsHtml(cats().map((c) => [c.id, c.name]), r.categoryId)}</select>`;
      case "saleRegion": return `<select class="cell-editor">${optionsHtml([["", "—"], ["IN_EU", "Trong EU"], ["OUTSIDE_EU", "Ngoài EU"]], r.saleRegion)}</select>`;
      case "originScope": return `<select class="cell-editor">${optionsHtml([["", "—"], ...SCOPES.map((x) => [x.id, x.name])], r.originScope)}</select>`;
      case "productQty": return `<input class="cell-editor" type="number" min="1" step="1" value="${v}" />`;
      case "taxPercent": return num('max="100" placeholder="%"');
      case "note": return `<textarea class="cell-editor" rows="3">${v}</textarea>`;
      default:
        return MONEY_FIELDS.includes(field) || field === "cost"
          ? num(`placeholder="${store.ccy}"`)
          : `<input class="cell-editor" value="${v}" />`;
    }
  }

  /** Lý do không sửa được (chuỗi rỗng = sửa được). */
  function editBlock(r, field) {
    if (!field) return "Cột này tự tính, không sửa trực tiếp được.";
    if (field === "cost") return ""; // tiền xưởng / ship sửa được cả với đơn Etsy; backend kiểm tra khóa sổ theo ngày chi
    if (isEtsyLocked(r) && !(isIncome && field === "categoryId")) return ETSY_READONLY; // nhóm sản phẩm không có từ Etsy
    if (isLocked(r[dateKey])) return lockMessage(r[dateKey]);
    return "";
  }

  /** Biến `container` (giá trị của một dòng trong panel) thành ô nhập. Enter / bấm ra ngoài = lưu, Esc = hủy. */
  function startEdit(container, r, field) {
    const block = editBlock(r, field);
    if (block) { toast(block); return; }
    container.innerHTML = editorHtml(r, field);
    const editor = container.querySelector(".cell-editor");
    editor.focus();
    try { editor.select?.(); } catch { /* ô ngày / chọn không hỗ trợ select() */ }
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      if (save) commitEdit(r, field, editor.value.trim());
      else cancelEdit();
    };
    editor.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); finish(false); }
      else if (e.key === "Enter" && !(editor.tagName === "TEXTAREA" && e.shiftKey)) { e.preventDefault(); finish(true); }
    });
    editor.addEventListener("blur", () => finish(true));
    if (editor.tagName === "SELECT") editor.addEventListener("change", () => finish(true));
  }

  function cancelEdit() {
    refreshTable();
    refreshDetail();
  }

  async function commitEdit(r, field, raw) {
    if (raw === editValue(r, field)) { cancelEdit(); return; } // không đổi gì
    // Nhóm sản phẩm của khoản thu được để trống (chưa phân nhóm).
    if (REQUIRED_FIELDS.includes(field) && !(isIncome && field === "categoryId") && raw === "") { toast("Trường này bắt buộc, không được để trống."); cancelEdit(); return; }
    const { ccy } = store;
    if (field === "cost") {
      const linked = costOf(r, store.expenses).items[0];
      const date = linked?.expenseDate || r[dateKey];
      const ok = await saveCost(r.id, {
        amount: fromDisplayNum(raw, ccy, 0, date),
        taxPercent: linked ? Number(linked.taxPercent) || 0 : r.saleRegion === "IN_EU" ? 19 : 0,
        invoiceId: linked?.invoiceId || "",
        payee: linked?.recipient || "",
        originScope: linked?.originScope || "",
        date,
      });
      if (ok) await reload(); else cancelEdit();
      return;
    }
    let value = raw;
    if (MONEY_FIELDS.includes(field)) value = field === "amount" ? fromDisplayNum(raw, ccy, 0, r[dateKey]) : fromDisplay(raw, ccy, r[dateKey]);
    else if (field === "taxPercent") value = Number(raw || 0);
    else if (field === "productQty") value = raw ? Math.max(1, Math.round(Number(raw))) : null;
    else if (field === "categoryId") {
      value = isIncome ? await resolveProductGroup(raw) : Number(raw);
      if (value === undefined) { cancelEdit(); return; }
    }
    const next = { ...r, [field === "date" ? dateKey : field]: value };
    next.amountAfterTax = afterTax(next.amount, next.taxPercent);
    if (!(await saveRecord(kind, next, r.id))) cancelEdit();
  }

  function onDblClick(e) {
    if (e.target.closest(".cell-editor, a")) return;
    const dr = e.target.closest(".dr-row[data-edit]");
    const rec = s.viewId ? list().find((x) => x.id === s.viewId) : null;
    if (dr && rec) {
      window.getSelection()?.removeAllRanges();
      startEdit(dr.querySelector(".dr-value"), rec, dr.dataset.edit);
    }
  }

  /** Lưu tiền xưởng / tiền ship của khoản thu `incomeId`. Trả về true nếu thành công. */
  async function saveCost(incomeId, cost) {
    if (!incomeId || !cost) return false;
    try {
      await setIncomeCost(incomeId, cost);
      toast(cost.amount > 0 ? "Đã lưu tiền xưởng / tiền ship (đã thêm vào Khoản chi)" : "Đã bỏ tiền xưởng / tiền ship của khoản thu");
      return true;
    } catch (err) {
      toast(err.message);
      return false;
    }
  }

  return {
    init() {
      s = {
        q: "", cat: "", src: "", region: "", origin: "", from: "", to: "", page: 1,
        showFilters: false, cols: loadCols(kind), colOrder: loadColOrder(kind),
        colsOpen: false, draftCols: {}, draftOrder: [], viewId: null, costDraft: null,
        att: null, pendingFiles: [], formKey: "", catsOpen: false, catsMode: "category", catEditId: null, viewAnim: false, formAnim: false,
        etsy: { open: false, from: "", to: "", orders: null, selected: new Set(), rates: {} },
      };
    },
    render,
    destroy() {},
  };
}

const IncomesPage = createRecordsPage("income");
const ExpensesPage = createRecordsPage("expense");
