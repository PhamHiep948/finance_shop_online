// Trang Bản dịch (#/translations): admin nhập tiếng Đức cho các chữ của web.
// Danh sách chữ do web tự gom khi hiển thị (i18n.js gửi lên /translations/discover). Báo cáo PDF hiện chưa dịch (luôn tiếng Việt).
const TR_PAGE_SIZE = 20;
const TR_VIEWS = [["todo", "Chưa dịch"], ["done", "Đã dịch"], ["ignored", "Bỏ qua"], ["all", "Tất cả"]];

// ---- Chỗ điền số liệu
// Chữ gốc lưu dạng "Trang {0} / {1}". Trên trang này {0}, {1}… hiện thành ký hiệu tô màu [1], [2]… (chỗ web tự điền số);
// admin gõ bản dịch kèm đúng các ký hiệu đó ("Seite [1] / [2]"), lúc lưu đổi ngược về {0}, {1}.

/** Ký hiệu cho từng chỗ {0}, {1}… của `source`: ["[1]", "[2]"…] (mảng rỗng nếu không có chỗ nào). */
function trExamples(source) {
  const count = Math.max(0, ...[...source.matchAll(/\{(\d+)\}/g)].map((m) => Number(m[1]) + 1));
  return Array.from({ length: count }, (_, i) => `[${i + 1}]`);
}

/** "{0} thu" → "97 thu" (để hiện trong ô nhập). */
const trShow = (text, ex) => String(text || "").replace(/\{(\d+)\}/g, (all, i) => ex[i] ?? all);

/** Chữ gốc dạng HTML, số liệu ví dụ tô màu. */
function trSourceHtml(source, ex) {
  return source.split(/(\{\d+\})/).map((part) => {
    const m = part.match(/^\{(\d+)\}$/);
    return m && ex[m[1]] != null
      ? `<mark class="tr-ph" title="Chỗ web tự điền số khi hiển thị — gõ y nguyên ${esc(ex[m[1]])} trong bản dịch">${esc(ex[m[1]])}</mark>`
      : esc(part);
  }).join("");
}

/** Bản dịch admin gõ (có số liệu ví dụ) → dạng lưu có {0}, {1}…; giá trị dài thay trước để không cắt nhầm. */
function trParse(text, ex) {
  let out = text;
  ex.map((value, i) => [value, i]).sort((a, b) => b[0].length - a[0].length)
    .forEach(([value, i]) => { out = out.split(value).join(`\u0000${i}\u0000`); });
  return out.replace(/\u0000(\d+)\u0000/g, "{$1}");
}

/** Các số liệu ví dụ chưa có trong bản dịch `de` (dạng lưu). */
const trMissing = (de, ex) => ex.filter((_, i) => !de.includes(`{${i}}`));

/**
 * Chữ là dữ liệu (tên sản phẩm, nội dung khoản thu / chi, bên nhận, ghi chú, tên sản phẩm Etsy), dạng khóa như lúc gom
 * ("Lily {0} cm"). Trước đây các chữ này lọt vào danh sách dịch; trang Bản dịch chỉ giữ chữ của giao diện.
 */
function trDataKeys(records, titles = []) {
  const keys = new Set();
  const add = (v) => {
    const norm = i18nNormalize(v);
    if (norm) keys.add(i18nTemplate(norm).key);
  };
  records.forEach((r) => [r.description, r.recipient, r.payee, r.note].forEach(add));
  titles.forEach(add);
  return keys;
}

/** Các chữ chưa dịch thuộc `keys` (đã dịch / bỏ qua thì để nguyên: admin đã chủ động xử lý). */
const trDataRows = (rows, keys) => rows.filter((x) => !x.de && !x.ignored && keys.has(i18nNormalize(x.source)));

