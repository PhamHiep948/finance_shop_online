// Trang Lịch sử chỉnh sửa (#/history). Có thể mở sẵn bộ lọc theo một khoản: #/history?type=EXPENSE&id=12
const AUDIT_ACTIONS = {
  CREATE: { text: "Đã thêm", icon: "plus", tone: "create" },
  UPDATE: { text: "Đã sửa", icon: "pencil", tone: "update" },
  DELETE: { text: "Đã xóa", icon: "trash-2", tone: "delete" },
  RESTORE: { text: "Đã khôi phục", icon: "archive-restore", tone: "restore" },
  PURGE: { text: "Đã xóa vĩnh viễn", icon: "x", tone: "purge" },
  ATTACH_ADD: { text: "Đã đính kèm chứng từ vào", icon: "paperclip", tone: "attach" },
  ATTACH_DELETE: { text: "Đã xóa chứng từ của", icon: "paperclip", tone: "delete" },
};
const AUDIT_FIELDS = {
  name: "Tên loại", date: "Ngày", description: "Nội dung", categoryId: "Loại", amount: "Số tiền trước thuế",
  taxPercent: "% thuế", amountAfterTax: "Sau thuế", orderCode: "Mã đơn", saleRegion: "Khu vực bán",
  salesChannel: "Kênh bán", productQty: "Số lượng", payee: "Bên nhận", originScope: "Phạm vi",
  paymentMethod: "Phương thức", referenceCode: "Mã tham chiếu", unitPrice: "Đơn giá", itemTotal: "Giá bán",
  discountAmount: "Giảm giá", discountCode: "Mã giảm giá", subtotal: "Thành tiền", shippingAmount: "Vận chuyển",
  taxAmount: "Thuế (tiền)", note: "Ghi chú", invoiceId: "ID hóa đơn",
};
const AUDIT_MONEY = ["amount", "amountAfterTax", "unitPrice", "itemTotal", "discountAmount", "subtotal", "shippingAmount", "taxAmount"];

function auditValue(field, v) {
  if (v === null || v === undefined || v === "") return '<span class="muted">—</span>';
  if (AUDIT_MONEY.includes(field)) return esc(usd(v));
  if (field === "taxPercent") return `${esc(v)}%`;
  if (field === "date") return esc(dmy(v));
  if (field === "categoryId") {
    const cat = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].find((c) => String(c.id) === String(v));
    return cat ? esc(cat.name) : `<span class="muted">#${esc(v)} (đã xóa)</span>`;
  }
  if (field === "saleRegion") return esc(saleRegionLabel(v));
  if (field === "originScope") return esc(originScopeLabel(v));
  if (field === "salesChannel") return esc(salesChannelLabel(v));
  if (field === "paymentMethod") return esc(paymentMethodLabel(v));
  return esc(v);
}

function auditEntityText(item) {
  if (item.entityType === "INCOME") return "khoản thu";
  if (item.entityType === "EXPENSE") return "khoản chi";
  return (item.detail || "loại").toLowerCase();
}

function auditDayLabel(date) {
  const d = new Date(date);
  const key = localISO(d);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (key === localISO(today)) return "Hôm nay";
  if (key === localISO(yesterday)) return "Hôm qua";
  return d.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
}

