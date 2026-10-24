// Dịch giao diện tiếng Việt → tiếng Đức theo từ điển admin nhập ở trang Bản dịch (#/translations, lưu database).
// Các trang vẫn viết chữ tiếng Việt như cũ; ở chế độ "de", mọi chữ hiện trên màn hình (chữ trong thẻ, placeholder,
// title, aria-label, nhãn biểu đồ) được thay bằng bản dịch nếu có, chưa dịch thì giữ tiếng Việt.
// Chữ chưa có trong từ điển được tự gửi lên backend (/translations/discover) để admin thấy và dịch.
// Số trong chữ được thay bằng {0}, {1}… nên "Trang 2 / 5" và "Trang 3 / 9" dùng chung một bản dịch "Seite {0} / {1}".
// Vùng có thuộc tính translate="no" (dữ liệu người dùng: tên sản phẩm, nội dung khoản chi…) không dịch và không gom.

const I18N_LANGS = [["vi", "VI", "Tiếng Việt"], ["de", "DE", "Deutsch"]];
const I18N_ATTRS = ["placeholder", "title", "aria-label"];
// .cell-code: mã đơn, mã hóa đơn… (dữ liệu, không phải chữ giao diện).
const I18N_SKIP = 'script, style, textarea, code, .cell-code, [contenteditable="true"], [translate="no"]';
const I18N_DISCOVER_BATCH = 300;

const i18n = {
  lang: (() => { try { return localStorage.getItem("fm_lang") === "de" ? "de" : "vi"; } catch { return "vi"; } })(),
  dict: new Map(), // chữ gốc (đã chuẩn hóa) → tiếng Đức
  known: new Set(), // chữ gốc backend đã có (kể cả chưa dịch / bỏ qua): không gửi lại
  loaded: false,
  queue: new Set(),
  timer: 0,
  texts: new WeakMap(), // text node → { src, out }
  attrs: new WeakMap(), // element → { [attr]: { src, out } }
  observer: null,
};

/** Bỏ khoảng trắng thừa ở hai đầu và giữa chữ. */
const i18nNormalize = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Chữ có ít nhất 2 chữ cái mới cần dịch (bỏ qua số tiền, ngày, ký hiệu…). */
const i18nWorthy = (s) => /\p{L}[^]*\p{L}/u.test(s);

// Tên loại / phạm vi có sẵn của hệ thống (FinanceSeeder, tiền xưởng / ship tự tạo): vẫn dịch như chữ giao diện.
const I18N_BUILTIN_NAMES = new Set([
  "Bán hàng", "Thu khác", "Nguyên vật liệu", "Bao bì / đóng gói", "Vận chuyển", "Quảng cáo", "Phí dịch vụ",
  "Lương nhân viên", "Điện / nước / Internet", "Thuê mặt bằng", "Công cụ / thiết bị", "Chi khác",
  "Tiền xưởng", "Phí ship", "Nội địa", "Quốc tế",
]);

/**
 * Tên người dùng tự thêm (nhóm sản phẩm, loại chi, phạm vi, nhóm báo cáo): tạm thời không dịch, không gom.
 * Tên hiện ở rất nhiều chỗ (bảng, ô chọn, biểu đồ…) nên so theo danh sách thay vì đánh dấu từng chỗ.
 */
function i18nIsUserName(norm) {
  i18n.userNames = i18n.userNames || new Set([INCOME_CATEGORIES, EXPENSE_CATEGORIES, SCOPES, CATEGORY_GROUPS]
    .flatMap((list) => list.map((c) => i18nNormalize(c.name)))
    .filter((name) => !I18N_BUILTIN_NAMES.has(name)));
  return i18n.userNames.has(norm);
}
// Danh sách tên được tải lại (reload) hoặc sửa tên thì dựng lại ở lần tra kế tiếp.
onStoreChange(() => { i18n.userNames = null; });

/** "Trang 2 / 5" → { key: "Trang {0} / {1}", nums: ["2", "5"] }. */
function i18nTemplate(text) {
  const nums = [];
  const key = text.replace(/\d+(?:[.,]\d+)*/g, (n) => `{${nums.push(n) - 1}}`);
  return { key, nums };
}

/** Thay {0}, {1}… trong `text` bằng `args`; thiếu thì giữ nguyên chỗ đó. */
function i18nFill(text, args) {
  return text.replace(/\{(\d+)\}/g, (all, i) => (args[i] === undefined ? all : String(args[i])));
}

/**
 * Bản dịch của chữ tiếng Việt `text` sang ngôn ngữ đang chọn; null nếu không cần / chưa có bản dịch.
 * `discover` = gửi chữ chưa có trong từ điển lên backend.
 */
function i18nLookup(text, { lang = i18n.lang, discover = true } = {}) {
  const norm = i18nNormalize(text);
  if (!norm || !i18nWorthy(norm) || i18nIsUserName(norm)) return null;
  const { key, nums } = i18nTemplate(norm);
  if (discover) i18nDiscover(key);
  if (lang !== "de") return null;
  const exact = i18n.dict.get(norm);
  if (exact) return exact;
  const de = i18n.dict.get(key);
  return de ? i18nFill(de, nums) : null;
}

function i18nDiscover(key) {
  if (i18n.known.has(key) || i18n.queue.has(key) || key.length > 1000) return;
  i18n.queue.add(key);
  clearTimeout(i18n.timer);
  i18n.timer = setTimeout(i18nFlush, 2000);
}

