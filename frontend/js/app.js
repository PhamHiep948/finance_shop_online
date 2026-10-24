// Khung giao diện (sidebar, topbar, hộp xác nhận, toast) và điều hướng theo hash (#/dashboard...).
const NAV_ITEMS = [
  { to: "/dashboard", label: "Tổng quan", icon: "layout-dashboard" },
  { to: "/incomes", label: "Khoản thu", icon: "trending-up" },
  { to: "/expenses", label: "Khoản chi", icon: "trending-down" },
  { to: "/reports", label: "Báo cáo", icon: "pie-chart" },
  { to: "/etsy-stats", label: "Sản phẩm & Quảng cáo", icon: "eye" },
  { to: "/translations", label: "Bản dịch", icon: "languages" },
  { to: "/fx", label: "Tỷ giá", icon: "euro" },
  { to: "/history", label: "Lịch sử", icon: "history" },
  { to: "/trash", label: "Thùng rác", icon: "trash-2" },
];

const PAGE_METAS = {
  "/dashboard": { breadcrumb: "Tổng quan", desc: "Tổng quan tình hình tài chính & kinh doanh" },
  "/incomes": { breadcrumb: "Khoản thu", desc: "Quản lý doanh thu từ đơn hàng & bán lẻ" },
  "/expenses": { breadcrumb: "Khoản chi", desc: "Theo dõi chi phí hoạt động & đối soát thuế" },
  "/reports": { breadcrumb: "Báo cáo", desc: "Báo cáo tài chính & phân tích lợi nhuận" },
  "/etsy-stats": { breadcrumb: "Sản phẩm & Quảng cáo", desc: "Sản phẩm Etsy nhiều lượt xem & tiền quảng cáo theo tháng" },
  "/translations": { breadcrumb: "Bản dịch", desc: "Nhập bản dịch tiếng Đức cho giao diện web" },
  "/fx": { breadcrumb: "Tỷ giá", desc: "Tự nhập tỷ giá EUR → USD theo tháng, hoặc riêng từng ngày" },
  "/history": { breadcrumb: "Lịch sử", desc: "Nhật ký thêm, sửa, xóa khoản thu chi và loại" },
  "/trash": { breadcrumb: "Thùng rác", desc: "Khôi phục hoặc xóa vĩnh viễn các khoản đã xóa" },
};

const ROUTES = {
  "/dashboard": DashboardPage,
  "/incomes": IncomesPage,
  "/expenses": ExpensesPage,
  "/reports": ReportsPage,
  "/etsy-stats": EtsyStatsPage,
  "/translations": TranslationsPage,
  "/fx": FxPage,
  "/history": HistoryPage,
  "/trash": TrashPage,
};

let darkMode = localStorage.getItem("fm_theme") === "dark";
let confirmHandler = null;
const current = { path: null, page: null, query: new URLSearchParams() };

