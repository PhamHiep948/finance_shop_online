// Trang Tổng quan (#/dashboard).
const DashboardPage = {
  state: null,
  charts: [],

  init() {
    this.state = { tab: "overview", range: "7days" };
  },

  destroy() {
    this.charts.forEach((c) => c.destroy());
    this.charts = [];
  },

  render(root) {
    this.destroy();
    const { incomes, expenses, ccy } = store;
    const { tab, range } = this.state;
    const today = new Date();
    const net = (x) => Number(x.amountAfterTax ?? x.amount) || 0;

    const getFrom = (r) => {
      const d = new Date(today);
      if (r === "today") return localISO(d);
      if (r === "7days") { d.setDate(d.getDate() - 6); return localISO(d); }
      return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
    };
    const dashFrom = getFrom(range);
    const dashTo = localISO(today);

    const inc = incomes.filter((x) => inRange(x.incomeDate, dashFrom, dashTo));
    const exp = expenses.filter((x) => inRange(x.expenseDate, dashFrom, dashTo));
    const totalIncome = inc.reduce((s, r) => s + net(r), 0);
    const totalExpense = exp.reduce((s, r) => s + net(r), 0);
    const netResult = totalIncome - totalExpense;
    const tin = inc.reduce((a, x) => a + Number(x.amount), 0);

    const channelData = groupByCat(inc, INCOME_CATEGORIES).map((c, i) => ({
      ...c,
      color: ["#2563EB", "#059669", "#F1641E", "#7C3AED"][i % 4],
    }));

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      const key = localISO(d);
      const label = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
      const income = incomes.filter((x) => x.incomeDate === key).reduce((s, x) => s + net(x), 0);
      const expense = expenses.filter((x) => x.expenseDate === key).reduce((s, x) => s + net(x), 0);
      return { label, income, expense };
    });

    const topSKU = [...inc]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((r, i) => ({ rank: i + 1, name: r.description, code: r.orderCode || "—", qty: r.productQty, amount: r.amount }));

    const recentTransactions = [
      ...incomes.map((x) => ({
        type: "income",
        date: x.incomeDate,
        desc: x.description,
        cat: catName(INCOME_CATEGORIES, x.categoryId),
        code: x.orderCode || x.referenceCode || `IN-${String(x.id).padStart(3, "0")}`,
        amount: x.amount,
        targetUrl: "/incomes",
      })),
      ...expenses.map((x) => ({
        type: "expense",
        date: x.expenseDate,
        desc: x.description,
        cat: catName(EXPENSE_CATEGORIES, x.categoryId),
        code: x.recipient || `EXP-${String(x.id).padStart(3, "0")}`,
        amount: x.amount,
        targetUrl: "/expenses",
      })),
    ]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);

    const TABS = [["overview", "Tổng quan"], ["by-channel", "Theo kênh"], ["top-sku", "Top sản phẩm"]];
    const rangeLabel = range === "today" ? "hôm nay" : range === "7days" ? "7 ngày qua" : "tháng này";

    const kpiCard = ({ label, value, sub, accent, negative }) => `
      <article class="ds-kpi" style="--accent: ${accent}">
        <p class="ds-kpi-label">${esc(label)}</p>
        <p class="ds-kpi-value${negative ? " ds-kpi-neg" : ""}">${esc(value)}</p>
        <p class="ds-kpi-sub">${esc(sub)}</p>
      </article>`;

    const channelBar = (c) => `
      <div class="ds-channel-bar" style="width: ${c.pct}%; background: ${c.color}"></div>`;

    const overviewHtml = `
      <div class="ds-kpi-row">
        ${kpiCard({ label: "Doanh thu (sau thuế)", value: money(totalIncome, ccy), sub: `${inc.length} khoản thu · ${rangeLabel}`, accent: "#2563EB" })}
        ${kpiCard({ label: "Chi phí (sau thuế)", value: money(totalExpense, ccy), sub: `${exp.length} khoản chi · ${rangeLabel}`, accent: "#DC2626", negative: true })}
        ${kpiCard({ label: "Lợi nhuận ròng", value: money(netResult, ccy), sub: "Doanh thu trừ chi phí", accent: "#059669", negative: netResult < 0 })}
        ${kpiCard({ label: "Số giao dịch", value: String(inc.length + exp.length), sub: "Thu và chi trong kỳ", accent: "#7C3AED" })}
      </div>

      <div class="ds-grid">
        <div class="ds-main-col">
          <article class="ds-card">
            <div class="ds-card-head">
              <div>
                <h2 class="ds-card-title">Xu hướng 7 ngày</h2>
                <p class="ds-card-sub">Doanh thu và chi phí (sau thuế) theo ngày</p>
              </div>
              <div class="ds-legend">
                <span><i class="ds-dot" style="background: #2563EB"></i>Doanh thu</span>
                <span><i class="ds-dot" style="background: #FCA5A5"></i>Chi phí</span>
              </div>
            </div>
            <div class="ds-chart-area"><canvas id="ds-bar"></canvas></div>
          </article>

          <article class="ds-card ds-recent-card">
            <div class="ds-card-head">
              <div>
                <h2 class="ds-card-title">Giao dịch gần đây</h2>
                <p class="ds-card-sub">Khoản thu chi mới nhất được ghi nhận</p>
              </div>
              <button type="button" class="ds-card-link-btn" data-action="go" data-to="/incomes">
                <span>Xem tất cả</span>
                ${icon("chevron-right", 13)}
              </button>
            </div>
            <div class="ds-recent-list">
              ${recentTransactions.map((tx) => `
                <div class="ds-tx-row" data-action="go" data-to="${tx.targetUrl}" role="button" tabindex="0" title="Bấm để xem chi tiết">
                  <div class="ds-tx-icon-wrap ${tx.type}">
                    ${icon(tx.type === "income" ? "trending-up" : "trending-down", 14)}
                  </div>
                  <div class="ds-tx-main">
                    <span class="ds-tx-desc" translate="no">${esc(tx.desc)}</span>
                    <div class="ds-tx-meta">
                      <span class="ds-tx-code" translate="no">${esc(tx.code)}</span>
                      <span class="ds-tx-dot">·</span>
                      <span class="ds-tx-cat">${esc(tx.cat)}</span>
                    </div>
                  </div>
                  <div class="ds-tx-date">${esc((tx.date || "").split("-").reverse().slice(0, 2).join("/"))}</div>
                  <div class="ds-tx-amount ${tx.type}">
                    ${tx.type === "income" ? "+" : "-"}${esc(money(tx.amount, ccy))}
                  </div>
                </div>`).join("")}
            </div>
          </article>
        </div>

        <div class="ds-side-col">
          <article class="ds-card ds-donut-card">
            <div class="ds-card-head">
              <div>
                <h2 class="ds-card-title">Theo kênh bán</h2>
                <p class="ds-card-sub">Tỷ trọng doanh thu</p>
              </div>
            </div>
            <div class="ds-donut-wrap">
              <div class="ds-donut-canvas">
                <canvas id="ds-donut"></canvas>
                <div class="ds-donut-inner">
                  <span class="ds-donut-val">${esc(money(tin, ccy))}</span>
                  <span class="ds-donut-tag">tổng</span>
                </div>
              </div>
              <ul class="ds-channel-list">
                ${channelData.map((c) => `
                  <li class="ds-channel-item">
                    <span class="ds-channel-dot" style="background: ${c.color}"></span>
                    <span class="ds-channel-name">${esc(c.name)}</span>
                    <div class="ds-channel-bar-wrap">${channelBar(c)}</div>
                    <span class="ds-channel-pct">${c.pct}%</span>
                  </li>`).join("")}
              </ul>
            </div>
          </article>

          <article class="ds-card ds-sku-card">
            <div class="ds-card-head">
              <div>
                <h2 class="ds-card-title">Top sản phẩm</h2>
                <p class="ds-card-sub">Doanh thu cao nhất kỳ này</p>
              </div>
            </div>
            <ol class="ds-sku-list">
              ${topSKU.length === 0 ? '<li class="ds-empty">Chưa có dữ liệu.</li>' : ""}
              ${topSKU.map((s) => `
                <li class="ds-sku-item">
                  <span class="ds-sku-rank">${s.rank}</span>
                  <div class="ds-sku-detail">
                    <span class="ds-sku-name" translate="no">${esc(s.name)}</span>
                    ${s.code !== "—" ? `<span class="ds-sku-code">${esc(s.code)}</span>` : ""}
                  </div>
                  ${s.qty ? `<span class="ds-sku-qty">${esc(s.qty)} đv</span>` : ""}
                  <span class="ds-sku-amt">${esc(money(s.amount, ccy))}</span>
                </li>`).join("")}
            </ol>
          </article>

          ${fxCardHtml(inc, ccy, "ds-card")}
        </div>
      </div>`;

    const byChannelHtml = `
      <article class="ds-card">
        <div class="ds-card-head">
          <div>
            <h2 class="ds-card-title">Doanh thu theo kênh bán</h2>
            <p class="ds-card-sub">Kỳ: ${rangeLabel}</p>
          </div>
        </div>
        <ul class="ds-channel-detail">
          ${channelData.map((c, i) => `
            <li class="ds-channel-detail-row">
              <span class="ds-sku-rank">${i + 1}</span>
              <span class="ds-channel-dot" style="background: ${c.color}"></span>
              <span class="ds-channel-name-lg">${esc(c.name)}</span>
              <div class="ds-channel-bar-wrap ds-channel-bar-lg">${channelBar(c)}</div>
              <span class="ds-channel-pct">${c.pct}%</span>
              <span class="ds-sku-amt">${esc(money(tin * c.pct / 100, ccy))}</span>
            </li>`).join("")}
        </ul>
      </article>`;

    const topSkuHtml = `
      <article class="ds-card" style="padding: 0">
        <div class="ds-card-head" style="padding: 16px 20px 12px">
          <div>
            <h2 class="ds-card-title">Top sản phẩm theo doanh thu</h2>
            <p class="ds-card-sub">Kỳ: ${rangeLabel}</p>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width: 40px">#</th>
                <th>Sản phẩm</th>
                <th>Mã đơn</th>
                <th class="amount">SL</th>
                <th class="amount">Doanh thu</th>
              </tr>
            </thead>
            <tbody>
              ${topSKU.length === 0 ? '<tr><td colspan="5"><div class="empty">Không có dữ liệu trong kỳ.</div></td></tr>' : ""}
              ${topSKU.map((s) => `
                <tr>
                  <td><span class="ds-sku-rank">${s.rank}</span></td>
                  <td><span style="font-weight: 500" translate="no">${esc(s.name)}</span></td>
                  <td><span class="muted">${esc(s.code)}</span></td>
                  <td class="amount">${esc(s.qty ?? "—")}</td>
                  <td class="amount"><strong>${esc(money(s.amount, ccy))}</strong></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </article>`;

    root.innerHTML = `
      <div class="ds-root">
        <div class="ds-header">
          <div class="ds-header-left">
            <div class="ds-tabs">
              ${TABS.map(([k, l]) => `<button type="button" class="ds-tab${tab === k ? " active" : ""}" data-action="tab" data-value="${k}">${l}</button>`).join("")}
            </div>
          </div>
        </div>
        ${tab === "overview" ? overviewHtml : tab === "by-channel" ? byChannelHtml : topSkuHtml}
      </div>`;

    bindRoot(root, {
      click: (e) => {
        const el = e.target.closest("[data-action]");
        if (!el) return;
        const action = el.dataset.action;
        if (action === "tab") { this.state.tab = el.dataset.value; this.render(root); }
        else if (action === "range") { this.state.range = el.dataset.value; this.render(root); }
        else if (action === "go") navigate(el.dataset.to);
      },
      change: (e) => {
        if (e.target.dataset.action === "ccy") setCcy(e.target.value);
      },
    });

    if (tab === "overview" && typeof Chart !== "undefined") {
      this.charts.push(new Chart(root.querySelector("#ds-bar"), {
        type: "bar",
        data: {
          labels: last7Days.map((d) => d.label),
          datasets: [
            { label: "Doanh thu", data: last7Days.map((d) => d.income), backgroundColor: "#2563EB", borderRadius: 3, barPercentage: 0.5, categoryPercentage: 0.65 },
            { label: "Chi phí", data: last7Days.map((d) => d.expense), backgroundColor: "#FCA5A5", borderRadius: 3, barPercentage: 0.5, categoryPercentage: 0.65 },
          ],
        },
        options: {
          animation: { duration: 350 },
          plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false } },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: "#F3F4F6" },
              border: { display: false },
              ticks: { font: { size: 11, family: "Inter" }, color: "#9CA3AF", callback: (v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v) },
            },
            x: {
              grid: { display: false },
              border: { display: false },
              ticks: { font: { size: 11, family: "Inter" }, color: "#9CA3AF" },
            },
          },
          maintainAspectRatio: false,
        },
      }));

      this.charts.push(new Chart(root.querySelector("#ds-donut"), {
        type: "doughnut",
        data: {
          labels: channelData.map((c) => c.name),
          datasets: [{ data: channelData.map((c) => c.pct), backgroundColor: channelData.map((c) => c.color), borderWidth: 2, borderColor: "#fff" }],
        },
        options: {
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed}%` } } },
          cutout: "68%",
          maintainAspectRatio: false,
        },
      }));
    }
  },
};
