// Trang Báo cáo (#/reports).
const ReportsPage = {
  state: null,
  charts: [],

  init() {
    // sel: id các loại thu / loại chi đang chọn (rỗng = tất cả); group: id nhóm đang áp dụng.
    this.state = { range: null, kind: "ALL", src: "", sel: [], group: "", pickOpen: false, groupsOpen: false };
    // Biểu đồ chỉ chạy hiệu ứng lần đầu vào trang; đổi bộ lọc sau đó vẽ ngay, không nhấp nháy.
    this.calm = false;
  },

  /**
   * Cập nhật riêng khung chọn loại khi đang tick (không vẽ lại cả trang → số liệu, biểu đồ không nháy).
   * Bộ lọc được áp dụng khi đóng khung (Xong / bấm ra ngoài).
   */
  refreshPick(root) {
    const s = this.state;
    const sel = new Set(s.sel);
    const wrap = root.querySelector(".rpt-pick-wrap");
    const old = wrap?.querySelector(".rpt-pick-panel");
    if (!old) return;
    const btn = wrap.querySelector(".rpt-pick-btn");
    btn.classList.toggle("on", sel.size > 0);
    btn.querySelector("span").textContent = sel.size ? `Đã chọn ${sel.size} loại` : "Tất cả loại";
    const groupSelect = root.querySelector('[data-field="group"]');
    if (groupSelect) groupSelect.value = s.group;
    const scroll = old.querySelector(".rpt-pick-cols")?.scrollTop || 0;
    const draftName = old.querySelector("#rpt-new-group")?.value || "";
    const left = old.style.left;
    old.outerHTML = this.pickPanelHtml(sel);
    const panel = wrap.querySelector(".rpt-pick-panel");
    panel.style.left = left;
    panel.querySelector(".rpt-pick-cols").scrollTop = scroll;
    panel.querySelector("#rpt-new-group").value = draftName;
  },

  destroy() {
    this.charts.forEach((c) => c.destroy());
    this.charts = [];
  },

  async exportReport(btn) {
    const r = this.report;
    if (!r || (!r.inc.length && !r.exp.length)) {
      toast("Không có dữ liệu trong kỳ đã chọn để xuất.");
      return;
    }
    const isPdf = btn.dataset.format === "pdf";
    const label = btn.querySelector("span");
    const old = label.textContent;
    btn.disabled = true;
    label.textContent = "Đang xuất…";
    try {
      await (isPdf ? exportReportPdf(r) : exportReportExcel(r));
      toast(isPdf ? "Đã xuất báo cáo PDF" : "Đã xuất báo cáo Excel");
    } catch (e) {
      console.error(e);
      toast(e.message || "Xuất báo cáo thất bại");
    } finally {
      btn.disabled = false;
      label.textContent = old;
    }
  },

  /** Danh sách tick chọn nhiều loại thu / loại chi. */
  pickPanelHtml(sel) {
    const s = this.state;
    const col = (kind, title, cats) => `
      <div class="rpt-pick-col">
        <div class="rpt-pick-head"><b>${title}</b>
          <button type="button" class="link-btn" data-action="pick-all" data-kind="${kind}">${cats.length && cats.every((c) => sel.has(c.id)) ? "Bỏ hết" : "Chọn hết"}</button>
        </div>
        ${cats.map((c) => `
          <label class="rpt-pick-item"><input type="checkbox" data-pick="${c.id}"${sel.has(c.id) ? " checked" : ""} /> <span>${esc(c.name)}</span></label>`).join("")
          || '<span class="muted">Chưa có loại nào.</span>'}
      </div>`;
    return `
      <div class="rpt-pick-panel">
        <div class="rpt-pick-cols">
          ${s.kind !== "EXPENSE" ? col("INCOME", "Nhóm sản phẩm", INCOME_CATEGORIES) : ""}
          ${s.kind !== "INCOME" ? col("EXPENSE", "Loại chi", EXPENSE_CATEGORIES) : ""}
        </div>
        <div class="rpt-pick-foot">
          <input type="text" class="toolbar-ctrl" id="rpt-new-group" placeholder="Tên nhóm, VD: Chi phí Etsy" maxlength="150" />
          <button type="button" class="btn secondary sm" data-action="pick-save"${sel.size ? "" : " disabled"}>${icon("plus", 13)} Lưu thành nhóm</button>
          <span class="rpt-pick-spacer"></span>
          <button type="button" class="btn ghost sm" data-action="pick-clear">Bỏ chọn</button>
          <button type="button" class="btn primary sm" data-action="pick-close">Xong</button>
        </div>
      </div>`;
  },

  /**
   * Quản lý nhóm dạng danh sách – chi tiết: bên trái là các nhóm (tìm, thêm), bên phải là nhóm đang chọn
   * (đổi tên, xóa, tick loại thu / loại chi). Nhiều nhóm vẫn dễ nhìn, không phình thành bảng nhiều cột.
   */
  groupsModalHtml() {
    const s = this.state;
    if (!s.groupsOpen) return "";
    const groups = CATEGORY_GROUPS;
    const cur = groups.find((g) => g.id === s.groupSel) || groups[0];
    const catSection = (kind, title, cats) => {
      const all = cats.length > 0 && cats.every((c) => cur.categoryIds.includes(c.id));
      return `
        <div class="gm-sec">
          <div class="gm-sec-head">
            <b>${title}</b> <span class="muted">${cats.filter((c) => cur.categoryIds.includes(c.id)).length}/${cats.length}</span>
            <button type="button" class="link-btn" data-action="gm-all" data-kind="${kind}" data-on="${all ? "0" : "1"}">${all ? "Bỏ hết" : "Chọn hết"}</button>
          </div>
          <div class="gm-cats">
            ${cats.map((c) => `
              <label class="gm-cat-chip${cur.categoryIds.includes(c.id) ? " on" : ""}" data-name="${esc(c.name.toLowerCase())}">
                <input type="checkbox" data-gm-group="${cur.id}" data-gm-cat="${c.id}"${cur.categoryIds.includes(c.id) ? " checked" : ""} />
                <span>${esc(c.name)}</span>
              </label>`).join("") || '<span class="muted">Chưa có loại nào.</span>'}
          </div>
        </div>`;
    };
    return `
      <div class="modal-back open">
        <div class="modal groups-modal gm2">
          <div class="gm2-head">
            <h3>${icon("columns-3", 17)} Nhóm loại thu / loại chi</h3>
            <button class="icon-ghost" type="button" aria-label="Đóng" data-action="groups-close">${icon("x")}</button>
          </div>
          <div class="gm2-body">
            <aside class="gm2-list">
              <form class="gm2-add" data-form="group-add">
                <input name="name" placeholder="Tên nhóm mới…" maxlength="150" required aria-label="Tên nhóm mới" />
                <button class="btn primary sm" type="submit" title="Thêm nhóm">${icon("plus", 14)}</button>
              </form>
              ${groups.length > 6 ? `<input class="gm2-search" data-gq placeholder="Tìm nhóm…" aria-label="Tìm nhóm" />` : ""}
              <ul class="gm2-groups">
                ${groups.map((g) => `
                  <li><button type="button" class="gm2-group${cur && g.id === cur.id ? " on" : ""}" data-action="group-pick" data-id="${g.id}" data-name="${esc(g.name.toLowerCase())}">
                    <span class="gm2-group-name">${esc(g.name)}</span><span class="gm2-count">${g.categoryIds.length}</span>
                  </button></li>`).join("") || '<li class="muted gm2-empty">Chưa có nhóm nào.</li>'}
              </ul>
            </aside>
            <section class="gm2-detail">
              ${cur ? `
                <div class="gm2-detail-head">
                  <input class="gm2-name" data-group-name="${cur.id}" value="${esc(cur.name)}" maxlength="150" aria-label="Tên nhóm" />
                  <button type="button" class="btn ghost sm danger-text" data-action="group-del" data-id="${cur.id}">${icon("trash-2", 14)} Xóa nhóm</button>
                </div>
                <input class="gm2-search" data-cq placeholder="Tìm loại thu / loại chi…" aria-label="Tìm loại" />
                ${catSection("INCOME", "Nhóm sản phẩm", INCOME_CATEGORIES)}
                ${catSection("EXPENSE", "Loại chi", EXPENSE_CATEGORIES)}`
                : '<div class="gm2-empty-detail muted">Nhập tên ở ô bên trái rồi bấm <b>+</b> để tạo nhóm đầu tiên.</div>'}
            </section>
          </div>
        </div>
      </div>`;
  },

  /** Chọn hết / bỏ hết loại thu (hoặc loại chi) trong nhóm đang mở. */
  async setGroupKind(kind, on) {
    const g = CATEGORY_GROUPS.find((x) => x.id === this.state.groupSel) || CATEGORY_GROUPS[0];
    if (!g) return;
    const ids = (kind === "INCOME" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => c.id);
    const categoryIds = on ? [...new Set([...g.categoryIds, ...ids])] : g.categoryIds.filter((x) => !ids.includes(x));
    if (String(this.state.group) === String(g.id)) this.state.sel = categoryIds;
    await updateGroup(g.id, { categoryIds });
  },

  async toggleGroupCat(groupId, catId, checked) {
    const g = CATEGORY_GROUPS.find((x) => x.id === groupId);
    if (!g) return;
    const categoryIds = checked ? [...new Set([...g.categoryIds, catId])] : g.categoryIds.filter((x) => x !== catId);
    // Nhóm đang áp dụng trong bộ lọc thì cập nhật luôn danh sách loại đang chọn.
    if (String(this.state.group) === String(groupId)) this.state.sel = categoryIds;
    await updateGroup(groupId, { categoryIds });
  },

  deleteGroup(id) {
    const g = CATEGORY_GROUPS.find((x) => x.id === id);
    openConfirm(`Xóa nhóm "${g?.name}"? Các loại thu / chi trong nhóm không bị ảnh hưởng.`, async () => {
      if (String(this.state.group) === String(id)) { this.state.group = ""; this.state.sel = []; }
      if (await removeGroup(id)) toast(`Đã xóa nhóm "${g?.name}"`);
    }, { title: "Xóa nhóm" });
  },

  async saveSelectionAsGroup(root) {
    const s = this.state;
    const input = root.querySelector("#rpt-new-group");
    const name = input?.value.trim();
    if (!name) { toast("Nhập tên nhóm trước khi lưu."); input?.focus(); return; }
    s.pickOpen = false;
    const res = await addGroup(name, s.sel);
    if (res?.id) {
      s.group = String(res.id);
      toast(`Đã lưu nhóm "${name}"`);
      this.render(root);
    }
  },

  render(root) {
    this.destroy();
    const s = this.state;
    const { incomes, expenses, ccy } = store;
    const colors = CHART_PALETTE;

    const allMonths = [...new Set([...incomes.map((x) => x.incomeDate), ...expenses.map((x) => x.expenseDate)].filter(Boolean).map((d) => d.slice(0, 7)))].sort();
    const spanFrom = allMonths.length ? `${allMonths[0]}-01` : "";
    const spanTo = allMonths.length ? lastDayOfMonth(allMonths[allMonths.length - 1]) : "";
    const from = s.range ? s.range.from : spanFrom;
    const to = s.range ? s.range.to : spanTo;

    let inc = incomes.filter((x) => inRange(x.incomeDate, from, to));
    let exp = expenses.filter((x) => inRange(x.expenseDate, from, to));
    if (s.src) {
      inc = inc.filter((x) => x.source === s.src);
      exp = exp.filter((x) => x.source === s.src);
    }
    if (s.kind === "INCOME") exp = [];
    if (s.kind === "EXPENSE") inc = [];
    // Đã chọn loại (hoặc nhóm) thì chỉ giữ các khoản thuộc những loại đó, ở cả phía thu và phía chi.
    const sel = new Set(s.sel);
    if (sel.size) {
      inc = inc.filter((x) => sel.has(x.categoryId));
      exp = exp.filter((x) => sel.has(x.categoryId));
    }
    // Dữ liệu dùng cho xuất Excel / PDF (đúng theo bộ lọc đang chọn).
    const kindLabel = { ALL: "Tất cả giao dịch", INCOME: "Chỉ khoản thu", EXPENSE: "Chỉ khoản chi" }[s.kind];
    const group = CATEGORY_GROUPS.find((g) => String(g.id) === String(s.group));
    const selNames = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].filter((c) => sel.has(c.id)).map((c) => c.name);
    const catLabel = group ? `Nhóm: ${group.name}` : selNames.length ? `Loại: ${selNames.join(", ")}` : "";
    this.report = reportData({
      from, to, ccy, inc, exp,
      filterLabel: [kindLabel, catLabel, s.src ? `Nguồn: ${sourceLabel(s.src)}` : ""].filter(Boolean).join(" · "),
      filter: { kind: s.kind, group: group?.name || "", cats: group ? [] : selNames, src: s.src || "" },
    });
    const { tin, tex, profit, averageIncome, incomeTax, monthly } = this.report;
    const incCats = groupByCat(inc, INCOME_CATEGORIES);
    const expCats = groupByCat(exp, EXPENSE_CATEGORIES).sort((a, b) => b.amount - a.amount);

    // ---- Thanh bộ lọc: chọn nhanh kỳ + khoảng ngày; bộ lọc chi tiết (ẩn/hiện); các bộ lọc đang áp dụng dạng thẻ.
    const seg = (key, items) => `
      <div class="rpt-seg" role="group">
        ${items.map(([v, l]) => `<button type="button" class="rpt-seg-btn${s[key] === v ? " on" : ""}" data-action="set" data-key="${key}" data-value="${v}">${l}</button>`).join("")}
      </div>`;
    const filterbar = `
      <div class="rpt-filterbar rpt-bar">
          <div class="rpt-bar-row rpt-bar-filters">
            <div class="rpt-ctl">
              <span>Thời gian</span>
              <div class="rpt-range">
                ${dateFieldHtml("rpt-from", from, 'data-field="from"', "Từ ngày")}
                <span class="rpt-range-sep">→</span>
                ${dateFieldHtml("rpt-to", to, 'data-field="to"', "Đến ngày")}
              </div>
            </div>
            <div class="rpt-ctl"><span>Giao dịch</span>${seg("kind", [["ALL", "Tất cả"], ["INCOME", "Thu"], ["EXPENSE", "Chi"]])}</div>
            <div class="rpt-ctl"><span>Nguồn</span>${seg("src", [["", "Tất cả"], ["MANUAL", "Nhập tay"], ["ETSY", "Etsy"]])}</div>
            <div class="rpt-ctl">
              <span>Nhóm loại</span>
              <div class="rpt-inline">
                <select class="rpt-select" data-field="group">${optionsHtml([["", "Không dùng nhóm"], ...CATEGORY_GROUPS.map((g) => [g.id, g.name])], s.group)}</select>
                <button type="button" class="rpt-icon-btn" data-action="groups-open" title="Quản lý nhóm (thêm, sửa, xóa)" aria-label="Quản lý nhóm">${icon("settings", 16)}</button>
              </div>
            </div>
            <div class="rpt-ctl rpt-pick-wrap">
              <span>Nhóm sản phẩm / loại chi</span>
              <button type="button" class="rpt-pick-btn${sel.size ? " on" : ""}" data-action="pick-toggle" aria-expanded="${s.pickOpen}">
                <span>${sel.size ? `Đã chọn ${sel.size} loại` : "Tất cả loại"}</span>${icon(s.pickOpen ? "chevron-up" : "chevron-down", 14)}
              </button>
              ${s.pickOpen ? this.pickPanelHtml(sel) : ""}
            </div>
          </div>
      </div>
      <div class="rpt-tabs-bar">
        <div class="rpt-tabs-actions">
          <button class="btn sm export-btn excel" type="button" data-action="export" data-format="excel" title="Tải báo cáo dạng Excel (.xlsx)">
            ${icon("file-spreadsheet", 15)} <span>Xuất Excel</span>
          </button>
          <button class="btn sm export-btn pdf" type="button" data-action="export" data-format="pdf" title="Tải báo cáo dạng PDF">
            ${icon("file-down", 15)} <span>Xuất PDF</span>
          </button>
        </div>
      </div>`;

    // ---- Nội dung
    const kpis = [
      [`Tổng doanh thu (${ccy})`, money(tin, ccy)],
      [`Lợi nhuận ròng (${ccy})`, money(profit, ccy)],
      [`Chi phí vận hành (${ccy})`, money(tex, ccy)],
      ["Số giao dịch", String(inc.length + exp.length)],
      [`Doanh thu TB / khoản thu (${ccy})`, money(averageIncome, ccy)],
      [`Thuế đầu ra ước tính (${ccy})`, money(incomeTax, ccy)],
    ];
    const topRows = inc.filter((x) => x.orderCode || x.productQty).sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 5);
    const content = `
      <div class="kpis rpt-kpis">
        ${kpis.map(([label, value]) => `
          <article class="card rpt-kpi">
            <div class="rpt-kpi-label">${esc(label)}</div>
            <div class="rpt-kpi-value num">${esc(value)}</div>
          </article>`).join("")}
      </div>
      <div class="rpt-split">
        <article class="card">
          <div class="card-head">
            <div><h3 class="section-title">Xu hướng Tài chính</h3><p class="muted">Doanh thu và chi phí theo kỳ đã chọn · ${ccy}</p></div>
            <div class="legend"><span><i class="dot" style="background: ${CHART_INCOME}"></i>Doanh thu</span><span><i class="dot" style="background: ${CHART_EXPENSE}"></i>Chi phí</span></div>
          </div>
          <div class="chart-wrap rpt-trend"><canvas id="rpt-trend"></canvas></div>
        </article>
        <article class="card">
          <h3 class="section-title">Cơ cấu Doanh mục</h3>
          <p class="muted" style="margin-bottom: 12px">Tỷ trọng doanh thu theo nhóm sản phẩm</p>
          <div class="donut-row">
            <div class="chart-donut"><canvas id="rpt-pie"></canvas></div>
            <div class="donut-legend-side">
              ${incCats.map((d, i) => `
                <div><span><i class="swatch" style="background: ${colors[i % colors.length]}"></i>${esc(d.name)}</span><b>${tin ? Math.round((d.amount / tin) * 100) : 0}% · ${esc(money(d.amount, ccy))}</b></div>`).join("")}
            </div>
          </div>
        </article>
      </div>
      <div class="rpt-split">
        <article class="card" style="padding: 0">
          <div class="card-head" style="padding: 16px 16px 8px">
            <div><h3 class="section-title">Sản phẩm Bán chạy</h3><p class="muted">Danh sách các mặt hàng đóng góp doanh thu lớn nhất</p></div>
          </div>
          <div class="table-wrap">
            <table class="rpt-table">
              <thead><tr><th>Tên sản phẩm</th><th class="amount">SL</th><th class="amount">Doanh thu</th><th>Mã đơn</th></tr></thead>
              <tbody>
                ${topRows.map((p) => `<tr><td translate="no">${esc(p.description)}</td><td class="amount muted">${esc(p.productQty || "—")}</td><td class="amount">${esc(money(p.amount, ccy))}</td><td class="amount muted" translate="no">${esc(p.orderCode || "—")}</td></tr>`).join("")}
              </tbody>
            </table>
          </div>
        </article>
        <article class="card">
          <h3 class="section-title">Cơ cấu Chi phí</h3>
          <p class="muted" style="margin-bottom: 12px">Tỷ trọng chi phí theo loại chi · theo bộ lọc đang chọn · ${ccy}</p>
          ${expCats.length === 0
            ? '<div class="empty" style="padding: 32px 0">Không có khoản chi trong bộ lọc đang chọn.</div>'
            : `<div class="donut-row">
                <div class="chart-donut"><canvas id="rpt-exp-pie"></canvas></div>
                <div class="donut-legend-side">
                  ${expCats.map((d, i) => `
                    <div><span><i class="swatch" style="background: ${colors[i % colors.length]}"></i>${esc(d.name)}</span><b>${tex ? Math.round((d.amount / tex) * 100) : 0}% · ${esc(money(d.amount, ccy))}</b></div>`).join("")}
                </div>
              </div>`}
        </article>
      </div>`;

    // Vẽ lại (sau khi tick loại, đổi tên nhóm…) vẫn giữ chỗ đang cuộn trong cửa sổ nhóm và trên trang.
    const keep = [".gm2-detail", ".gm2-groups"].map((sel) => [sel, root.querySelector(sel)?.scrollTop || 0]);
    const pageY = window.scrollY;
    root.innerHTML = filterbar + content + this.groupsModalHtml();
    keep.forEach(([sel, top]) => { const el = root.querySelector(sel); if (el) el.scrollTop = top; });
    // Khung chọn loại không được tràn khỏi mép phải màn hình: dịch sang trái phần bị tràn (chừa lề 16px).
    const panel = root.querySelector(".rpt-pick-panel");
    if (panel) {
      const over = panel.getBoundingClientRect().right - (document.documentElement.clientWidth - 16);
      if (over > 0) panel.style.left = `${-over}px`;
    }
    window.scrollTo(0, pageY);

    bindRoot(root, {
      click: (e) => {
        if (e.target.classList.contains("modal-back")) { s.groupsOpen = false; this.render(root); return; }
        const el = e.target.closest("[data-action]");
        // Bấm ra ngoài khung chọn loại → đóng khung và áp dụng các loại đã tick.
        if (s.pickOpen && !e.target.closest(".rpt-pick-wrap")) {
          s.pickOpen = false;
          if (!el) { this.render(root); return; }
        }
        if (!el) return;
        const a = el.dataset.action;
        if (a === "export") { this.exportReport(el); return; }
        if (a === "group-del") { this.deleteGroup(Number(el.dataset.id)); return; }
        if (a === "gm-all") { this.setGroupKind(el.dataset.kind, el.dataset.on === "1"); return; }
        if (a === "group-pick") s.groupSel = Number(el.dataset.id);
        if (a === "pick-save") { this.saveSelectionAsGroup(root); return; }
        // Trong khung đang mở: chỉ cập nhật khung, chưa vẽ lại trang.
        if (a === "pick-clear" || a === "pick-all") {
          if (a === "pick-clear") s.sel = [];
          else {
            const ids = (el.dataset.kind === "INCOME" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => c.id);
            const all = ids.every((id) => s.sel.includes(id));
            s.sel = all ? s.sel.filter((id) => !ids.includes(id)) : [...new Set([...s.sel, ...ids])];
          }
          s.group = "";
          this.refreshPick(root);
          return;
        }
        if (a === "set") { s[el.dataset.key] = el.dataset.value; if (el.dataset.key === "kind") s.pickOpen = false; }
        else if (a === "pick-toggle") s.pickOpen = !s.pickOpen;
        else if (a === "pick-close") s.pickOpen = false;
        else if (a === "groups-open") s.groupsOpen = true;
        else if (a === "groups-close") s.groupsOpen = false;
        this.render(root);
      },
      change: (e) => {
        const t = e.target;
        if (t.dataset.pick) {
          const id = Number(t.dataset.pick);
          s.sel = t.checked ? [...new Set([...s.sel, id])] : s.sel.filter((x) => x !== id);
          s.group = "";
          this.refreshPick(root);
          return;
        }
        if (t.dataset.gmGroup) { this.toggleGroupCat(Number(t.dataset.gmGroup), Number(t.dataset.gmCat), t.checked); return; }
        if (t.dataset.groupName) {
          const name = t.value.trim();
          if (name) updateGroup(Number(t.dataset.groupName), { name }).then((ok) => ok && toast(`Đã đổi tên nhóm thành "${name}"`));
          return;
        }
        const { field } = t.dataset;
        const v = t.value;
        if (!field) return;
        if (field === "ccy") { setCcy(v); return; }
        if (field === "group") {
          const g = CATEGORY_GROUPS.find((x) => String(x.id) === v);
          s.group = g ? v : "";
          s.sel = g ? [...g.categoryIds] : [];
          this.render(root);
          return;
        }
        if (field === "from") s.range = { from: v, to };
        else if (field === "to") s.range = { from, to: v };
        else if (field === "kind") s.kind = v;
        else s[field] = v;
        this.render(root);
      },
      // Tìm nhóm / tìm loại trong cửa sổ nhóm: chỉ ẩn hiện, không vẽ lại (giữ con trỏ trong ô tìm).
      input: (e) => {
        const t = e.target;
        if (t.dataset.gq === undefined && t.dataset.cq === undefined) return;
        const q = t.value.trim().toLowerCase();
        const items = root.querySelectorAll(t.dataset.gq !== undefined ? ".gm2-group" : ".gm-cat-chip");
        items.forEach((el) => { (el.closest("li") || el).hidden = Boolean(q) && !el.dataset.name.includes(q); });
      },
      submit: async (e) => {
        if (e.target.dataset.form !== "group-add") return;
        e.preventDefault();
        const name = e.target.elements.name.value.trim();
        const res = name ? await addGroup(name, []) : null;
        if (res?.id) {
          this.state.groupSel = Number(res.id);
          toast(`Đã thêm nhóm "${name}"`);
          this.render(root);
        }
      },
    });

    // ---- Biểu đồ
    const animate = !this.calm;
    this.calm = true;
    if (typeof Chart === "undefined") return;
    const doughnut = (el, rows, cutout) => {
      if (!el || !rows.length) return;
      this.charts.push(new Chart(el, {
        type: "doughnut",
        data: { labels: rows.map((x) => x.name), datasets: [{ data: rows.map((x) => x.amount), backgroundColor: rows.map((_, i) => colors[i % colors.length]), borderWidth: 0 }] },
        options: { plugins: { legend: { display: false } }, cutout, maintainAspectRatio: false, ...(animate ? {} : { animation: false }) },
      }));
    };
    const conv = (v) => (ccy === "EUR" ? v * FX_USD_TO_EUR : v);
    this.charts.push(new Chart(root.querySelector("#rpt-trend"), {
      type: "line",
      data: {
        labels: monthly.length ? monthly.map((x) => x.m) : ["Không có dữ liệu"],
        datasets: [
          { label: "Doanh thu", data: monthly.map((x) => conv(x.income)), borderColor: CHART_INCOME, backgroundColor: "rgba(0,113,227,0.12)", fill: true, tension: 0.35, pointRadius: 3, pointBackgroundColor: CHART_INCOME, borderWidth: 2 },
          { label: "Chi phí", data: monthly.map((x) => conv(x.expense)), borderColor: CHART_EXPENSE, backgroundColor: "transparent", fill: false, tension: 0.35, pointRadius: 3, pointBackgroundColor: CHART_EXPENSE, borderWidth: 2 },
        ],
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: "#EEF1F4" } }, x: { grid: { display: false } } }, maintainAspectRatio: false, ...(animate ? {} : { animation: false }) },
    }));
    doughnut(root.querySelector("#rpt-pie"), incCats, "62%");
    doughnut(root.querySelector("#rpt-exp-pie"), expCats, "62%");
  },
};
