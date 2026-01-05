// ===================
// グローバル変数
// ===================
let CSV_FILES = [];
let dataCache = {};
let headers = [];
let currentDateIndex = 0;
let allMachines = new Set();

// ===================
// ユーティリティ
// ===================
function formatDate(filename) {
  const match = filename.match(/(\d{4})_(\d{2})_(\d{2})/);
  if (match) return `${match[1]}/${match[2]}/${match[3]}`;
  return filename;
}

function formatDateShort(filename) {
  const match = filename.match(/(\d{4})_(\d{2})_(\d{2})/);
  if (match) return `${match[2]}/${match[3]}`;
  return filename;
}

// ===================
// データ読み込み
// ===================
async function loadCSV(filename) {
  if (dataCache[filename]) return dataCache[filename];

  try {
    const res = await fetch(filename);
    if (!res.ok) throw new Error("Not found");
    const text = await res.text();
    const lines = text.trim().split("\n");

    if (headers.length === 0) {
      headers = lines[0].split(",");
    }

    const data = lines.slice(1).map((line) => {
      const values = line.split(",");
      const obj = {};
      headers.forEach((h, i) => (obj[h] = values[i]));
      return obj;
    });

    data.forEach((d) => allMachines.add(d["機種名"]));
    dataCache[filename] = data;
    return data;
  } catch (e) {
    console.error(`Failed to load ${filename}:`, e);
    return [];
  }
}

async function loadAllCSV() {
  for (const file of CSV_FILES) {
    await loadCSV(file);
  }
  populateMachineFilters();
}

// ===================
// UI初期化
// ===================
function populateMachineFilters() {
  const machines = [...allMachines].sort();
  ["statsMachineSelect", "trendMachineFilter"].forEach((id) => {
    const select = document.getElementById(id);
    if (!select) return;
    const firstOption = select.options[0];
    select.innerHTML = "";
    select.appendChild(firstOption);
    machines.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      select.appendChild(opt);
    });
  });
}

function populateDateSelectors() {
  const selectors = ["dateSelect", "statsDateSelect"];
  selectors.forEach((id) => {
    const select = document.getElementById(id);
    select.innerHTML = "";
    CSV_FILES.forEach((file, i) => {
      const opt = document.createElement("option");
      opt.value = file;
      opt.textContent = formatDate(file);
      select.appendChild(opt);
    });
    select.selectedIndex = CSV_FILES.length - 1;
  });
  currentDateIndex = CSV_FILES.length - 1;
}

// ===================
// 日別データ
// ===================
function applyColumnFilters(data) {
  const filters = [
    {
      op: document.getElementById("filterSaOp").value,
      val: document.getElementById("filterSaVal").value,
      col: "差枚",
    },
    {
      op: document.getElementById("filterGOp").value,
      val: document.getElementById("filterGVal").value,
      col: "G数",
    },
  ];

  return data.filter((d) => {
    for (const f of filters) {
      if (!f.op || f.val === "") continue;
      const v = parseInt(d[f.col]) || 0;
      const target = parseInt(f.val);
      if (f.op === "gte" && v < target) return false;
      if (f.op === "lte" && v > target) return false;
    }
    return true;
  });
}

function resetFilters() {
  ["filterSaOp", "filterGOp"].forEach((id) => {
    document.getElementById(id).value = "";
  });
  ["filterSaVal", "filterGVal"].forEach((id) => {
    document.getElementById(id).value = "";
  });
  filterAndRender();
}

function renderTable(data, tableId = "data-table", summaryId = "summary") {
  const totalGames = data.reduce((s, d) => s + (parseInt(d["G数"]) || 0), 0);
  const totalSa = data.reduce((s, d) => s + (parseInt(d["差枚"]) || 0), 0);

  document.getElementById(summaryId).innerHTML = `
    <span>表示: <b>${data.length}</b>台</span>
    <span>総G数: <b>${totalGames.toLocaleString()}</b></span>
    <span>総差枚: <b class="${totalSa > 0 ? "plus" : totalSa < 0 ? "minus" : ""}">${totalSa > 0 ? "+" : ""}${totalSa.toLocaleString()}</b></span>
  `;

  const thead = document.querySelector(`#${tableId} thead`);
  thead.innerHTML = "<tr>" + headers.map((h) => `<th>${h}</th>`).join("") + "</tr>";

  const tbody = document.querySelector(`#${tableId} tbody`);
  tbody.innerHTML = data
    .map((row) => {
      return (
        "<tr>" +
        headers
          .map((h) => {
            let val = row[h];
            let cls = "";

            if (h === "差枚") {
              const num = parseInt(val);
              cls = num > 0 ? "plus" : num < 0 ? "minus" : "zero";
              val = num > 0 ? "+" + val : val;
            }

            if (h === "合成確率" && val && val !== "1/0.0") {
              const prob = parseFloat(val.replace("1/", ""));
              if (prob > 0 && prob < 140) cls = "prob-good";
              else if (prob >= 140 && prob < 180) cls = "prob-mid";
              else if (prob >= 180) cls = "prob-bad";
            }

            return `<td class="${cls}">${val}</td>`;
          })
          .join("") +
        "</tr>"
      );
    })
    .join("");
}

