const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("./load");

const toasts = [];
const calls = [];
// Tháng 9 bán 2 đơn, các khoảng khác 5 đơn: đủ để thấy ô tổng đổi theo ngày.
const salesFor = (from) => (from >= "2026-09-01"
  ? { orders: 2, items: 3, revenue: 40, listings: [{ listingId: 1, sold: 3, orders: 2, revenue: 27 }] }
  : { orders: 5, items: 9, revenue: 100, listings: [{ listingId: 1, sold: 9, orders: 5, revenue: 81 }] });
function setup() {
  toasts.length = 0;
  calls.length = 0;
  const { EtsyStatsPage, localISO } = loadScripts(["js/format.js", "js/api.js", "js/pages/etsy-stats.js"], {
    window: {}, location: { protocol: "http:", port: "5500", origin: "http://127.0.0.1:5500" },
    toast: (msg) => toasts.push(msg),
    current: { page: null },
    store: { ccy: "USD" },
    // API giả: ghi lại các lần gọi; số bán / quảng cáo theo đúng khoảng ngày được hỏi.
    etsyStatus: async () => { calls.push("status"); return { ready: true }; },
    etsyListings: async () => { calls.push("listings"); return [{ listingId: 1, title: "Lilie", views: 100, favorites: 10, price: 9, currency: "EUR" }]; },
    etsySales: async (from, to) => { calls.push(`sales ${from} ${to}`); return salesFor(from, to); },
    // App ghi lượt xem từ 01/09/2026: tháng 9 sản phẩm 1 có 30 lượt xem, khoảng dài hơn thì 60.
    etsyListingViews: async (from, to) => {
      calls.push(`views ${from} ${to}`);
      const n = from >= "2026-09-01" ? 30 : 60;
      return { from, to, trackedSince: "2026-09-01", complete: from > "2026-09-01", views: n, favorites: 3, listings: [{ listingId: 1, views: n, favorites: 3 }] };
    },
    etsyFees: async (from, to) => { calls.push(`fees ${from} ${to}`); return { rangeAdsUsd: from >= "2026-09-01" ? 5 : 12, months: [] }; },
    etsyRefresh: async () => { calls.push("refresh"); },
    etsySyncAds: async (from, to) => { calls.push(`sync ${from} ${to}`); return { created: 1, updated: 0 }; },
    reload: () => { calls.push("reload"); },
  })(["EtsyStatsPage", "localISO"]);
  EtsyStatsPage.init();
  return { page: EtsyStatsPage, localISO };
}

test("khoảng 3 tháng bắt đầu từ ngày 1 của tháng cách đây 2 tháng, kết thúc hôm nay", () => {
  const { page, localISO } = setup();
  const now = new Date();
  const r = page.range();
  assert.equal(r.to, localISO(now));
  assert.equal(r.from, localISO(new Date(now.getFullYear(), now.getMonth() - 2, 1)));
  assert.equal(r.fromMonth, r.from.slice(0, 7));
  assert.equal(r.toMonth, r.to.slice(0, 7));
});

test("khoảng 12 tháng bao đủ 12 tháng tính cả tháng này", () => {
  const { page } = setup();
  page.s.preset = 12;
  const r = page.range();
  const [fy, fm] = r.fromMonth.split("-").map(Number);
  const [ty, tm] = r.toMonth.split("-").map(Number);
  assert.equal((ty - fy) * 12 + (tm - fm) + 1, 12);
});

test("giá hiện theo đúng loại tiền Etsy trả về", () => {
  const { page } = setup();
  assert.equal(page.price(24.9, "EUR").replace(/\s/g, " "), "24,90 €");
  assert.equal(page.price(24.9, "USD"), "$24.90");
  // Mã tiền lạ không làm vỡ trang.
  assert.match(page.price(5, "XX"), /5/);
});

test("lỗi thiếu quyền kèm nút kết nối lại, lỗi khác thì không", () => {
  const { page } = setup();
  assert.match(page.errorHtml("Lỗi", 'Hãy bấm "Kết nối Etsy" lại một lần'), /Kết nối Etsy lại/);
  assert.doesNotMatch(page.errorHtml("Lỗi", "Etsy API lỗi (500)"), /etsy\/connect/);
});

