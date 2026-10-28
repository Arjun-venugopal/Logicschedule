"use client";

import React from "react";
import {
  Trophy,
  Medal,
  IndianRupee,
  Users,
  CheckCircle2,
  AlertCircle,
  Download,
  ArrowUpRight,
  TrendingUp,
  Percent,
} from "lucide-react";

export interface SalespersonRankingItem {
  rank: number;
  name: string;
  collectedAmount: number;
  closingsCount?: number;
  closingsRevenue?: number;
  balanceCompletionsCount?: number;
  balanceCompletionsRevenue?: number;
  enrolledStudents: number;
  successfulPaymentsCount: number;
  pendingAmount: number;
  overdueAmount: number;
  collectionPercentage: number;
  periodCollectionRate: number;
  totalCourseFee: number;
  totalAmountPaid: number;
}

interface SalespersonLeaderboardProps {
  rankings: SalespersonRankingItem[];
  selectedMonthName: string;
  onSelectSalespersonForPending: (salespersonName: string) => void;
  onExportCsv: () => void;
}

export function SalespersonLeaderboard({
  rankings = [],
  selectedMonthName,
  onSelectSalespersonForPending,
  onExportCsv,
}: SalespersonLeaderboardProps) {
  const topThree = rankings.slice(0, 3);

  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1:
        return (
          <span className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center font-extrabold text-xs shadow-sm shadow-amber-500/20">
            🥇 1
          </span>
        );
      case 2:
        return (
          <span className="w-7 h-7 rounded-full bg-slate-300/20 text-slate-300 border border-slate-300/40 flex items-center justify-center font-extrabold text-xs shadow-sm">
            🥈 2
          </span>
        );
      case 3:
        return (
          <span className="w-7 h-7 rounded-full bg-amber-700/20 text-amber-600 border border-amber-700/40 flex items-center justify-center font-extrabold text-xs shadow-sm">
            🥉 3
          </span>
        );
      default:
        return (
          <span className="w-6 h-6 rounded-full bg-neutral-800 text-neutral-400 flex items-center justify-center font-bold text-xs">
            #{rank}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-900/90 p-4 sm:p-5 rounded-2xl border border-neutral-800 shadow-lg">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            Salesperson Performance Ranking
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Ranked strictly by actual payments collected in <span className="text-amber-400 font-semibold">{selectedMonthName}</span> (not theoretical enrollment values)
          </p>
        </div>

        <button
          onClick={onExportCsv}
          className="px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 text-neutral-200 hover:text-white text-xs font-semibold flex items-center gap-2 transition-colors self-start sm:self-auto shadow-sm"
        >
          <Download className="w-4 h-4 text-amber-400" />
          Export Leaderboard CSV
        </button>
      </div>

      {/* Podium Cards for Top 3 */}
      {topThree.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {topThree.map((item, idx) => {
            const isFirst = item.rank === 1;
            const isSecond = item.rank === 2;
            const isThird = item.rank === 3;

            return (
              <div
                key={item.name}
                className={`p-5 rounded-2xl border relative overflow-hidden transition-all shadow-xl flex flex-col justify-between ${
                  isFirst
                    ? "bg-gradient-to-b from-amber-500/15 via-neutral-900 to-neutral-900 border-amber-500/40 md:-translate-y-1"
                    : isSecond
                    ? "bg-gradient-to-b from-slate-400/10 via-neutral-900 to-neutral-900 border-slate-400/30"
                    : "bg-gradient-to-b from-amber-700/10 via-neutral-900 to-neutral-900 border-amber-700/30"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getRankBadge(item.rank)}
                      <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                        {isFirst ? "1st Place (Top Closer)" : isSecond ? "2nd Place" : "3rd Place"}
                      </span>
                    </div>
                    {isFirst && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-black">
                        LEADER
                      </span>
                    )}
                  </div>

                  <h3 className="text-base sm:text-lg font-extrabold text-white mt-3 truncate">
                    {item.name}
                  </h3>

                  <div className="mt-3 p-3 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-1.5">
                    <span className="text-[10px] text-neutral-400 font-medium block">
                      Actual Collected ({selectedMonthName})
                    </span>
                    <span className="text-xl sm:text-2xl font-black text-emerald-400 block">
                      ₹{item.collectedAmount.toLocaleString("en-IN")}
                    </span>
                    <span className="text-[11px] text-neutral-400 block">
                      {item.successfulPaymentsCount} successful transactions
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div className="p-2 rounded-lg bg-neutral-950/50 border border-neutral-850">
                      <span className="text-[10px] text-neutral-500 block">Closings Credited</span>
                      <span className="font-bold text-amber-400">{item.closingsCount ?? item.enrolledStudents}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-neutral-950/50 border border-neutral-850">
                      <span className="text-[10px] text-neutral-500 block">Balances Settled</span>
                      <span className="font-bold text-emerald-400">{item.balanceCompletionsCount ?? 0}</span>
                    </div>
                  </div>

                  {item.overdueAmount > 0 && (
                    <div className="mt-2.5 text-[11px] text-red-400 font-semibold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Pending Due: ₹{item.overdueAmount.toLocaleString("en-IN")}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => onSelectSalespersonForPending(item.name)}
                  className="mt-4 w-full py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-neutral-700/60"
                >
                  View Outstanding Receivables <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Full Leaderboard Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-5 py-3.5 border-b border-neutral-800 bg-neutral-950/40 flex items-center justify-between">
          <h3 className="text-xs sm:text-sm font-bold text-white">
            Complete Rankings ({rankings.length} Sales Representatives)
          </h3>
          <span className="text-[11px] text-neutral-400">
            Sorted by Collected ₹ (Highest to Lowest)
          </span>
        </div>

        {rankings.length === 0 ? (
          <div className="py-16 text-center text-neutral-500 text-xs">
            <Trophy className="w-8 h-8 mx-auto mb-2 text-neutral-700" />
            No salesperson collection records found for the selected period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-950/60 text-neutral-400 text-[11px] uppercase tracking-wider font-semibold">
                  <th className="px-4 py-3.5">Rank</th>
                  <th className="px-4 py-3.5">Salesperson</th>
                  <th className="px-4 py-3.5">Collected ({selectedMonthName})</th>
                  <th className="px-4 py-3.5">Closings ({selectedMonthName})</th>
                  <th className="px-4 py-3.5">Balances Settled</th>
                  <th className="px-4 py-3.5">Transactions</th>
                  <th className="px-4 py-3.5">Total Pending</th>
                  <th className="px-4 py-3.5">Overdue Amount</th>
                  <th className="px-4 py-3.5">Recovery %</th>
                  <th className="px-4 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {rankings.map((sp) => {
                  return (
                    <tr
                      key={sp.name}
                      className="hover:bg-neutral-800/40 transition-colors"
                    >
                      <td className="px-4 py-3.5">
                        {getRankBadge(sp.rank)}
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="font-bold text-white block">
                          {sp.name}
                        </span>
                        <span className="text-[10px] text-neutral-500">
                          Total Course Value: ₹{sp.totalCourseFee.toLocaleString("en-IN")}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="text-emerald-400 font-extrabold text-sm block">
                          ₹{sp.collectedAmount.toLocaleString("en-IN")}
                        </span>
                        <span className="text-[10px] text-neutral-400">
                          All-time: ₹{sp.totalAmountPaid.toLocaleString("en-IN")}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          {sp.closingsCount ?? sp.enrolledStudents} Closed
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {sp.balanceCompletionsCount ?? 0} Settled
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-neutral-800 text-sky-400 border border-neutral-700">
                          {sp.successfulPaymentsCount} paid
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="text-amber-400 font-semibold">
                          ₹{sp.pendingAmount.toLocaleString("en-IN")}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        {sp.overdueAmount > 0 ? (
                          <span className="text-red-400 font-bold flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            ₹{sp.overdueAmount.toLocaleString("en-IN")}
                          </span>
                        ) : (
                          <span className="text-emerald-400 text-xs font-semibold">
                            Zero Due
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="space-y-1 w-28">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-neutral-400">Rate</span>
                            <span className="text-emerald-400 font-bold">{sp.collectionPercentage}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${Math.min(100, sp.collectionPercentage)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => onSelectSalespersonForPending(sp.name)}
                          className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                        >
                          Pending Receivables <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

