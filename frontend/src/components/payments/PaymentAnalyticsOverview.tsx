"use client";

import React from "react";
import {
  IndianRupee,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Clock,
  CheckCircle2,
  Calendar,
  Trophy,
  ArrowUpRight,
  ShieldAlert,
  CreditCard,
  Users,
} from "lucide-react";

interface PaymentAnalyticsOverviewProps {
  kpis: {
    totalFeesCollected: number;
    pendingAmount: number;
    dueAmount: number;
    totalExpectedCollection: number;
    numberOfPaymentsReceived: number;
    monthlyGrowthPercentage: number;
    prevMonthCollected: number;
    closingsCount?: number;
    closingsRevenue?: number;
    balanceCompletedCount?: number;
    balanceCompletedRevenue?: number;
    paidCount: number;
    partiallyPaidCount: number;
    dueCount: number;
    overdueCount: number;
    upcomingCount: number;
    totalStudentsWithFee: number;
    periodLabel: string;
    targetMonthKey?: string;
  };
  monthlyTrend: Array<{
    monthKey: string;
    monthName: string;
    month: number;
    year: number;
    collected: number;
    txCount: number;
    pending: number;
  }>;
  salespersonRanking: Array<any>;
  onNavigateToLeaderboard: () => void;
  onNavigateToPending: () => void;
  onNavigateToAll: () => void;
}