function renderShell() {
  document.getElementById("root").innerHTML = `
    <aside class="sidebar-new">
      <a href="#/dashboard" class="sb-brand" title="Mina Store — Quản lý tài chính">
        <div class="sb-brand-wrap">
          <div class="sb-brand-icon-img" style="width: 40px; height: 40px" aria-hidden="true">
            <img src="assets/mina-store-logo.jpg" alt="Mina Store Logo" width="40" height="40" class="brand-logo-img" loading="eager" />
          </div>
          <div class="sb-brand-text" translate="no">
            <span class="sb-brand-name">
              <span class="brand-name-mina">Mina</span>
              <span class="brand-name-store">Store</span>
            </span>
            <span class="sb-brand-sub">
              <span class="brand-sub-dot" aria-hidden="true"></span>
              <span>Quản lý tài chính</span>
            </span>
          </div>
        </div>
      </a>
      <nav class="nav-new">
        <div class="nav-group-new">
          ${NAV_ITEMS.map((n) => `
            <a href="#${n.to}" title="${n.label}" class="nav-btn-new" data-path="${n.to}">
              ${icon(n.icon, 18)}
              <span class="nav-label-new">${n.label}</span>
            </a>`).join("")}
        </div>
      </nav>
    </aside>

    <div class="workspace-new">
      <header class="workspace-topbar">
        <div class="topbar-left">
          <div class="topbar-breadcrumb-row">
            <div class="topbar-breadcrumb">
              <a href="#/dashboard" class="topbar-root" title="Về trang Tổng quan">
                ${icon("layout-dashboard", 14)}
                <span>Tổng quan</span>
              </a>
              <span id="crumb-tail"></span>
            </div>
          </div>
          <div class="topbar-subtitle" id="page-desc"></div>
        </div>
        <div class="topbar-right">
          <div class="workspace-tools">
            <div class="ccy-toggle" id="lang-toggle" role="group" aria-label="Ngôn ngữ giao diện" translate="no"></div>
            <div class="ccy-toggle" id="ccy-toggle" role="group" aria-label="Tiền hiển thị"></div>
            <button type="button" class="workspace-tool-btn" id="theme-btn"></button>
          </div>
        </div>
      </header>
      <section class="page" id="page"></section>
    </div>

    <div class="modal-back" id="confirm-modal">
      <div class="modal modal-confirm">
        <div class="modal-confirm-icon">${icon("triangle-alert")}</div>
        <h3 id="confirm-title">Xác nhận xóa</h3>
        <p id="confirm-text"></p>
        <p class="confirm-note" id="confirm-note" hidden></p>
        <div class="modal-actions">
          <button class="btn secondary" type="button" id="confirm-cancel">Hủy bỏ</button>
          <button class="btn danger" type="button" id="confirm-ok"></button>
        </div>
      </div>
    </div>

    <div class="toast-wrap"></div>`;

  document.getElementById("ccy-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-ccy]");
    if (btn && btn.dataset.ccy !== store.ccy) setCcy(btn.dataset.ccy);
  });
  document.getElementById("lang-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-lang]");
    if (btn && btn.dataset.lang !== i18n.lang) setLang(btn.dataset.lang);
  });
  document.getElementById("theme-btn").addEventListener("click", () => {
    darkMode = !darkMode;
    applyTheme();
  });

  const modal = document.getElementById("confirm-modal");
  modal.addEventListener("click", (e) => { if (e.target === modal) closeConfirm(); });
  document.getElementById("confirm-cancel").addEventListener("click", closeConfirm);
  document.getElementById("confirm-ok").addEventListener("click", () => {
    const fn = confirmHandler;
    closeConfirm();
    fn?.();
  });
}

