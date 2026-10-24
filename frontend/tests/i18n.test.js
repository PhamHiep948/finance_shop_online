const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadScripts } = require("./load");

const NAMES = ["i18n", "i18nNormalize", "i18nWorthy", "i18nTemplate", "i18nFill", "i18nLookup", "i18nSetDictionary", "i18nFlush",
  "pdfTextFn", "PDF_TEXT_GROUPS", "PDF_TEXT_DEFAULTS"];

/** Nạp lại script cho mỗi test; `calls` ghi lại các lần gọi API. */
function setup({ lang = "vi", rows = [] } = {}) {
  const calls = [];
  const api = async (url, opts) => { calls.push({ url, body: opts?.body }); return []; };
  const storage = { getItem: (k) => (k === "fm_lang" ? lang : null), setItem() {}, removeItem() {} };
  const x = loadScripts(["js/format.js", "js/store.js", "js/i18n.js", "js/pages/report-export.js"], { api, localStorage: storage })(NAMES);
  x.i18nSetDictionary(rows);
  return { ...x, calls };
}

test("chuẩn hóa khoảng trắng và chỉ dịch chữ có ít nhất 2 chữ cái", () => {
  const { i18nNormalize, i18nWorthy } = setup();
  assert.equal(i18nNormalize("  Tổng   cộng \n"), "Tổng cộng");
  assert.equal(i18nWorthy("Tổng cộng"), true);
  assert.equal(i18nWorthy("$1,234.56"), false);
  assert.equal(i18nWorthy("12/10/2026"), false);
  assert.equal(i18nWorthy("€ 5"), false);
});

test("số trong chữ thành {0}, {1}… để nhiều câu dùng chung một bản dịch", () => {
  const { i18nTemplate } = setup();
  const t = i18nTemplate("Hiển thị 1 – 10 trên tổng số 1.234 bản ghi");
  assert.equal(t.key, "Hiển thị {0} – {1} trên tổng số {2} bản ghi");
  assert.deepEqual([...t.nums], ["1", "10", "1.234"]);
});

test("chế độ tiếng Việt không đổi chữ", () => {
  const { i18nLookup } = setup({ lang: "vi", rows: [{ source: "Tổng cộng", de: "Gesamt" }] });
  assert.equal(i18nLookup("Tổng cộng"), null);
});

test("chế độ tiếng Đức: dịch đúng chữ, chèn lại số theo thứ tự bản dịch", () => {
  const { i18nLookup } = setup({
    lang: "de",
    rows: [
      { source: "Tổng cộng", de: "Gesamt" },
      { source: "Trang {0} / {1}", de: "{1} Seiten, Seite {0}" },
    ],
  });
  assert.equal(i18nLookup("  Tổng   cộng "), "Gesamt");
  assert.equal(i18nLookup("Trang 2 / 5"), "5 Seiten, Seite 2");
});

test("chữ chưa dịch hoặc đã bỏ qua thì giữ tiếng Việt", () => {
  const { i18nLookup } = setup({
    lang: "de",
    rows: [{ source: "Khoản thu", de: null }, { source: "Mina Store", de: "Mina Laden", ignored: true }],
  });
  assert.equal(i18nLookup("Khoản thu"), null);
  assert.equal(i18nLookup("Mina Store"), null);
});

test("chữ mới chưa có ở backend được gửi lên một lần (dạng có {0}), chữ đã có thì không", async () => {
  const x = setup({ rows: [{ source: "Khoản thu", de: null }] });
  x.i18nLookup("Khoản thu");
  x.i18nLookup("Trang 1 / 3");
  x.i18nLookup("Trang 2 / 3");
  x.i18nLookup("$12.40");
  await x.i18nFlush();
  assert.equal(x.calls.length, 1);
  assert.equal(x.calls[0].url, "/translations/discover");
  assert.deepEqual([...x.calls[0].body.sources], ["Trang {0} / {1}"]);
  x.i18nLookup("Trang 9 / 9");
  await x.i18nFlush();
  assert.equal(x.calls.length, 1);
});

test("không gửi chữ trước khi tải xong từ điển (tránh gửi lại chữ backend đã có)", async () => {
  const x = setup();
  x.i18n.loaded = false;
  x.i18nLookup("Khoản thu");
  await x.i18nFlush();
  assert.equal(x.calls.length, 0);
});

test("PDF: tiếng Việt mặc định, tiếng Đức lấy từ cùng từ điển giao diện", () => {
  const x = setup({ rows: [{ source: "Báo cáo tài chính", de: "Finanzbericht" }, { source: "Trang {0} / {1}", de: "Seite {0} von {1}" }] });
  assert.equal(x.pdfTextFn("vi")("title"), "Báo cáo tài chính");
  assert.equal(x.pdfTextFn("de")("title"), "Finanzbericht");
  assert.equal(x.pdfTextFn("de")("page", 2, 5), "Seite 2 von 5");
  assert.equal(x.pdfTextFn("de")("kpiIncome"), "Tổng doanh thu"); // chưa dịch
  assert.equal(x.pdfTextFn("vi")("txCount", 0), "0 thu · {1} chi");
});

