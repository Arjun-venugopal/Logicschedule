"use client";

import React, { useState, useMemo } from "react";
import {
  CreditCard,
  History,
  Search,
  UserCheck,
  AlertCircle,
  Phone,
  MessageSquare,
  Clock,
  Download,
  Calendar,
  CheckCircle2,
  Mail,
  User,
} from "lucide-react";
import { format } from "date-fns";

export interface PendingStudentItem {
  paymentId: string;
  studentId: string;
  studentName: string;
  parentName: string;
  contactNumber: string;
  email: string;
  courseName: string;
  batchId?: string;
  courseFee: number;
  discount: number;
  totalPaid: number;
  remainingBalance: number;
  monthlyInstallment: number;
  nextPaymentDueDate: string;
  overdueDays: number;
  paymentStatus: string;
  lastPaymentDate: string | null;
  salesperson: string;
  closingDate?: string;
  closingMonth?: string;
  balanceCompletedDate?: string | null;
  balanceCompletedMonth?: string | null;
  isClosedInPeriod?: boolean;
  isBalanceCompletedInPeriod?: boolean;
  periodCollected?: number;
  completedClasses: number;
  assignedClasses: number;
  dueAfterClasses: number;
  paymentHistory?: any[];
}

interface SalespersonPendingReportProps {
  pendingStudents: PendingStudentItem[];
  salesExecutives: string[];
  selectedSalesperson: string;
  onSelectSalesperson: (name: string) => void;
  onRecordPayment: (payment: any) => void;
  onViewHistory: (payment: any) => void;
  onExportCsv: () => void;
}