function applyTheme() {
  document.documentElement.dataset.theme = darkMode ? "dark" : "light";
  localStorage.setItem("fm_theme", darkMode ? "dark" : "light");
  const btn = document.getElementById("theme-btn");
  btn.innerHTML = icon(darkMode ? "sun" : "moon", 17);
  btn.title = darkMode ? "Giao diện sáng" : "Giao diện tối";
  btn.setAttribute("aria-label", darkMode ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối");
  btn.setAttribute("aria-pressed", String(darkMode));
}

/** Nút đổi ngôn ngữ giao diện VI ⇄ DE (bản dịch nhập ở trang Bản dịch). */
function renderLangToggle() {
  document.getElementById("lang-toggle").innerHTML = I18N_LANGS.map(([v, label, name]) => `
    <button type="button" class="ccy-opt${i18n.lang === v ? " on" : ""}" data-lang="${v}" aria-pressed="${i18n.lang === v}" title="${name}">${label}</button>`).join("");
}

/** Nút đổi tiền hiển thị USD ⇄ EUR trên thanh trên cùng (dùng chung cho mọi trang). */
function renderCcyToggle() {
  const rate = eurToUsdOn(localISO(new Date()));
  document.getElementById("ccy-toggle").innerHTML = [["USD", "$ USD"], ["EUR", "€ EUR"]].map(([v, label]) => `
    <button type="button" class="ccy-opt${store.ccy === v ? " on" : ""}" data-ccy="${v}" aria-pressed="${store.ccy === v}"
      title="Hiển thị số tiền bằng ${v} · tỷ giá tháng này 1 EUR = ${fmtRate(rate)} USD">${label}</button>`).join("");
}

/**
 * Hộp xác nhận. `opts`: { title, okLabel, note } — note là dòng lưu ý nhỏ bên dưới.
 * Mặc định nút là "Xóa"; chỉ dùng "Xóa vĩnh viễn" khi dữ liệu không khôi phục được.
 */
function openConfirm(text, onOk, opts = {}) {
  confirmHandler = onOk;
  document.getElementById("confirm-title").textContent = opts.title || "Xác nhận xóa";
  document.getElementById("confirm-text").textContent = text;
  const note = document.getElementById("confirm-note");
  note.hidden = !opts.note;
  note.innerHTML = opts.note ? `${icon("info", 14)}<span>${esc(opts.note)}</span>` : "";
  document.getElementById("confirm-ok").innerHTML = `${icon(opts.icon || "trash-2")} ${esc(opts.okLabel || "Xóa")}`;
  document.getElementById("confirm-modal").classList.add("open");
}
const TRASH_NOTE = "Khoản bị xóa sẽ được chuyển vào Thùng rác và có thể khôi phục trong 30 ngày.";

function closeConfirm() {
  confirmHandler = null;
  document.getElementById("confirm-modal").classList.remove("open");
}

/** Chuyển trang, ví dụ navigate("/incomes?new=1"). `replace` = không thêm vào lịch sử. */
function navigate(to, replace = false) {
  if (replace) {
    history.replaceState(null, "", `#${to}`);
    route();
  } else {
    location.hash = to;
  }
}

function parseHash() {
  const raw = location.hash.slice(1) || "/dashboard";
  const [path, qs = ""] = raw.split("?");
  return { path, query: new URLSearchParams(qs) };
}

function updateShell(path) {
  const meta = PAGE_METAS[path];
  document.querySelectorAll(".nav-btn-new").forEach((a) => a.classList.toggle("active", a.dataset.path === path));
  document.getElementById("crumb-tail").innerHTML = path !== "/dashboard"
    ? `<span class="topbar-sep">/</span><span class="topbar-cur">${meta.breadcrumb}</span>`
    : "";
  document.getElementById("page-desc").textContent = meta.desc;
}

function route() {
  const { path, query } = parseHash();
  const page = ROUTES[path];
  if (!page) {
    navigate("/dashboard", true);
    return;
  }
  const changed = path !== current.path;
  if (changed) {
    current.page?.destroy();
    current.path = path;
    current.page = page;
    page.init();
    updateShell(path);
  }
  current.query = query;
  renderPage();
  if (changed) {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.querySelectorAll(".table-wrap").forEach((el) => { el.scrollLeft = 0; });
  }
}

function renderPage() {
  if (current.page) current.page.render(document.getElementById("page"), current.query);
}

// ---- Ô ngày gõ số dd/mm/yyyy (dateFieldHtml trong format.js), dùng chung cho mọi trang
document.addEventListener("input", (e) => {
  const t = e.target;
  if (!t.classList?.contains("date-text") || e.inputType?.startsWith("delete")) return;
  t.value = maskDateText(t.value);
});
// Bấm vào ô ngày: chọn sẵn cả ngày cũ để gõ là thay luôn.
document.addEventListener("focusin", (e) => {
  const t = e.target;
  if (t.classList?.contains("date-text")) setTimeout(() => { if (document.activeElement === t) t.select(); });
});

/**
 * Định dạng khi đang gõ ngày: gõ đủ ngày thì tự nhảy sang tháng, đủ tháng thì nhảy sang năm (dd/mm/yyyy).
 * Ngày bắt đầu bằng 4–9, tháng bắt đầu bằng 2–9 hoặc gõ "/" sau 1 chữ số → tự thêm số 0 và nhảy luôn.
 */
function maskDateText(raw) {
  const seg = ["", "", ""];
  const max = [2, 2, 4];
  let i = 0;
  for (const ch of String(raw)) {
    if (/\d/.test(ch)) {
      if (i < 2 && seg[i].length === max[i]) i++;
      if (seg[i].length >= max[i]) continue;
      seg[i] += ch;
      // Chữ số đầu không thể là hàng chục (ngày 4–9, tháng 2–9) → hiểu là 0x và sang phần sau.
      if (i < 2 && seg[i].length === 1 && Number(ch) > (i === 0 ? 3 : 1)) { seg[i] = "0" + ch; i++; }
    } else if (/[/.\-\s]/.test(ch) && i < 2 && seg[i]) {
      if (seg[i].length === 1) seg[i] = "0" + seg[i];
      i++;
    }
  }
  let out = seg[0];
  if (seg[0].length === 2 && (i >= 1 || seg[1])) out += "/" + seg[1];
  else if (seg[0].length === 2) out += "/";
  if (seg[1].length === 2) out += "/" + seg[2];
  return out;
}
document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (!t.classList?.contains("date-text")) return;
  if (e.key === "Enter") { e.preventDefault(); commitDateText(t); }
  else if (e.key === "Escape") t.value = dmy(t.parentElement.querySelector(".date-native").value);
});
document.addEventListener("focusout", (e) => {
  if (e.target.classList?.contains("date-text")) commitDateText(e.target, e.relatedTarget);
});
document.addEventListener("click", (e) => {
  const btn = e.target.closest?.(".date-pick-btn");
  if (!btn) return;
  const native = btn.parentElement.querySelector(".date-native");
  try { native.showPicker(); } catch { native.focus(); }
});
// Chọn trên lịch → hiện lại ngày dạng dd/mm/yyyy trong ô gõ.
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.classList?.contains("date-native")) t.parentElement.querySelector(".date-text").value = dmy(t.value);
}, true);

