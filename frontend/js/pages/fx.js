// Trang Tỷ giá (#/fx): tự nhập tỷ giá 1 EUR = ? USD theo tháng, hoặc riêng cho từng ngày (dạng lịch).
// Thứ tự dùng: tỷ giá riêng của ngày → tỷ giá của tháng → mặc định 1 EUR = 1 USD (tháng chưa nhập, vd chưa có thông báo).
const FX_WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

const FxPage = {
  s: null,

  init() {
    const now = new Date();
    this.s = {
      mode: "month",
      rows: [], loading: false, loaded: false, error: "", from: "", to: this.ym(now),
      // Lịch theo ngày: tháng đang xem và các ngày của tháng đó.
      dayMonth: this.ym(now), days: [], daysLoading: false, daysLoaded: "", daysError: "",
    };
  },

  destroy() {},

  /** Gợi ý tháng dạng số "06/2026" cho ô tháng (gõ tay hoặc chọn): 4 năm trước đến 12 tháng sau. */
  monthListHtml() {
    const now = new Date();
    const items = [];
    for (let i = 12; i >= -47; i--) items.push(this.mmyyyy(this.ym(new Date(now.getFullYear(), now.getMonth() + i, 1))));
    return `<datalist id="fx-month-list">${items.map((v) => `<option value="${v}"></option>`).join("")}</datalist>`;
  },

  /** "2026-06" → "06/2026". */
  mmyyyy(key) {
    return `${key.slice(5)}/${key.slice(0, 4)}`;
  },

  /** Đọc tháng gõ tay: "6/2026", "06/2026", "06-2026", "2026-06" → "2026-06"; sai thì null. */
  parseMonth(text) {
    const t = String(text).trim();
    let m = t.match(/^(\d{1,2})\s*[/.\-]\s*(\d{4})$/);
    if (m) return Number(m[1]) >= 1 && Number(m[1]) <= 12 ? `${m[2]}-${m[1].padStart(2, "0")}` : null;
    m = t.match(/^(\d{4})\s*[/.\-]\s*(\d{1,2})$/);
    if (m) return Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${m[1]}-${m[2].padStart(2, "0")}` : null;
    return null;
  },

  ym(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  },

  /** Cộng `n` tháng vào "yyyy-MM". */
  addMonths(key, n) {
    const [y, m] = key.split("-").map(Number);
    return this.ym(new Date(y, m - 1 + n, 1));
  },

  /** Mặc định hiện từ tháng sớm nhất có dữ liệu (ít nhất 6 tháng gần đây), tối đa 36 tháng. */
  defaultFrom() {
    const now = new Date();
    const sixAgo = this.ym(new Date(now.getFullYear(), now.getMonth() - 5, 1));
    const limit = this.ym(new Date(now.getFullYear(), now.getMonth() - 35, 1));
    const first = [...store.incomes.map((x) => x.incomeDate), ...store.expenses.map((x) => x.expenseDate)]
      .filter(Boolean).map((d) => d.slice(0, 7)).sort()[0];
    const from = first && first < sixAgo ? first : sixAgo;
    return from < limit ? limit : from;
  },

  async load() {
    const s = this.s;
    if (!s.from) s.from = this.defaultFrom();
    s.loading = true;
    try {
      s.rows = await fxMonths(s.from, s.to);
      s.error = "";
    } catch (e) {
      s.error = e.message;
    }
    s.loading = false;
    s.loaded = true;
    if (current.page === this) this.render(this.root);
  },

  async loadDays() {
    const s = this.s;
    const month = s.dayMonth;
    s.daysLoading = true;
    try {
      const days = await fxDays(month);
      if (month !== s.dayMonth) return; // đã chuyển sang tháng khác trong lúc chờ
      s.days = days;
      s.daysError = "";
    } catch (e) {
      s.daysError = e.message;
    }
    s.daysLoading = false;
    s.daysLoaded = month;
    if (current.page === this) this.render(this.root);
  },

  async save(month, value) {
    const rate = Number(value);
    const row = this.s.rows.find((r) => r.month === month);
    const hadManual = row ? row.manual != null : hasMonthlyRate(month);
    const label = `tháng ${Number(month.slice(5))}/${month.slice(0, 4)}`;
    try {
      if (value === "" || !(rate > 0)) {
        if (!hadManual) return;
        await deleteFxMonthly(month);
        if (row) row.manual = null;
        toast(`Đã xóa tỷ giá ${label}, dùng mặc định 1 EUR = 1 USD`);
      } else {
        const saved = await setFxMonthly(month, rate);
        if (row) row.manual = saved.eurToUsd;
        toast(`Đã lưu tỷ giá ${label}: 1 EUR = ${fmtRate(saved.eurToUsd)} USD`);
      }
    } catch (e) {
      toast(e.message);
    }
    await loadFx();
    // Đổi tỷ giá tháng làm đổi tỷ giá đang dùng của các ngày trong tháng: tải lại lịch nếu đang xem tháng đó.
    if (this.s.mode === "day" && month === this.s.dayMonth) this.loadDays();
    else this.render(this.root);
  },

  async saveDay(date, value) {
    const rate = Number(value);
    const day = this.s.days.find((d) => d.date === date);
    try {
      if (value === "" || !(rate > 0)) {
        if (day?.manual == null) return;
        await deleteFxDaily(date);
        toast(`Đã xóa tỷ giá riêng ngày ${dmy(date)}, quay về tỷ giá tháng`);
      } else {
        const saved = await setFxDaily(date, rate);
        toast(`Đã lưu tỷ giá ngày ${dmy(date)}: 1 EUR = ${fmtRate(saved.eurToUsd)} USD`);
      }
    } catch (e) {
      toast(e.message);
      this.render(this.root);
      return;
    }
    await loadFx();
    this.loadDays();
  },

  monthTableHtml() {
    const s = this.s;
    const thisMonth = this.ym(new Date());
    const dailyCount = (month) => Object.keys(FX_DAILY).filter((d) => d.startsWith(month)).length;
    const rowHtml = (r) => {
      const [y, m] = r.month.split("-").map(Number);
      const isNow = r.month === thisMonth;
      const hasManual = r.manual != null;
      const nDays = dailyCount(r.month);
      return `
        <tr class="${isNow ? "fx-now" : ""}">
          <td><b>Tháng ${m}/${y}</b>${isNow ? ' <span class="badge ok">Tháng này</span>' : ""}</td>
          <td class="muted">Quý ${Math.floor((m - 1) / 3) + 1}/${y}</td>
          <td>
            <div class="fx-input">
              <span>1 EUR =</span>
              <input type="number" step="0.0001" min="0" data-month="${r.month}" value="${hasManual ? Number(r.manual) : ""}"
                placeholder="1" aria-label="Tỷ giá tháng ${m}/${y}" />
              <span>USD</span>
            </div>
          </td>
          <td class="amount">${r.ecb != null
            ? `${fmtRate(r.ecb)}${hasManual && Number(r.manual) === Number(r.ecb) ? "" : ` <button class="btn ghost sm" type="button" data-action="use-ecb" data-month="${r.month}">Dùng</button>`}`
            : '<span class="muted">—</span>'}</td>
          <td>${hasManual
            ? '<span class="badge ok">Tự nhập</span>'
            : '<span class="badge info">Mặc định 1</span>'}</td>
          <td><button class="btn ghost sm" type="button" data-action="open-days" data-month="${r.month}" title="Xem / nhập tỷ giá riêng từng ngày của tháng">
            ${icon("calendar", 14)} ${nDays ? `${nDays} ngày riêng` : "Theo ngày"}</button></td>
          <td>${hasManual ? `<button class="icon-ghost" type="button" data-action="clear" data-month="${r.month}" title="Xóa tỷ giá tự nhập" aria-label="Xóa tỷ giá tự nhập">${icon("x", 15)}</button>` : ""}</td>
        </tr>`;
    };

    let body;
    if (s.error) body = `<tr><td colspan="7"><div class="empty-state"><strong>Không tải được tỷ giá</strong><p>${esc(s.error)}</p></div></td></tr>`;
    else if (!s.loaded) body = '<tr><td colspan="7"><div class="empty-state"><p>Đang tải…</p></div></td></tr>';
    else body = s.rows.map(rowHtml).join("");

    return `
      <article class="card" style="padding: 0">
        <div class="card-head list-card-head">
          <div class="list-card-left">
            ${this.monthListHtml()}
            <label class="fx-range">Từ tháng <input class="toolbar-ctrl fx-month" data-field="from" list="fx-month-list" inputmode="numeric"
              value="${esc(this.mmyyyy(s.from))}" placeholder="MM/YYYY" maxlength="7" /></label>
            <label class="fx-range">Đến tháng <input class="toolbar-ctrl fx-month" data-field="to" list="fx-month-list" inputmode="numeric"
              value="${esc(this.mmyyyy(s.to))}" placeholder="MM/YYYY" maxlength="7" /></label>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table fx-table">
            <thead><tr>
              <th>Tháng</th><th>Quý</th><th>Tỷ giá tự nhập</th><th class="amount">ECB trung bình tháng</th><th>Đang dùng</th><th>Tỷ giá ngày</th><th></th>
            </tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </article>`;
  },

  calendarHtml() {
    const s = this.s;
    const [y, m] = s.dayMonth.split("-").map(Number);
    const today = localISO(new Date());
    const monthRate = FX_MONTHLY[s.dayMonth];
    const ready = s.daysLoaded === s.dayMonth && !s.daysError;
    const own = ready ? s.days.filter((d) => d.manual != null) : [];
    const ecbDays = ready ? s.days.filter((d) => d.ecb != null) : [];
    const ecbAvg = ecbDays.length ? ecbDays.reduce((t, d) => t + Number(d.ecb), 0) / ecbDays.length : null;

    let grid;
    if (s.daysError) grid = `<div class="empty-state"><strong>Không tải được tỷ giá ngày</strong><p>${esc(s.daysError)}</p></div>`;
    else if (!ready) grid = '<div class="empty-state"><p>Đang tải…</p></div>';
    else {
      // Thứ Hai là cột đầu: getDay() 0 = CN → 6.
      const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
      const cells = Array.from({ length: lead }, () => '<div class="fx-cal-cell is-blank"></div>');
      for (const d of s.days) {
        const dayNum = Number(d.date.slice(8));
        const weekend = [5, 6].includes((lead + dayNum - 1) % 7);
        const hasOwn = d.manual != null;
        const sourceText = hasOwn ? "Riêng ngày" : d.source === "MONTHLY" ? "Theo tháng" : "Mặc định 1";
        cells.push(`
          <div class="fx-cal-cell${hasOwn ? " is-own" : ""}${weekend ? " is-weekend" : ""}${d.date === today ? " is-today" : ""}">
            <div class="fx-cal-top">
              <span class="fx-cal-day">${dayNum}</span>
              <span class="fx-cal-src ${hasOwn ? "own" : d.source === "MONTHLY" ? "month" : "default"}">${sourceText}</span>
            </div>
            <input type="number" step="0.0001" min="0" class="fx-cal-input" data-date="${d.date}"
              value="${hasOwn ? Number(d.manual) : ""}" placeholder="${fmtRate(d.used)}" aria-label="Tỷ giá riêng ngày ${dmy(d.date)}"
              title="Gõ tỷ giá riêng cho ngày này; để trống = dùng tỷ giá tháng" />
            <div class="fx-cal-foot">
              ${d.ecb != null
                ? `<button type="button" class="fx-cal-ecb" data-action="use-ecb-day" data-date="${d.date}" title="Dùng tỷ giá ECB ngày này">ECB ${fmtRate(d.ecb)}</button>`
                : '<span class="muted">ECB —</span>'}
              ${hasOwn ? `<button class="icon-ghost" type="button" data-action="clear-day" data-date="${d.date}" title="Xóa tỷ giá riêng ngày này" aria-label="Xóa tỷ giá riêng">${icon("x", 13)}</button>` : ""}
            </div>
          </div>`);
      }
      grid = `
        <div class="fx-cal">
          ${FX_WEEKDAYS.map((w) => `<div class="fx-cal-head">${w}</div>`).join("")}
          ${cells.join("")}
        </div>`;
    }

    return `
      <article class="card fx-cal-card">
        <div class="fx-cal-bar">
          <div class="fx-cal-nav">
            <button class="icon-ghost fx-prev" type="button" data-action="prev-month" title="Tháng trước" aria-label="Tháng trước">${icon("chevron-right", 16)}</button>
            <h3>Tháng ${m}/${y}</h3>
            <button class="icon-ghost" type="button" data-action="next-month" title="Tháng sau" aria-label="Tháng sau">${icon("chevron-right", 16)}</button>
            ${s.dayMonth !== this.ym(new Date()) ? '<button class="btn ghost sm" type="button" data-action="this-month">Tháng này</button>' : ""}
          </div>
          <div class="fx-input">
            <span>Tỷ giá tháng: 1 EUR =</span>
            <input type="number" step="0.0001" min="0" data-month="${s.dayMonth}" value="${monthRate > 0 ? Number(monthRate) : ""}" placeholder="1"
              aria-label="Tỷ giá tháng ${m}/${y}" />
            <span>USD</span>
          </div>
        </div>
        <div class="fx-cal-summary">
          <span><b>${own.length}</b> ngày có tỷ giá riêng</span>
          <span><b>${ready ? s.days.length - own.length : "—"}</b> ngày dùng ${monthRate > 0 ? `tỷ giá tháng ${fmtRate(monthRate)}` : "mặc định 1"}</span>
          <span>ECB trung bình tháng: <b>${ecbAvg != null ? fmtRate(Math.round(ecbAvg * 10000) / 10000) : "—"}</b></span>
        </div>
        ${grid}
        <p class="fx-cal-note muted">${icon("info", 13)} Ô trống dùng tỷ giá tháng (số mờ là tỷ giá đang dùng). Gõ số vào ô của một ngày để khoản thu / chi,
          đơn Etsy của ngày đó quy đổi theo tỷ giá riêng; bấm "ECB …" để lấy luôn tỷ giá ECB của ngày. Khoản đã lưu bằng USD không đổi số.</p>
      </article>`;
  },

  render(root, query) {
    this.root = root;
    const s = this.s;
    // Mở thẳng lịch của một tháng: #/fx?view=day&month=2026-10 (chỉ áp dụng khi địa chỉ thay đổi).
    const q = query?.toString() || "";
    if (q && q !== s.lastQuery) {
      if (query.get("view") === "day") s.mode = "day";
      const month = this.parseMonth(query.get("month") || "");
      if (month) s.dayMonth = month;
    }
    if (query) s.lastQuery = q;
    if (s.mode === "month" && !s.loaded && !s.loading) this.load();
    if (s.mode === "day" && s.daysLoaded !== s.dayMonth && !s.daysLoading) this.loadDays();

    const today = localISO(new Date());
    const thisMonth = today.slice(0, 7);
    const monthRate = FX_MONTHLY[thisMonth];
    const todayOwn = hasDailyRate(today);
    const modes = [["month", "Theo tháng"], ["day", "Theo ngày"]];

    root.innerHTML = `
      <article class="card fx-current">
        <div>
          <div class="muted">Tỷ giá hôm nay (${dmy(today)})</div>
          <div class="fx-current-value">${todayOwn
            ? `1 EUR = ${fmtRate(eurToUsdOn(today))} USD <span class="badge ok">Riêng ngày</span>`
            : monthRate > 0
              ? `1 EUR = ${fmtRate(monthRate)} USD <span class="badge ok">Tự nhập tháng</span>`
              : `1 EUR = 1 USD <span class="badge info">Mặc định · chưa nhập</span>`}</div>
        </div>
        <div class="rpt-seg" role="group" aria-label="Cách xem tỷ giá">
          ${modes.map(([v, l]) => `<button type="button" class="rpt-seg-btn${s.mode === v ? " on" : ""}" data-action="mode" data-value="${v}">${icon(v === "day" ? "calendar" : "clipboard-list", 14)} ${l}</button>`).join("")}
        </div>
      </article>
      ${s.mode === "day" ? this.calendarHtml() : this.monthTableHtml()}`;

    bindRoot(root, {
      click: (e) => {
        const el = e.target.closest("[data-action]");
        if (!el) return;
        const a = el.dataset.action;
        const month = el.dataset.month;
        const row = s.rows.find((r) => r.month === month);
        if (a === "mode") { s.mode = el.dataset.value; this.render(root); }
        else if (a === "open-days") { s.mode = "day"; s.dayMonth = month; this.render(root); }
        else if (a === "prev-month" || a === "next-month") { s.dayMonth = this.addMonths(s.dayMonth, a === "prev-month" ? -1 : 1); this.render(root); }
        else if (a === "this-month") { s.dayMonth = this.ym(new Date()); this.render(root); }
        else if (a === "use-ecb" && row?.ecb != null) this.save(month, String(row.ecb));
        else if (a === "clear") this.save(month, "");
        else if (a === "use-ecb-day") {
          const day = s.days.find((d) => d.date === el.dataset.date);
          if (day?.ecb != null) this.saveDay(day.date, String(day.ecb));
        }
        else if (a === "clear-day") this.saveDay(el.dataset.date, "");
      },
      change: (e) => {
        const t = e.target;
        if (t.dataset.date) { this.saveDay(t.dataset.date, t.value.trim()); return; }
        if (t.dataset.month) { this.save(t.dataset.month, t.value.trim()); return; }
        if (t.dataset.field === "from" || t.dataset.field === "to") {
          const month = this.parseMonth(t.value);
          if (!month) { toast("Nhập tháng dạng MM/YYYY, ví dụ 06/2026."); t.value = this.mmyyyy(s[t.dataset.field]); return; }
          s[t.dataset.field] = month;
          if (s.from > s.to) [s.from, s.to] = [s.to, s.from];
          this.load();
        }
      },
      keydown: (e) => {
        if (e.key === "Enter" && (e.target.dataset.month || e.target.dataset.date)) e.target.blur();
      },
    });
  },
};

/** Tỷ giá dạng 1,1593 (tối đa 4 chữ số thập phân). */
function fmtRate(v) {
  return Number(v).toLocaleString("vi-VN", { maximumFractionDigits: 4 });
}
