/**
 * AntiGrav Personal Expense & Cash Flow Management Engine
 * Cyber Gaming HUD & Mobile (Poco X8 Pro) Optimized Edition
 * Implementation of algorithms & reactive UI state based on C:\GED\AntiGrav\Brain\plan.md
 */

// ==========================================
// 1. GAME SFX WEB AUDIO API SYNTHESIZER
// ==========================================
const AudioEngine = {
  ctx: null,
  enabled: true,

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  },

  playBeep(freq = 600, duration = 0.08, type = 'sine') {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Audio autoplay policy fallback
    }
  },

  click() {
    this.playBeep(880, 0.05, 'triangle');
  },

  tab() {
    this.playBeep(1100, 0.07, 'sine');
  },

  action() {
    this.playBeep(480, 0.04, 'sawtooth');
    setTimeout(() => this.playBeep(960, 0.07, 'sine'), 40);
  },

  success() {
    this.playBeep(587.33, 0.06, 'triangle'); // D5
    setTimeout(() => this.playBeep(880, 0.1, 'sine'), 60); // A5
  },

  toggle() {
    this.enabled = !this.enabled;
    const sfxBtn = document.getElementById('sfx-toggle-btn');
    const mobSfxBtn = document.getElementById('mob-sfx-toggle-btn');
    const text = this.enabled ? 'SFX: ON' : 'SFX: OFF';
    const icon = this.enabled ? 'volume-2' : 'volume-x';

    if (sfxBtn) {
      sfxBtn.innerHTML = `<i data-lucide="${icon}" class="w-3.5 h-3.5"></i> <span class="hidden sm:inline">${text}</span>`;
    }
    if (mobSfxBtn) {
      mobSfxBtn.innerHTML = `<i data-lucide="${icon}" class="w-5 h-5 mb-0.5"></i> <span class="text-[10px] font-bold">SFX</span>`;
    }
    if (window.lucide) lucide.createIcons();
    if (this.enabled) this.success();
  }
};

// ==========================================
// 2. DATA STORE & ENGINE STATE
// ==========================================
const state = {
  activeHorizon: 'daily',
  currentTxType: 'expense',
  monthlySavingsTarget: 10000,
  currentMonthDays: 31,
  
  accounts: [
    { id: 'acc-1', name: 'KBANK เงินเดือน (Main Treasury)', type: 'bank', currentBalance: 0, isLiquid: true },
    { id: 'acc-2', name: 'กระเป๋าเงินสด (Field Cash)', type: 'cash', currentBalance: 0, isLiquid: true },
    { id: 'acc-3', name: 'บัตรเครดิต KTC Visa (Credit Shield)', type: 'credit_card', currentBalance: 0, creditLimit: 50000, paymentDueDay: 25, isLiquid: false },
    { id: 'acc-4', name: 'Dime! ออมทรัพย์ดอกเบี้ยสูง (High Yield Vault)', type: 'savings', currentBalance: 0, isLiquid: true }
  ],

  categories: [
    { id: 'cat-sal', name: 'เงินเดือน (Salary)', type: 'income', isFixedObligation: false, color: '#00ff9d' },
    { id: 'cat-bonus', name: 'โบนัส / ค่าเควสท์พิเศษ', type: 'income', isFixedObligation: false, color: '#00f0ff' },
    { id: 'cat-food', name: 'อาหารและพลังงาน (Consumables)', type: 'expense', isFixedObligation: false, color: '#ffaa00' },
    { id: 'cat-rent', name: 'ค่าเช่าห้อง / ฐานทัพ (Fixed)', type: 'expense', isFixedObligation: true, color: '#ff2a5f' },
    { id: 'cat-util', name: 'ค่าน้ำ-ไฟ-อินเทอร์เน็ต (Base Support)', type: 'expense', isFixedObligation: true, color: '#f43f5e' },
    { id: 'cat-sub', name: 'Subscriptions & Pass', type: 'expense', isFixedObligation: true, color: '#b026ff' },
    { id: 'cat-trans', name: 'ยานพาหนะ / การเดินทาง', type: 'expense', isFixedObligation: false, color: '#38bdf8' },
    { id: 'cat-shop', name: 'Gear & Shopping ไลฟ์สไตล์', type: 'expense', isFixedObligation: false, color: '#ff007f' },
  ],

  // Upcoming scheduled bills for remainder of month
  upcomingObligations: [],

  transactions: []
};

const FINANCE_STORAGE_KEY = 'antigrav-finance-state-v1';
let financeSyncQueue = Promise.resolve();

