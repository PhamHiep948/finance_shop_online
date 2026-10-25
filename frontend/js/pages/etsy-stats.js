// Trang Sản phẩm & Quảng cáo (#/etsy-stats): sản phẩm nào nhiều lượt xem, và tổng tiền quảng cáo theo tháng.
// Lượt xem / yêu thích là tổng từ lúc đăng sản phẩm (Etsy không cho xem theo kỳ); số bán tính theo khoảng thời gian chọn.
// Tiền quảng cáo lấy từ sổ Etsy Payments; hết tháng, backend tự ghi tháng đó thành một khoản chi "Quảng cáo".
const ES_PRESETS = [["month", "Tháng này"], [3, "3 tháng"], [6, "6 tháng"], [12, "12 tháng"]];
// Số bán lấy theo đơn Etsy: mỗi lần tối đa 1 năm (giới hạn của backend).
const ES_MAX_DAYS = 366;
const ES_PAGE_SIZE = 20;
// Tiêu chí sắp xếp sản phẩm: [khóa, nhãn, chiều mặc định]. Số thì cao → thấp trước, tên thì A → Z.
const ES_SORTS = [
  ["views", "Lượt xem", "desc"], ["favorites", "Yêu thích", "desc"], ["sold", "Đã bán", "desc"],
  ["revenue", "Tiền hàng", "desc"], ["likeRate", "Tỷ lệ thích", "desc"], ["price", "Giá", "desc"], ["title", "Tên sản phẩm", "asc"],
];
const EtsyStatsPage = {
  s: null,

  init() {
    this.s = {
      // preset: "month" | 3 | 6 | 12 | "custom" (tự chọn từ ngày → đến ngày).
      preset: 3, from: "", to: "", sort: "views", sortDir: "desc", search: "", page: 1,
      status: null, listings: null, sales: null, fees: null, listingsError: "", salesError: "", feesError: "",
      loading: false, loaded: false,
    };
  },

  destroy() {},

  ym(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  },

  /** Khoảng thời gian đang chọn: nút chọn nhanh tính đến hôm nay, hoặc từ ngày → đến ngày tự chọn. */
  range() {
    const s = this.s;
    const now = new Date();
    let from = s.from;
    let to = s.to;
    if (s.preset !== "custom") {
      const back = s.preset === "month" ? 0 : s.preset - 1;
      from = localISO(new Date(now.getFullYear(), now.getMonth() - back, 1));
      to = localISO(now);
    }
    return { from, to, fromMonth: from.slice(0, 7), toMonth: to.slice(0, 7) };
  },

  /** "01/08/2026 – 25/10/2026" cho các nhãn trên trang. */
  rangeLabel() {
    const r = this.range();
    return `${dmy(r.from)} – ${dmy(r.to)}`;
  },

  /** Đổi sang khoảng tự chọn; sai thứ tự thì đảo lại, quá 1 năm thì báo và giữ khoảng cũ. */
  setCustom(field, iso) {
    const s = this.s;
    const r = this.range();
    let from = field === "from" ? iso : r.from;
    let to = field === "to" ? iso : r.to;
    if (from > to) [from, to] = [to, from];
    if ((new Date(to) - new Date(from)) / 864e5 > ES_MAX_DAYS) {
      toast("Mỗi lần xem tối đa 1 năm. Hãy chọn khoảng ngắn hơn.");
      this.render(this.root);
      return;
    }
    Object.assign(s, { preset: "custom", from, to, page: 1 });
    this.load(false);
  },

  /**
   * Tải dữ liệu: trạng thái kết nối, sản phẩm, số bán và tiền quảng cáo gọi cùng lúc, phần nào về trước hiện trước.
   * `all` = tải lại cả danh sách sản phẩm (mở trang, Làm mới); đổi ngày thì chỉ số bán và quảng cáo đổi theo.
   */
  async load(all = true) {
    const s = this.s;
    const r = this.range();
    const key = `${r.from}|${r.to}`;
    s.rangeKey = key;
    s.loading = true;
    if (all) s.listings = null;
    s.sales = null;
    s.fees = null;
    this.render(this.root);
    const show = () => { if (current.page === this) this.render(this.root); };
    // Kết quả của khoảng ngày cũ (đã đổi ngày trong lúc chờ) thì bỏ.
    const same = () => s.rangeKey === key;
    const jobs = [
      etsyStatus().then((v) => { s.status = v; }, () => { s.status = null; }).finally(show),
      etsySales(r.from, r.to).then(
        (v) => { if (same()) { s.sales = v; s.salesError = ""; } },
        (e) => { if (same()) s.salesError = e.message; }).finally(show),
      etsyFees(r.from, r.to).then(
        (v) => { if (same()) { s.fees = v; s.feesError = ""; } },
        (e) => { if (same()) s.feesError = e.message; }).finally(show),
    ];
    if (all) {
      jobs.push(etsyListings().then(
        (v) => { s.listings = v; s.listingsError = ""; },
        (e) => { s.listingsError = e.message; }).finally(show));
    }
    await Promise.all(jobs);
    if (!same()) return;
    s.loading = false;
    s.loaded = true;
    show();
  },

  /** "Làm mới": bỏ dữ liệu Etsy backend đang nhớ rồi tải lại tất cả. */
  async refresh() {
    try { await etsyRefresh(); } catch { /* vẫn tải lại; lỗi kết nối sẽ hiện ở từng phần */ }
    this.load(true);
  },

  /** Giá của sản phẩm theo đúng loại tiền Etsy trả về (không quy đổi). */
  price(v, ccy) {
    try {
      return new Intl.NumberFormat(ccy === "EUR" ? "de-DE" : "en-US", { style: "currency", currency: ccy || "USD" }).format(Number(v) || 0);
    } catch {
      return `${Number(v).toFixed(2)} ${ccy}`;
    }
  },

  num(v) {
    return Number(v || 0).toLocaleString("vi-VN");
  },

  statusHtml() {
    const st = this.s.status;
    if (this.s.loading && !st) return '<div class="etsy-status">Đang kiểm tra kết nối…</div>';
    if (!st || !st.configured || st.keyError) {
      return `<div class="etsy-status">${icon("link", 16)}<div>Đồng bộ Etsy chưa sẵn sàng (chưa có key Etsy).</div></div>`;
    }
    if (!st.connected) {
      return `
        <div class="etsy-status">
          ${icon("link", 16)}
          <div><b>Chưa đăng nhập Etsy.</b> Bấm nút bên phải để cấp quyền đọc đơn hàng, sản phẩm và phí của shop.</div>
          <a class="btn primary sm" href="${API_BASE}/api/v1/etsy/connect">${icon("link", 14)} Kết nối Etsy</a>
        </div>`;
    }
    return "";
  },

  /** Lỗi của một phần; lỗi thiếu quyền thì kèm nút kết nối lại. */
  errorHtml(title, message) {
    const reconnect = /Kết nối Etsy/.test(message);
    return `
      <div class="empty-state">
        <strong>${esc(title)}</strong>
        <p>${esc(message)}</p>
        ${reconnect ? `<a class="btn primary sm" href="${API_BASE}/api/v1/etsy/connect">${icon("link", 14)} Kết nối Etsy lại</a>` : ""}
      </div>`;
  },

  kpisHtml() {
    const s = this.s;
    const list = s.listings || [];
    const wait = '<span class="muted">…</span>';
    const card = (label, value, ico, tone, hint) => `
      <article class="card kpi">
        <div class="label">${label}</div>
        <div class="value">${value}</div>
        <div class="kpi-ico ${tone}">${icon(ico, 18)}</div>
        ${hint ? `<div class="delta muted">${hint}</div>` : ""}
      </article>`;
    const sales = s.sales;
    const ads = s.fees ? Number(s.fees.rangeAdsUsd) || 0 : null;
    const share = sales && ads != null && sales.revenue > 0 ? ` · bằng ${(ads / sales.revenue * 100).toFixed(1)}% doanh thu` : "";
    const range = esc(this.rangeLabel());
    return `
      <div class="kpis">
        ${card("Đơn hàng", sales ? this.num(sales.orders) : s.salesError ? "—" : wait, "package", "green", sales ? `${this.num(sales.items)} sản phẩm · ${range}` : range)}
        ${card("Doanh thu", sales ? money(sales.revenue, store.ccy) : s.salesError ? "—" : wait, "trending-up", "blue", `trước thuế, như Khoản thu · ${range}`)}
        ${card("Tiền quảng cáo", ads != null ? money(ads, store.ccy) : s.feesError ? "—" : wait, "trending-down", "red", `${range}${share}`)}
        ${card("Lượt xem · Yêu thích", s.listings ? `${this.num(list.reduce((t, l) => t + l.views, 0))} · ${this.num(list.reduce((t, l) => t + l.favorites, 0))}` : s.listingsError ? "—" : wait,
          "eye", "purple", "tổng từ lúc đăng — Etsy không cho xem theo ngày")}
      </div>`;
  },

  /** Giá trị dùng để sắp xếp; tỷ lệ thích của sản phẩm chưa có lượt xem xếp cuối. */
  sortValue(l, key) {
    if (key === "likeRate") return l.views ? l.favorites / l.views : -1;
    if (key === "title") return l.title || "";
    return Number(l[key]) || 0;
  },

  /** Sản phẩm kèm số bán / số đơn / tiền hàng của khoảng ngày đang chọn (chưa tải xong thì 0). */
  rows() {
    const s = this.s;
    const by = new Map((s.sales?.listings || []).map((x) => [x.listingId, x]));
    return (s.listings || []).map((l) => {
      const x = by.get(l.listingId);
      return { ...l, sold: x?.sold ?? l.sold ?? 0, orders: x?.orders ?? l.orders ?? 0, revenue: x?.revenue ?? l.revenue ?? 0 };
    });
  },

  /** Sản phẩm sau khi lọc theo ô tìm kiếm và sắp xếp theo tiêu chí / chiều đang chọn (bằng nhau thì theo lượt xem). */
  sortedListings() {
    const s = this.s;
    const q = s.search.trim().toLowerCase();
    const sign = s.sortDir === "asc" ? 1 : -1;
    return this.rows()
      .filter((l) => !q || l.title.toLowerCase().includes(q))
      .sort((a, b) => {
        const va = this.sortValue(a, s.sort);
        const vb = this.sortValue(b, s.sort);
        const diff = typeof va === "string" ? va.localeCompare(vb, "vi") : va - vb;
        return diff * sign || b.views - a.views;
      });
  },

  /** Chọn tiêu chí: tiêu chí mới thì về chiều mặc định, bấm lại tiêu chí đang dùng thì đảo chiều. */
  setSort(key, toggle) {
    const s = this.s;
    const def = ES_SORTS.find(([k]) => k === key);
    if (!def) return;
    if (toggle && s.sort === key) s.sortDir = s.sortDir === "asc" ? "desc" : "asc";
    else [s.sort, s.sortDir] = [key, def[2]];
    s.page = 1;
  },

  /** Phân trang danh sách đã lọc: trang đang xem (lùi về trang cuối nếu danh sách ngắn lại) và các dòng của trang. */
  pageOf(rows) {
    const s = this.s;
    const pages = Math.max(1, Math.ceil(rows.length / ES_PAGE_SIZE));
    s.page = Math.min(Math.max(1, s.page), pages);
    const start = (s.page - 1) * ES_PAGE_SIZE;
    return { pages, start, rows: rows.slice(start, start + ES_PAGE_SIZE) };
  },

  pagerHtml(total, pages) {
    const p = this.s.page;
    if (!total) return "";
    const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((i) => i === 1 || i === pages || Math.abs(i - p) <= 2);
    return `
      <div class="pager">
        <span class="muted">Hiển thị ${(p - 1) * ES_PAGE_SIZE + 1} – ${Math.min(p * ES_PAGE_SIZE, total)} trên tổng số ${total} sản phẩm</span>
        ${pages > 1 ? `<div class="pager-pages">
          <button type="button" class="btn ghost pager-btn" data-action="page" data-page="${p - 1}"${p <= 1 ? " disabled" : ""}>Trước</button>
          ${nums.map((i, k) => `${k && i - nums[k - 1] > 1 ? '<span class="muted">…</span>' : ""}<button type="button" class="btn ${i === p ? "primary" : "ghost"} pager-btn" data-action="page" data-page="${i}">${i}</button>`).join("")}
          <button type="button" class="btn ghost pager-btn" data-action="page" data-page="${p + 1}"${p >= pages ? " disabled" : ""}>Sau</button>
        </div>` : ""}
      </div>`;
  },

  listingsHtml() {
    const s = this.s;
    let body;
    let pager = "";
    if (s.listingsError) body = `<tr><td colspan="8">${this.errorHtml("Không lấy được danh sách sản phẩm", s.listingsError)}</td></tr>`;
    else if (!s.listings) body = '<tr><td colspan="8"><div class="empty-state"><p>Đang tải…</p></div></td></tr>';
    else {
      const all = this.sortedListings();
      const { pages, start, rows } = this.pageOf(all);
      pager = this.pagerHtml(all.length, pages);
      const maxViews = Math.max(1, ...s.listings.map((l) => l.views));
      body = rows.length ? rows.map((l, i) => `
        <tr>
          <td class="muted">${start + i + 1}</td>
          <td>
            <div class="es-product">
              ${l.imageUrl ? `<img class="es-thumb" src="${esc(l.imageUrl)}" alt="" loading="lazy" />` : `<span class="es-thumb es-thumb-empty">${icon("image", 16)}</span>`}
              <div class="es-product-text">
                <a href="${esc(l.url)}" target="_blank" rel="noopener" class="es-title" title="${esc(l.title)}">${esc(l.title)}</a>
                ${l.state === "sold_out" ? '<span class="badge warn">Hết hàng</span>' : ""}
              </div>
            </div>
          </td>
          <td class="amount">
            <div class="es-views"><span>${this.num(l.views)}</span><span class="es-bar"><span style="width:${(l.views / maxViews * 100).toFixed(1)}%"></span></span></div>
          </td>
          <td class="amount">${this.num(l.favorites)}</td>
          <td class="amount">${!s.sales ? '<span class="muted">…</span>' : l.sold ? `<b>${this.num(l.sold)}</b>` : '<span class="muted">0</span>'}</td>
          <td class="amount">${!s.sales ? '<span class="muted">…</span>' : l.revenue ? money(l.revenue, store.ccy) : '<span class="muted">—</span>'}</td>
          <td class="amount">${l.views ? `${(l.favorites / l.views * 100).toFixed(1)}%` : "—"}</td>
          <td class="amount">${this.price(l.price, l.currency)}</td>
        </tr>`).join("")
        : '<tr><td colspan="8"><div class="empty-state"><p>Không có sản phẩm nào khớp.</p></div></td></tr>';
    }

    const isText = s.sort === "title";
    const dirLabel = s.sortDir === "asc" ? (isText ? "A → Z" : "Thấp → cao") : (isText ? "Z → A" : "Cao → thấp");
    // Tiêu đề cột bấm được để sắp xếp; mũi tên cho biết cột và chiều đang dùng.
    const th = (key, label, cls = "", title = "") => {
      const on = s.sort === key;
      const arrow = on ? `<span class="es-sort-arrow${s.sortDir === "asc" ? " up" : ""}">${icon("chevron-down", 13)}</span>` : "";
      return `<th class="${cls}"${title ? ` title="${title}"` : ""} aria-sort="${on ? (s.sortDir === "asc" ? "ascending" : "descending") : "none"}">
        <button type="button" class="es-sort-th${on ? " on" : ""}" data-action="sort-col" data-value="${key}">${label}${arrow}</button></th>`;
    };
    return `
      <article class="card" style="padding: 0">
        <div class="card-head list-card-head">
          <div class="list-card-left">
            <h3 class="es-card-title">${icon("eye", 16)} Sản phẩm theo lượt xem</h3>
          </div>
          <div class="list-card-actions">
            <input class="toolbar-ctrl" type="search" data-field="search" placeholder="Tìm sản phẩm…" value="${esc(s.search)}" />
            <div class="es-sortbar" role="group" aria-label="Sắp xếp sản phẩm">
              <span class="es-sortbar-label">${icon("list-filter", 14)} Sắp xếp</span>
              <select class="rpt-select" data-field="sort" aria-label="Sắp xếp theo">
                ${ES_SORTS.map(([k, l]) => `<option value="${k}"${s.sort === k ? " selected" : ""}>${l}</option>`).join("")}
              </select>
              <button type="button" class="btn ghost sm es-sort-dir" data-action="sort-dir" title="Đổi chiều sắp xếp">
                <span class="es-sort-arrow${s.sortDir === "asc" ? " up" : ""}">${icon("chevron-down", 14)}</span> ${dirLabel}</button>
            </div>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table es-table">
            <thead><tr>
              <th>#</th>${th("title", "Sản phẩm")}${th("views", "Lượt xem", "amount")}${th("favorites", "Yêu thích", "amount")}
              ${th("sold", "Đã bán", "amount", `Số lượng bán từ ${esc(this.rangeLabel())}`)}
              ${th("revenue", "Tiền hàng", "amount", `Giá × số lượng bán từ ${esc(this.rangeLabel())}`)}
              ${th("likeRate", "Tỷ lệ thích", "amount", "Yêu thích ÷ lượt xem")}${th("price", "Giá", "amount")}
            </tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        ${pager}
        <p class="es-note muted">${icon("info", 13)} Lượt xem và yêu thích là tổng từ lúc đăng sản phẩm — Etsy không cho lấy theo tháng qua API.
          Số lượt ghé shop, tỷ lệ chuyển đổi, nguồn truy cập chỉ có trong trang Stats của Etsy.</p>
      </article>`;
  },

  feesHtml() {
    const s = this.s;
    const thisMonth = this.ym(new Date());
    const cur = (m, v) => (Number(v) ? this.price(v, m.currency) : '<span class="muted">—</span>');
    let body;
    if (s.feesError) body = `<tr><td colspan="7">${this.errorHtml("Không lấy được tiền quảng cáo từ Etsy", s.feesError)}</td></tr>`;
    else if (!s.fees) body = '<tr><td colspan="7"><div class="empty-state"><p>Đang tải…</p></div></td></tr>';
    else body = s.fees.months.map((m) => {
      const [y, mo] = m.month.split("-").map(Number);
      const next = new Date(y, mo, 1);
      let state;
      if (m.imported) state = `<a class="badge ok" href="#/expenses" title="Mở Khoản chi để xem / sửa">${icon("check", 12)} Đã ghi vào Khoản chi</a>`;
      else if (!m.complete) state = `<span class="badge info" title="Hết tháng, app tự ghi vào Khoản chi">${m.month === thisMonth ? "Tự ghi ngày" : "Ghi ngày"} ${dmy(localISO(next))}</span>`;
      else if (!(m.adsUsd > 0)) state = '<span class="muted">Không chạy quảng cáo</span>';
      else state = '<span class="muted" title="App chỉ tự ghi tháng vừa hết; tháng cũ hơn thêm tay ở Khoản chi nếu cần">Chưa ghi</span>';
      return `
        <tr>
          <td><b>Tháng ${mo}/${y}</b></td>
          <td class="amount">${cur(m, m.etsyAds)}</td>
          <td class="amount">${cur(m, m.offsiteAds)}</td>
          <td class="amount">${Number(m.refunds) ? `<span class="plus">−${this.price(m.refunds, m.currency)}</span>` : '<span class="muted">—</span>'}</td>
          <td class="amount"><b>${cur(m, m.ads)}</b></td>
          <td class="amount">${m.currency === store.ccy ? '<span class="muted">—</span>' : money(m.adsUsd, store.ccy, lastDayOfMonth(m.month))}</td>
          <td>${state}</td>
        </tr>`;
    }).join("");

    const adsError = store.etsyAuto?.adsError;
    return `
      <article class="card" style="padding: 0">
        <div class="card-head list-card-head">
          <div class="list-card-left">
            <h3 class="es-card-title">${icon("trending-down", 16)} Tiền quảng cáo theo tháng</h3>
          </div>
        </div>
        ${adsError ? `<div class="etsy-status warn es-ads-warn">${icon("triangle-alert", 16)}<div>Chưa tự ghi được tiền quảng cáo tháng trước: ${esc(adsError)} App sẽ thử lại sau.</div></div>` : ""}
        <div class="table-wrap">
          <table class="data-table es-table">
            <thead><tr>
              <th>Tháng</th>
              <th class="amount" title="Quảng cáo trên Etsy">Etsy Ads</th>
              <th class="amount" title="Quảng cáo Etsy chạy ngoài Etsy, tính phí theo đơn">Offsite Ads</th>
              <th class="amount">Etsy hoàn phí</th>
              <th class="amount">Tổng</th>
              <th class="amount">Quy đổi (${store.ccy})</th>
              <th>Khoản chi</th>
            </tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        <p class="es-note muted">${icon("info", 13)} Hết tháng, tiền quảng cáo của tháng đó tự ghi vào Khoản chi (loại "Quảng cáo", ngày cuối tháng). Số tiền sửa được ở Khoản chi.</p>
      </article>`;
  },

  render(root) {
    if (!root) return;
    this.root = root;
    const s = this.s;
    if (!s.loaded && !s.loading) { this.load(); return; }
    // Đã biết là chưa kết nối Etsy thì chỉ hiện hướng dẫn; còn lại vẽ ngay phần nào đã có dữ liệu.
    const ready = s.status ? s.status.ready : true;
    const r = this.range();
    const seg = ES_PRESETS.map(([v, l]) => `<button type="button" class="rpt-seg-btn${s.preset === v ? " on" : ""}" data-action="preset" data-value="${v}">${l}</button>`).join("");

    root.innerHTML = `
      ${this.statusHtml()}
      <div class="record-filters es-filters">
        <div class="rpt-ctl"><span>Chọn nhanh</span><div class="rpt-seg" role="group">${seg}</div></div>
        <div class="rpt-ctl">
          <span>Từ ngày → đến ngày</span>
          <div class="rpt-range${s.preset === "custom" ? " is-active" : ""}">
            ${dateFieldHtml("es-from", r.from, 'data-range="from"', "Từ ngày")}
            <span class="rpt-range-sep">→</span>
            ${dateFieldHtml("es-to", r.to, 'data-range="to"', "Đến ngày")}
          </div>
        </div>
        <div class="rpt-ctl"><span>&nbsp;</span>
          <button class="btn secondary sm" type="button" data-action="refresh"${s.loading ? " disabled" : ""}>${icon("refresh-cw", 14)} ${s.loading ? "Đang tải…" : "Làm mới"}</button>
        </div>
      </div>
      ${ready ? `${this.kpisHtml()}${this.listingsHtml()}${this.feesHtml()}` : ""}`;

    // Ô tìm kiếm: chỉ vẽ lại bảng khi gõ, giữ nguyên con trỏ.
    const keepFocus = (fn) => {
      const el = document.activeElement;
      const pos = el?.dataset?.field === "search" ? el.selectionStart : null;
      fn();
      if (pos !== null) {
        const input = root.querySelector('[data-field="search"]');
        input?.focus();
        input?.setSelectionRange(pos, pos);
      }
    };

    bindRoot(root, {
      click: (e) => {
        const el = e.target.closest("[data-action]");
        if (!el || el.disabled) return;
        const a = el.dataset.action;
        if (a === "preset") {
          const v = el.dataset.value;
          s.preset = v === "month" ? v : Number(v);
          s.page = 1;
          this.load(false);
        }
        if (a === "refresh") this.refresh();
        if (a === "sort-col") { this.setSort(el.dataset.value, true); this.render(root); }
        if (a === "sort-dir") { s.sortDir = s.sortDir === "asc" ? "desc" : "asc"; s.page = 1; this.render(root); }
        if (a === "page") {
          s.page = Number(el.dataset.page);
          this.render(root);
          root.querySelector(".es-table")?.scrollIntoView({ block: "start", behavior: "smooth" });
        }
      },
      change: (e) => {
        if (e.target.dataset.field === "sort") { this.setSort(e.target.value, false); this.render(root); return; }
        const field = e.target.dataset.range;
        if (field && e.target.value) this.setCustom(field, e.target.value);
      },
      input: (e) => {
        if (e.target.dataset.field === "search") { s.search = e.target.value; s.page = 1; keepFocus(() => this.render(root)); }
      },
    });
  },
};