async function filterAndRender() {
  const filename = CSV_FILES[currentDateIndex];
  const data = await loadCSV(filename);

  const search = document.getElementById("search").value.toLowerCase();
  const sort = document.getElementById("sortBy").value;

  let filtered = data.filter((d) => {
    return d["機種名"].toLowerCase().includes(search) || d["台番号"].includes(search);
  });

  filtered = applyColumnFilters(filtered);

  if (sort) {
    filtered.sort((a, b) => {
      switch (sort) {
        case "sa_desc":
          return (parseInt(b["差枚"]) || 0) - (parseInt(a["差枚"]) || 0);
        case "sa_asc":
          return (parseInt(a["差枚"]) || 0) - (parseInt(b["差枚"]) || 0);
        case "game_desc":
          return (parseInt(b["G数"]) || 0) - (parseInt(a["G数"]) || 0);
      }
    });
  }

  renderTable(filtered);
  updateDateNav();
}

function updateDateNav() {
  document.getElementById("currentDateLabel").textContent = formatDate(CSV_FILES[currentDateIndex]);
  document.getElementById("prevDate").disabled = currentDateIndex === 0;
  document.getElementById("nextDate").disabled = currentDateIndex === CSV_FILES.length - 1;
  document.getElementById("dateSelect").selectedIndex = currentDateIndex;
}

