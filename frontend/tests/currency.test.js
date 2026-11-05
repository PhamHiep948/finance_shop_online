const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("./load");

// Tháng 10/2026: 1 EUR = 1.1634 USD. Backend trả số tiền đúng như đã nhập, kèm loại tiền.
function setup(ccy = "EUR") {
  const x = loadScripts(["js/format.js", "js/store.js"], { api: async () => [] })(
    ["mapRow", "keepUnchangedMoney", "incomePayload", "expensePayload", "money", "store", "setRates"].map((n) =>
      (n === "setRates" ? "setRates: (m) => { FX_MONTHLY = m; }" : n)));
  x.setRates({ "2026-10": 1.1634 });
  x.store.ccy = ccy;
  return x;
}
const apiRow = (o) => ({
  id: 1, date: "2026-10-12", description: "Lily", amount: 100, taxPercent: 19, amountAfterTax: 119, currencyCode: "EUR",
  unitPrice: null, itemTotal: null, discountAmount: 0, subtotal: null, shippingAmount: 0, taxAmount: 0, ...o,
});
const form = (o) => ({ get: (k) => (k in o ? o[k] : null) });

test("khoản nhập bằng EUR: xem bằng EUR ra đúng số đã nhập, xem bằng USD quy theo tỷ giá ngày của khoản", () => {
  const { mapRow, money, store } = setup();
  const r = mapRow("incomeDate")(apiRow({ amount: 99.99, amountAfterTax: 118.99 }));
  assert.equal(r.currency, "EUR");
  assert.equal(r.orig.amount, 99.99);
  assert.equal(money(r.amount, "EUR", r.incomeDate).replace(/\s/g, " "), "99,99 €");
  assert.equal(money(r.amountAfterTax, "EUR", r.incomeDate).replace(/\s/g, " "), "118,99 €");
  assert.equal(money(r.amount, "USD", r.incomeDate), "$116.33");
  store.ccy = "USD";
});

test("gõ EUR thì lưu EUR, gõ USD thì lưu USD (không quy đổi trước khi lưu)", () => {
  const { incomePayload, expensePayload } = setup();
  const inc = incomePayload(form({ incomeDate: "2026-10-12", amount: "50", taxPercent: "19", discountAmount: "" }), "EUR");
  assert.deepEqual([inc.amount, inc.amountAfterTax, inc.currency], [50, 59.5, "EUR"]);
  const exp = expensePayload(form({ expenseDate: "2026-10-12", amount: "20.5", taxPercent: "0", categoryId: "3" }), "USD");
  assert.deepEqual([exp.amount, exp.amountAfterTax, exp.currency], [20.5, 20.5, "USD"]);
});

test("loại tiền lưu do người dùng chọn ở ô Lưu bằng, không theo loại tiền đang xem", () => {
  const { incomePayload } = setup("USD");
  const inc = incomePayload(form({ incomeDate: "2026-10-12", amount: "50", taxPercent: "0", currency: "EUR" }), "USD");
  assert.deepEqual([inc.amount, inc.currency], [50, "EUR"]);
});

test("đổi loại tiền lưu: giữ nguyên các số đã gõ, chỉ đổi loại tiền", () => {
  const { mapRow, keepUnchangedMoney } = setup("EUR");
  const prev = mapRow("incomeDate")(apiRow({ currencyCode: "USD", amount: 16.81, amountAfterTax: 20.01 }));
  const next = keepUnchangedMoney(prev, { ...prev.orig, taxPercent: 19, currency: "EUR" });
  assert.deepEqual([next.amount, next.amountAfterTax, next.currency], [16.81, 20.01, "EUR"]);
});

test("cùng loại tiền, số trước thuế và % thuế không đổi: giữ số sau thuế đã lưu", () => {
  const { mapRow, keepUnchangedMoney } = setup("EUR");
  const prev = mapRow("incomeDate")(apiRow({ amount: 16.81, amountAfterTax: 20.01 }));
  const next = keepUnchangedMoney(prev, { amount: 16.81, taxPercent: 19, amountAfterTax: 20.0, currency: "EUR" });
  assert.equal(next.amountAfterTax, 20.01);
  assert.equal(next.currency, "EUR");
});
