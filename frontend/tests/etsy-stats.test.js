const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("./load");

const toasts = [];
function setup() {
  toasts.length = 0;
  const { EtsyStatsPage, localISO } = loadScripts(["js/format.js", "js/api.js", "js/pages/etsy-stats.js"], {
    window: {}, location: { protocol: "http:", port: "5500", origin: "http://127.0.0.1:5500" },
    toast: (msg) => toasts.push(msg),
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