// ===================
// 差枚トレンド
// ===================
async function showTrend() {
  const daysCount = parseInt(document.getElementById("trendDays").value) || CSV_FILES.length;
  const machineFilter = document.getElementById("trendMachineFilter").value;
  const sortBy = document.getElementById("trendSortBy").value;
  const filterOp = document.getElementById("trendFilterOp").value;
  const filterVal = document.getElementById("trendFilterVal").value;

  const targetFiles = daysCount === 0 ? CSV_FILES : CSV_FILES.slice(-daysCount);

  const allData = {};
  for (const file of targetFiles) {
    const data = await loadCSV(file);
    data.forEach((d) => {
      const key = `${d["機種名"]}_${d["台番号"]}`;
      if (!allData[key]) {
        allData[key] = {
          機種名: d["機種名"],
          台番号: d["台番号"],
          days: {},
        };
      }
      allData[key].days[file] = parseInt(d["差枚"]) || 0;
    });
  }

  let trendData = Object.values(allData);

  // 機種フィルター
  if (machineFilter) {
    trendData = trendData.filter((d) => d["機種名"] === machineFilter);
  }

  // 日別差枚フィルター
  if (filterOp && filterVal !== "") {
    const target = parseInt(filterVal);
    trendData = trendData.filter((d) => {
      const hasAllDays = targetFiles.every((f) => d.days[f] !== undefined);
      if (!hasAllDays) return false;

      return targetFiles.every((f) => {
        const val = d.days[f];
        if (filterOp === "gte") return val >= target;
        if (filterOp === "lte") return val <= target;
        return true;
      });
    });
  }

  // 合計・平均を計算
  trendData.forEach((d) => {
    const values = targetFiles.map((f) => d.days[f] || 0);
    d.total = values.reduce((a, b) => a + b, 0);
    d.avg = Math.round(d.total / values.length);
    d.latest = d.days[targetFiles[targetFiles.length - 1]] || 0;
    const first = d.days[targetFiles[0]] || 0;
    const last = d.days[targetFiles[targetFiles.length - 1]] || 0;
    d.trend = last - first;
  });

  // ソート
  trendData.sort((a, b) => {
    switch (sortBy) {
      case "total_desc":
        return b.total - a.total;
      case "total_asc":
        return a.total - b.total;
      case "avg_desc":
        return b.avg - a.avg;
      case "latest_desc":
        return b.latest - a.latest;
      default:
        return b.total - a.total;
    }
  });

  // サマリー
  const totalAll = trendData.reduce((s, d) => s + d.total, 0);
  let filterInfo = "";
  if (filterOp && filterVal !== "") {
    const opText = filterOp === "gte" ? "以上" : "以下";
    filterInfo = `<span style="color:#fbbf24;">フィルター: 各日${filterVal}枚${opText}</span>`;
  }
  document.getElementById("trendSummary").innerHTML = `
    <span>表示: <b>${trendData.length}</b>台</span>
    <span>期間: <b>${formatDateShort(targetFiles[0])}</b> 〜 <b>${formatDateShort(targetFiles[targetFiles.length - 1])}</b></span>
    <span>合計差枚: <b class="${totalAll > 0 ? "plus" : totalAll < 0 ? "minus" : ""}">${totalAll > 0 ? "+" : ""}${totalAll.toLocaleString()}</b></span>
    ${filterInfo}
  `;

  // ヘッダー生成
  const trendHeaders = ["機種名", "台番号", ...targetFiles.map((f) => formatDateShort(f)), "合計", "平均", "傾向"];
  const thead = document.querySelector("#trend-table thead");
  thead.innerHTML = "<tr>" + trendHeaders.map((h) => `<th>${h}</th>`).join("") + "</tr>";

  // ボディ生成
  const tbody = document.querySelector("#trend-table tbody");
  tbody.innerHTML = trendData
    .map((row) => {
      let html = "<tr>";
      html += `<td>${row["機種名"]}</td>`;
      html += `<td>${row["台番号"]}</td>`;

      targetFiles.forEach((f) => {
        const val = row.days[f];
        if (val === undefined) {
          html += '<td class="zero">-</td>';
        } else {
          const cls = val > 0 ? "plus" : val < 0 ? "minus" : "zero";
          html += `<td class="${cls}">${val > 0 ? "+" : ""}${val.toLocaleString()}</td>`;
        }
      });

      const totalCls = row.total > 0 ? "plus" : row.total < 0 ? "minus" : "zero";
      html += `<td class="${totalCls}"><b>${row.total > 0 ? "+" : ""}${row.total.toLocaleString()}</b></td>`;

      const avgCls = row.avg > 0 ? "plus" : row.avg < 0 ? "minus" : "zero";
      html += `<td class="${avgCls}">${row.avg > 0 ? "+" : ""}${row.avg.toLocaleString()}</td>`;

      let trendIcon = "→";
      let trendCls = "trend-flat";
      if (row.trend > 100) {
        trendIcon = "↑";
        trendCls = "trend-up";
      } else if (row.trend < -100) {
        trendIcon = "↓";
        trendCls = "trend-down";
      }
      html += `<td class="${trendCls}">${trendIcon}</td>`;

      html += "</tr>";
      return html;
    })
    .join("");
}

function resetTrendFilter() {
  document.getElementById("trendFilterOp").value = "";
  document.getElementById("trendFilterVal").value = "";
  showTrend();
}

function applyPreset(op, val) {
  document.getElementById("trendFilterOp").value = op;
  document.getElementById("trendFilterVal").value = val;
  showTrend();
}

// ===================
// 機種別統計
// ===================
async function showStats() {
  const filename = document.getElementById("statsDateSelect").value;
  const machine = document.getElementById("statsMachineSelect").value;
  const sortBy = document.getElementById("statsSortBy").value;
  const container = document.getElementById("statsContent");

  const data = await loadCSV(filename);

  // 機種未選択: 全機種一覧を表示
  if (!machine) {
    showAllMachineStats(data, filename, sortBy);
    return;
  }

  // 機種選択時: 台別詳細を表示
  showMachineDetail(data, filename, machine);
}