async function i18nFlush() {
  if (!i18n.loaded) return; // chờ tải xong từ điển, tránh gửi lại chữ backend đã có
  const sources = [...i18n.queue].filter((x) => !i18n.known.has(x)).slice(0, I18N_DISCOVER_BATCH);
  i18n.queue.clear();
  if (!sources.length) return;
  sources.forEach((x) => i18n.known.add(x));
  try {
    await api("/translations/discover", { method: "POST", body: { sources } });
  } catch (e) {
    sources.forEach((x) => i18n.known.delete(x));
    console.warn("Không gửi được chữ cần dịch:", e.message);
  }
}

/** Nạp từ điển từ backend; `rows` = [{ source, de, ignored }]. */
function i18nSetDictionary(rows) {
  i18n.dict = new Map(rows.filter((x) => x.de && !x.ignored).map((x) => [i18nNormalize(x.source), x.de]));
  i18n.known = new Set(rows.map((x) => i18nNormalize(x.source)));
  i18n.loaded = true;
}

async function i18nLoad() {
  try {
    i18nSetDictionary(await api("/translations"));
  } catch (e) {
    console.warn("Không tải được bản dịch giao diện:", e.message);
    i18n.loaded = true;
  }
  i18nApply(document.body);
  i18nFlush();
}

// ---------------------------------------------------------------- Dịch trên trang

/** Dịch một text node; nhớ chữ gốc để đổi ngôn ngữ qua lại không bị dịch chồng. */
function i18nText(node) {
  const cur = node.nodeValue;
  const rec = i18n.texts.get(node);
  // App vừa ghi chữ mới vào node thì đó là chữ gốc; còn đúng chữ mình đã dịch thì giữ chữ gốc cũ.
  const src = rec && cur === rec.out ? rec.src : cur;
  const de = i18nLookup(src);
  const out = de == null ? src : src.match(/^\s*/)[0] + de + src.match(/\s*$/)[0];
  if (out !== cur) node.nodeValue = out;
  i18n.texts.set(node, { src, out });
}

function i18nAttr(el, name) {
  const cur = el.getAttribute(name);
  if (cur == null) return;
  const recs = i18n.attrs.get(el) || {};
  const rec = recs[name];
  const src = rec && cur === rec.out ? rec.src : cur;
  const out = i18nLookup(src) ?? src;
  if (out !== cur) el.setAttribute(name, out);
  recs[name] = { src, out };
  i18n.attrs.set(el, recs);
}

const i18nSkipped = (el) => Boolean(el?.closest?.(I18N_SKIP));

/** Dịch mọi chữ trong `root` (kể cả chính nó). */
function i18nApply(root) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    if (!i18nSkipped(root.parentElement)) i18nText(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE || i18nSkipped(root)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeType === Node.ELEMENT_NODE && n.matches(I18N_SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = root; n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) i18nText(n);
    else I18N_ATTRS.forEach((a) => n.hasAttribute(a) && i18nAttr(n, a));
  }
}

function i18nTitle() {
  const src = i18n.titleSrc ?? (i18n.titleSrc = document.title);
  document.title = i18nLookup(src) ?? src;
}

/** Theo dõi mọi thay đổi trên trang (vẽ lại trang, toast, modal…) để dịch ngay. */
function i18nStart() {
  i18n.observer = new MutationObserver((muts) => {
    muts.forEach((m) => {
      if (m.type === "childList") m.addedNodes.forEach(i18nApply);
      else if (m.type === "characterData") i18nApply(m.target);
      else if (!i18nSkipped(m.target)) i18nAttr(m.target, m.attributeName);
    });
  });
  i18n.observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: I18N_ATTRS });
  document.documentElement.lang = i18n.lang;
  i18nTitle();
  i18nLoad();
}

/** Đổi ngôn ngữ giao diện. Trang được vẽ lại để biểu đồ cũng đổi chữ. */
function setLang(lang) {
  i18n.lang = lang === "de" ? "de" : "vi";
  try { localStorage.setItem("fm_lang", i18n.lang); } catch { /* bỏ qua */ }
  document.documentElement.lang = i18n.lang;
  i18nTitle();
  i18nApply(document.body);
  emitStore();
}

// Nhãn biểu đồ (vẽ trên canvas, không phải chữ trên trang). Biểu đồ đặt `plugins.i18n: false` thì bỏ qua (ảnh trong PDF).
if (typeof Chart !== "undefined") {
  Chart.register({
    id: "i18n",
    beforeUpdate(chart, args, opts) {
      if (opts === false || chart.options?.plugins?.i18n === false) return;
      const d = chart.data;
      // Trang thay mảng nhãn mới (hoặc lần đầu) thì đó là nhãn gốc; còn là mảng mình đã dịch thì dùng nhãn gốc cũ.
      const src = chart.$i18n && d.labels === chart.$i18n.out && d.datasets.length === chart.$i18n.ds.length
        ? chart.$i18n
        : { labels: d.labels ? [...d.labels] : null, ds: d.datasets.map((x) => x.label) };
      const t = (v) => (typeof v === "string" ? i18nLookup(v) ?? v : v);
      if (src.labels) d.labels = src.labels.map(t);
      d.datasets.forEach((x, i) => { x.label = t(src.ds[i]); });
      chart.$i18n = { ...src, out: d.labels };
    },
  });
}