test("chọn Tháng này thì từ ngày 1 tháng này đến hôm nay", () => {
  const { page, localISO } = setup();
  const now = new Date();
  page.s.preset = "month";
  const r = page.range();
  assert.equal(r.from, localISO(new Date(now.getFullYear(), now.getMonth(), 1)));
  assert.equal(r.to, localISO(now));
});

test("tự chọn từ ngày → đến ngày; chọn ngược thì tự đảo lại", () => {
  const { page } = setup();
  let loads = 0;
  page.load = () => { loads++; };
  page.s.preset = "custom";
  page.s.from = "2026-08-01";
  page.s.to = "2026-08-31";
  page.setCustom("to", "2026-07-15");
  assert.deepEqual([page.s.from, page.s.to], ["2026-07-15", "2026-08-01"]);
  assert.equal(page.range().fromMonth, "2026-07");
  assert.equal(page.rangeLabel(), "15/07/2026 – 01/08/2026");
  assert.equal(loads, 1);
});

test("khoảng quá 1 năm bị từ chối, giữ khoảng cũ", () => {
  const { page } = setup();
  page.load = () => { throw new Error("không được tải"); };
  page.render = () => {};
  page.s.preset = "custom";
  page.s.from = "2026-01-01";
  page.s.to = "2026-02-01";
  page.setCustom("from", "2024-01-01");
  assert.deepEqual([page.s.from, page.s.to], ["2026-01-01", "2026-02-01"]);
  assert.match(toasts[0], /tối đa 1 năm/);
});

// ---- Sắp xếp và phân trang danh sách sản phẩm

const L = (id, title, views, favorites, sold, price) => ({ listingId: id, title, views, favorites, sold, price, currency: "EUR" });
const SAMPLE = [
  L(1, "Lilie", 100, 10, 2, 24.9),
  L(2, "Tulpe", 300, 15, 9, 19.5),
  L(3, "Hase", 200, 40, 1, 32),
  L(4, "Anleitung", 0, 0, 0, 4.5),
];

function withListings(listings) {
  const { page } = setup();
  page.s.listings = listings;
  return page;
}
const ids = (page) => page.sortedListings().map((l) => l.listingId);

test("mặc định sắp theo lượt xem, cao → thấp", () => {
  assert.deepEqual(ids(withListings(SAMPLE)), [2, 3, 1, 4]);
});

test("đổi tiêu chí thì về chiều mặc định của tiêu chí đó", () => {
  const page = withListings(SAMPLE);
  page.setSort("price", false);
  assert.deepEqual([page.s.sort, page.s.sortDir], ["price", "desc"]);
  assert.deepEqual(ids(page), [3, 1, 2, 4]);
  page.setSort("title", false);
  assert.equal(page.s.sortDir, "asc");
  assert.deepEqual(ids(page), [4, 3, 1, 2]);
});

test("bấm lại tiêu đề cột đang sắp thì đảo chiều", () => {
  const page = withListings(SAMPLE);
  page.setSort("sold", true);
  assert.deepEqual(ids(page), [2, 1, 3, 4]);
  page.setSort("sold", true);
  assert.equal(page.s.sortDir, "asc");
  assert.deepEqual(ids(page), [4, 3, 1, 2]);
});

test("tỷ lệ thích = yêu thích ÷ lượt xem; chưa có lượt xem thì xếp cuối", () => {
  const page = withListings(SAMPLE);
  page.setSort("likeRate", false);
  assert.deepEqual(ids(page), [3, 1, 2, 4]); // 20%, 10%, 5%, —
});

test("tìm kiếm lọc trước rồi mới sắp xếp", () => {
  const page = withListings(SAMPLE);
  page.s.search = "e";
  assert.deepEqual(ids(page), [2, 3, 1, 4].filter((id) => SAMPLE.find((l) => l.listingId === id).title.toLowerCase().includes("e")));
});

test("nhiều sản phẩm thì chia trang 20 dòng, số thứ tự đếm tiếp qua trang", () => {
  const many = Array.from({ length: 45 }, (_, i) => L(i + 1, `SP ${i + 1}`, 1000 - i, 0, 0, 1));
  const page = withListings(many);
  page.s.page = 3;
  const { pages, start, rows } = page.pageOf(page.sortedListings());
  assert.equal(pages, 3);
  assert.equal(start, 40);
  assert.deepEqual(rows.map((l) => l.listingId), [41, 42, 43, 44, 45]);
  assert.match(page.pagerHtml(45, 3), /Hiển thị 41 – 45 trên tổng số 45 sản phẩm/);
});

