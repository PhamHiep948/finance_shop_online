const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("./load");

const { isEtsyAds, isEtsyLocked } = loadScripts(["js/format.js"])(["isEtsyAds", "isEtsyLocked"]);

test("phí quảng cáo Etsy (mã ADS-yyyy-MM) sửa được", () => {
  const ads = { source: "ETSY", orderCode: "ADS-2026-09" };
  assert.equal(isEtsyAds(ads), true);
  assert.equal(isEtsyLocked(ads), false);
});

test("đơn Etsy vẫn bị khóa sửa", () => {
  const order = { source: "ETSY", orderCode: "4136894034" };
  assert.equal(isEtsyAds(order), false);
  assert.equal(isEtsyLocked(order), true);
  assert.equal(isEtsyLocked({ source: "ETSY", orderCode: null }), true);
});

test("khoản nhập tay có mã ADS- không bị coi là của Etsy", () => {
  const manual = { source: "MANUAL", orderCode: "ADS-2026-09" };
  assert.equal(isEtsyAds(manual), false);
  assert.equal(isEtsyLocked(manual), false);
  assert.equal(isEtsyLocked(undefined), false);
});
