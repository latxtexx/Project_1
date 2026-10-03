'use client';

import React, { useState, useMemo } from 'react';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  ShieldCheck, 
  AlertTriangle, 
  Wallet, 
  Calendar,
  Clock,
  PieChart as PieIcon,
  PlusCircle,
  Zap,
  CheckCircle2
} from 'lucide-react';
import { 
  calculateSafeToSpend, 
  generateCashFlowForecast, 
  calculateHealthMetrics,
  detectSpikeDays,
  checkAccountOverdraftRisk
} from '../../lib/analytics/cashflow';
import { Account, Transaction, UpcomingObligation, Category } from '../../types/finance';

export default function DashboardPage() {
  const [horizon, setHorizon] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  // Realistic mock state conforming to types
  const accounts: Account[] = [
    { id: 'acc-1', userId: 'usr-1', name: 'KBANK เงินเดือน', type: 'bank', currency: 'THB', currentBalance: 68500, isLiquid: true, isActive: true, createdAt: '', updatedAt: '' },
    { id: 'acc-2', userId: 'usr-1', name: 'เงินสดในกระเป๋า', type: 'cash', currency: 'THB', currentBalance: 4200, isLiquid: true, isActive: true, createdAt: '', updatedAt: '' },
    { id: 'acc-3', userId: 'usr-1', name: 'บัตรเครดิต KTC Visa', type: 'credit_card', currency: 'THB', currentBalance: -18200, creditLimit: 50000, paymentDueDay: 25, isLiquid: false, isActive: true, createdAt: '', updatedAt: '' },
    { id: 'acc-4', userId: 'usr-1', name: 'Dime! ออมทรัพย์', type: 'savings', currency: 'THB', currentBalance: 52700, isLiquid: true, isActive: true, createdAt: '', updatedAt: '' }
  ];

  const upcomingBills: UpcomingObligation[] = [
    { id: 'up-1', name: 'ค่าเช่าคอนโด', amount: -12000, dueDate: '2026-10-05', accountId: 'acc-1' },
    { id: 'up-2', name: 'ค่าน้ำ-ไฟ-เน็ต', amount: -2400, dueDate: '2026-10-12', accountId: 'acc-1' },
    { id: 'up-3', name: 'ชำระหนี้บัตรเครดิต KTC', amount: -18200, dueDate: '2026-10-25', accountId: 'acc-1', isCreditCardSettlement: true }
  ];

  const totalLiquid = accounts.filter(a => a.isLiquid).reduce((sum, a) => sum + a.currentBalance, 0);
  const ccEscrow = Math.abs(accounts.find(a => a.type === 'credit_card')?.currentBalance || 0);

  // Compute Safe-to-Spend
  const safeToSpend = useMemo(() => {
    return calculateSafeToSpend({
      totalLiquidCash: totalLiquid,
      upcomingFixedExpenses: 14400, // ค่าเช่า + ค่าน้ำไฟ
      monthlySavingsTarget: 10000,
      accumulatedSavings: 5000,
      daysRemainingInPeriod: 28,
      creditCardEscrowHeld: ccEscrow
    });
  }, [totalLiquid, ccEscrow]);

  // Compute Forecast
  const forecast = useMemo(() => {
    return generateCashFlowForecast(totalLiquid, upcomingBills, 400, 30);
  }, [totalLiquid, upcomingBills]);

  // Health Metrics
  const health = useMemo(() => {
    return calculateHealthMetrics(55000, 5570, totalLiquid, 30000, 18200);
  }, [totalLiquid]);

  const overdraftCheck = checkAccountOverdraftRisk(
    accounts[0].currentBalance,
    upcomingBills.filter(b => b.accountId === accounts[0].id)
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
      {/* Top Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Financial Command Center</h1>
          <p className="text-slate-400 text-sm">การบริหารกระแสเงินสดและประเมินสภาพคล่องแบบเรียลไทม์</p>
        </div>
        
        {/* Time Horizon Switcher */}
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 self-start md:self-auto">
          {(['daily', 'weekly', 'monthly'] as const).map((view) => (
            <button
              key={view}
              onClick={() => setHorizon(view)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg capitalize transition-all ${
                horizon === view
                  ? 'bg-emerald-500 text-slate-950 shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {view} View
            </button>
          ))}
        </div>
      </header>

      {/* Financial Guardrail Alert */}
      <div className="my-4">
        {overdraftCheck.isHazard ? (
          <div className="p-4 rounded-2xl border bg-amber-950/40 border-amber-800/80 text-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-xs uppercase tracking-wider text-amber-400">Overdraft Hazard Alert</h4>
              <p className="text-xs text-amber-300/90 mt-0.5">
                ตรวจพบความเสี่ยงเงินในบัญชีหลักไม่พอตัดหนี้บัตรเครดิตในวันที่ {overdraftCheck.criticalDate} แนะนำให้โอนเงินสำรองจากบัญชีออมทรัพย์เข้ามาเติม
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl border bg-emerald-950/30 border-emerald-800/40 text-emerald-200 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-xs uppercase tracking-wider text-emerald-400">Cash Guardrails Active & Healthy</h4>
              <p className="text-xs text-emerald-300/80 mt-0.5">กระแสเงินสดและสภาพคล่องมีความพร้อมครอบคลุมทุกรายจ่ายจนถึงสิ้นเดือน</p>
            </div>
          </div>
        )}
      </div>

      {/* Global Metrics Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 my-6">
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs uppercase font-medium">Liquid Cash</span>
            <Wallet className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold">฿{totalLiquid.toLocaleString()}</div>
          <span className="text-xs text-slate-400 flex items-center justify-between mt-1">
            <span>กันไว้จ่ายบัตร:</span>
            <span className="text-amber-400 font-semibold">฿{ccEscrow.toLocaleString()}</span>
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs uppercase font-medium">Safe-To-Spend Today</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">฿{Math.round(safeToSpend.dailySafeToSpend)}</div>
          <span className="text-xs text-slate-400 mt-1 block">
            เงินใช้ได้อิสระรวม: ฿{Math.round(safeToSpend.totalSafeToSpend).toLocaleString()}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs uppercase font-medium">Cash Runway</span>
            <Calendar className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold">{health.runwayMonths} <span className="text-sm font-normal text-slate-400">เดือน</span></div>
          <span className="text-xs text-cyan-400 mt-1 block">กรณีไม่มีรายได้เพิ่ม</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs uppercase font-medium">Savings Rate</span>
            <ArrowUpRight className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold">{health.savingsRatePercentage}%</div>
          <span className="text-xs text-slate-400 mt-1 block">OCF Ratio: {health.operatingCashFlowRatio}x</span>
        </div>
      </section>

      {/* Main Horizon Section */}
      <section className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <h3 className="text-sm font-semibold uppercase text-slate-300 mb-4">
          {horizon === 'daily' && 'Daily Safe-to-Spend & Predictive Projection'}
          {horizon === 'weekly' && 'Weekly Trends & Spike Day Analysis'}
          {horizon === 'monthly' && 'Monthly Income vs Expense & Balance Sheet'}
        </h3>
        <p className="text-xs text-slate-400">
          พยากรณ์เงินสด 30 วันล่วงหน้าเริ่มต้นที่ ฿{forecast[0]?.projectedBalance.toLocaleString()} สิ้นสุดที่ ฿{forecast[forecast.length - 1]?.projectedBalance.toLocaleString()}
        </p>
      </section>
    </div>
  );
}
