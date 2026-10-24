const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("./load");

const NAMES = ["loadFx", "eurToUsdOn", "hasDailyRate", "hasMonthlyRate", "toDisplay", "fromDisplay", "FxPage"];

/** Nạp script với API giả trả tỷ giá tháng / ngày, rồi gọi loadFx() như khi mở web. */
async function setup({ monthly = [], daily = [] } = {}) {
  const api = async (url) => {
    if (url === "/fx") return { eurToUsd: 1.1, usdToEur: 0.9, date: "2026-10-23", auto: true };
    if (url === "/fx/monthly") return monthly;
    if (url === "/fx/daily") return daily;
    throw new Error(`không có API giả cho ${url}`);
  };
  const x = loadScripts(["js/format.js", "js/store.js", "js/pages/fx.js"], { api })(NAMES);
  await x.loadFx();
  return x;
}

test("ngày có tỷ giá riêng dùng tỷ giá ngày, các ngày khác dùng tỷ giá tháng", async () => {
  const { eurToUsdOn, hasDailyRate } = await setup({
    monthly: [{ month: "2026-08", eurToUsd: 1.16 }],
    daily: [{ date: "2026-08-06", eurToUsd: 1.2 }],
  });
  assert.equal(eurToUsdOn("2026-08-06"), 1.2);
  assert.equal(eurToUsdOn("2026-08-07"), 1.16);
  assert.equal(hasDailyRate("2026-08-06"), true);
  assert.equal(hasDailyRate("2026-08-07"), false);
});

test("tháng chưa nhập gì thì 1 EUR = 1 USD", async () => {
  const { eurToUsdOn, hasMonthlyRate } = await setup({ daily: [{ date: "2026-08-06", eurToUsd: 1.2 }] });
  assert.equal(eurToUsdOn("2026-09-01"), 1);
  assert.equal(hasMonthlyRate("2026-09-01"), false);
});

test("truyền khóa tháng (yyyy-MM) thì luôn lấy tỷ giá tháng", async () => {
  const { eurToUsdOn } = await setup({
    monthly: [{ month: "2026-08", eurToUsd: 1.16 }],
    daily: [{ date: "2026-08-06", eurToUsd: 1.2 }],
  });
  assert.equal(eurToUsdOn("2026-08"), 1.16);
});

test("hiện tiền theo EUR và nhập tiền EUR quy đổi theo tỷ giá của đúng ngày", async () => {
  const { toDisplay, fromDisplay } = await setup({
    monthly: [{ month: "2026-08", eurToUsd: 1.25 }],
    daily: [{ date: "2026-08-06", eurToUsd: 1.6 }],
  });
  assert.equal(toDisplay(16, "EUR", "2026-08-06"), 10);
  assert.equal(toDisplay(10, "EUR", "2026-08-07"), 8);
  assert.equal(toDisplay(16, "USD", "2026-08-06"), 16);
  assert.equal(fromDisplay(10, "EUR", "2026-08-06"), 16);
});

test("API tỷ giá ngày lỗi thì vẫn dùng được tỷ giá tháng", async () => {
  const api = async (url) => {
    if (url === "/fx/monthly") return [{ month: "2026-08", eurToUsd: 1.16 }];
    if (url === "/fx/daily") throw new Error("mất mạng");
    return null;
  };
  const { loadFx, eurToUsdOn } = loadScripts(["js/format.js", "js/store.js"], { api })(["loadFx", "eurToUsdOn"]);
  await loadFx();
  assert.equal(eurToUsdOn("2026-08-06"), 1.16);
});

test("trang Tỷ giá đọc tháng gõ tay và cộng / trừ tháng qua năm", async () => {
  const { FxPage } = await setup();
  assert.equal(FxPage.parseMonth("6/2026"), "2026-06");
  assert.equal(FxPage.parseMonth("06-2026"), "2026-06");
  assert.equal(FxPage.parseMonth("2026/6"), "2026-06");
  assert.equal(FxPage.parseMonth("13/2026"), null);
  assert.equal(FxPage.parseMonth("abc"), null);
  assert.equal(FxPage.addMonths("2026-12", 1), "2027-01");
  assert.equal(FxPage.addMonths("2026-01", -1), "2025-12");
  assert.equal(FxPage.mmyyyy("2026-06"), "06/2026");
});