test("danh mục chữ PDF: mã không trùng, chữ không rỗng, đủ mọi mã hàm dựng PDF dùng", () => {
  const { PDF_TEXT_GROUPS, PDF_TEXT_DEFAULTS } = setup();
  const keys = PDF_TEXT_GROUPS.flatMap(([, items]) => items.map(([key]) => key));
  assert.equal(new Set(keys).size, keys.length);
  keys.forEach((key) => assert.ok(String(PDF_TEXT_DEFAULTS[key]).trim(), key));
  const src = fs.readFileSync(path.join(__dirname, "../js/pages/report-export.js"), "utf8");
  const used = [...src.slice(src.indexOf("async function buildReportPdf")).matchAll(/\bt\("([A-Za-z]+)"/g)].map((m) => m[1]);
  assert.ok(used.length > 50);
  used.forEach((key) => assert.ok(key in PDF_TEXT_DEFAULTS, `thiếu chữ "${key}"`));
});

function cmsSetup() {
  return loadScripts(["js/format.js", "js/store.js", "js/i18n.js", "js/pages/report-export.js", "js/pages/translations.js"], { api: async () => [] })(
    ["trExamples", "trShow", "trParse", "trMissing", "trSourceHtml"],
  );
}

test("trang Bản dịch: mỗi chỗ {0}, {1}… hiện một số ví dụ khác nhau", () => {
  const x = cmsSetup();
  assert.deepEqual([...x.trExamples("Trang {0} / {1}")], ["[1]", "[2]"]);
  assert.deepEqual([...x.trExamples("Hiển thị {0} – {1} trên tổng số {2} bản ghi")], ["[1]", "[2]", "[3]"]);
  assert.deepEqual([...x.trExamples("Tổng cộng")], []);
  assert.equal(x.trShow("{0} Einnahmen · {1} Ausgaben", ["97", "44"]), "97 Einnahmen · 44 Ausgaben");
});

test("trang Bản dịch: bản dịch gõ kèm số liệu ví dụ được lưu lại dạng {0}, {1}, kể cả khi đảo thứ tự", () => {
  const x = cmsSetup();
  const ex = x.trExamples("Tháng có doanh thu cao nhất: {0} với {1}.");
  assert.equal(x.trParse("Umsatzstärkster Monat: [1] mit [2].", ex), "Umsatzstärkster Monat: {0} mit {1}.");
  assert.equal(x.trParse("[2] im [1]", ex), "{1} im {0}");
  // Mỗi ký hiệu thay đúng chỗ của nó, kể cả khi bản dịch có số thường.
  const ex2 = x.trExamples("Hiển thị {0} – {1} trên tổng số {2} bản ghi");
  assert.equal(x.trParse("[1] – [2] von [3] Einträgen (1 Seite)", ex2), "{0} – {1} von {2} Einträgen (1 Seite)");
});

test("trang Bản dịch: báo thiếu số liệu, và tô màu số liệu trong chữ gốc", () => {
  const x = cmsSetup();
  const ex = ["T9/2026", "$1,234.00"];
  assert.deepEqual([...x.trMissing("Monat {0}", ex)], ["$1,234.00"]);
  assert.deepEqual([...x.trMissing("{1} / {0}", ex)], []);
  const html = x.trSourceHtml("Tháng có doanh thu cao nhất: {0} với {1}.", ex);
  assert.ok(html.includes('<mark class="tr-ph"'));
  assert.ok(html.includes("T9/2026") && !html.includes("{0}"));
});

test("tên nhóm người dùng tự thêm thì không dịch, không gom; tên có sẵn của hệ thống vẫn dịch", async () => {
  const calls = [];
  const api = async (url, opts) => { calls.push(opts?.body); return []; };
  const storage = { getItem: (k) => (k === "fm_lang" ? "de" : null), setItem() {}, removeItem() {} };
  const x = loadScripts(["js/format.js", "js/store.js", "js/i18n.js"], { api, localStorage: storage })(
    ["i18n", "i18nLookup", "i18nSetDictionary", "i18nFlush", "INCOME_CATEGORIES", "EXPENSE_CATEGORIES", "emitStore"],
  );
  x.i18nSetDictionary([{ source: "Trang sức", de: "Schmuck" }, { source: "Vận chuyển", de: "Versand" }]);
  x.INCOME_CATEGORIES.push({ id: 30, name: "Trang sức" });
  x.EXPENSE_CATEGORIES.push({ id: 31, name: "Vận chuyển" });
  x.emitStore(); // như sau reload(): dựng lại danh sách tên
  assert.equal(x.i18nLookup("Trang sức"), null);
  assert.equal(x.i18nLookup("Vận chuyển"), "Versand");
  x.i18nLookup("Móc khóa"); // chưa phải tên nhóm: vẫn gom
  x.INCOME_CATEGORIES.push({ id: 32, name: "Thiệp" });
  x.emitStore();
  x.i18nLookup("Thiệp");
  await x.i18nFlush();
  assert.deepEqual([...calls[0].sources], ["Móc khóa"]);
});
