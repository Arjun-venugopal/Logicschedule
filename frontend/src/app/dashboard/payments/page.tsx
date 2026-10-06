"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard,
  Search,
  Filter,
  IndianRupee,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sliders,
  History,
  User,
  Plus,
  Pencil,
  Trash2,
  UserCheck,
  Calendar,
  X,
  Sparkles,
} from "lucide-react";
import { RecordPaymentModal } from "@/components/payments/RecordPaymentModal";
import { ConfigRulesModal } from "@/components/payments/ConfigRulesModal";
import { CreatePaymentModal } from "@/components/payments/CreatePaymentModal";
import { EditPaymentModal } from "@/components/payments/EditPaymentModal";
import { DeletePaymentConfirmModal } from "@/components/payments/DeletePaymentConfirmModal";
import { format } from "date-fns";

export default function PaymentsPage() {
  const [search, setSearch] = useState("");
  const [timeRangeFilter, setTimeRangeFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [salesFilter, setSalesFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("All");

  const [selectedPaymentForRecord, setSelectedPaymentForRecord] = useState<any>(null);
  const [selectedPaymentForHistory, setSelectedPaymentForHistory] = useState<any>(null);
  const [selectedPaymentForEdit, setSelectedPaymentForEdit] = useState<any>(null);
  const [selectedPaymentForDelete, setSelectedPaymentForDelete] = useState<any>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["payments", timeRangeFilter, salesFilter, statusFilter, search],
    queryFn: async () => {
      const params: any = {};
      if (timeRangeFilter !== "all") params.timeRange = timeRangeFilter;
      if (salesFilter !== "all") params.salesExecutive = salesFilter;
      if (statusFilter !== "All") params.status = statusFilter;
      if (search) params.search = search;
      const res = await api.get("/payments", { params });
      return res.data;
    },
    refetchInterval: 30_000,
  });

  const payments = data?.payments || [];
  const salesExecutives: string[] = data?.salesExecutives || [];
  const filteredKpis = data?.filteredKpis || data?.kpis || {
    totalCollected: 0,
    totalOutstanding: 0,
    dueCount: 0,
    upcomingCount: 0,
    paidCount: 0,
    overdueCount: 0,
    periodCollected: 0,
  };
  const overallKpis = data?.overallKpis || filteredKpis;

  const filteredPayments = useMemo(() => {
    return payments.filter((item: any) => {
      const sName = item.student?.name || item.studentName || "";
      const sPhone = item.student?.phone || item.student?.mobileNumber || "";
      const cName = item.batch?.subject || item.batch?.name || item.courseName || "";
      const closed = item.closedBy || item.salesExecutive || "";
      const query = search.toLowerCase();

      const matchesSearch =
        sName.toLowerCase().includes(query) ||
        sPhone.toLowerCase().includes(query) ||
        cName.toLowerCase().includes(query) ||
        closed.toLowerCase().includes(query);

      if (!matchesSearch) return false;

      if (salesFilter !== "all" && closed.toLowerCase() !== salesFilter.toLowerCase()) {
        return false;
      }

      if (statusFilter === "All") return true;
      if (statusFilter === "Due") return item.paymentStatus === "Due" || item.paymentStatus === "Overdue";
      return item.paymentStatus === statusFilter;
    });
  }, [payments, search, salesFilter, statusFilter]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Paid":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "Due":
        return "bg-red-500/10 text-red-400 border-red-500/20";
      case "Overdue":
        return "bg-rose-500/15 text-rose-300 border-rose-500/30";
      case "Upcoming":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "Partially Paid":
        return "bg-sky-500/10 text-sky-400 border-sky-500/20";
      default:
        return "bg-neutral-800 text-neutral-400 border-neutral-700";
    }
  };

  const getTimeRangeLabel = () => {
    switch (timeRangeFilter) {
      case "today":
        return "Today";
      case "week":
        return "This Week";
      case "month":
        return "This Month";
      default:
        return "All Time";
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5">
            <CreditCard className="w-6 h-6 text-amber-400" />
            Fees & Payment Management
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Track student admissions, partial payments, sales performance, and automated class completion triggers
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            onClick={() => setShowConfigModal(true)}
            className="px-3.5 py-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm"
          >
            <Sliders className="w-4 h-4 text-amber-400" />
            Due Rules
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-2 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Fee Record
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        <div className="p-4 sm:p-5 rounded-2xl bg-neutral-900/90 border border-neutral-800 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-400">
              {timeRangeFilter === "all" ? "Total Collected" : `${getTimeRangeLabel()} Collection`}
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-2xl font-extrabold text-white">
            ₹
            {Number(
              timeRangeFilter === "all"
                ? filteredKpis.totalCollected
                : (filteredKpis.periodCollected ?? filteredKpis.totalCollected)
            ).toLocaleString("en-IN")}
          </p>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-emerald-400/90 flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {timeRangeFilter === "all" ? "All collections received" : `In ${getTimeRangeLabel().toLowerCase()}`}
            </span>
            {timeRangeFilter !== "all" && (
              <span className="text-neutral-500 text-[10px]">
                Total: ₹{Number(overallKpis.totalCollected).toLocaleString("en-IN")}
              </span>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-neutral-900/90 border border-neutral-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-400">Outstanding Due</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-2xl font-extrabold text-amber-400">
            ₹{Number(filteredKpis.totalOutstanding).toLocaleString("en-IN")}
          </p>
          <span className="text-[11px] text-neutral-400 font-medium">
            Remaining uncollected balance
          </span>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-neutral-900/90 border border-neutral-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-400">Payment Due</span>
            <div className="w-8 h-8 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-2xl font-extrabold text-red-400">
            {filteredKpis.dueCount}
          </p>
          <span className="text-[11px] text-red-400/90 font-medium flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> Reached class due threshold
          </span>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-neutral-900/90 border border-neutral-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-400">Fully Paid Students</span>
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-2xl font-extrabold text-sky-400">
            {filteredKpis.paidCount}
          </p>
          <span className="text-[11px] text-neutral-400 font-medium">
            100% course fee completed
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-neutral-900/80 p-3.5 rounded-2xl border border-neutral-800 space-y-3">
        {/* Row 1: Time Filters & Sales Executive Filter */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Time Range Pills: Day - Week - Month - All */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar text-xs">
            <span className="text-neutral-400 text-xs font-semibold flex items-center gap-1.5 mr-1 shrink-0">
              <Calendar className="w-3.5 h-3.5 text-amber-400" /> Filter:
            </span>
            {[
              { id: "all", label: "All Time" },
              { id: "today", label: "Today (Day)" },
              { id: "week", label: "This Week" },
              { id: "month", label: "This Month" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTimeRangeFilter(t.id as any)}
                className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-colors ${
                  timeRangeFilter === t.id
                    ? "bg-amber-500 text-black font-bold shadow-sm"
                    : "bg-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Sales Person / Closed By Dropdown */}
          <div className="flex items-center gap-2 shrink-0">
            <UserCheck className="w-4 h-4 text-neutral-400 shrink-0" />
            <select
              value={salesFilter}
              onChange={(e) => setSalesFilter(e.target.value)}
              className="bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-amber-500 transition-colors"
            >
              <option value="all">All Sales Executives</option>
              {salesExecutives.map((se) => (
                <option key={se} value={se}>
                  Closed by: {se}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Search and Status Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between pt-2 border-t border-neutral-800/60">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student, mobile number, course, or sales person..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-4 py-2 text-xs sm:text-sm text-white outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          {/* Status Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar text-xs">
            {["All", "Due", "Upcoming", "Partially Paid", "Paid"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-colors ${
                  statusFilter === st
                    ? "bg-amber-500 text-black font-bold"
                    : "bg-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
        {isLoading ? (
          <div className="py-20 text-center text-neutral-500 text-sm">
            <div className="w-7 h-7 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading student payment records...
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="py-20 text-center text-neutral-500">
            <CreditCard className="w-10 h-10 mx-auto mb-3 text-neutral-700" />
            <p className="text-base font-semibold text-neutral-400">No payment records found</p>
            <p className="text-xs text-neutral-600 mt-1">
              Confirmed demo admissions or manually added fees will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-950/60 text-neutral-400 text-[11px] uppercase tracking-wider font-semibold">
                  <th className="px-4 py-3.5">Student</th>
                  <th className="px-4 py-3.5">Course / Batch</th>
                  <th className="px-4 py-3.5">Closed By</th>
                  <th className="px-4 py-3.5">Fee Overview</th>
                  <th className="px-4 py-3.5">Class Progress & Due Trigger</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {filteredPayments.map((p: any) => {
                  const studentName = p.student?.name || p.studentName || "Student";
                  const studentPhone = p.student?.phone || p.student?.mobileNumber || "";
                  const courseName = p.batch?.subject || p.batch?.name || p.courseName || "Course";
                  const closedByPerson = p.closedBy || p.salesExecutive || "Direct / Admin";
                  const total = Number(p.totalFee) || 0;
                  const paid = Number(p.amountPaid) || 0;
                  const remaining = Math.max(0, total - paid);

                  const completed = Number(p.completedClasses) || 0;
                  const assigned = Number(p.assignedClasses) || 15;
                  const dueAfter = Number(p.dueAfterClasses) || 5;

                  const progressPct = Math.min(100, Math.round((completed / assigned) * 100));
                  const duePct = Math.min(100, Math.round((dueAfter / assigned) * 100));

                  return (
                    <tr
                      key={p._id || p.id}
                      className="hover:bg-neutral-800/40 transition-colors"
                    >
                      {/* Student info */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          {studentName}
                        </div>
                        {studentPhone && (
                          <div className="text-[11px] text-neutral-400 mt-0.5">
                            {studentPhone}
                          </div>
                        )}
                        <span className="text-[10px] text-neutral-500 font-medium">
                          {p.paymentType || "Course Fee"}
                        </span>
                      </td>

                      {/* Course */}
                      <td className="px-4 py-3.5">
                        <span className="font-semibold text-neutral-200 block">
                          {courseName}
                        </span>
                        <span className="text-[11px] text-neutral-500">
                          {assigned} Total Classes
                        </span>
                      </td>

                      {/* Closed By (Sales Person) */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 font-medium text-neutral-200">
                          <UserCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate max-w-[130px]">{closedByPerson}</span>
                        </div>
                        <span className="text-[10px] text-neutral-500 block pl-5">
                          Sales Closer
                        </span>
                      </td>

                      {/* Fee Overview */}
                      <td className="px-4 py-3.5">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-bold">
                              ₹{total.toLocaleString("en-IN")}
                            </span>
                            <span className="text-[11px] text-emerald-400 font-semibold">
                              (Paid: ₹{paid.toLocaleString("en-IN")})
                            </span>
                          </div>
                          <div className="text-[11px]">
                            {remaining === 0 ? (
                              <span className="text-emerald-400 font-semibold">Zero Due</span>
                            ) : (
                              <span className="text-amber-400 font-bold">
                                Due: ₹{remaining.toLocaleString("en-IN")}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Class Progress & Trigger */}
                      <td className="px-4 py-3.5">
                        <div className="w-48 space-y-1.5">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-white font-semibold">
                              {completed} / {assigned} completed
                            </span>
                            <span className="text-amber-400 font-bold">
                              Due at {dueAfter} classes
                            </span>
                          </div>
                          {/* Progress bar with due milestone */}
                          <div className="relative w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all"
                              style={{ width: `${progressPct}%` }}
                            />
                            {/* Due marker indicator */}
                            <div
                              className="absolute top-0 bottom-0 w-1 bg-amber-400 z-10"
                              style={{ left: `${duePct}%` }}
                              title={`Payment due trigger at ${dueAfter} classes`}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`px-2.5 py-1 rounded-md text-xs font-bold border inline-flex items-center gap-1.5 ${getStatusBadge(
                            p.paymentStatus
                          )}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              p.paymentStatus === "Paid"
                                ? "bg-emerald-400"
                                : p.paymentStatus === "Due" || p.paymentStatus === "Overdue"
                                ? "bg-red-400"
                                : "bg-amber-400"
                            }`}
                          />
                          {p.paymentStatus}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {remaining > 0 && (
                            <button
                              onClick={() => setSelectedPaymentForRecord(p)}
                              className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl flex items-center gap-1 transition-colors shadow-sm"
                              title="Record Next Payment"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              Pay
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedPaymentForHistory(p)}
                            className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-xl transition-colors"
                            title="View Payment History"
                          >
                            <History className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setSelectedPaymentForEdit(p)}
                            className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-amber-400 rounded-xl transition-colors"
                            title="Edit Payment Details"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setSelectedPaymentForDelete(p)}
                            className="p-1.5 bg-neutral-800 hover:bg-red-950/60 text-neutral-400 hover:text-red-400 rounded-xl transition-colors"
                            title="Delete Payment Record"
                          >
                            <Trash2 className="w-4 h-4" />
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

      {/* Record Payment Modal */}
      {selectedPaymentForRecord && (
        <RecordPaymentModal
          isOpen={true}
          onClose={() => setSelectedPaymentForRecord(null)}
          payment={selectedPaymentForRecord}
        />
      )}

      {/* Config Rules Modal */}
      {showConfigModal && (
        <ConfigRulesModal
          isOpen={true}
          onClose={() => setShowConfigModal(false)}
        />
      )}

      {/* Create Payment Modal */}
      <CreatePaymentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />

      {/* Edit Payment Modal */}
      <EditPaymentModal
        isOpen={!!selectedPaymentForEdit}
        payment={selectedPaymentForEdit}
        onClose={() => setSelectedPaymentForEdit(null)}
      />

      {/* Delete Payment Confirmation Modal */}
      <DeletePaymentConfirmModal
        isOpen={!!selectedPaymentForDelete}
        payment={selectedPaymentForDelete}
        onClose={() => setSelectedPaymentForDelete(null)}
      />

      {/* Transaction History Drawer / Modal */}
      <AnimatePresence>
        {selectedPaymentForHistory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col overflow-hidden max-h-[88vh]"
            >
              <div className="flex items-center justify-between p-5 border-b border-neutral-800 bg-neutral-900/90 sticky top-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                    <History className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Payment Audit & History</h3>
                    <p className="text-xs text-neutral-400">
                      {selectedPaymentForHistory.student?.name || selectedPaymentForHistory.studentName}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPaymentForHistory(null)}
                  className="p-2 text-neutral-400 hover:text-white bg-neutral-800/60 rounded-xl"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4 custom-scrollbar flex-1">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-2.5 p-3.5 bg-neutral-950 border border-neutral-800 rounded-xl text-center text-xs">
                  <div>
                    <span className="text-neutral-500 block">Total Fee</span>
                    <span className="text-sm font-bold text-white mt-0.5 block">
                      ₹{Number(selectedPaymentForHistory.totalFee).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block">Total Paid</span>
                    <span className="text-sm font-bold text-emerald-400 mt-0.5 block">
                      ₹{Number(selectedPaymentForHistory.amountPaid).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block">Remaining Balance</span>
                    <span className="text-sm font-bold text-amber-400 mt-0.5 block">
                      ₹{Math.max(0, Number(selectedPaymentForHistory.totalFee) - Number(selectedPaymentForHistory.amountPaid)).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>

                {/* Closed By info in history */}
                <div className="p-3 bg-neutral-950/70 border border-neutral-800 rounded-xl text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2 text-neutral-300">
                    <UserCheck className="w-4 h-4 text-amber-400" />
                    <span>Closed / Enrolled by:</span>
                  </div>
                  <span className="font-bold text-white">
                    {selectedPaymentForHistory.closedBy || selectedPaymentForHistory.salesExecutive || "Direct / Admin"}
                  </span>
                </div>

                {/* History list */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                    Transaction Timeline
                  </h4>

                  {(!selectedPaymentForHistory.paymentHistory || selectedPaymentForHistory.paymentHistory.length === 0) ? (
                    <p className="text-xs text-neutral-500 py-4 text-center">No transactions recorded yet.</p>
                  ) : (
                    selectedPaymentForHistory.paymentHistory.map((tx: any, idx: number) => (
                      <div
                        key={tx.id || idx}
                        className="p-3.5 bg-neutral-950/70 border border-neutral-800 rounded-xl space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                            <span className="font-bold text-white">
                              Payment #{selectedPaymentForHistory.paymentHistory.length - idx}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-800 text-neutral-300">
                              {tx.paymentType || "Payment"}
                            </span>
                          </div>
                          <span className="font-extrabold text-sm text-emerald-400">
                            ₹{Number(tx.amount).toLocaleString("en-IN")}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-400 pt-1 border-t border-neutral-850">
                          <div>
                            Date: <span className="text-white font-medium">{tx.paymentDate ? format(new Date(tx.paymentDate), "dd MMM yyyy") : "-"}</span>
                          </div>
                          <div>
                            Method: <span className="text-white font-medium">{tx.paymentMethod || "Bank Transfer"}</span>
                          </div>
                          <div>
                            Recorded By: <span className="text-white font-medium">{tx.recordedBy || "Admin"}</span>
                          </div>
                          <div>
                            Balance After: <span className="text-amber-400 font-bold">₹{Number(tx.remainingBalance || 0).toLocaleString("en-IN")}</span>
                          </div>
                        </div>

                        {tx.transactionId && (
                          <p className="text-[10px] text-neutral-500 font-mono">
                            Ref ID: {tx.transactionId}
                          </p>
                        )}
                        {tx.notes && (
                          <p className="text-[11px] text-neutral-400 italic bg-neutral-900/60 p-2 rounded-lg">
                            "{tx.notes}"
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