const TranslationsPage = {
  rows: null, // [{ source, de, ignored }] đã lưu; null = đang tải
  draft: {}, // source → { de, ignored } đang sửa
  error: "",
  q: "",
  view: "todo",
  page: 1,
  saving: false,

  init() {
    this.rows = null;
    this.draft = {};
    this.error = "";
    this.page = 1;
    this.load();
  },

  destroy() {},

  async load() {
    try {
      this.setRows(await this.withoutData(await api("/translations")));
    } catch (e) {
      this.error = e.message;
    }
    if (current.page === this && this.root) this.render(this.root);
  },

  /** Xóa khỏi từ điển các chữ là tên sản phẩm / dữ liệu đã lỡ gom; trả về danh sách còn lại. */
  async withoutData(rows) {
    if (store.loading) await new Promise((done) => onStoreChange(() => done()));
    // Tên sản phẩm Etsy (trang Sản phẩm & Quảng cáo); chưa kết nối Etsy thì bỏ qua.
    const titles = await etsyListings().then((list) => list.map((l) => l.title), () => []);
    const junk = trDataRows(rows, trDataKeys([...store.incomes, ...store.expenses], titles));
    if (!junk.length) return rows;
    try {
      await api("/translations/delete", { method: "POST", body: { sources: junk.map((x) => x.source) } });
    } catch {
      return rows;
    }
    toast(`Đã bỏ ${junk.length} tên sản phẩm / dữ liệu khỏi danh sách dịch`);
    const gone = new Set(junk.map((x) => x.source));
    return rows.filter((x) => !gone.has(x.source));
  },

  setRows(rows) {
    this.rows = rows;
    this.draft = Object.fromEntries(rows.map((x) => [x.source, { de: x.de || "", ignored: x.ignored }]));
    i18nSetDictionary(rows);
    i18nApply(document.body);
  },

  changed() {
    return (this.rows || []).filter((x) => {
      const d = this.draft[x.source];
      return d.de.trim() !== (x.de || "") || d.ignored !== x.ignored;
    });
  },

  stats() {
    const live = Object.values(this.draft).filter((d) => !d.ignored);
    return { done: live.filter((d) => d.de.trim()).length, total: live.length, ignored: Object.keys(this.draft).length - live.length };
  },

  filtered() {
    const q = this.q.trim().toLowerCase();
    return (this.rows || []).filter((x) => {
      const d = this.draft[x.source];
      const inView = this.view === "all"
        || (this.view === "ignored" ? d.ignored : !d.ignored && (this.view === "done" ? d.de.trim() : !d.de.trim()));
      const ex = trExamples(x.source);
      return inView && (!q || `${trShow(x.source, ex)} ${trShow(d.de, ex)}`.toLowerCase().includes(q));
    });
  },

  rowsHtml() {
    const list = this.filtered();
    if (!list.length) {
      return `<div class="empty-state"><strong>Không có chữ nào</strong>
        <p>${this.view === "todo" && !this.q ? "Đã dịch hết các chữ đã gom. Mở thêm các trang của web để gom chữ mới." : "Thử từ khóa hoặc mục lọc khác."}</p></div>`;
    }
    const pages = Math.max(1, Math.ceil(list.length / TR_PAGE_SIZE));
    // Bấm "Bỏ qua" làm danh sách ngắn lại: trang đang xem có thể không còn, lùi về trang cuối.
    this.page = Math.min(Math.max(1, this.page), pages);
    const p = this.page;
    const shown = list.slice((p - 1) * TR_PAGE_SIZE, p * TR_PAGE_SIZE);
    const pageNums = Array.from({ length: pages }, (_, i) => i + 1).filter((i) => i === 1 || i === pages || Math.abs(i - p) <= 2);
    return `
      <div class="tr-list" translate="no">
        ${shown.map((x) => {
          const d = this.draft[x.source];
          const ex = trExamples(x.source);
          return `
            <div class="tr-row${d.de.trim() ? "" : " is-missing"}${d.ignored ? " is-ignored" : ""}">
              <div class="tr-src">
                <span class="tr-default">${trSourceHtml(x.source, ex)}</span>
              </div>
              <label class="tr-cell"><span>Deutsch</span>
                <textarea data-src="${esc(x.source)}" rows="2" maxlength="2000" placeholder="${ex.length ? `Nhập tiếng Đức, đặt ${esc(ex.join(", "))} vào chỗ có số` : "Nhập tiếng Đức…"}"${d.ignored ? " disabled" : ""}>${esc(trShow(d.de, ex))}</textarea>
              </label>
              <button type="button" class="btn ghost sm tr-ignore" data-action="ignore" data-src="${esc(x.source)}"
                title="${d.ignored ? "Đưa lại vào danh sách cần dịch" : "Không dịch chữ này (dữ liệu, tên riêng…)"}">${d.ignored ? "Khôi phục" : "Bỏ qua"}</button>
            </div>`;
        }).join("")}
      </div>
      <div class="pager">
        <span class="muted">Hiển thị ${(p - 1) * TR_PAGE_SIZE + 1} – ${Math.min(p * TR_PAGE_SIZE, list.length)} trên tổng số ${list.length} chữ</span>
        ${pages > 1 ? `<div class="pager-pages">
          <button type="button" class="btn ghost pager-btn" data-action="page" data-page="${p - 1}"${p <= 1 ? " disabled" : ""}>Trước</button>
          ${pageNums.map((i, k) => `${k && i - pageNums[k - 1] > 1 ? '<span class="muted">…</span>' : ""}<button type="button" class="btn ${i === p ? "primary" : "ghost"} pager-btn" data-action="page" data-page="${i}">${i}</button>`).join("")}
          <button type="button" class="btn ghost pager-btn" data-action="page" data-page="${p + 1}"${p >= pages ? " disabled" : ""}>Sau</button>
        </div>` : ""}
      </div>`;
  },

  statusHtml() {
    const s = this.stats();
    const n = this.changed().length;
    return `<span class="muted">Đã dịch <b>${s.done}/${s.total}</b> chữ${s.ignored ? ` · bỏ qua ${s.ignored}` : ""}${n ? ` · <b class="tr-unsaved">${n} chữ chưa lưu</b>` : ""}</span>`;
  },

  refreshList() {
    this.root.querySelector('[data-slot="tr-rows"]').innerHTML = this.rowsHtml();
    this.root.querySelector('[data-slot="tr-status"]').innerHTML = this.statusHtml();
  },

  render(root) {
    this.root = root;
    if (!this.rows) {
      root.innerHTML = `<article class="card"><div class="empty-state"><p>${this.error ? esc(this.error) : "Đang tải bản dịch…"}</p></div></article>`;
      return;
    }
    root.innerHTML = `
      <article class="card tr-card">
        <div class="card-head tr-head">
          <div>
            <h3 class="section-title">Dịch giao diện sang tiếng Đức</h3>
          </div>
          <div class="tr-actions">
            <button class="btn ghost sm" type="button" data-action="reload">${icon("refresh-cw", 14)} Tải lại danh sách</button>
            <button class="btn primary sm" type="button" data-action="save"${this.saving ? " disabled" : ""}>${icon("check", 14)} ${this.saving ? "Đang lưu…" : "Lưu bản dịch"}</button>
          </div>
        </div>
        <div class="tr-tools">
          <div class="rpt-seg" role="group">
            ${TR_VIEWS.map(([v, l]) => `<button type="button" class="rpt-seg-btn${this.view === v ? " on" : ""}" data-action="view" data-view="${v}">${l}</button>`).join("")}
          </div>
          <label class="search-box">${icon("search")}<input type="search" data-tr-search placeholder="Tìm chữ hoặc bản dịch…" value="${esc(this.q)}" /></label>
          <span data-slot="tr-status">${this.statusHtml()}</span>
        </div>
        <div data-slot="tr-rows">${this.rowsHtml()}</div>
      </article>`;

    bindRoot(root, {
      click: (e) => {
        const el = e.target.closest("[data-action]");
        if (!el) return;
        const a = el.dataset.action;
        if (a === "save") this.save();
        else if (a === "reload") { this.rows = null; this.render(root); this.load(); }
        else if (a === "page") {
          this.page = Number(el.dataset.page);
          this.refreshList();
          root.querySelector('[data-slot="tr-rows"]').scrollIntoView({ block: "start", behavior: "smooth" });
        }
        else if (a === "view") { this.view = el.dataset.view; this.page = 1; this.render(root); }
        else if (a === "ignore") {
          const d = this.draft[el.dataset.src];
          d.ignored = !d.ignored;
          this.refreshList();
        }
      },
      input: (e) => {
        const t = e.target;
        if (t.dataset.trSearch !== undefined) {
          this.q = t.value;
          this.page = 1;
          this.refreshList();
          return;
        }
        if (t.dataset.src === undefined) return;
        // Ghi vào bản nháp (dạng lưu có {0}, {1}…) theo từng phím gõ; không vẽ lại danh sách để giữ con trỏ.
        this.draft[t.dataset.src].de = trParse(t.value, trExamples(t.dataset.src));
        t.closest(".tr-row").classList.toggle("is-missing", !t.value.trim());
        root.querySelector('[data-slot="tr-status"]').innerHTML = this.statusHtml();
      },
    });
  },

  async save() {
    const items = this.changed().map((x) => ({ source: x.source, de: this.draft[x.source].de, ignored: this.draft[x.source].ignored }));
    if (!items.length) { toast("Không có thay đổi để lưu."); return; }
    const bad = items.find((x) => x.de.trim() && trMissing(x.de, trExamples(x.source)).length);
    if (bad) {
      const ex = trExamples(bad.source);
      toast(`Bản dịch của "${trShow(bad.source, ex)}" thiếu chỗ điền số: ${trMissing(bad.de, ex).join(", ")}. Gõ thêm đúng ký hiệu tô màu.`);
      return;
    }
    this.saving = true;
    this.render(this.root);
    try {
      this.setRows(await api("/translations", { method: "PUT", body: items }));
      toast(`Đã lưu ${items.length} bản dịch`);
    } catch (e) {
      toast(e.message);
    }
    this.saving = false;
    this.render(this.root);
  },
};