export function SalespersonPendingReport({
  pendingStudents = [],
  salesExecutives = [],
  selectedSalesperson = "all",
  onSelectSalesperson,
  onRecordPayment,
  onViewHistory,
  onExportCsv,
}: SalespersonPendingReportProps) {
  const [localSearch, setLocalSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "overdue" | "due">("all");

  // Calculate counts per salesperson
  const countsBySalesperson = useMemo(() => {
    const map = new Map<string, { count: number; pendingAmount: number; overdueAmount: number }>();
    for (const item of pendingStudents) {
      const sp = item.salesperson || "Unassigned";
      const curr = map.get(sp) || { count: 0, pendingAmount: 0, overdueAmount: 0 };
      curr.count++;
      curr.pendingAmount += item.remainingBalance;
      if (item.paymentStatus === "Due" || item.paymentStatus === "Overdue") {
        curr.overdueAmount += item.remainingBalance;
      }
      map.set(sp, curr);
    }
    return map;
  }, [pendingStudents]);

  // Filter students based on selected salesperson, local search, and status
  const filteredStudents = useMemo(() => {
    return pendingStudents.filter((item) => {
      // Salesperson filter
      if (selectedSalesperson !== "all" && item.salesperson.toLowerCase() !== selectedSalesperson.toLowerCase()) {
        return false;
      }

      // Status filter
      if (statusFilter === "overdue" && item.paymentStatus !== "Overdue") {
        return false;
      }
      if (statusFilter === "due" && item.paymentStatus !== "Due" && item.paymentStatus !== "Overdue") {
        return false;
      }

      // Search filter
      if (localSearch) {
        const q = localSearch.toLowerCase();
        const matchesName = item.studentName.toLowerCase().includes(q);
        const matchesParent = item.parentName.toLowerCase().includes(q);
        const matchesPhone = item.contactNumber.toLowerCase().includes(q);
        const matchesEmail = item.email.toLowerCase().includes(q);
        const matchesCourse = item.courseName.toLowerCase().includes(q);
        const matchesSales = item.salesperson.toLowerCase().includes(q);
        if (!matchesName && !matchesParent && !matchesPhone && !matchesEmail && !matchesCourse && !matchesSales) {
          return false;
        }
      }

      return true;
    });
  }, [pendingStudents, selectedSalesperson, statusFilter, localSearch]);

  const totalFilteredPending = filteredStudents.reduce((acc, s) => acc + s.remainingBalance, 0);
  const totalFilteredOverdue = filteredStudents
    .filter((s) => s.paymentStatus === "Due" || s.paymentStatus === "Overdue")
    .reduce((acc, s) => acc + s.remainingBalance, 0);

  const getStatusBadge = (status: string, overdueDays: number) => {
    if (status === "Overdue" || overdueDays > 0) {
      return (
        <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          Overdue ({overdueDays > 0 ? `${overdueDays}d` : "Past Due"})
        </span>
      );
    }
    if (status === "Due") {
      return (
        <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Milestone Due
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner and Summary */}
      <div className="bg-neutral-900/90 p-4 sm:p-5 rounded-2xl border border-neutral-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-amber-400" />
              Salesperson Outstanding Receivables Report
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              Detailed tracking of students with unpaid course balances, parent contacts, installment schedules, and overdue days
            </p>
          </div>

          <button
            onClick={onExportCsv}
            className="px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 text-neutral-200 hover:text-white text-xs font-semibold flex items-center gap-2 transition-colors self-start sm:self-auto shadow-sm"
          >
            <Download className="w-4 h-4 text-amber-400" />
            Export Pending CSV
          </button>
        </div>

        {/* Salesperson Selector Pills */}
        <div className="space-y-2">
          <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block">
            Filter by Assigned Salesperson:
          </span>
          <div className="flex items-center gap-2 overflow-x-auto pb-1.5 custom-scrollbar text-xs">
            <button
              onClick={() => onSelectSalesperson("all")}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                selectedSalesperson === "all"
                  ? "bg-amber-500 text-black shadow-sm"
                  : "bg-neutral-800 text-neutral-300 hover:text-white"
              }`}
            >
              All Sales Representatives
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-neutral-900/40 text-current">
                {pendingStudents.length}
              </span>
            </button>

            {salesExecutives.map((se) => {
              const stat = countsBySalesperson.get(se);
              const count = stat ? stat.count : 0;
              const isSelected = selectedSalesperson.toLowerCase() === se.toLowerCase();

              return (
                <button
                  key={se}
                  onClick={() => onSelectSalesperson(se)}
                  className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-amber-500 text-black font-bold shadow-sm"
                      : "bg-neutral-800 text-neutral-300 hover:text-white"
                  }`}
                >
                  {se}
                  {count > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                        isSelected ? "bg-black/30 text-black" : "bg-neutral-700 text-amber-400"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sub-Filters: Search and Status toggle */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between pt-2 border-t border-neutral-800/80">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search student, parent name, mobile number, course..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-4 py-2 text-xs sm:text-sm text-white outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-400 font-medium">Show:</span>
            {(["all", "due", "overdue"] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold capitalize transition-colors ${
                  statusFilter === st
                    ? "bg-neutral-700 text-white font-bold"
                    : "bg-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                {st === "all" ? "All Pending" : st}
              </button>
            ))}
          </div>
        </div>

        {/* Quick summary badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
          <div className="p-3 rounded-xl bg-neutral-950/70 border border-neutral-800">
            <span className="text-neutral-500 block">Pending Students</span>
            <span className="text-base font-bold text-white mt-0.5 block">
              {filteredStudents.length} Students
            </span>
          </div>

          <div className="p-3 rounded-xl bg-neutral-950/70 border border-neutral-800">
            <span className="text-neutral-500 block">Total Outstanding Balance</span>
            <span className="text-base font-bold text-amber-400 mt-0.5 block">
              ₹{totalFilteredPending.toLocaleString("en-IN")}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-neutral-950/70 border border-neutral-800">
            <span className="text-neutral-500 block">Total Overdue / Due Amount</span>
            <span className="text-base font-bold text-red-400 mt-0.5 block">
              ₹{totalFilteredOverdue.toLocaleString("en-IN")}
            </span>
          </div>
        </div>
      </div>

      {/* Pending Receivables Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
        {filteredStudents.length === 0 ? (
          <div className="py-20 text-center text-neutral-500">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-500/50" />
            <p className="text-base font-semibold text-neutral-300">
              No outstanding receivables found
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              All students under this salesperson or filter criteria are fully paid up!
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-950/60 text-neutral-400 text-[11px] uppercase tracking-wider font-semibold">
                  <th className="px-4 py-3.5">Student & Course</th>
                  <th className="px-4 py-3.5">Parent & Contact</th>
                  <th className="px-4 py-3.5">Fee & Paid</th>
                  <th className="px-4 py-3.5">Remaining Balance</th>
                  <th className="px-4 py-3.5">Installment & Due</th>
                  <th className="px-4 py-3.5">Overdue Status</th>
                  <th className="px-4 py-3.5">Last Payment</th>
                  <th className="px-4 py-3.5">Closer</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {filteredStudents.map((item) => {
                  const cleanPhone = (item.contactNumber || "").replace(/\D/g, "");
                  const waLink = cleanPhone ? `https://wa.me/${cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone}` : null;

                  return (
                    <tr
                      key={item.paymentId || item.studentId}
                      className="hover:bg-neutral-800/40 transition-colors"
                    >
                      {/* Student & Course */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          {item.studentName}
                        </div>
                        <span className="text-[11px] text-neutral-400 block mt-0.5">
                          {item.courseName}
                        </span>
                        <span className="text-[10px] text-neutral-500 font-medium">
                          {item.completedClasses} of {item.assignedClasses} classes completed
                        </span>
                      </td>

                      {/* Parent & Contact */}
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-neutral-200">
                          {item.parentName || "Parent"}
                        </div>
                        {item.contactNumber ? (
                          <div className="flex items-center gap-2 mt-1">
                            <a
                              href={`tel:${item.contactNumber}`}
                              className="text-neutral-400 hover:text-white text-xs flex items-center gap-1 font-mono transition-colors"
                              title="Call"
                            >
                              <Phone className="w-3 h-3 text-neutral-500" />
                              {item.contactNumber}
                            </a>
                            {waLink && (
                              <a
                                href={waLink}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1 rounded-md bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                                title="Chat on WhatsApp"
                              >
                                <MessageSquare className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-neutral-600 italic">No phone</span>
                        )}
                        {item.email && (
                          <span className="text-[10px] text-neutral-500 block truncate max-w-[150px]">
                            {item.email}
                          </span>
                        )}
                      </td>

                      {/* Fee & Paid */}
                      <td className="px-4 py-3.5">
                        <span className="text-white font-bold block">
                          ₹{item.courseFee.toLocaleString("en-IN")}
                        </span>
                        <span className="text-[11px] text-emerald-400 font-medium block">
                          Paid: ₹{item.totalPaid.toLocaleString("en-IN")}
                        </span>
                        {item.discount > 0 && (
                          <span className="text-[10px] text-neutral-500 block">
                            Disc: ₹{item.discount.toLocaleString("en-IN")}
                          </span>
                        )}
                      </td>

                      {/* Remaining Balance */}
                      <td className="px-4 py-3.5">
                        <span className="text-amber-400 font-black text-sm block">
                          ₹{item.remainingBalance.toLocaleString("en-IN")}
                        </span>
                        <span className="text-[10px] text-neutral-500">
                          Outstanding
                        </span>
                      </td>

                      {/* Installment & Due Date */}
                      <td className="px-4 py-3.5">
                        <span className="font-semibold text-neutral-200 block">
                          ₹{item.monthlyInstallment.toLocaleString("en-IN")}
                        </span>
                        <span className="text-[11px] text-neutral-400 block mt-0.5">
                          Due: {item.nextPaymentDueDate || `At Class ${item.dueAfterClasses}`}
                        </span>
                      </td>

                      {/* Overdue Status */}
                      <td className="px-4 py-3.5">
                        {getStatusBadge(item.paymentStatus, item.overdueDays)}
                      </td>

                      {/* Last Payment Date */}
                      <td className="px-4 py-3.5">
                        <span className="text-neutral-300 font-medium block">
                          {item.lastPaymentDate
                            ? format(new Date(item.lastPaymentDate), "dd MMM yyyy")
                            : "No previous payments"}
                        </span>
                      </td>

                      {/* Closer / Salesperson */}
                      <td className="px-4 py-3.5">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-800 text-neutral-300 border border-neutral-700 block max-w-max">
                          {item.salesperson}
                        </span>
                        {item.closingMonth && (
                          <span className="text-[10px] text-amber-400/90 font-medium block mt-1">
                            Closed: {item.closingMonth}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onRecordPayment(item)}
                            className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl flex items-center gap-1 transition-colors shadow-sm"
                            title="Record Payment"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            Collect
                          </button>
                          <button
                            onClick={() => onViewHistory(item)}
                            className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-xl transition-colors"
                            title="View Audit & Payment History"
                          >
                            <History className="w-4 h-4" />
                          </button>
                        </div>
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