test("đổi cách sắp xếp hoặc danh sách ngắn lại thì không kẹt ở trang không còn", () => {
  const many = Array.from({ length: 45 }, (_, i) => L(i + 1, `SP ${i + 1}`, 1000 - i, 0, 0, 1));
  const page = withListings(many);
  page.s.page = 3;
  page.setSort("price", false);
  assert.equal(page.s.page, 1);
  page.s.page = 3;
  page.s.search = "SP 1"; // 11 sản phẩm → 1 trang
  page.pageOf(page.sortedListings());
  assert.equal(page.s.page, 1);
});

test("một trang thì không có nút chuyển trang", () => {
  const page = withListings(SAMPLE);
  const html = page.pagerHtml(4, 1);
  assert.match(html, /Hiển thị 1 – 4 trên tổng số 4 sản phẩm/);
  assert.doesNotMatch(html, /pager-pages/);
});

// ---- Ô tổng theo khoảng ngày và tải dữ liệu

test("đổi khoảng ngày thì ô Đơn hàng, Doanh thu, Tiền quảng cáo đổi theo", async () => {
  const { page } = setup();
  Object.assign(page.s, { preset: "custom", from: "2026-08-01", to: "2026-10-24" });
  await page.load(true);
  let html = page.kpisHtml();
  assert.match(html, /<div class="value">5<\/div>/);
  assert.match(html, /\$100\.00/);
  assert.match(html, /\$12\.00/);
  assert.match(html, /bằng 12\.0% doanh thu/);

  Object.assign(page.s, { from: "2026-09-01", to: "2026-09-30" });
  await page.load(false);
  html = page.kpisHtml();
  assert.match(html, /<div class="value">2<\/div>/);
  assert.match(html, /\$40\.00/);
  assert.match(html, /\$5\.00/);
  assert.equal(page.rows()[0].sold, 3);
});

test("đổi khoảng ngày không tải lại danh sách sản phẩm; Làm mới thì tải lại tất cả", async () => {
  const { page } = setup();
  Object.assign(page.s, { preset: "custom", from: "2026-08-01", to: "2026-10-24" });
  await page.load(true);
  calls.length = 0;
  await page.load(false);
  assert.deepEqual(calls.filter((c) => c === "listings"), []);
  assert.ok(calls.includes("sales 2026-08-01 2026-10-24") && calls.includes("fees 2026-08-01 2026-10-24"));
  calls.length = 0;
  await page.refresh();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls[0], "refresh");
  assert.ok(calls.includes("listings"));
});

test("mọi phần được hỏi cùng lúc, không chờ nhau", async () => {
  const { page } = setup();
  Object.assign(page.s, { preset: "custom", from: "2026-08-01", to: "2026-10-24" });
  const done = page.load(true);
  // Chưa phần nào trả lời mà cả 4 đã được hỏi.
  assert.deepEqual(calls.map((c) => c.split(" ")[0]).sort(), ["fees", "listings", "sales", "status", "views"]);
  await done;
});

test("lượt xem theo khoảng ngày thay cho tổng từ lúc đăng; tổng vẫn giữ để xem khi rê chuột", async () => {
  const { page } = setup();
  Object.assign(page.s, { preset: "custom", from: "2026-09-02", to: "2026-09-30" });
  await page.load(true);
  const row = page.rows()[0];
  assert.deepEqual([row.views, row.favorites, row.totalViews, row.totalFavorites, row.sinceViews], [30, 3, 100, 10, null]);
  assert.match(page.kpisHtml(), /<div class="value">30 · 3<\/div>/);
  assert.match(page.listingsHtml(), /Tổng từ lúc đăng: 100 lượt xem, 10 yêu thích/);
});