function getFinanceSnapshot() {
  return {
    accounts: state.accounts,
    transactions: state.transactions
  };
}

function restoreFinanceState(savedState) {
  if (!savedState || !Array.isArray(savedState.accounts) || !Array.isArray(savedState.transactions)) {
    return false;
  }

  const savedAccounts = new Map(
    savedState.accounts
      .filter(account => account && typeof account.id === 'string' && Number.isFinite(account.currentBalance))
      .map(account => [account.id, account])
  );
  const savedTransactions = savedState.transactions.filter(transaction =>
    transaction &&
    typeof transaction.id === 'string' &&
    ['income', 'expense', 'transfer'].includes(transaction.type) &&
    Number.isFinite(transaction.amount) &&
    typeof transaction.transactedAt === 'string'
  );

  state.accounts = state.accounts.map(account => ({
    ...account,
    ...(savedAccounts.get(account.id) || {})
  }));
  state.transactions = savedTransactions;
  return true;
}

function saveFinanceStateLocally() {
  localStorage.setItem(FINANCE_STORAGE_KEY, JSON.stringify(getFinanceSnapshot()));
}

function syncFinanceStateToObsidian() {
  const snapshot = JSON.stringify(getFinanceSnapshot());
  financeSyncQueue = financeSyncQueue.catch(() => {}).then(async () => {
    const response = await fetch('/api/finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: snapshot
    });
    if (!response.ok) {
      throw new Error(`Finance API returned HTTP ${response.status}`);
    }
  });
  return financeSyncQueue;
}

// ==========================================
// 3. CHART INSTANCES
// ==========================================
let forecastChartInstance = null;
let weeklyChartInstance = null;
let categoryDonutChartInstance = null;

// ==========================================
// 4. CORE ANALYTICS ALGORITHMS
// ==========================================
function getLiquidBalance() {
  return state.accounts
    .filter(a => a.isLiquid)
    .reduce((sum, a) => sum + a.currentBalance, 0);
}

function getCreditCardEscrowHeld() {
  const cc = state.accounts.find(a => a.type === 'credit_card');
  return cc && cc.currentBalance < 0 ? Math.abs(cc.currentBalance) : 0;
}

function calculateSafeToSpendEngine() {
  const liquid = getLiquidBalance();
  const fixedObligations = state.upcomingObligations
    .filter(o => !o.isCreditCardSettlement && o.amount < 0)
    .reduce((sum, o) => sum + Math.abs(o.amount), 0);

  const ccEscrow = getCreditCardEscrowHeld();

  // Accumulate savings already deposited this month
  const accumulatedSavings = state.transactions
    .filter(t => t.type === 'transfer' && state.accounts.find(a => a.id === t.destinationAccountId)?.type === 'savings')
    .reduce((sum, t) => sum + t.amount, 0);

  const remainingSavingsGoal = Math.max(0, state.monthlySavingsTarget - accumulatedSavings);
  
  // Days remaining in month
  const todayDate = 3;
  const daysRemaining = Math.max(1, state.currentMonthDays - todayDate);

  const rawSafe = liquid - fixedObligations - remainingSavingsGoal - ccEscrow;
  const buffer = Math.max(0, rawSafe * 0.05);
  const totalSafe = Math.max(0, rawSafe - buffer);
  const dailySafe = totalSafe / daysRemaining;

  // Spent today
  const todaySpent = state.transactions
    .filter(t => t.type === 'expense' && t.transactedAt.startsWith('2026-10-03'))
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    liquid,
    fixedObligations,
    ccEscrow,
    remainingSavingsGoal,
    buffer,
    totalSafe,
    dailySafe,
    todaySpent,
    daysRemaining
  };
}

function calculateHealthIndicators() {
  const totalIncome = state.transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = state.transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const netSavings = Math.max(0, totalIncome - totalExpense);
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;
  const ocfRatio = totalExpense > 0 ? totalIncome / totalExpense : (totalIncome > 0 ? 99 : 0);

  const liquid = getLiquidBalance();
  const estMonthlyExpense = 30000;
  const runwayMonths = liquid / estMonthlyExpense;

  return {
    totalIncome,
    totalExpense,
    netSavings,
    savingsRate: savingsRate.toFixed(1),
    ocfRatio: ocfRatio.toFixed(1),
    runwayMonths: runwayMonths.toFixed(1)
  };
}