export function PaymentAnalyticsOverview({
  kpis,
  monthlyTrend = [],
  salespersonRanking = [],
  onNavigateToLeaderboard,
  onNavigateToPending,
  onNavigateToAll,
}: PaymentAnalyticsOverviewProps) {
  const totalCollected = Number(kpis.totalFeesCollected || 0);
  const pendingAmount = Number(kpis.pendingAmount || 0);
  const dueAmount = Number(kpis.dueAmount || 0);
  const expectedCollection = Number(kpis.totalExpectedCollection || (totalCollected + dueAmount));
  const txCount = Number(kpis.numberOfPaymentsReceived || 0);
  const growth = Number(kpis.monthlyGrowthPercentage || 0);
  const prevCollected = Number(kpis.prevMonthCollected || 0);

  const totalFeeUniverse = totalCollected + pendingAmount;
  const collectionRate = totalFeeUniverse > 0
    ? Math.min(100, Math.round((totalCollected / totalFeeUniverse) * 100))
    : 0;

  // Max collection in 6 months for chart scaling
  const maxTrendCollected = Math.max(
    ...monthlyTrend.map((t) => t.collected),
    1
  );

  const topPerformer = salespersonRanking && salespersonRanking.length > 0 ? salespersonRanking[0] : null;

  return (
    <div className="space-y-6">
      {/* 6 Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 sm:gap-4">
        {/* 1. Total Fees Collected */}
        <div className="p-4 sm:p-5 rounded-2xl bg-neutral-900/90 border border-neutral-800 space-y-2 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-400">Total Collected</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-lg sm:text-2xl font-extrabold text-white">
              ₹{totalCollected.toLocaleString("en-IN")}
            </p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span
                className={`text-[10px] sm:text-[11px] px-1.5 py-0.5 rounded-md font-bold flex items-center gap-1 ${
                  growth >= 0
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                    : "bg-rose-500/15 text-rose-400 border border-rose-500/20"
                }`}
              >
                {growth >= 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {growth >= 0 ? `+${growth}%` : `${growth}%`} MoM
              </span>
              <span className="text-[10px] text-neutral-500 block truncate">
                Prev: ₹{prevCollected.toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        </div>

        {/* 2. Closings Credited This Month */}
        <div
          onClick={onNavigateToLeaderboard}
          className="p-4 sm:p-5 rounded-2xl bg-neutral-900/90 border border-neutral-800 hover:border-amber-500/40 cursor-pointer transition-all space-y-2 flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-400">Closings Credited</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-lg sm:text-2xl font-extrabold text-amber-400">
              {Number(kpis.closingsCount || 0)} Students
            </p>
            <p className="text-[11px] text-neutral-400 font-medium mt-1 flex items-center gap-1">
              ₹{Number(kpis.closingsRevenue || 0).toLocaleString("en-IN")} closing fees
              <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-amber-400" />
            </p>
          </div>
        </div>

        {/* 3. Balances Completed This Month */}
        <div
          onClick={onNavigateToAll}
          className="p-4 sm:p-5 rounded-2xl bg-neutral-900/90 border border-neutral-800 hover:border-emerald-500/40 cursor-pointer transition-all space-y-2 flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-400">Balances Completed</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-lg sm:text-2xl font-extrabold text-emerald-400">
              {Number(kpis.balanceCompletedCount || 0)} Settled
            </p>
            <p className="text-[11px] text-neutral-400 font-medium mt-1 flex items-center gap-1">
              ₹{Number(kpis.balanceCompletedRevenue || 0).toLocaleString("en-IN")} collected
              <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-emerald-400" />
            </p>
          </div>
        </div>

        {/* 4. Pending Amount */}
        <div
          onClick={onNavigateToPending}
          className="p-4 sm:p-5 rounded-2xl bg-neutral-900/90 border border-neutral-800 hover:border-amber-500/40 cursor-pointer transition-all space-y-2 flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-400">Total Pending</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-lg sm:text-2xl font-extrabold text-amber-400">
              ₹{pendingAmount.toLocaleString("en-IN")}
            </p>
            <p className="text-[11px] text-neutral-400 font-medium mt-1 flex items-center gap-1">
              Unpaid course balances
              <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-amber-400" />
            </p>
          </div>
        </div>

        {/* 5. Due & Overdue Amount */}
        <div
          onClick={onNavigateToPending}
          className="p-4 sm:p-5 rounded-2xl bg-neutral-900/90 border border-neutral-800 hover:border-red-500/40 cursor-pointer transition-all space-y-2 flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-400">Due / Overdue</span>
            <div className="w-8 h-8 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 group-hover:scale-105 transition-transform">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-lg sm:text-2xl font-extrabold text-red-400">
              ₹{dueAmount.toLocaleString("en-IN")}
            </p>
            <p className="text-[11px] text-red-400/90 font-medium mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {kpis.dueCount} students at due mark
            </p>
          </div>
        </div>

        {/* 6. Total Expected Collection */}
        <div className="p-4 sm:p-5 rounded-2xl bg-neutral-900/90 border border-neutral-800 space-y-2 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-400">Expected Total</span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-lg sm:text-2xl font-extrabold text-purple-300">
              ₹{expectedCollection.toLocaleString("en-IN")}
            </p>
            <p className="text-[11px] text-neutral-400 font-medium mt-1">
              {txCount} payments received
            </p>
          </div>
        </div>
      </div>

      {/* Charts and Visual Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: 6-Month Collection Trend Bar Chart */}
        <div className="lg:col-span-2 p-5 sm:p-6 rounded-2xl bg-neutral-900 border border-neutral-800 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800 pb-3">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                6-Month Payment Collections Trend
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Actual payments received month by month (installments + full admissions)
              </p>
            </div>
            <button
              onClick={onNavigateToAll}
              className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 self-start sm:self-auto"
            >
              View All Records <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Bar Chart Visualization */}
          <div className="pt-4">
            {monthlyTrend.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-neutral-500 text-xs">
                No historical payment data recorded yet.
              </div>
            ) : (
              <div className="h-56 flex items-end justify-between gap-2 sm:gap-4 px-2 pt-6 pb-2 border-b border-neutral-800/80">
                {monthlyTrend.map((item, idx) => {
                  const heightPercent = maxTrendCollected > 0
                    ? Math.max(8, Math.round((item.collected / maxTrendCollected) * 100))
                    : 8;
                  const isCurrent = idx === monthlyTrend.length - 1;

                  return (
                    <div
                      key={item.monthKey}
                      className="flex-1 flex flex-col items-center h-full justify-end group relative"
                    >
                      {/* Tooltip on hover */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-12 z-20 pointer-events-none bg-neutral-950 border border-neutral-700 px-2.5 py-1.5 rounded-lg shadow-xl text-center whitespace-nowrap">
                        <span className="text-[10px] text-neutral-400 block font-medium">
                          {item.monthName}
                        </span>
                        <span className="text-xs font-bold text-emerald-400">
                          ₹{item.collected.toLocaleString("en-IN")}
                        </span>
                        <span className="text-[10px] text-neutral-500 block">
                          {item.txCount} payments
                        </span>
                      </div>

                      {/* Rupee Label above bar */}
                      <span className="text-[10px] font-bold text-neutral-300 mb-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                        ₹{(item.collected / 1000).toFixed(item.collected >= 10000 ? 0 : 1)}k
                      </span>

                      {/* Bar */}
                      <div
                        className={`w-full max-w-[48px] rounded-t-xl transition-all duration-300 ${
                          isCurrent
                            ? "bg-gradient-to-t from-emerald-600 to-emerald-400 shadow-lg shadow-emerald-500/20"
                            : "bg-gradient-to-t from-neutral-800 to-neutral-700 group-hover:from-emerald-700/60 group-hover:to-emerald-500/60"
                        }`}
                        style={{ height: `${heightPercent}%` }}
                      />

                      {/* Month label */}
                      <span
                        className={`text-[11px] font-semibold mt-2 truncate max-w-full text-center ${
                          isCurrent ? "text-amber-400 font-bold" : "text-neutral-400"
                        }`}
                      >
                        {item.monthName}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-3">
              <span>Showing last 6 rolling calendar months</span>
              <span className="text-emerald-400 font-medium">
                Highlighted: Selected Period
              </span>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Fee Recovery & Student Distribution */}
        <div className="p-5 sm:p-6 rounded-2xl bg-neutral-900 border border-neutral-800 shadow-xl space-y-4 flex flex-col justify-between">
          <div>
            <div className="border-b border-neutral-800 pb-3">
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-sky-400" />
                Fee Recovery & Student Status
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Breakdown of students across payment phases
              </p>
            </div>

            {/* Split Progress Bar */}
            <div className="mt-5 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-neutral-300">Recovery Breakdown</span>
                <span className="font-bold text-emerald-400">{collectionRate}% Paid</span>
              </div>
              <div className="w-full h-3 rounded-full bg-neutral-800 overflow-hidden flex">
                <div
                  className="bg-emerald-500 h-full transition-all"
                  style={{ width: `${collectionRate}%` }}
                  title={`Collected: ${collectionRate}%`}
                />
                <div
                  className="bg-amber-500 h-full transition-all"
                  style={{ width: `${Math.max(0, 100 - collectionRate)}%` }}
                  title={`Pending: ${100 - collectionRate}%`}
                />
              </div>
            </div>

            {/* Status Breakdown List */}
            <div className="mt-5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-950/60 border border-neutral-800/80">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <span className="text-neutral-300 font-medium">Fully Paid Students</span>
                </div>
                <span className="font-bold text-white">{kpis.paidCount}</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-950/60 border border-neutral-800/80">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                  <span className="text-neutral-300 font-medium">Partially Paid Students</span>
                </div>
                <span className="font-bold text-sky-400">{kpis.partiallyPaidCount}</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-950/60 border border-neutral-800/80">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span className="text-neutral-300 font-medium">Upcoming Milestone Due</span>
                </div>
                <span className="font-bold text-amber-400">{kpis.upcomingCount}</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-950/60 border border-neutral-800/80">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                  <span className="text-neutral-300 font-medium">Overdue / Action Needed</span>
                </div>
                <span className="font-bold text-red-400">{kpis.overdueCount}</span>
              </div>
            </div>
          </div>

          {/* Top Performer Card Teaser */}
          {topPerformer && (
            <div className="pt-3 border-t border-neutral-800">
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-neutral-950 to-neutral-950 border border-amber-500/20 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">
                      Top Sales Performer
                    </span>
                    <span className="text-xs font-bold text-white">
                      {topPerformer.name}
                    </span>
                  </div>
                </div>
                <button
                  onClick={onNavigateToLeaderboard}
                  className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1 transition-colors"
                >
                  Leaderboard <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