function showAllMachineStats(data, filename, sortBy) {
  const container = document.getElementById("statsContent");

  // 機種ごとに集計
  const machineStats = {};
  data.forEach((d) => {
    const name = d["機種名"];
    if (!machineStats[name]) {
      machineStats[name] = {
        name: name,
        count: 0,
        totalGames: 0,
        totalSa: 0,
        plusCount: 0,
      };
    }
    const sa = parseInt(d["差枚"]) || 0;
    const g = parseInt(d["G数"]) || 0;

    machineStats[name].count++;
    machineStats[name].totalGames += g;
    machineStats[name].totalSa += sa;
    if (sa > 0) machineStats[name].plusCount++;
  });

  // 平均を計算
  let statsArray = Object.values(machineStats);
  statsArray.forEach((s) => {
    s.avgSa = Math.round(s.totalSa / s.count);
    s.avgGames = Math.round(s.totalGames / s.count);
    s.plusRate = ((s.plusCount / s.count) * 100).toFixed(1);
  });

  // ソート
  statsArray.sort((a, b) => {
    switch (sortBy) {
      case "total_desc":
        return b.totalSa - a.totalSa;
      case "total_asc":
        return a.totalSa - b.totalSa;
      case "avg_desc":
        return b.avgSa - a.avgSa;
      case "avg_asc":
        return a.avgSa - b.avgSa;
      case "count_desc":
        return b.count - a.count;
      default:
        return b.totalSa - a.totalSa;
    }
  });

  // サマリー
  const totalSaAll = statsArray.reduce((s, d) => s + d.totalSa, 0);
  const totalGamesAll = statsArray.reduce((s, d) => s + d.totalGames, 0);

  container.innerHTML = `
    <div class="stats-card">
      <h3>全機種サマリー (${formatDate(filename)})</h3>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="label">機種数</div>
          <div class="value">${statsArray.length}機種</div>
        </div>
        <div class="stat-item">
          <div class="label">総台数</div>
          <div class="value">${data.length}台</div>
        </div>
        <div class="stat-item">
          <div class="label">総G数</div>
          <div class="value">${totalGamesAll.toLocaleString()}</div>
        </div>
        <div class="stat-item">
          <div class="label">総差枚</div>
          <div class="value ${totalSaAll > 0 ? "plus" : totalSaAll < 0 ? "minus" : ""}">${totalSaAll > 0 ? "+" : ""}${totalSaAll.toLocaleString()}</div>
        </div>
      </div>
    </div>
    
    <div class="stats-card">
      <h3>機種別データ</h3>
      <div class="table-wrapper">
        <table id="stats-table">
          <thead></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;

  const statsHeaders = ["機種名", "台数", "総G数", "平均G数", "総差枚", "平均差枚", "勝率"];
  document.querySelector("#stats-table thead").innerHTML =
    "<tr>" + statsHeaders.map((h) => `<th>${h}</th>`).join("") + "</tr>";

  document.querySelector("#stats-table tbody").innerHTML = statsArray
    .map((s) => {
      const totalCls = s.totalSa > 0 ? "plus" : s.totalSa < 0 ? "minus" : "zero";
      const avgCls = s.avgSa > 0 ? "plus" : s.avgSa < 0 ? "minus" : "zero";
      return `
        <tr>
          <td>${s.name}</td>
          <td>${s.count}</td>
          <td>${s.totalGames.toLocaleString()}</td>
          <td>${s.avgGames.toLocaleString()}</td>
          <td class="${totalCls}">${s.totalSa > 0 ? "+" : ""}${s.totalSa.toLocaleString()}</td>
          <td class="${avgCls}">${s.avgSa > 0 ? "+" : ""}${s.avgSa.toLocaleString()}</td>
          <td>${s.plusRate}%</td>
        </tr>
      `;
    })
    .join("");
}

function showMachineDetail(data, filename, machine) {
  const container = document.getElementById("statsContent");
  const machineData = data.filter((d) => d["機種名"] === machine);

  if (machineData.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:#888;">データがありません</p>';
    return;
  }

  const stats = {
    count: machineData.length,
    totalGames: 0,
    totalSa: 0,
    maxSa: -Infinity,
    minSa: Infinity,
    maxSaUnit: "",
    minSaUnit: "",
    plusCount: 0,
  };

  machineData.forEach((d) => {
    const g = parseInt(d["G数"]) || 0;
    const sa = parseInt(d["差枚"]) || 0;

    stats.totalGames += g;
    stats.totalSa += sa;
    if (sa > 0) stats.plusCount++;

    if (sa > stats.maxSa) {
      stats.maxSa = sa;
      stats.maxSaUnit = d["台番号"];
    }
    if (sa < stats.minSa) {
      stats.minSa = sa;
      stats.minSaUnit = d["台番号"];
    }
  });

  stats.avgSa = Math.round(stats.totalSa / stats.count);
  stats.avgGames = Math.round(stats.totalGames / stats.count);
  stats.plusRate = ((stats.plusCount / stats.count) * 100).toFixed(1);

  container.innerHTML = `
    <div class="stats-card">
      <h3>${machine} (${formatDate(filename)})</h3>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="label">設置台数</div>
          <div class="value">${stats.count}台</div>
        </div>
        <div class="stat-item">
          <div class="label">総G数</div>
          <div class="value">${stats.totalGames.toLocaleString()}</div>
        </div>
        <div class="stat-item">
          <div class="label">平均G数</div>
          <div class="value">${stats.avgGames.toLocaleString()}</div>
        </div>
        <div class="stat-item">
          <div class="label">総差枚</div>
          <div class="value ${stats.totalSa > 0 ? "plus" : stats.totalSa < 0 ? "minus" : ""}">${stats.totalSa > 0 ? "+" : ""}${stats.totalSa.toLocaleString()}</div>
        </div>
        <div class="stat-item">
          <div class="label">平均差枚</div>
          <div class="value ${stats.avgSa > 0 ? "plus" : stats.avgSa < 0 ? "minus" : ""}">${stats.avgSa > 0 ? "+" : ""}${stats.avgSa.toLocaleString()}</div>
        </div>
        <div class="stat-item">
          <div class="label">勝率</div>
          <div class="value">${stats.plusRate}%</div>
        </div>
        <div class="stat-item">
          <div class="label">最高差枚</div>
          <div class="value plus">+${stats.maxSa.toLocaleString()}<br><small>(${stats.maxSaUnit}番)</small></div>
        </div>
        <div class="stat-item">
          <div class="label">最低差枚</div>
          <div class="value minus">${stats.minSa.toLocaleString()}<br><small>(${stats.minSaUnit}番)</small></div>
        </div>
      </div>
    </div>
    
    <div class="stats-card">
      <h3>台別データ</h3>
      <div class="table-wrapper">
        <table id="stats-table">
          <thead></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;

  const statsHeaders = ["台番号", "G数", "差枚"];
  document.querySelector("#stats-table thead").innerHTML =
    "<tr>" + statsHeaders.map((h) => `<th>${h}</th>`).join("") + "</tr>";

  const sortedData = [...machineData].sort((a, b) => (parseInt(b["差枚"]) || 0) - (parseInt(a["差枚"]) || 0));
  document.querySelector("#stats-table tbody").innerHTML = sortedData
    .map((row) => {
      const sa = parseInt(row["差枚"]) || 0;
      const cls = sa > 0 ? "plus" : sa < 0 ? "minus" : "zero";
      return `
        <tr>
          <td>${row["台番号"]}</td>
          <td>${row["G数"]}</td>
          <td class="${cls}">${sa > 0 ? "+" : ""}${sa}</td>
        </tr>
      `;
    })
    .join("");
}