test("khoảng bắt đầu trước ngày app ghi đầu tiên: hiện tổng từ lúc đăng, kèm phần tăng từ ngày bắt đầu ghi", async () => {
  const { page } = setup();
  // App ghi từ 01/09 nên 3 tháng từ 01/08 chỉ có phần tăng từ 01/09 (60), nhỏ hơn số thật: không hiện như lượt xem cả khoảng.
  Object.assign(page.s, { preset: "custom", from: "2026-08-01", to: "2026-10-24" });
  await page.load(true);
  assert.equal(page.periodViews(), false);
  const row = page.rows()[0];
  assert.deepEqual([row.views, row.favorites, row.sinceViews], [100, 10, 60]);
  assert.match(page.kpisHtml(), /<div class="value">100 · 10<\/div>/);
  assert.match(page.viewsHint(), /tổng từ lúc đăng · từ 01\/09\/2026/);
  assert.match(page.listingsHtml(), /\+60 từ 01\/09/);
});

test("chưa có ngày nào để trừ (mới bắt đầu ghi hôm nay) thì hiện tổng từ lúc đăng", () => {
  const { page, localISO } = setup();
  const today = localISO(new Date());
  page.s.listings = [{ listingId: 1, title: "Lilie", views: 100, favorites: 10 }];
  page.s.views = { trackedSince: today, complete: false, listings: [{ listingId: 1, views: 0, favorites: 0 }] };
  assert.equal(page.periodViews(), false);
  assert.equal(page.rows()[0].views, 100);
  assert.match(page.viewsHint(), /từ hôm nay/);
});

test("kết quả của khoảng ngày cũ về muộn thì bị bỏ", async () => {
  const { page } = setup();
  Object.assign(page.s, { preset: "custom", from: "2026-08-01", to: "2026-10-24" });
  const first = page.load(false);
  Object.assign(page.s, { from: "2026-09-01", to: "2026-09-30" });
  const second = page.load(false);
  await Promise.all([first, second]);
  assert.equal(page.s.sales.orders, 2);
});

// ---- Tiền quảng cáo tự vào Khoản chi

const M = (o) => ({ month: "2026-10", ads: 10, adsUsd: 11.6, currency: "EUR", complete: false, imported: false, deleted: false, edited: false, expenseId: null, expenseAmount: null, ...o });

test("tháng có quảng cáo mà chưa ghi, hoặc số đã đổi, thì cần cập nhật; khoản sửa tay / đã xóa thì không", () => {
  const { page } = setup();
  assert.equal(page.adsPending({ months: [M({})] }), true);
  assert.equal(page.adsPending({ months: [M({ imported: true, expenseId: 5, expenseAmount: 9 })] }), true);
  assert.equal(page.adsPending({ months: [M({ imported: true, expenseId: 5, expenseAmount: 11.6 })] }), false);
  assert.equal(page.adsPending({ months: [M({ imported: true, edited: true, expenseId: 5, expenseAmount: 7 })] }), false);
  assert.equal(page.adsPending({ months: [M({ imported: true, deleted: true, expenseId: 5, expenseAmount: 9 })] }), false);
  assert.equal(page.adsPending({ months: [M({ ads: 0, adsUsd: 0 })] }), false);
});

test("mở trang mà có tháng chờ ghi thì tự cập nhật Khoản chi ngay", async () => {
  const { page } = setup();
  Object.assign(page.s, { preset: "custom", from: "2026-08-01", to: "2026-10-24" });
  const orig = page.adsPending;
  let asked = 0;
  page.adsPending = () => asked++ === 0; // lần đầu còn tháng chờ ghi, sau khi ghi thì hết
  await page.load(true);
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(calls.includes("sync 2026-08-01 2026-10-24"));
  assert.ok(calls.includes("reload"));
  assert.equal(page.s.syncing, false);
  page.adsPending = orig;
});

test("trạng thái mỗi tháng bấm được, mở đúng khoản chi", () => {
  const { page } = setup();
  page.s.fees = { months: [
    M({ imported: true, expenseId: 41, expenseAmount: 11.6 }),
    M({ month: "2026-09", complete: true, imported: true, edited: true, expenseId: 42, expenseAmount: 7 }),
    M({ month: "2026-08", complete: true, imported: true, deleted: true, expenseId: 43, expenseAmount: 4 }),
  ] };
  const html = page.feesHtml();
  assert.match(html, /href="#\/expenses\?view=41"/);
  assert.match(html, /href="#\/expenses\?view=42"[^>]*>.*Đã sửa tay/);
  assert.doesNotMatch(html, /view=43/);
  assert.match(html, /Đã xóa ở Khoản chi/);
});
