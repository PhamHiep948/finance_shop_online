// Trang Thùng rác (#/trash): các khoản đã xóa, khôi phục hoặc xóa vĩnh viễn. Tự xóa sau `retentionDays` ngày.
const TrashPage = {
  s: null,

  init() {
    this.s = { items: [], retentionDays: 30, loading: false, loaded: false, error: "", selected: new Set(), kind: "", q: "" };
  },

  destroy() {},

  async load() {
    const s = this.s;
    s.loading = true;
    try {
      const res = await listTrash();
      // Số tiền lưu theo loại tiền lúc nhập: quy sang USD như các trang khác.
      s.items = res.items.map((r) => ({ ...r, amount: usdOf(r.amount, r.currencyCode, r.date), amountAfterTax: usdOf(r.amountAfterTax, r.currencyCode, r.date) }));
      s.retentionDays = res.retentionDays;
      s.error = "";
      const ids = new Set(s.items.map((r) => r.id));
      s.selected = new Set([...s.selected].filter((id) => ids.has(id)));
    } catch (e) {
      s.error = e.message;
    }
    s.loading = false;
    s.loaded = true;
    if (current.page === this) this.render(this.root);
  },

  daysLeft(row) {
    const deleted = new Date(row.deletedAt);
    const purgeAt = new Date(deleted.getTime() + this.s.retentionDays * 86400000);
    return Math.max(0, Math.ceil((purgeAt - Date.now()) / 86400000));
  },

  visible() {
    const { kind, q } = this.s;
    const qq = q.toLowerCase();
    return this.s.items.filter((r) => (!kind || r.kind === kind) && (!qq || `${r.description} ${r.orderCode || ""} ${r.payee || ""}`.toLowerCase().includes(qq)));
  },

  async restore(ids) {
    let ok = 0;
    for (const id of ids) if (await restoreEntry(id, true)) ok += 1;
    if (ok) toast(`Đã khôi phục ${ok} khoản`);
    await this.load();
  },

  purge(ids, label) {
    openConfirm(label, async () => {
      try {
        for (const id of ids) await purgeEntry(id);
        toast(`Đã xóa vĩnh viễn ${ids.length} khoản`);
      } catch (e) {
        toast(e.message);
      }
      await this.load();
    }, { title: "Xóa vĩnh viễn", okLabel: "Xóa vĩnh viễn", note: "Không thể khôi phục. Chứng từ đính kèm cũng bị xóa." });
  },

  render(root) {
    this.root = root;
    const s = this.s;
    if (!s.loaded && !s.loading) { this.load(); }

    const rows = this.visible();
    const allChecked = rows.length > 0 && rows.every((r) => s.selected.has(r.id));
    const selectedIds = [...s.selected];

    const rowHtml = (r) => {
      const isIncome = r.kind === "INCOME";
      const left = this.daysLeft(r);
      const deletedAt = new Date(r.deletedAt);
      return `
        <tr>
          <td><input type="checkbox" data-pick="${r.id}"${s.selected.has(r.id) ? " checked" : ""} aria-label="Chọn" /></td>
          <td><span class="trash-kind ${isIncome ? "income" : "expense"}">${isIncome ? "Thu" : "Chi"}</span></td>
          <td>
            <div class="trash-desc" translate="no">${esc(r.description)}</div>
            <div class="muted trash-sub">
              <span translate="no">${esc(isIncome ? r.orderCode || "" : r.payee || "")}</span>
              ${r.attachmentCount ? `<span class="cell-attach">${icon("paperclip", 12)}${r.attachmentCount}</span>` : ""}
            </div>
          </td>
          <td>${esc(catName(isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES, r.categoryId))}</td>
          <td><span class="cell-date">${esc(dmy(r.date))}</span></td>
          <td class="amount"><strong class="${isIncome ? "plus" : "minus"}">${esc(money(r.amountAfterTax, store.ccy, r.date))}</strong></td>
          <td><span class="cell-date">${deletedAt.toLocaleDateString("vi-VN")} ${deletedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span></td>
          <td><span class="trash-left${left <= 3 ? " soon" : ""}">${left === 0 ? "Hôm nay" : `${left} ngày`}</span></td>
          <td>
            <div class="trash-actions">
              <button class="btn secondary sm" type="button" data-action="restore" data-id="${r.id}"${isLocked(r.date) ? ` disabled title="${esc(lockMessage(r.date))} Không thể khôi phục."` : ""}>${icon(isLocked(r.date) ? "lock" : "archive-restore", 14)} Khôi phục</button>
              <button class="icon-ghost danger" type="button" title="Xóa vĩnh viễn" data-action="purge" data-id="${r.id}">${icon("trash-2", 15)}</button>
            </div>
          </td>
        </tr>`;
    };

    let body;
    if (s.error) body = `<tr><td colspan="9"><div class="empty-state"><strong>Không tải được thùng rác</strong><p>${esc(s.error)}</p></div></td></tr>`;
    else if (!s.loaded) body = '<tr><td colspan="9"><div class="empty-state"><p>Đang tải…</p></div></td></tr>';
    else if (!rows.length) {
      body = `<tr><td colspan="9"><div class="empty-state"><div class="empty-state-icon">${icon("trash-2")}</div>
        <strong>${s.items.length ? "Không có khoản nào khớp bộ lọc" : "Thùng rác trống"}</strong>
        <p>Khi bạn xóa khoản thu hoặc khoản chi, chúng sẽ nằm ở đây ${s.retentionDays} ngày để có thể khôi phục.</p></div></td></tr>`;
    } else body = rows.map(rowHtml).join("");

    root.innerHTML = `
      <div class="trash-banner">
        ${icon("info", 16)}
        <div>Khoản bị xóa được giữ trong thùng rác <b>${s.retentionDays} ngày</b>, sau đó hệ thống tự xóa vĩnh viễn (kể cả chứng từ đính kèm).
        Bạn có thể khôi phục bất cứ lúc nào trước thời hạn.</div>
      </div>
      <article class="card" style="padding: 0">
        <div class="card-head list-card-head">
          <div class="list-card-left">
            <label class="search-box list-search">
              ${icon("search")}
              <input type="search" data-field="q" placeholder="Tìm nội dung, mã đơn, bên nhận…" value="${esc(s.q)}" />
            </label>
            <select class="toolbar-ctrl" data-field="kind">${optionsHtml([["", "Tất cả"], ["INCOME", "Khoản thu"], ["EXPENSE", "Khoản chi"]], s.kind)}</select>
          </div>
          <div class="list-card-actions">
            ${selectedIds.length ? `
              <span class="muted trash-selected">Đã chọn ${selectedIds.length}</span>
              <button class="btn secondary sm" type="button" data-action="restore-selected">${icon("archive-restore", 14)} Khôi phục</button>
              <button class="btn danger sm" type="button" data-action="purge-selected">${icon("trash-2", 14)} Xóa vĩnh viễn</button>` : ""}
            <button class="btn ghost sm" type="button" data-action="empty"${s.items.length ? "" : " disabled"}>${icon("trash-2", 14)} Làm trống thùng rác</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table trash-table">
            <thead><tr>
              <th><input type="checkbox" data-all${allChecked ? " checked" : ""}${rows.length ? "" : " disabled"} aria-label="Chọn tất cả" /></th>
              <th>Loại</th><th>Nội dung</th><th>Danh mục</th><th>Ngày</th><th class="amount">Số tiền</th>
              <th>Đã xóa lúc</th><th>Tự xóa sau</th><th></th>
            </tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </article>`;

    bindRoot(root, {
      click: (e) => {
        const el = e.target.closest("[data-action]");
        if (!el) return;
        const id = Number(el.dataset.id);
        switch (el.dataset.action) {
          case "restore": this.restore([id]); break;
          case "purge": {
            const row = s.items.find((r) => r.id === id);
            this.purge([id], `Xóa vĩnh viễn “${row?.description}”?`);
            break;
          }
          case "restore-selected": this.restore(selectedIds); break;
          case "purge-selected": this.purge(selectedIds, `Xóa vĩnh viễn ${selectedIds.length} khoản đã chọn?`); break;
          case "empty":
            openConfirm(`Làm trống thùng rác? ${s.items.length} khoản và chứng từ của chúng sẽ bị xóa vĩnh viễn.`, async () => {
              try {
                const res = await emptyTrash();
                toast(`Đã xóa vĩnh viễn ${res.purged} khoản`);
              } catch (err) {
                toast(err.message);
              }
              await this.load();
            }, { title: "Làm trống thùng rác", okLabel: "Xóa vĩnh viễn tất cả", note: "Không thể khôi phục sau khi xóa." });
            break;
        }
      },
      change: (e) => {
        const t = e.target;
        if (t.dataset.pick) {
          const id = Number(t.dataset.pick);
          if (t.checked) s.selected.add(id); else s.selected.delete(id);
          this.render(root);
        } else if (t.dataset.all !== undefined) {
          s.selected = new Set(t.checked ? this.visible().map((r) => r.id) : []);
          this.render(root);
        } else if (t.dataset.field === "kind") {
          s.kind = t.value;
          this.render(root);
        }
      },
      input: (e) => {
        if (e.target.dataset.field !== "q") return;
        s.q = e.target.value;
        this.render(root);
        const input = root.querySelector('[data-field="q"]');
        input.focus();
        input.setSelectionRange(s.q.length, s.q.length);
      },
    });
  },
};