// ===================
// イベントリスナー
// ===================
function setupEventListeners() {
  // タブ切り替え
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.tab).classList.add("active");

      if (tab.dataset.tab === "trend") showTrend();
      if (tab.dataset.tab === "stats") showStats();
    });
  });

  // 日別データ
  document.getElementById("search").addEventListener("input", filterAndRender);
  document.getElementById("sortBy").addEventListener("change", filterAndRender);
  document.getElementById("dateSelect").addEventListener("change", (e) => {
    currentDateIndex = e.target.selectedIndex;
    filterAndRender();
  });
  document.getElementById("prevDate").addEventListener("click", () => {
    if (currentDateIndex > 0) {
      currentDateIndex--;
      filterAndRender();
    }
  });
  document.getElementById("nextDate").addEventListener("click", () => {
    if (currentDateIndex < CSV_FILES.length - 1) {
      currentDateIndex++;
      filterAndRender();
    }
  });

  // フィルター
  document.getElementById("applyFilter").addEventListener("click", filterAndRender);
  document.getElementById("resetFilter").addEventListener("click", resetFilters);

  // トレンド
  document.getElementById("trendDays").addEventListener("change", showTrend);
  document.getElementById("trendMachineFilter").addEventListener("change", showTrend);
  document.getElementById("trendSortBy").addEventListener("change", showTrend);
  document.getElementById("applyTrendFilter").addEventListener("click", showTrend);
  document.getElementById("resetTrendFilter").addEventListener("click", resetTrendFilter);

  // プリセットボタン
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyPreset(btn.dataset.op, btn.dataset.val);
    });
  });

  // 統計
  document.getElementById("statsDateSelect").addEventListener("change", showStats);
  document.getElementById("statsMachineSelect").addEventListener("change", showStats);
  document.getElementById("statsSortBy").addEventListener("change", showStats);
}

// ===================
// 初期化
// ===================
async function init() {
  const res = await fetch("files.json");
  CSV_FILES = await res.json();
  populateDateSelectors();
  await loadAllCSV();
  setupEventListeners();
  filterAndRender();
}

init();