// ==========================================
// 5. REACTIVE UI UPDATE ENGINE
// ==========================================
function updateAllViews() {
  const safeData = calculateSafeToSpendEngine();
  const health = calculateHealthIndicators();

  // 1. Update Top 4 Metric Cards
  document.getElementById('stat-liquid-balance').innerText = `฿${safeData.liquid.toLocaleString()}`;
  document.getElementById('stat-escrow').innerText = `฿${safeData.ccEscrow.toLocaleString()}`;
  document.getElementById('stat-safe-spend').innerText = `฿${Math.round(safeData.dailySafe).toLocaleString()}`;
  
  const spentPct = safeData.dailySafe > 0 ? Math.min(100, Math.round((safeData.todaySpent / safeData.dailySafe) * 100)) : 0;
  document.getElementById('stat-safe-bar').style.width = `${spentPct}%`;
  document.getElementById('stat-spent-today-text').innerText = `ใช้ไปแล้ว: ฿${safeData.todaySpent.toLocaleString()}`;
  document.getElementById('stat-spent-pct').innerText = `${spentPct}%`;

  document.getElementById('stat-runway').innerHTML = `${health.runwayMonths} <span class="text-xs sm:text-sm font-normal text-slate-400 font-chakra">เดือน</span>`;
  document.getElementById('stat-savings-rate').innerText = `${health.savingsRate}%`;
  document.getElementById('stat-ocf').innerText = `${health.ocfRatio}x`;

  // 2. Safe-to-Spend Breakdown Card
  document.getElementById('calc-liquid').innerText = `฿${safeData.liquid.toLocaleString()}`;
  document.getElementById('calc-fixed').innerText = `-฿${safeData.fixedObligations.toLocaleString()}`;
  document.getElementById('calc-savings').innerText = `-฿${safeData.remainingSavingsGoal.toLocaleString()}`;
  document.getElementById('calc-buffer').innerText = `-฿${safeData.buffer.toLocaleString()}`;
  document.getElementById('calc-free').innerText = `฿${Math.round(safeData.totalSafe).toLocaleString()}`;
  document.getElementById('calc-days-remaining').innerText = `เหลืออีก ${safeData.daysRemaining} วันในรอบเดือนนี้`;
  document.getElementById('calc-daily-result').innerText = `฿${Math.round(safeData.dailySafe).toLocaleString()} / วัน`;

  // 3. Monthly View Stats
  document.getElementById('m-income').innerText = `฿${health.totalIncome.toLocaleString()}`;
  document.getElementById('m-expense').innerText = `฿${health.totalExpense.toLocaleString()}`;
  const netSign = (health.totalIncome - health.totalExpense) >= 0 ? '+' : '';
  document.getElementById('m-net').innerText = `${netSign}฿${(health.totalIncome - health.totalExpense).toLocaleString()}`;
  document.getElementById('m-savings-rate').innerText = `${health.savingsRate}%`;

  // 4. Update Tables & Lists
  renderTransactionsTable();
  renderAccountsList();
  renderSpikeDays();
  checkAndDisplayGuardrails(safeData);

  // 5. Render/Update Charts
  renderForecastChart();
  renderWeeklyChart();
  renderCategoryDonutChart();

  // Refresh lucide icons
  if (window.lucide) lucide.createIcons();
}

