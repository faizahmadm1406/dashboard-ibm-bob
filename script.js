/**
 * Sales Dashboard — script.js
 * ============================================================
 * Loads 200_sales_data.csv via PapaParse, applies dynamic filters,
 * computes KPIs, and renders all Chart.js visualizations.
 * ============================================================
 */

// ─── GLOBAL STATE ────────────────────────────────────────────
let allData   = [];   // Raw parsed CSV rows
let charts    = {};   // Holds all Chart instances for later destruction

// ─── COLOUR PALETTE ──────────────────────────────────────────
const PALETTE = {
  blue:    '#3b82f6',
  violet:  '#8b5cf6',
  emerald: '#10b981',
  amber:   '#f59e0b',
  rose:    '#ef4444',
  cyan:    '#06b6d4',
  orange:  '#f97316',
  teal:    '#14b8a6',
  indigo:  '#6366f1',
  pink:    '#ec4899',
};

const MULTI_COLORS = Object.values(PALETTE);

// ─── CHART.JS GLOBAL DEFAULTS ────────────────────────────────
Chart.defaults.font.family = '-apple-system, "Segoe UI", system-ui, sans-serif';
Chart.defaults.font.size   = 12;
Chart.defaults.color       = '#64748b'; // slate-500

// ─── ENTRY POINT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Load CSV from the same directory
  Papa.parse('200_sales_data.csv', {
    download:      true,
    header:        true,
    dynamicTyping: true,   // auto-cast numbers / booleans
    skipEmptyLines: true,
    complete: (results) => {
      allData = results.data;
      init();
    },
    error: (err) => {
      console.error('CSV load error:', err);
      alert('Could not load 200_sales_data.csv. Make sure the file is served from the same directory.');
    }
  });
});

// ─── INIT ────────────────────────────────────────────────────
function init() {
  // Wire up filter change listeners
  ['filterRegion', 'filterCategory', 'filterCustomer', 'filterChannel'].forEach(id => {
    document.getElementById(id).addEventListener('change', renderDashboard);
  });

  // Reset button
  document.getElementById('resetFilters').addEventListener('click', () => {
    ['filterRegion', 'filterCategory', 'filterCustomer', 'filterChannel'].forEach(id => {
      document.getElementById(id).value = 'all';
    });
    renderDashboard();
  });

  // First render
  renderDashboard();
}

// ─── FILTER DATA ─────────────────────────────────────────────
/**
 * Returns a filtered subset of allData based on current dropdown values.
 */
function getFilteredData() {
  const region   = document.getElementById('filterRegion').value;
  const category = document.getElementById('filterCategory').value;
  const customer = document.getElementById('filterCustomer').value;
  const channel  = document.getElementById('filterChannel').value;

  return allData.filter(row => {
    if (region   !== 'all' && row.Region           !== region)   return false;
    if (category !== 'all' && row.Product_Category !== category) return false;
    if (customer !== 'all' && row.Customer_Type    !== customer) return false;
    if (channel  !== 'all' && row.Sales_Channel    !== channel)  return false;
    return true;
  });
}

// ─── MAIN RENDER ─────────────────────────────────────────────
function renderDashboard() {
  const data = getFilteredData();

  // Update record count badge
  document.getElementById('recordCount').textContent = data.length;

  renderKPIs(data);
  renderSalesTrend(data);
  renderRegionChart(data);
  renderCategoryChart(data);
  renderQtyCategoryChart(data);
  renderSalesRepChart(data);
  renderTop10Chart(data);
  renderCustomerTypeChart(data);
  renderPaymentChart(data);
  renderChannelChart(data);
  renderScatterChart(data);
}

