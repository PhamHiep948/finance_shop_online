const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("./load");

/** Trang Bản dịch với `n` chữ chưa dịch ("Chữ 01", "Chữ 02"…). */
function setup(n, extra = []) {
  const { TranslationsPage, TR_PAGE_SIZE } = loadScripts(["js/format.js", "js/pages/translations.js"])(["TranslationsPage", "TR_PAGE_SIZE"]);
  const rows = [
    ...Array.from({ length: n }, (_, i) => ({ source: `Chữ ${String(i + 1).padStart(2, "0")}`, de: null, ignored: false })),
    ...extra,
  ];
  Object.assign(TranslationsPage, {
    rows, q: "", view: "todo", page: 1,
    draft: Object.fromEntries(rows.map((x) => [x.source, { de: x.de || "", ignored: x.ignored }])),
  });
  return { page: TranslationsPage, size: TR_PAGE_SIZE };
}

const rowCount = (html) => (html.match(/class="tr-row/g) || []).length;
const sources = (html) => [...html.matchAll(/<span class="tr-default">([^<]+)<\/span>/g)].map((m) => m[1]);

test("mỗi trang hiện 20 chữ", () => {
  const { page, size } = setup(45);
  assert.equal(size, 20);
  const html = page.rowsHtml();
  assert.equal(rowCount(html), 20);
  assert.match(html, /Hiển thị 1 – 20 trên tổng số 45 chữ/);
});

test("trang 2 hiện chữ 21 – 40, trang cuối chỉ còn phần dư", () => {
  const { page } = setup(45);
  page.page = 2;
  let html = page.rowsHtml();
  assert.deepEqual(sources(html).slice(0, 2), ["Chữ 21", "Chữ 22"]);
  assert.match(html, /Hiển thị 21 – 40 trên tổng số 45 chữ/);
  page.page = 3;
  html = page.rowsHtml();
  assert.equal(rowCount(html), 5);
  assert.match(html, /Hiển thị 41 – 45/);
});

test("nút Trước tắt ở trang đầu, nút Sau tắt ở trang cuối", () => {
  const { page } = setup(45);
  const prevDisabled = (html) => /data-page="0" disabled/.test(html);
  const nextDisabled = (html) => /data-page="4" disabled/.test(html);
  let html = page.rowsHtml();
  assert.equal(prevDisabled(html), true);
  page.page = 3;
  html = page.rowsHtml();
  assert.equal(nextDisabled(html), true);
  assert.match(html, /class="btn primary pager-btn" data-action="page" data-page="3"/);
});

test("ít hơn một trang thì không có nút chuyển trang", () => {
  const { page } = setup(7);
  const html = page.rowsHtml();
  assert.equal(rowCount(html), 7);
  assert.doesNotMatch(html, /pager-pages/);
  assert.match(html, /Hiển thị 1 – 7 trên tổng số 7 chữ/);
});

test("nhiều trang thì rút gọn bằng dấu …, luôn giữ trang đầu và trang cuối", () => {
  const { page } = setup(200); // 10 trang
  page.page = 5;
  const html = page.rowsHtml();
  const nums = [...html.matchAll(/pager-btn" data-action="page" data-page="(\d+)">\d+</g)].map((m) => Number(m[1]));
  assert.deepEqual(nums, [1, 3, 4, 5, 6, 7, 10]);
  assert.equal((html.match(/…<\/span>/g) || []).length, 2);
});

test("bấm Bỏ qua làm danh sách ngắn lại thì lùi về trang cuối còn tồn tại", () => {
  const { page } = setup(21);
  page.page = 2;
  page.draft["Chữ 21"].ignored = true;
  const html = page.rowsHtml();
  assert.equal(page.page, 1);
  assert.equal(rowCount(html), 20);
});

test("tìm kiếm và bộ lọc tính phân trang trên danh sách đã lọc", () => {
  const { page } = setup(45, [{ source: "Đã dịch rồi", de: "Schon übersetzt", ignored: false }]);
  page.q = "Chữ 4";
  let html = page.rowsHtml();
  assert.deepEqual(sources(html), ["Chữ 40", "Chữ 41", "Chữ 42", "Chữ 43", "Chữ 44", "Chữ 45"]);
  page.q = "";
  page.view = "done";
  html = page.rowsHtml();
  assert.deepEqual(sources(html), ["Đã dịch rồi"]);
});

test("không có chữ nào thì báo trống, không có thanh phân trang", () => {
  const { page } = setup(0);
  const html = page.rowsHtml();
  assert.match(html, /Không có chữ nào/);
  assert.doesNotMatch(html, /class="pager"/);
});

test("tên sản phẩm / dữ liệu đã lỡ gom thì bị bỏ khỏi danh sách dịch; chữ đã dịch hoặc bỏ qua giữ nguyên", () => {
  const { trDataKeys, trDataRows } = loadScripts(["js/format.js", "js/store.js", "js/i18n.js", "js/pages/translations.js"], { api: async () => [] })(["trDataKeys", "trDataRows"]);
  const keys = trDataKeys(
    [{ description: "Lily  Flower 30 cm", recipient: "DHL Express" }, { description: "Tiền xưởng · Rose", note: "" }],
    ["Handmade Rose Necklace"]);
  const rows = [
    { source: "Lily Flower {0} cm", de: "", ignored: false },
    { source: "DHL Express", de: "", ignored: false },
    { source: "Handmade Rose Necklace", de: "", ignored: false },
    { source: "Tiền xưởng · Rose", de: "Werkstatt · Rose", ignored: false },
    { source: "Rose", de: "", ignored: true },
    { source: "Tổng thu", de: "", ignored: false },
  ];
  assert.deepEqual(trDataRows(rows, keys).map((x) => x.source), ["Lily Flower {0} cm", "DHL Express", "Handmade Rose Necklace"]);
});