function checkAndDisplayGuardrails(safeData) {
  const alertEl = document.getElementById('guardrail-alert');
  if (!alertEl) return;
  
  const kbank = state.accounts.find(a => a.id === 'acc-1');
  const ccDue = state.upcomingObligations.find(o => o.isCreditCardSettlement);
  
  if (kbank && ccDue && (kbank.currentBalance - Math.abs(ccDue.amount)) < 3000) {
    alertEl.className = 'p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border bg-amber-950/40 border-amber-500/60 text-amber-200 flex items-start gap-3 clip-corner shadow-neon-amber';
    alertEl.innerHTML = `
      <div class="p-2 bg-amber-500/20 rounded-lg border border-amber-500/40 text-amber-400 shrink-0">
        <i data-lucide="alert-triangle" class="w-5 h-5"></i>
      </div>
      <div>
        <div class="flex items-center gap-2">
          <h4 class="font-orbitron font-bold text-xs uppercase tracking-wider text-amber-400">
            [HAZARD RADAR] OVERDRAFT RISK DETECTED
          </h4>
          <span class="text-[9px] font-mono bg-amber-900/60 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/40">CRITICAL</span>
        </div>
        <p class="text-xs text-amber-300/90 mt-1 font-chakra">
          คลังแสง "${kbank.name}" เหลือ ฿${kbank.currentBalance.toLocaleString()} ซึ่งใกล้เคียงกับยอดชำระบิลบัตรเครดิต ฿${Math.abs(ccDue.amount).toLocaleString()} ในวันที่ ${ccDue.dueDate}
          แนะนำให้โอนเงินสำรองจาก High Yield Vault เข้ามาเติมล่วงหน้า 3 วัน
        </p>
      </div>
    `;
    alertEl.classList.remove('hidden');
  } else {
    alertEl.className = 'p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border bg-[#061e18]/80 border-emerald-500/40 text-emerald-200 flex items-start gap-3 clip-corner shadow-neon-emerald';
    alertEl.innerHTML = `
      <div class="p-2 bg-emerald-500/20 rounded-lg border border-emerald-500/40 text-emerald-400 shrink-0">
        <i data-lucide="shield-check" class="w-5 h-5"></i>
      </div>
      <div>
        <div class="flex items-center gap-2">
          <h4 class="font-orbitron font-bold text-xs uppercase tracking-wider text-emerald-400">
            [TACTICAL SHIELD] ALL SYSTEMS SECURE & OPERATIONAL
          </h4>
          <span class="text-[9px] font-mono bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/40">HEALTHY</span>
        </div>
        <p class="text-xs text-emerald-300/90 mt-1 font-chakra">
          สภาพคล่องอยู่ในเกณฑ์ปลอดภัย มีกระสุนเพียงพอรองรับ Fixed Obligations และบิลบัตรเครดิตทั้งหมดจนถึงสิ้นเดือน
        </p>
      </div>
    `;
    alertEl.classList.remove('hidden');
  }
}