// ═══════════════════════════════════════════════════════════════
// KPI CARDS
// ═══════════════════════════════════════════════════════════════
function renderKPIs(data) {
  const totalRevenue     = data.reduce((s, r) => s + (r.Sales_Amount || 0), 0);
  const totalTransactions = data.length;
  const totalQty          = data.reduce((s, r) => s + (r.Quantity_Sold || 0), 0);
  const avgDiscount       = data.length
    ? data.reduce((s, r) => s + (r.Discount || 0), 0) / data.length
    : 0;

  document.getElementById('kpiRevenue').textContent      = formatCurrency(totalRevenue);
  document.getElementById('kpiTransactions').textContent = totalTransactions.toLocaleString();
  document.getElementById('kpiQty').textContent          = totalQty.toLocaleString();
  document.getElementById('kpiDiscount').textContent     = (avgDiscount * 100).toFixed(1) + '%';
}

// ═══════════════════════════════════════════════════════════════
// SALES TREND (Monthly)
// ═══════════════════════════════════════════════════════════════
function renderSalesTrend(data) {
  // Group by YYYY-MM
  const monthly = {};
  data.forEach(row => {
    if (!row.Sale_Date) return;
    const month = row.Sale_Date.slice(0, 7); // "2023-01"
    monthly[month] = (monthly[month] || 0) + (row.Sales_Amount || 0);
  });

  const sorted = Object.keys(monthly).sort();
  const labels = sorted.map(m => {
    const [y, mo] = m.split('-');
    return new Date(+y, +mo - 1).toLocaleString('en', { month: 'short', year: 'numeric' });
  });
  const values = sorted.map(m => +monthly[m].toFixed(2));

  const ctx = document.getElementById('chartSalesTrend').getContext('2d');
  destroyChart('chartSalesTrend');

  charts['chartSalesTrend'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Monthly Revenue ($)',
        data: values,
        borderColor: PALETTE.blue,
        backgroundColor: hexToRgba(PALETTE.blue, 0.12),
        borderWidth: 2.5,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' $' + ctx.raw.toLocaleString() } } },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 45 } },
        y: { grid: { color: '#f1f5f9' }, ticks: { callback: v => '$' + (v / 1000).toFixed(0) + 'k' } }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// REVENUE PER REGION
