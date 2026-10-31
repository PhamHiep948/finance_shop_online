// Kéo giãn chiều ngang cột của mọi bảng như Excel: kéo mép phải tiêu đề cột để rộng / hẹp, nhấp đúp để trả về như cũ.
// Các trang vẽ lại bảng bằng innerHTML rất thường xuyên, nên theo dõi DOM và gắn tay kéo vào mỗi bảng mới xuất hiện.
// Độ rộng nhớ trong trình duyệt (localStorage) theo trang + loại bảng + cột; cột có `data-col` thì nhớ theo mã cột
// (đổi thứ tự / ẩn cột vẫn đúng), còn lại theo vị trí cột. Bảng có `data-noresize` thì bỏ qua.

const COLW_STORAGE = "fm_colw";
const COLW_MIN = 48;

const colw = {
  saved: (() => { try { return JSON.parse(localStorage.getItem(COLW_STORAGE)) || {}; } catch { return {}; } })(),
  drag: null,
  justDragged: false,
};

function colwPersist() {
  try { localStorage.setItem(COLW_STORAGE, JSON.stringify(colw.saved)); } catch { /* bỏ qua */ }
}

/** Khóa nhớ độ rộng của bảng: trang (#/incomes…) + class của bảng + thứ tự trong các bảng cùng loại trên trang. */
function colwTableKey(table) {
  const page = (location.hash || "#/").split("?")[0];
  const cls = [...table.classList].filter((c) => c !== "is-resized").sort().join(".") || "table";
  const same = [...document.querySelectorAll("table")].filter((t) => ([...t.classList].filter((c) => c !== "is-resized").sort().join(".") || "table") === cls);
  return `${page}|${cls}|${same.indexOf(table)}`;
}

const colwHeads = (table) => [...(table.tHead?.rows[0]?.cells || [])];
const colwColKey = (th, i) => th.dataset.col || String(i);

/** Gắn tay kéo vào các tiêu đề cột của bảng (một lần) và dùng lại độ rộng đã nhớ. */
function colwDecorate(table) {
  if (table.dataset.noresize !== undefined || table.dataset.colw) return;
  const heads = colwHeads(table);
  if (!heads.length) return;
  table.dataset.colw = "1";
  heads.forEach((th) => {
    th.classList.add("col-resizable");
    const grip = document.createElement("span");
    grip.className = "col-resizer";
    grip.title = "Kéo để đổi độ rộng cột · nhấp đúp để trả về như cũ";
    grip.setAttribute("aria-hidden", "true");
    th.appendChild(grip);
  });
  const saved = colw.saved[colwTableKey(table)];
  if (saved && heads.some((th, i) => saved[colwColKey(th, i)])) colwFix(table, saved);
}

/**
 * Chuyển bảng sang độ rộng cố định: cột đã nhớ lấy số đã nhớ, cột khác giữ độ rộng đang hiện.
 * Bảng rộng đúng tổng các cột (không giãn ra cả khung), ô hẹp hơn chữ thì cắt bằng "…".
 */
function colwFix(table, saved = {}) {
  const heads = colwHeads(table);
  const widths = heads.map((th, i) => Number(saved[colwColKey(th, i)]) || Math.max(COLW_MIN, Math.round(th.getBoundingClientRect().width)));
  heads.forEach((th, i) => { th.style.width = `${widths[i]}px`; });
  table.classList.add("is-resized");
  table.style.width = `${widths.reduce((t, w) => t + w, 0)}px`;
}

function colwReset(table) {
  delete colw.saved[colwTableKey(table)];
  colwPersist();
  table.classList.remove("is-resized");
  table.style.width = "";
  colwHeads(table).forEach((th) => { th.style.width = ""; });
}

function colwRemember(table) {
  colw.saved[colwTableKey(table)] = Object.fromEntries(colwHeads(table).map((th, i) => [colwColKey(th, i), Math.round(th.getBoundingClientRect().width)]));
  colwPersist();
}

function colwScan() {
  document.querySelectorAll("table:not([data-colw])").forEach(colwDecorate);
}

function initColumnResize() {
  colwScan();
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; colwScan(); });
  }).observe(document.body, { childList: true, subtree: true });

  document.addEventListener("pointerdown", (e) => {
    const grip = e.target.closest?.(".col-resizer");
    if (!grip || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const th = grip.parentElement;
    const table = th.closest("table");
    if (!table.classList.contains("is-resized")) colwFix(table);
    colw.drag = { th, table, x: e.clientX, w: th.getBoundingClientRect().width, tableW: table.getBoundingClientRect().width };
    document.body.classList.add("is-col-resizing");
  }, true);

  document.addEventListener("pointermove", (e) => {
    const d = colw.drag;
    if (!d) return;
    const w = Math.max(COLW_MIN, Math.round(d.w + e.clientX - d.x));
    d.th.style.width = `${w}px`;
    d.table.style.width = `${Math.round(d.tableW + w - d.w)}px`;
  });

  document.addEventListener("pointerup", () => {
    const d = colw.drag;
    if (!d) return;
    colw.drag = null;
    document.body.classList.remove("is-col-resizing");
    colwRemember(d.table);
    // Thả chuột trên tiêu đề cột có nút sắp xếp: không tính là bấm sắp xếp.
    colw.justDragged = true;
    setTimeout(() => { colw.justDragged = false; }, 0);
  });

  document.addEventListener("click", (e) => {
    if (colw.justDragged || e.target.closest?.(".col-resizer")) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  document.addEventListener("dblclick", (e) => {
    const grip = e.target.closest?.(".col-resizer");
    if (!grip) return;
    e.preventDefault();
    e.stopPropagation();
    colwReset(grip.closest("table"));
  }, true);
}
