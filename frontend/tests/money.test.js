const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("./load");

const f = loadScripts(["js/format.js"])(["subtotalOf", "costOf", "profitOf", "costKindLabel", "round2"]);

test("Thành tiền = giá bán − giảm giá", () => {
  assert.equal(f.subtotalOf({ itemTotal: 50, discountAmount: 10 }), 40);
  assert.equal(f.subtotalOf({ itemTotal: 19.99, discountAmount: 0 }), 19.99);
});

test("Thành tiền: chưa có giá bán thì dùng số đã lưu, không có gì thì null", () => {
  assert.equal(f.subtotalOf({ subtotal: 33 }), 33);
  assert.equal(f.subtotalOf({}), null);
});

test("Thành tiền tự tính giá bán từ đơn giá × số lượng", () => {
  assert.equal(f.subtotalOf({ unitPrice: 5.49, productQty: 3, discountAmount: 1 }), 15.47);
});

test("tiền xưởng: trước thuế + thuế luôn bằng đúng số đã trả", () => {
  const cost = f.costOf({ id: 7 }, [
    { linkedIncomeId: 7, amount: 16.81, taxPercent: 19, amountAfterTax: 20 },
    { linkedIncomeId: 8, amount: 100, taxPercent: 0, amountAfterTax: 100 },
  ]);
  assert.equal(cost.items.length, 1);
  assert.equal(cost.total, 20);
  assert.equal(cost.before, 16.81);
  assert.equal(cost.tax, 3.19);
  assert.equal(f.round2(cost.before + cost.tax), cost.total);
});

test("lợi nhuận = trước thuế của đơn − tiền xưởng / ship trước thuế (không trừ phần thuế)", () => {
  const income = { id: 7, amount: 40, saleRegion: "OUTSIDE_EU" };
  const expenses = [{ linkedIncomeId: 7, amount: 16.81, taxPercent: 19, amountAfterTax: 20 }];
  assert.equal(f.profitOf(income, expenses), 23.19);
  assert.equal(f.profitOf({ id: 9, amount: 40 }, expenses), 40);
});

test("không cộng dồn sai số dấu phẩy động", () => {
  const items = Array.from({ length: 10 }, () => ({ linkedIncomeId: 1, amount: 0.1, amountAfterTax: 0.1 }));
  assert.equal(f.costOf({ id: 1 }, items).before, 1);
  assert.equal(f.profitOf({ id: 1, amount: 1.3 }, items), 0.3);
});

test("trong EU là tiền ship, ngoài EU là tiền xưởng", () => {
  assert.equal(f.costKindLabel({ saleRegion: "IN_EU" }), "Tiền ship");
  assert.equal(f.costKindLabel({ saleRegion: "OUTSIDE_EU" }), "Tiền xưởng");
});
