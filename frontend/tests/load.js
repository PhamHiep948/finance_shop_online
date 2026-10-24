// Nạp các file JS của trang (script thường, không phải module) vào một môi trường riêng để test bằng `node --test`.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadScripts(files, extraGlobals = {}) {
  const ctx = vm.createContext({
    console, Intl, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    icon: () => "",
    ...extraGlobals,
  });
  const source = files.map((f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8")).join("\n;\n");
  // `const` / `let` ở cấp cao nhất không thành thuộc tính của ctx, nên chạy kèm một biểu thức trả ra các tên cần dùng.
  return (names) => vm.runInContext(`${source}\n;({ ${names.join(", ")} })`, ctx);
}

module.exports = { loadScripts };