/** Áp dụng ngày vừa gõ: báo "change" trên ô ngày ẩn để trang lọc lại; giữ con trỏ ở ô ngày kế tiếp nếu đang Tab sang. */
function commitDateText(text, next) {
  const native = text.parentElement?.querySelector(".date-native");
  if (!native) return;
  const iso = parseDmy(text.value);
  if (iso === null) {
    toast("Ngày không hợp lệ. Nhập dạng dd/mm/yyyy, ví dụ 29/09/2026.");
    text.value = dmy(native.value);
    return;
  }
  text.value = dmy(iso);
  if (iso === native.value) return;
  native.value = iso;
  const nextKey = next?.classList?.contains("date-text") ? next.dataset.dateKey : "";
  native.dispatchEvent(new Event("change", { bubbles: true }));
  if (nextKey) {
    const el = document.querySelector(`.date-text[data-date-key="${nextKey}"]`);
    if (el && el !== document.activeElement) { el.focus(); el.select(); }
  }
}

// ---- Đồng bộ Etsy tự động: mỗi phút hỏi backend; có lần chạy mới nhập thêm đơn thì tải lại dữ liệu.
async function pollEtsyAuto() {
  let a;
  try { a = await etsyAutoSync(); } catch { return; }
  const changed = store.etsyAuto?.enabled !== a.enabled;
  store.etsyAuto = a;
  // Hết tháng, backend tự ghi tiền quảng cáo Etsy của tháng đó vào Khoản chi.
  if (store.etsyAdsSeen !== undefined && a.adsLastRunAt !== store.etsyAdsSeen && a.lastAdsImported > 0) {
    toast(`Đã ghi tiền quảng cáo Etsy tháng ${String(a.adsMonthDone || "").split("-").reverse().join("/")} vào Khoản chi`);
    reload();
  }
  store.etsyAdsSeen = a.adsLastRunAt;
  if (store.etsyAutoSeen !== undefined && a.lastRunAt !== store.etsyAutoSeen && a.lastImported > 0) {
    toast(`Đã tự động nhập ${a.lastImported} đơn Etsy mới`);
    store.etsyAutoSeen = a.lastRunAt;
    reload();
    return;
  }
  store.etsyAutoSeen = a.lastRunAt;
  if (changed) emitStore();
}

// ---- Khởi động
renderShell();
applyTheme();
renderCcyToggle();
renderLangToggle();
i18nStart();
onStoreChange(renderPage);
onStoreChange(renderCcyToggle);
onStoreChange(renderLangToggle);
window.addEventListener("hashchange", route);
route();
reload();
loadFx();
pollEtsyAuto();
setInterval(pollEtsyAuto, 60 * 1000);
