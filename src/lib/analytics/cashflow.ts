import { UpcomingObligation, Transaction } from '../../types/finance';

export interface SafeToSpendInput {
  totalLiquidCash: number;        // ยอดรวมบัญชี Cash + Bank ที่มีสภาพคล่อง
  upcomingFixedExpenses: number;  // ภาระที่ต้องจ่ายแน่นอนก่อนสิ้นรอบเดือน (Fixed Obligations)
  monthlySavingsTarget: number;   // เป้าหมายเงินออมประจำเดือน
  accumulatedSavings: number;     // เงินที่ออมเข้าบัญชีเป้าหมายไปแล้วในเดือนนี้
  daysRemainingInPeriod: number;  // จำนวนวันที่เหลือในรอบเดือน
  creditCardEscrowHeld?: number;  // ยอดที่รูดบัตรเครดิตแล้วและกันไว้จ่ายบิล
}

export interface SafeToSpendResult {
  totalSafeToSpend: number;
  dailySafeToSpend: number;
  discretionaryBuffer: number;
  remainingSavingsGoal: number;
}

/**
 * คำนวณเงินที่ใช้จ่ายได้อย่างปลอดภัย (Safe-to-Spend)
 */
export function calculateSafeToSpend(input: SafeToSpendInput): SafeToSpendResult {
  const {
    totalLiquidCash,
    upcomingFixedExpenses,
    monthlySavingsTarget,
    accumulatedSavings,
    daysRemainingInPeriod,
    creditCardEscrowHeld = 0,
  } = input;

  const remainingSavingsGoal = Math.max(0, monthlySavingsTarget - accumulatedSavings);
  
  // Total Free Cash = เงินสด - ค่าใช้จ่ายประจำที่ต้องจ่าย - ยอดเงินออมที่ยังค้างเก็บ - ยอดกันไว้จ่ายบัตรเครดิต
  const rawSafeAmount = totalLiquidCash - upcomingFixedExpenses - remainingSavingsGoal - creditCardEscrowHeld;
  
  // สำรอง Buffer 5% เผื่อค่าใช้จ่ายฉุกเฉิน
  const discretionaryBuffer = Math.max(0, rawSafeAmount * 0.05);
  const totalSafeToSpend = Math.max(0, rawSafeAmount - discretionaryBuffer);
  
  const daily = daysRemainingInPeriod > 0 ? totalSafeToSpend / daysRemainingInPeriod : 0;

  return {
    totalSafeToSpend: Number(totalSafeToSpend.toFixed(2)),
    dailySafeToSpend: Number(daily.toFixed(2)),
    discretionaryBuffer: Number(discretionaryBuffer.toFixed(2)),
    remainingSavingsGoal: Number(remainingSavingsGoal.toFixed(2)),
  };
}

export interface ForecastDay {
  date: string;
  projectedBalance: number;
  scheduledInflows: number;
  scheduledOutflows: number;
  isOverdraftHazard: boolean;
  notes: string[];
}

/**
 * ประเมินกระแสเงินสดคงเหลือล่วงหน้า (Predictive Cash Flow Forecast)
 */
export function generateCashFlowForecast(
  startingBalance: number,
  scheduledTransactions: UpcomingObligation[],
  avgDailyDiscretionarySpend: number,
  forecastDays: number = 30
): ForecastDay[] {
  const forecast: ForecastDay[] = [];
  let currentBalance = startingBalance;
  const today = new Date();

  for (let i = 0; i < forecastDays; i++) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + i);
    const dateStr = targetDate.toISOString().split('T')[0];

    const dayObligations = scheduledTransactions.filter(
      (tx) => tx.dueDate.split('T')[0] === dateStr
    );
    
    const inflows = dayObligations
      .filter((o) => o.amount > 0)
      .reduce((sum, o) => sum + o.amount, 0);

    const outflows = dayObligations
      .filter((o) => o.amount < 0)
      .reduce((sum, o) => sum + Math.abs(o.amount), 0);

    const notes: string[] = [];
    dayObligations.forEach(o => {
      notes.push(`${o.name} (${o.amount > 0 ? '+' : ''}${o.amount.toLocaleString()} ฿)`);
    });

    // ปรับลดยอดตามค่ากินอยู่เฉลี่ยต่อวัน
    currentBalance = currentBalance + inflows - outflows - avgDailyDiscretionarySpend;

    forecast.push({
      date: dateStr,
      projectedBalance: Number(currentBalance.toFixed(2)),
      scheduledInflows: Number(inflows.toFixed(2)),
      scheduledOutflows: Number(outflows.toFixed(2)),
      isOverdraftHazard: currentBalance < 0,
      notes,
    });
  }

  return forecast;
}