function renderTransactionsTable() {
  const tbody = document.getElementById('transaction-table-body');
  if (!tbody) return;

  document.getElementById('tx-count-text').innerText = `${state.transactions.length} รายการ`;
  tbody.innerHTML = '';

  const sorted = [...state.transactions].sort((a, b) => new Date(b.transactedAt) - new Date(a.transactedAt));

  sorted.forEach(tx => {
    const cat = state.categories.find(c => c.id === tx.categoryId);
    const srcAcc = state.accounts.find(a => a.id === tx.sourceAccountId);
    const destAcc = state.accounts.find(a => a.id === tx.destinationAccountId);

    let typeBadge = '';
    let amountClass = '';
    let amountPrefix = '';

    if (tx.type === 'income') {
      typeBadge = '<span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-mono font-bold text-[10px] uppercase tracking-wider">+ INFLOW</span>';
      amountClass = 'text-emerald-400 font-orbitron font-bold';
      amountPrefix = '+';
    } else if (tx.type === 'expense') {
      typeBadge = '<span class="bg-rose-500/10 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded font-mono font-bold text-[10px] uppercase tracking-wider">- OUTFLOW</span>';
      amountClass = 'text-rose-400 font-orbitron font-bold';
      amountPrefix = '-';
    } else {
      typeBadge = '<span class="bg-purple-500/10 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded font-mono font-bold text-[10px] uppercase tracking-wider">⇄ TRANSFER</span>';
      amountClass = 'text-purple-400 font-orbitron font-bold';
      amountPrefix = '⇄ ';
    }

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-cyan-950/20 transition-colors border-b border-cyan-500/10';
    tr.innerHTML = `
      <td class="py-2.5 px-3 sm:px-4 text-slate-400 whitespace-nowrap font-mono text-[11px]">${tx.transactedAt.replace('T', ' ').substring(0, 16)}</td>
      <td class="py-2.5 px-3 sm:px-4 whitespace-nowrap">${typeBadge}</td>
      <td class="py-2.5 px-3 sm:px-4 font-medium text-slate-200">${cat ? cat.name : (tx.type === 'transfer' ? 'โอนย้ายคลัง' : '-')}</td>
      <td class="py-2.5 px-3 sm:px-4 text-slate-300 text-[11px]">
        ${tx.type === 'transfer' ? `${srcAcc?.name} ➔ ${destAcc?.name}` : (srcAcc?.name || destAcc?.name || '-')}
      </td>
      <td class="py-2.5 px-3 sm:px-4 text-slate-400 text-[11px]">${tx.notes || '-'}</td>
      <td class="py-2.5 px-3 sm:px-4 text-right ${amountClass} whitespace-nowrap text-xs sm:text-sm">
        ${amountPrefix}฿${tx.amount.toLocaleString()}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAccountsList() {
  const container = document.getElementById('accounts-list-container');
  if (!container) return;
  container.innerHTML = '';

  state.accounts.forEach(acc => {
    let typeName = 'TREASURY';
    let iconName = 'wallet';
    if (acc.type === 'credit_card') { typeName = 'CREDIT SHIELD'; iconName = 'credit-card'; }
    if (acc.type === 'savings') { typeName = 'HIGH-YIELD VAULT'; iconName = 'shield-alert'; }
    if (acc.type === 'cash') { typeName = 'FIELD CASH'; iconName = 'banknote'; }

    const isNegative = acc.currentBalance < 0;
    const balanceColor = isNegative ? 'text-amber-400' : 'text-cyan-300';

    const card = document.createElement('div');
    card.className = 'p-3 bg-[#050811]/80 border border-cyan-500/25 rounded-xl flex items-center justify-between clip-corner-sm hover:border-cyan-400/60 transition';
    card.innerHTML = `
      <div class="flex items-center gap-2.5">
        <div class="p-2 bg-cyan-950/70 rounded-lg text-cyan-400 border border-cyan-500/30">
          <i data-lucide="${iconName}" class="w-4 h-4"></i>
        </div>
        <div>
          <h4 class="text-xs font-bold text-white font-chakra">${acc.name}</h4>
          <span class="text-[10px] text-cyan-400/80 font-mono">[${typeName}] &bull; ${acc.isLiquid ? 'READY' : 'CREDIT LIMIT'}</span>
        </div>
      </div>
      <div class="text-right font-mono">
        <div class="text-xs sm:text-sm font-orbitron font-black ${balanceColor}">฿${acc.currentBalance.toLocaleString()}</div>
        ${acc.creditLimit ? `<span class="text-[9px] text-slate-500 font-mono">LIMIT: ฿${acc.creditLimit.toLocaleString()}</span>` : ''}
      </div>
    `;
    container.appendChild(card);
  });
}

function renderSpikeDays() {
  const container = document.getElementById('spike-days-container');
  if (!container) return;
  container.innerHTML = '';

  const spikes = state.transactions.filter(t => t.type === 'expense' && t.amount >= 2000);

  if (spikes.length === 0) {
    container.innerHTML = `
      <div class="p-4 bg-[#050811]/60 rounded-xl border border-cyan-500/20 text-center text-slate-500 text-xs font-mono">
        // NO SURGE ANOMALIES DETECTED THIS CYCLE
      </div>
    `;
    return;
  }

  spikes.forEach(s => {
    const cat = state.categories.find(c => c.id === s.categoryId);
    const card = document.createElement('div');
    card.className = 'p-3 bg-amber-950/25 border border-amber-500/40 rounded-xl flex items-center justify-between text-xs clip-corner-sm';
    card.innerHTML = `
      <div>
        <div class="flex items-center gap-1.5 font-bold text-amber-300 font-mono">
          <i data-lucide="alert-circle" class="w-3.5 h-3.5 text-amber-400"></i>
          <span>${s.transactedAt.split('T')[0]} - ${s.notes || cat?.name}</span>
        </div>
        <span class="text-[10px] text-amber-400/80 font-mono">SURGE: 4.8x ABOVE DAILY BURN RATE</span>
      </div>
      <div class="font-orbitron font-extrabold text-amber-400">
        ฿${s.amount.toLocaleString()}
      </div>
    `;
    container.appendChild(card);
  });
}

// ==========================================
// 6. CHART.JS CYBER GAMING HUD THEMES
// ==========================================

function renderForecastChart() {
  const ctx = document.getElementById('forecastChart');
  if (!ctx) return;

  const labels = [];
  const balancePoints = [];
  let balance = getLiquidBalance();
  const avgDiscretionary = 400;

  for (let day = 3; day <= 31; day++) {
    const dateStr = `10/${day < 10 ? '0' + day : day}`;
    labels.push(dateStr);

    const fullDate = `2026-10-${day < 10 ? '0' + day : day}`;
    const dayBills = state.upcomingObligations.filter(o => o.dueDate === fullDate);
    const billSum = dayBills.reduce((sum, b) => sum + b.amount, 0);

    balance = balance + billSum - avgDiscretionary;
    balancePoints.push(Math.round(balance));
  }

  if (forecastChartInstance) forecastChartInstance.destroy();

  // Cyber Cyan Gradient
  const canvasCtx = ctx.getContext('2d');
  const gradient = canvasCtx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(0, 240, 255, 0.35)');
  gradient.addColorStop(1, 'rgba(0, 240, 255, 0.01)');

  forecastChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'PROJECTED BALANCE ฿',
        data: balancePoints,
        borderColor: '#00f0ff',
        backgroundColor: gradient,
        fill: true,
        tension: 0.3,
        borderWidth: 2.5,
        pointBackgroundColor: '#00f0ff',
        pointBorderColor: '#050811',
        pointBorderWidth: 2,
        pointRadius: 2.5,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#090e1d',
          titleColor: '#00f0ff',
          bodyColor: '#e2e8f0',
          borderColor: '#00f0ff',
          borderWidth: 1,
          padding: 10,
          titleFont: { family: 'Share Tech Mono', size: 12 },
          bodyFont: { family: 'Orbitron', size: 12 },
          callbacks: {
            label: (c) => `CREDITS: ฿${c.parsed.y.toLocaleString()}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(0, 240, 255, 0.08)' },
          ticks: { color: '#00f0ff88', font: { family: 'Share Tech Mono', size: 9 } }
        },
        y: {
          grid: { color: 'rgba(0, 240, 255, 0.08)' },
          ticks: {
            color: '#00f0ff88',
            font: { family: 'Share Tech Mono', size: 9 },
            callback: (v) => `฿${v / 1000}k`
          }
        }
      }
    }
  });
}