const HistoryPage = {
  s: null,

  init() {
    this.s = {
      entityType: "", action: "", from: "", to: "", search: "", entityId: "",
      page: 1, items: [], total: 0, totalPages: 0, loading: false, loaded: false, error: "", open: new Set(),
    };
  },

  destroy() {},

  async load(append = false) {
    const s = this.s;
    s.loading = true;
    if (!append) { s.page = 1; s.items = []; }
    this.render(this.root);
    try {
      const res = await listAudit({
        page: s.page, pageSize: 40, entityType: s.entityType, action: s.action,
        entityId: s.entityId, search: s.search, dateFrom: s.from, dateTo: s.to,
      });
      s.items = append ? [...s.items, ...res.items] : res.items;
      s.total = res.totalItems;
      s.totalPages = res.totalPages;
      s.error = "";
    } catch (e) {
      s.error = e.message;
    }
    s.loading = false;
    s.loaded = true;
    if (current.page === this) this.render(this.root);
  },

  render(root, query) {
    this.root = root;
    const s = this.s;
    // Bộ lọc theo một khoản cụ thể lấy từ URL.
    if (query) {
      const id = query.get("id") || "";
      const type = query.get("type") || "";
      if (id !== s.entityId || (id && type !== s.entityType)) {
        s.entityId = id;
        if (id) s.entityType = type;
        s.loaded = false;
      }
    }
    if (!s.loaded && !s.loading) { this.load(); return; }

    const groups = [];
    s.items.forEach((item) => {
      const day = auditDayLabel(item.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(item);
      else groups.push({ day, items: [item] });
    });

    const itemHtml = (item) => {
      const a = AUDIT_ACTIONS[item.action] || { text: item.action, icon: "info", tone: "update" };
      const time = new Date(item.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
      const changes = item.changes ? Object.entries(item.changes) : [];
      const isOpen = item.action === "UPDATE" || s.open.has(item.id);
      const isEntry = item.entityType === "INCOME" || item.entityType === "EXPENSE";
      const detail = item.action.startsWith("ATTACH") ? `Tệp: ${item.detail}` : isEntry ? item.detail : "";
      return `
        <li class="audit-item">
          <span class="audit-icon tone-${a.tone}">${icon(a.icon, 15)}</span>
          <div class="audit-body">
            <div class="audit-title">
              <span>${a.text} ${auditEntityText(item)} <b translate="no">“${esc(item.label)}”</b></span>
              <time>${time}</time>
            </div>
            <div class="audit-meta">
              ${detail ? `<span>${esc(detail)}</span>` : ""}
              ${isEntry ? `<span class="muted">#${item.entityId}</span>` : ""}
              ${isEntry && !s.entityId ? `<button type="button" class="link-btn" data-action="only" data-type="${item.entityType}" data-id="${item.entityId}">Lịch sử của khoản này</button>` : ""}
              ${changes.length && item.action !== "UPDATE" ? `<button type="button" class="link-btn" data-action="toggle" data-id="${item.id}">${isOpen ? "Ẩn chi tiết" : `Xem ${changes.length} trường`}</button>` : ""}
            </div>
            ${changes.length && isOpen ? `
              <table class="audit-changes">
                <thead><tr><th>Trường</th><th>${item.action === "CREATE" ? "" : "Trước"}</th><th>${item.action === "CREATE" ? "Giá trị" : "Sau"}</th></tr></thead>
                <tbody>
                  ${changes.map(([field, c]) => `
                    <tr>
                      <td>${esc(AUDIT_FIELDS[field] || field)}</td>
                      <td class="audit-from" translate="no">${item.action === "CREATE" ? "" : auditValue(field, c.from)}</td>
                      <td class="audit-to" translate="no">${auditValue(field, c.to)}</td>
                    </tr>`).join("")}
                </tbody>
              </table>` : ""}
          </div>
        </li>`;
    };

    let listHtml;
    if (s.error) listHtml = `<div class="empty-state"><strong>Không tải được lịch sử</strong><p>${esc(s.error)}</p></div>`;
    else if (!s.items.length && s.loading) listHtml = '<div class="empty-state"><p>Đang tải…</p></div>';
    else if (!s.items.length) {
      listHtml = `<div class="empty-state"><div class="empty-state-icon">${icon("history")}</div><strong>Chưa có thao tác nào</strong><p>Các lần thêm, sửa, xóa khoản thu chi và loại sẽ hiện ở đây.</p></div>`;
    } else {
      listHtml = groups.map((g) => `
        <section class="audit-day">
          <h4>${esc(g.day)}</h4>
          <ul class="audit-list">${g.items.map(itemHtml).join("")}</ul>
        </section>`).join("");
    }

    const typeOptions = [["", "Tất cả đối tượng"], ["ENTRY", "Khoản thu & chi"], ["INCOME", "Khoản thu"], ["EXPENSE", "Khoản chi"], ["CATEGORY", "Nhóm sản phẩm / loại chi"]];
    const actionOptions = [["", "Tất cả thao tác"], ["CREATE", "Thêm mới"], ["UPDATE", "Sửa"], ["DELETE", "Xóa (vào thùng rác)"], ["RESTORE", "Khôi phục"], ["PURGE", "Xóa vĩnh viễn"], ["ATTACH", "Chứng từ"]];
    const hasFilter = s.entityType || s.action || s.from || s.to || s.search || s.entityId;

    root.innerHTML = `
      <article class="card" style="padding: 0">
        <div class="card-head list-card-head history-head">
          <form class="history-filters" data-form="filters">
            <label class="search-box list-search">
              ${icon("search")}
              <input type="search" name="search" placeholder="Tìm theo nội dung, tên file…" value="${esc(s.search)}" />
            </label>
            <select class="toolbar-ctrl" name="entityType"${s.entityId ? " disabled" : ""}>${optionsHtml(typeOptions, s.entityType)}</select>
            <select class="toolbar-ctrl" name="action">${optionsHtml(actionOptions, s.action)}</select>
            <span class="toolbar-daterange">
              ${dateFieldHtml("hist-from", s.from, 'name="from"', "Từ ngày", "toolbar-ctrl")}
              <span class="toolbar-date-sep">→</span>
              ${dateFieldHtml("hist-to", s.to, 'name="to"', "Đến ngày", "toolbar-ctrl")}
            </span>
            ${hasFilter ? `<button class="btn ghost sm" type="button" data-action="clear">${icon("rotate-ccw")} Xóa bộ lọc</button>` : ""}
          </form>
        </div>
        ${s.entityId ? `
          <div class="history-chip">
            ${icon("history", 14)} Đang xem lịch sử của ${s.entityType === "INCOME" ? "khoản thu" : "khoản chi"} <b>#${esc(s.entityId)}</b>
            <button type="button" class="icon-ghost" aria-label="Bỏ lọc" data-action="all">${icon("x", 14)}</button>
          </div>` : ""}
        <div class="history-summary muted">${s.loaded ? `${s.total} thao tác${hasFilter ? " khớp bộ lọc" : ""}` : ""}</div>
        <div class="history-body">${listHtml}</div>
        ${s.page < s.totalPages ? `
          <div class="history-more">
            <button class="btn secondary" type="button" data-action="more"${s.loading ? " disabled" : ""}>${s.loading ? "Đang tải…" : "Tải thêm"}</button>
          </div>` : ""}
      </article>`;

    bindRoot(root, {
      click: (e) => {
        const el = e.target.closest("[data-action]");
        if (!el) return;
        const act = el.dataset.action;
        if (act === "toggle") {
          const id = Number(el.dataset.id);
          if (s.open.has(id)) s.open.delete(id); else s.open.add(id);
          this.render(root);
        } else if (act === "more") {
          s.page += 1;
          this.load(true);
        } else if (act === "only") {
          navigate(`/history?type=${el.dataset.type}&id=${el.dataset.id}`);
        } else if (act === "all") {
          s.entityType = "";
          navigate("/history");
        } else if (act === "clear") {
          Object.assign(s, { entityType: "", action: "", from: "", to: "", search: "" });
          if (s.entityId) navigate("/history");
          else this.load();
        }
      },
      change: (e) => {
        const t = e.target;
        if (!t.name || t.name === "search") return;
        s[t.name] = t.value;
        this.load();
      },
      submit: (e) => {
        e.preventDefault();
        s.search = e.target.elements.search.value.trim();
        this.load();
      },
      input: (e) => {
        // Xóa hết ô tìm kiếm thì tải lại ngay.
        if (e.target.name === "search" && !e.target.value && s.search) { s.search = ""; this.load(); }
      },
    });
  },
};