// ═══════════════════════════════════════════════════════════════
function renderRegionChart(data) {
  const grouped = groupSum(data, 'Region', 'Sales_Amount');
  const ctx = document.getElementById('chartRegion').getContext('2d');
  destroyChart('chartRegion');

  charts['chartRegion'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: grouped.labels,
      datasets: [{
        data: grouped.values,
        backgroundColor: [PALETTE.blue, PALETTE.emerald, PALETTE.amber, PALETTE.violet],
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { position: 'bottom', labels: { padding: 12, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: $${ctx.raw.toLocaleString(undefined, {maximumFractionDigits:0})}` } }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// REVENUE PER PRODUCT CATEGORY
// ═══════════════════════════════════════════════════════════════
function renderCategoryChart(data) {
  const grouped = groupSum(data, 'Product_Category', 'Sales_Amount');
  const ctx = document.getElementById('chartCategory').getContext('2d');
  destroyChart('chartCategory');

  charts['chartCategory'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: grouped.labels,
      datasets: [{
        label: 'Revenue ($)',
        data: grouped.values,
        backgroundColor: [PALETTE.violet, PALETTE.cyan, PALETTE.orange, PALETTE.emerald],
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: barOptions('Revenue ($)', v => '$' + (v / 1000).toFixed(1) + 'k')
  });
}

// ═══════════════════════════════════════════════════════════════
// QUANTITY SOLD PER CATEGORY
// ═══════════════════════════════════════════════════════════════
function renderQtyCategoryChart(data) {
  const grouped = groupSum(data, 'Product_Category', 'Quantity_Sold');
  const ctx = document.getElementById('chartQtyCategory').getContext('2d');
  destroyChart('chartQtyCategory');

  charts['chartQtyCategory'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: grouped.labels,
      datasets: [{
        label: 'Quantity Sold',
        data: grouped.values,
        backgroundColor: [PALETTE.amber, PALETTE.rose, PALETTE.teal, PALETTE.indigo],
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: barOptions('Quantity Sold', v => v.toLocaleString())
  });
}

// ═══════════════════════════════════════════════════════════════
// SALES PER SALES REPRESENTATIVE
// ═══════════════════════════════════════════════════════════════
function renderSalesRepChart(data) {
  const grouped = groupSum(data, 'Sales_Rep', 'Sales_Amount');

  // Sort descending by value
  const pairs = grouped.labels.map((l, i) => ({ l, v: grouped.values[i] }))
    .sort((a, b) => b.v - a.v);

  const ctx = document.getElementById('chartSalesRep').getContext('2d');
  destroyChart('chartSalesRep');

  charts['chartSalesRep'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: pairs.map(p => p.l),
      datasets: [{
        label: 'Revenue ($)',
        data: pairs.map(p => +p.v.toFixed(2)),
        backgroundColor: MULTI_COLORS.slice(0, pairs.length),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: barOptions('Revenue by Sales Rep', v => '$' + (v / 1000).toFixed(1) + 'k', true)
  });
}

// ═══════════════════════════════════════════════════════════════
// TOP 10 HIGHEST SALES (individual transactions)
// ═══════════════════════════════════════════════════════════════
function renderTop10Chart(data) {
  const top10 = [...data]
    .sort((a, b) => (b.Sales_Amount || 0) - (a.Sales_Amount || 0))
    .slice(0, 10);

  const labels = top10.map((r, i) =>
    `#${i + 1} ${r.Sales_Rep} (${r.Product_Category})`
  );
  const values = top10.map(r => +(r.Sales_Amount || 0).toFixed(2));

  const ctx = document.getElementById('chartTop10').getContext('2d');
  destroyChart('chartTop10');

  charts['chartTop10'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Sales Amount ($)',
        data: values,
        backgroundColor: hexToRgba(PALETTE.rose, 0.75),
        borderColor: PALETTE.rose,
        borderWidth: 1.5,
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',   // Horizontal bar
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ' $' + ctx.raw.toLocaleString() } }
      },
      scales: {
        x: { grid: { color: '#f1f5f9' }, ticks: { callback: v => '$' + (v / 1000).toFixed(0) + 'k' } },
        y: { grid: { display: false } }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMER TYPE DISTRIBUTION
// ═══════════════════════════════════════════════════════════════
function renderCustomerTypeChart(data) {
  const grouped = groupCount(data, 'Customer_Type');
  const ctx = document.getElementById('chartCustomerType').getContext('2d');
  destroyChart('chartCustomerType');

  charts['chartCustomerType'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: grouped.labels,
      datasets: [{
        data: grouped.values,
        backgroundColor: [PALETTE.blue, PALETTE.emerald],
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 6,
      }]
    },
    options: donutOptions()
  });
}

// ═══════════════════════════════════════════════════════════════
// PAYMENT METHOD USAGE
// ═══════════════════════════════════════════════════════════════
function renderPaymentChart(data) {
  const grouped = groupCount(data, 'Payment_Method');
  const ctx = document.getElementById('chartPayment').getContext('2d');
  destroyChart('chartPayment');

  charts['chartPayment'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: grouped.labels,
      datasets: [{
        data: grouped.values,
        backgroundColor: [PALETTE.violet, PALETTE.amber, PALETTE.cyan],
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 6,
      }]
    },
    options: donutOptions()
  });
}

// ═══════════════════════════════════════════════════════════════
// SALES CHANNEL DISTRIBUTION
// ═══════════════════════════════════════════════════════════════
function renderChannelChart(data) {
  const grouped = groupCount(data, 'Sales_Channel');
  const ctx = document.getElementById('chartChannel').getContext('2d');
  destroyChart('chartChannel');

  charts['chartChannel'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: grouped.labels,
      datasets: [{
        data: grouped.values,
        backgroundColor: [PALETTE.orange, PALETTE.teal],
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 6,
      }]
    },
    options: donutOptions()
  });
}