function renderWeeklyChart() {
  const ctx = document.getElementById('weeklyChart');
  if (!ctx) return;

  if (weeklyChartInstance) weeklyChartInstance.destroy();

  weeklyChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['W1 (สัปดาห์ 1)', 'W2 (สัปดาห์ 2)', 'W3 (สัปดาห์ 3)', 'W4 (สัปดาห์ 4)'],
      datasets: [
        {
          label: 'INFLOW (+)',
          data: [55000, 0, 0, 0],
          backgroundColor: '#00ff9d',
          borderRadius: 4
        },
        {
          label: 'OUTFLOW (-)',
          data: [5570, 14400, 2988, 18200],
          backgroundColor: '#ff2a5f',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#94a3b8', font: { family: 'Share Tech Mono', size: 11 } }
        },
        tooltip: {
          backgroundColor: '#090e1d',
          borderColor: '#00f0ff',
          borderWidth: 1,
          titleFont: { family: 'Share Tech Mono' },
          bodyFont: { family: 'Orbitron' }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#64748b', font: { family: 'Chakra Petch', size: 10 } }
        },
        y: {
          grid: { color: 'rgba(0, 240, 255, 0.08)' },
          ticks: {
            color: '#64748b',
            font: { family: 'Share Tech Mono', size: 9 },
            callback: (v) => `฿${v / 1000}k`
          }
        }
      }
    }
  });
}

function renderCategoryDonutChart() {
  const ctx = document.getElementById('categoryDonutChart');
  if (!ctx) return;

  const expenseMap = {};
  state.transactions.filter(t => t.type === 'expense').forEach(t => {
    const cat = state.categories.find(c => c.id === t.categoryId);
    const catName = cat ? cat.name : 'ทั่วไป';
    expenseMap[catName] = (expenseMap[catName] || 0) + t.amount;
  });

  const labels = Object.keys(expenseMap);
  const data = Object.values(expenseMap);
  const backgroundColors = ['#00f0ff', '#ffe600', '#ff007f', '#b026ff', '#00ff9d', '#ffaa00'];

  if (categoryDonutChartInstance) categoryDonutChartInstance.destroy();

  categoryDonutChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: backgroundColors,
        borderWidth: 2,
        borderColor: '#050811'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#94a3b8', font: { family: 'Chakra Petch', size: 10 } }
        }
      },
      cutout: '68%'
    }
  });
}

// ==========================================
// 7. EVENT HANDLERS & MODAL MANAGEMENT
// ==========================================