export interface HealthMetrics {
  operatingCashFlowRatio: number; // Income / Expense
  savingsRatePercentage: number;   // (Net Savings / Income) * 100
  runwayMonths: number;            // Liquid Balance / Monthly Burn Rate
  debtToIncomeRatio: number;       // Total Debt Payments / Total Income
}

/**
 * คำนวณดัชนีสุขภาพการเงิน (Financial Health Indicator Metrics)
 */
export function calculateHealthMetrics(
  totalIncome: number,
  totalExpense: number,
  liquidBalance: number,
  monthlyFixedExpense: number,
  monthlyDebtObligations: number = 0
): HealthMetrics {
  const operatingRatio = totalExpense > 0 ? totalIncome / totalExpense : totalIncome > 0 ? 99 : 0;
  const netSavings = Math.max(0, totalIncome - totalExpense);
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;
  
  const baselineMonthlyBurn = totalExpense > 0 ? totalExpense : monthlyFixedExpense;
  const runway = baselineMonthlyBurn > 0 ? liquidBalance / baselineMonthlyBurn : 99;
  const debtRatio = totalIncome > 0 ? (monthlyDebtObligations / totalIncome) * 100 : 0;

  return {
    operatingCashFlowRatio: Number(operatingRatio.toFixed(2)),
    savingsRatePercentage: Number(savingsRate.toFixed(1)),
    runwayMonths: Number(runway.toFixed(1)),
    debtToIncomeRatio: Number(debtRatio.toFixed(1)),
  };
}

export interface SpikeDay {
  date: string;
  amount: number;
  multiplierOfAverage: number;
}

/**
 * ตรวจจับวันที่มียอดใช้จ่ายพุ่งสูงผิดปกติ (Spike Days)
 */
export function detectSpikeDays(
  dailyExpenses: { date: string; amount: number }[],
  thresholdMultiplier: number = 2.0
): SpikeDay[] {
  if (dailyExpenses.length === 0) return [];
  
  const total = dailyExpenses.reduce((sum, item) => sum + item.amount, 0);
  const avgDaily = total / dailyExpenses.length;
  
  if (avgDaily <= 0) return [];

  return dailyExpenses
    .filter(item => item.amount >= avgDaily * thresholdMultiplier)
    .map(item => ({
      date: item.date,
      amount: item.amount,
      multiplierOfAverage: Number((item.amount / avgDaily).toFixed(1)),
    }));
}

/**
 * คำนวณความเสี่ยงเงินไม่พอตัดบิลรายบัญชี (Account Overdraft Risk)
 */
export function checkAccountOverdraftRisk(
  accountBalance: number,
  upcomingBillsForAccount: UpcomingObligation[],
  safetyThreshold: number = 2000
): { isHazard: boolean; shortfallAmount: number; criticalDate?: string } {
  let runningBalance = accountBalance;
  for (const bill of upcomingBillsForAccount) {
    runningBalance += bill.amount; // bill.amount is negative for outflows
    if (runningBalance < safetyThreshold) {
      return {
        isHazard: true,
        shortfallAmount: Math.abs(safetyThreshold - runningBalance),
        criticalDate: bill.dueDate,
      };
    }
  }
  return { isHazard: false, shortfallAmount: 0 };
}