// ═══════════════════════════════════════════════════════════════
// DISCOUNT VS SALES SCATTER PLOT
// ═══════════════════════════════════════════════════════════════
function renderScatterChart(data) {
  // Build scatter points by category (coloured)
  const categories = [...new Set(data.map(r => r.Product_Category))].sort();
  const categoryColors = {
    Furniture:   PALETTE.blue,
    Clothing:    PALETTE.violet,
    Food:        PALETTE.emerald,
    Electronics: PALETTE.amber,
  };

  const datasets = categories.map(cat => {
    const points = data
      .filter(r => r.Product_Category === cat)
      .map(r => ({ x: +(r.Discount * 100).toFixed(1), y: +(r.Sales_Amount || 0).toFixed(2) }));

    return {
      label: cat,
      data: points,
      backgroundColor: hexToRgba(categoryColors[cat] || PALETTE.cyan, 0.65),
      pointRadius: 5,
      pointHoverRadius: 7,
    };
  });

  const ctx = document.getElementById('chartScatter').getContext('2d');
  destroyChart('chartScatter');

  charts['chartScatter'] = new Chart(ctx, {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { padding: 12, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: Disc ${ctx.raw.x}%, $${ctx.raw.y.toLocaleString()}`
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Discount (%)', font: { weight: '500' } },
          grid: { color: '#f1f5f9' },
        },
        y: {
          title: { display: true, text: 'Sales Amount ($)', font: { weight: '500' } },
          grid: { color: '#f1f5f9' },
          ticks: { callback: v => '$' + (v / 1000).toFixed(1) + 'k' }
        }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Groups rows by a key field and sums a numeric value field.
 * Returns { labels: [], values: [] }
 */
function groupSum(data, keyField, valueField) {
  const map = {};
  data.forEach(row => {
    const key = row[keyField] || 'Unknown';
    map[key] = (map[key] || 0) + (row[valueField] || 0);
  });
  return {
    labels: Object.keys(map),
    values: Object.values(map).map(v => +v.toFixed(2))
  };
}

/**
 * Groups rows by a key field and counts occurrences.
 * Returns { labels: [], values: [] }
 */
function groupCount(data, keyField) {
  const map = {};
  data.forEach(row => {
    const key = row[keyField] || 'Unknown';
    map[key] = (map[key] || 0) + 1;
  });
  return {
    labels: Object.keys(map),
    values: Object.values(map)
  };
}

/**
 * Destroys an existing Chart instance by canvas ID to prevent memory leaks
 * and duplicate-canvas Chart.js errors.
 */
function destroyChart(id) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
}

/**
 * Shared bar chart options factory.
 * @param {string} label
 * @param {Function} tickFormatter
 * @param {boolean} horizontal
 */
function barOptions(label, tickFormatter = v => v, horizontal = false) {
  return {
    indexAxis: horizontal ? 'y' : 'x',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': $' + ctx.raw.toLocaleString() } }
    },
    scales: {
      x: {
        grid: { display: !horizontal, color: '#f1f5f9' },
        ticks: { callback: horizontal ? tickFormatter : undefined }
      },
      y: {
        grid: { display: horizontal, color: '#f1f5f9' },
        ticks: { callback: horizontal ? undefined : tickFormatter }
      }
    }
  };
}

/**
 * Shared doughnut chart options.
 */
function donutOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: { position: 'bottom', labels: { padding: 10, boxWidth: 12 } },
      tooltip: {
        callbacks: {
          label: ctx => {
            const total = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
            const pct = ((ctx.raw / total) * 100).toFixed(1);
            return ` ${ctx.label}: ${ctx.raw} (${pct}%)`;
          }
        }
      }
    }
  };
}

/**
 * Converts a hex colour to rgba string.
 */
function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Formats a number as a compact currency string (e.g. $1.23M, $45.6k).
 */
function formatCurrency(value) {
  if (value >= 1_000_000) return '$' + (value / 1_000_000).toFixed(2) + 'M';
  if (value >= 1_000)     return '$' + (value / 1_000).toFixed(1) + 'k';
  return '$' + value.toFixed(2);
}