function setHorizon(horizon) {
  state.activeHorizon = horizon;
  AudioEngine.tab();
  
  // 1. Update Desktop Header Tabs
  document.querySelectorAll('.horizon-tab').forEach(btn => {
    btn.className = 'horizon-tab px-4 py-1.5 text-xs font-bold rounded-lg transition-all text-slate-400 hover:text-cyan-300 flex items-center gap-1.5';
  });
  
  const activeBtn = document.getElementById(`tab-${horizon}`);
  if (activeBtn) {
    activeBtn.className = 'horizon-tab px-4 py-1.5 text-xs font-bold rounded-lg transition-all bg-cyan-400 text-black shadow-neon-cyan flex items-center gap-1.5';
  }

  // 2. Update Mobile Bottom HUD Navigation Tabs
  const mobTabs = {
    daily: document.getElementById('mob-tab-daily'),
    weekly: document.getElementById('mob-tab-weekly'),
    monthly: document.getElementById('mob-tab-monthly')
  };

  Object.keys(mobTabs).forEach(key => {
    if (mobTabs[key]) {
      if (key === horizon) {
        mobTabs[key].className = 'mob-nav-btn flex flex-col items-center justify-center py-1 text-cyan-400 font-mono cyber-btn';
      } else {
        mobTabs[key].className = 'mob-nav-btn flex flex-col items-center justify-center py-1 text-slate-400 hover:text-cyan-300 font-mono cyber-btn';
      }
    }
  });

  // 3. Toggle Horizon Section Views
  document.getElementById('view-daily').classList.toggle('hidden', horizon !== 'daily');
  document.getElementById('view-weekly').classList.toggle('hidden', horizon !== 'weekly');
  document.getElementById('view-monthly').classList.toggle('hidden', horizon !== 'monthly');

  // 4. Trigger Responsive Chart Re-render
  setTimeout(() => {
    if (horizon === 'daily') renderForecastChart();
    if (horizon === 'weekly') renderWeeklyChart();
    if (horizon === 'monthly') renderCategoryDonutChart();
    if (window.lucide) lucide.createIcons();
  }, 40);
}

function openTxModal() {
  AudioEngine.action();
  document.getElementById('tx-modal').classList.remove('hidden');
  populateSelectOptions();
  
  const now = new Date();
  const isoLocal = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('tx-date').value = isoLocal;
  setTxType(state.currentTxType);
  if (window.lucide) lucide.createIcons();
}

function closeTxModal() {
  AudioEngine.click();
  document.getElementById('tx-modal').classList.add('hidden');
}

function setTxType(type) {
  state.currentTxType = type;
  AudioEngine.click();
  
  const btnExpense = document.getElementById('btn-tx-expense');
  const btnIncome = document.getElementById('btn-tx-income');
  const btnTransfer = document.getElementById('btn-tx-transfer');

  // Reset styles
  [btnExpense, btnIncome, btnTransfer].forEach(b => {
    b.className = 'tx-type-btn py-2.5 rounded-xl font-bold font-mono text-xs transition cyber-btn bg-[#050811] text-slate-400 border border-cyan-500/20';
  });

  const catField = document.getElementById('field-category');
  const destField = document.getElementById('field-dest-acc');
  const srcField = document.getElementById('field-source-acc');

  if (type === 'expense') {
    btnExpense.className = 'tx-type-btn py-2.5 rounded-xl font-bold font-mono text-xs transition cyber-btn bg-rose-500/20 text-rose-400 border border-rose-500/50 shadow-neon-rose';
    catField.classList.remove('hidden');
    srcField.classList.remove('hidden');
    destField.classList.add('hidden');
  } else if (type === 'income') {
    btnIncome.className = 'tx-type-btn py-2.5 rounded-xl font-bold font-mono text-xs transition cyber-btn bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-neon-emerald';
    catField.classList.remove('hidden');
    srcField.classList.add('hidden');
    destField.classList.remove('hidden');
  } else {
    btnTransfer.className = 'tx-type-btn py-2.5 rounded-xl font-bold font-mono text-xs transition cyber-btn bg-purple-500/20 text-purple-400 border border-purple-500/50 shadow-neon-purple';
    catField.classList.add('hidden');
    srcField.classList.remove('hidden');
    destField.classList.remove('hidden');
  }

  populateSelectOptions();
}

function populateSelectOptions() {
  const catSelect = document.getElementById('tx-category');
  const srcSelect = document.getElementById('tx-source');
  const destSelect = document.getElementById('tx-dest');

  catSelect.innerHTML = '';
  srcSelect.innerHTML = '';
  destSelect.innerHTML = '';

  // Categories
  const filteredCats = state.categories.filter(c => c.type === state.currentTxType);
  filteredCats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.innerText = c.name;
    catSelect.appendChild(opt);
  });

  // Accounts
  state.accounts.forEach(a => {
    const opt1 = document.createElement('option');
    opt1.value = a.id;
    opt1.innerText = `${a.name} (฿${a.currentBalance.toLocaleString()})`;
    srcSelect.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = a.id;
    opt2.innerText = `${a.name} (฿${a.currentBalance.toLocaleString()})`;
    destSelect.appendChild(opt2);
  });
}

function handleCreateTransaction(event) {
  event.preventDefault();

  const amount = parseFloat(document.getElementById('tx-amount').value);
  const categoryId = document.getElementById('tx-category').value;
  const sourceAccountId = document.getElementById('tx-source').value;
  const destinationAccountId = document.getElementById('tx-dest').value;
  const transactedAt = document.getElementById('tx-date').value;
  const notes = document.getElementById('tx-notes').value;

  if (isNaN(amount) || amount <= 0) {
    alert('กรุณากรอกจำนวนเครดิตที่ถูกต้อง');
    return;
  }

  const previousAccounts = state.accounts.map(account => ({ ...account }));
  const previousTransactions = state.transactions;

  // 1. Create Transaction Record
  const newTx = {
    id: `tx-${Date.now()}`,
    type: state.currentTxType,
    amount,
    categoryId: state.currentTxType !== 'transfer' ? categoryId : undefined,
    sourceAccountId: state.currentTxType !== 'income' ? sourceAccountId : undefined,
    destinationAccountId: state.currentTxType !== 'expense' ? destinationAccountId : undefined,
    transactedAt: transactedAt || new Date().toISOString(),
    notes,
    isCleared: true
  };

  // 2. Mutate Account Balance
  if (state.currentTxType === 'income') {
    const acc = state.accounts.find(a => a.id === destinationAccountId);
    if (acc) acc.currentBalance += amount;
  } else if (state.currentTxType === 'expense') {
    const acc = state.accounts.find(a => a.id === sourceAccountId);
    if (acc) acc.currentBalance -= amount;
  } else if (state.currentTxType === 'transfer') {
    const src = state.accounts.find(a => a.id === sourceAccountId);
    const dst = state.accounts.find(a => a.id === destinationAccountId);
    if (src && dst) {
      src.currentBalance -= amount;
      dst.currentBalance += amount;
    }
  }

  state.transactions.unshift(newTx);

  try {
    saveFinanceStateLocally();
  } catch (error) {
    state.accounts = previousAccounts;
    state.transactions = previousTransactions;
    console.error('Unable to save finance data in browser storage.', error);
    alert('บันทึกรายการไม่สำเร็จ: พื้นที่จัดเก็บในเบราว์เซอร์ใช้งานไม่ได้ กรุณาตรวจสอบพื้นที่ว่างและลองอีกครั้ง');
    updateAllViews();
    return;
  }

  AudioEngine.success();

  // 3. Reset form & close modal
  document.getElementById('tx-form').reset();
  closeTxModal();

  // 4. Update UI
  updateAllViews();

  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    syncFinanceStateToObsidian().catch(error => {
      console.error('Unable to sync finance data to the Obsidian vault.', error);
      alert('บันทึกไว้ในเบราว์เซอร์แล้ว แต่ซิงก์ไปยัง Obsidian ไม่สำเร็จ กรุณาตรวจสอบว่าเซิร์ฟเวอร์กำลังทำงาน');
    });
  }
}

// ==========================================
// 8. INITIALIZE APPLICATION
// ==========================================
async function initializeApplication() {
  let hasLocalState = false;

  try {
    const localData = localStorage.getItem(FINANCE_STORAGE_KEY);
    if (localData) {
      hasLocalState = restoreFinanceState(JSON.parse(localData));
    }
  } catch (error) {
    console.error('Unable to restore finance data from browser storage.', error);
    alert('อ่านข้อมูลจากเบราว์เซอร์ไม่สำเร็จ รายการที่บันทึกใน Obsidian จะยังถูกโหลดหากเชื่อมต่อเซิร์ฟเวอร์ได้');
  }

  updateAllViews();
  if (window.lucide) lucide.createIcons();

  if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return;

  try {
    const response = await fetch('/api/finance');
    if (!response.ok) {
      throw new Error(`Finance API returned HTTP ${response.status}`);
    }

    const vaultData = await response.json();
    const hasVaultState = Array.isArray(vaultData.accounts) &&
      Array.isArray(vaultData.transactions) &&
      (vaultData.accounts.length > 0 || vaultData.transactions.length > 0);

    if (hasVaultState) {
      restoreFinanceState(vaultData);
      saveFinanceStateLocally();
      updateAllViews();
    } else if (hasLocalState) {
      await syncFinanceStateToObsidian();
    }
  } catch (error) {
    console.error('Unable to load finance data from the Obsidian vault.', error);
    alert('ไม่สามารถเชื่อมต่อกับข้อมูลใน Obsidian ได้ ขณะนี้จะแสดงข้อมูลที่บันทึกไว้ในเบราว์เซอร์');
  }
}

window.addEventListener('DOMContentLoaded', initializeApplication);
