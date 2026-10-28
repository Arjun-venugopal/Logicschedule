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
  Trophy,
  BarChart3,
  Download,
  RotateCcw,
  TrendingUp,
} from "lucide-react";
import { RecordPaymentModal } from "@/components/payments/RecordPaymentModal";
import { ConfigRulesModal } from "@/components/payments/ConfigRulesModal";
import { CreatePaymentModal } from "@/components/payments/CreatePaymentModal";
import { EditPaymentModal } from "@/components/payments/EditPaymentModal";
import { DeletePaymentConfirmModal } from "@/components/payments/DeletePaymentConfirmModal";
import { PaymentAnalyticsOverview } from "@/components/payments/PaymentAnalyticsOverview";
import { SalespersonLeaderboard } from "@/components/payments/SalespersonLeaderboard";
import { SalespersonPendingReport } from "@/components/payments/SalespersonPendingReport";
import { format } from "date-fns";

const MONTH_OPTIONS = [
  { value: 0, label: "All Months" },
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

const YEAR_OPTIONS = [2024, 2025, 2026, 2027];

const PAYMENT_METHODS = [
  "all",
  "UPI",
  "Bank Transfer",
  "Cash",
  "Credit Card",
  "Debit Card",
  "Cheque",
  "Other",
];

function exportToCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCell = (val: any) => {
    const s = String(val ?? "").replace(/"/g, '""');
    return `"${s}"`;
  };
  const csvContent = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => row.map(escapeCell).join(",")),
  ].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function PaymentsPage() {
  const currentNow = new Date();
  const [activeTab, setActiveTab] = useState<"overview" | "leaderboard" | "pending" | "records">("overview");

  // Filters State
  const [timeRangeFilter, setTimeRangeFilter] = useState<"all" | "today" | "week" | "month" | "custom">("month");
  const [selectedMonth, setSelectedMonth] = useState<number>(currentNow.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(currentNow.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [salesFilter, setSalesFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("All");
  const [methodFilter, setMethodFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Modals state
  const [selectedPaymentForRecord, setSelectedPaymentForRecord] = useState<any>(null);
  const [selectedPaymentForHistory, setSelectedPaymentForHistory] = useState<any>(null);
  const [selectedPaymentForEdit, setSelectedPaymentForEdit] = useState<any>(null);
  const [selectedPaymentForDelete, setSelectedPaymentForDelete] = useState<any>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);

  // TanStack Query to fetch payments and rich aggregation data
  const { data, isLoading, refetch } = useQuery({
    queryKey: [
      "payments",
      timeRangeFilter,
      selectedMonth,
      selectedYear,
      selectedDate,
      customStartDate,
      customEndDate,
      salesFilter,
      statusFilter,
      methodFilter,
      search,
    ],
    queryFn: async () => {
      const params: any = {};
      if (selectedDate) {
        params.date = selectedDate;
      } else if (timeRangeFilter === "custom" && customStartDate && customEndDate) {
        params.startDate = customStartDate;
        params.endDate = customEndDate;
      } else if (timeRangeFilter === "month" && selectedMonth > 0) {
        params.month = selectedMonth;
        params.year = selectedYear;
      } else if (timeRangeFilter !== "all") {
        params.timeRange = timeRangeFilter;
      }

      if (salesFilter !== "all") params.salesExecutive = salesFilter;
      if (statusFilter !== "All") params.status = statusFilter;
      if (methodFilter !== "all") params.paymentMethod = methodFilter;
      if (search) params.search = search;

      const res = await api.get("/payments", { params });
      return res.data;
    },
    refetchInterval: 30_000,
  });

  const payments = data?.payments || [];
  const salesExecutives: string[] = data?.salesExecutives || [];
  const salespersonRanking = data?.salespersonRanking || [];
  const monthlyPendingBySalesperson = data?.monthlyPendingBySalesperson || [];
  const monthlyTrend = data?.monthlyTrend || [];
  const kpis = data?.kpis || {
    totalFeesCollected: 0,
    totalCollected: 0,
    pendingAmount: 0,
    totalOutstanding: 0,
    dueAmount: 0,
    totalExpectedCollection: 0,
    numberOfPaymentsReceived: 0,
    monthlyGrowthPercentage: 0,
    prevMonthCollected: 0,
    paidCount: 0,
    partiallyPaidCount: 0,
    dueCount: 0,
    overdueCount: 0,
    upcomingCount: 0,
    totalStudentsWithFee: 0,
    periodLabel: "All Time",
  };

  // Get active month label
  const selectedMonthLabel = useMemo(() => {
    if (selectedDate) {
      const parts = selectedDate.split("-");
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        const dateObj = new Date(y, m - 1, d);
        return !isNaN(dateObj.getTime()) ? format(dateObj, "dd MMM yyyy") : selectedDate;
      }
      return selectedDate;
    }
    if (timeRangeFilter === "custom" && customStartDate && customEndDate) {
      return `${customStartDate} to ${customEndDate}`;
    }
    if (timeRangeFilter === "today") return "Today";
    if (timeRangeFilter === "week") return "This Week";
    if (selectedMonth > 0) {
      const found = MONTH_OPTIONS.find((m) => m.value === selectedMonth);
      return `${found?.label || ""} ${selectedYear}`;
    }
    return "All Time";
  }, [selectedDate, timeRangeFilter, selectedMonth, selectedYear, customStartDate, customEndDate]);

  // Client-side quick filter on payments table
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
      if (statusFilter === "Closed This Month") return !!item.isClosedInPeriod;
      if (statusFilter === "Balance Completed") return !!item.isBalanceCompletedInPeriod;
      if (statusFilter === "Paid This Month") return Number(item.periodCollected) > 0;
      return item.paymentStatus === statusFilter;
    });
  }, [payments, search, salesFilter, statusFilter]);

  const handleResetFilters = () => {
    setTimeRangeFilter("month");
    setSelectedMonth(currentNow.getMonth() + 1);
    setSelectedYear(currentNow.getFullYear());
    setSelectedDate("");
    setCustomStartDate("");
    setCustomEndDate("");
    setSalesFilter("all");
    setStatusFilter("All");
    setMethodFilter("all");
    setSearch("");
  };

  const hasActiveFilters =
    timeRangeFilter !== "month" ||
    selectedMonth !== currentNow.getMonth() + 1 ||
    selectedYear !== currentNow.getFullYear() ||
    selectedDate !== "" ||
    salesFilter !== "all" ||
    statusFilter !== "All" ||
    methodFilter !== "all" ||
    search !== "" ||
    customStartDate !== "";

  // Switch to Pending tab with pre-selected salesperson from Leaderboard
  const handleSelectSalespersonForPending = (name: string) => {
    setSalesFilter(name);
    setActiveTab("pending");
  };

  // Open Record Modal with normalized shape
  const handleOpenRecordModal = (item: any) => {
    const normalized = {
      ...item,
      _id: item.paymentId || item._id,
      student: item.student || {
        _id: item.studentId,
        name: item.studentName,
        mobileNumber: item.contactNumber || item.phone,
      },
      totalFee: item.courseFee || item.totalFee,
      amountPaid: item.totalPaid !== undefined ? item.totalPaid : item.amountPaid,
      remainingAmount: item.remainingBalance !== undefined ? item.remainingBalance : item.remainingAmount,
    };
    setSelectedPaymentForRecord(normalized);
  };

  // Open History Modal with normalized shape
  const handleOpenHistoryModal = (item: any) => {
    const normalized = {
      ...item,
      _id: item.paymentId || item._id,
      student: item.student || {
        _id: item.studentId,
        name: item.studentName,
        phone: item.contactNumber,
      },
      totalFee: item.courseFee || item.totalFee,
      amountPaid: item.totalPaid !== undefined ? item.totalPaid : item.amountPaid,
      remainingAmount: item.remainingBalance !== undefined ? item.remainingBalance : item.remainingAmount,
      paymentHistory: item.paymentHistory || [],
    };
    setSelectedPaymentForHistory(normalized);
  };

  // CSV Exports
  const handleExportPayments = () => {
    const headers = [
      "Student Name",
      "Mobile Number",
      "Email",
      "Parent Name",
      "Course / Batch",
      "Sales Representative",
      "Total Fee (INR)",
      "Amount Paid (INR)",
      "Remaining Balance (INR)",
      "Payment Status",
      "Completed Classes",
      "Assigned Classes",
      "Last Payment Date",
    ];
    const rows = filteredPayments.map((p: any) => [
      p.student?.name || p.studentName || "Student",
      p.student?.phone || p.student?.mobileNumber || "",
      p.student?.email || "",
      p.student?.parentName || "",
      p.batch?.name || p.courseName || "",
      p.closedBy || p.salesExecutive || "",
      p.totalFee || 0,
      p.amountPaid || 0,
      p.remainingAmount || 0,
      p.paymentStatus || "",
      p.completedClasses || 0,
      p.assignedClasses || 0,
      p.lastPaymentDate ? format(new Date(p.lastPaymentDate), "yyyy-MM-dd") : "",
    ]);
    exportToCsv(`LogicBox_All_Payments_${format(new Date(), "yyyyMMdd")}.csv`, headers, rows);
  };

  const handleExportLeaderboard = () => {
    const headers = [
      "Rank",
      "Salesperson Name",
      "Collected Amount (INR)",
      "Enrolled Students",
      "Successful Payments",
      "Pending Balance (INR)",
      "Overdue Amount (INR)",
      "Recovery Rate (%)",
      "Total Course Fee (INR)",
      "Total Amount Paid (INR)",
    ];
    const rows = salespersonRanking.map((sp: any) => [
      sp.rank,
      sp.name,
      sp.collectedAmount,
      sp.enrolledStudents,
      sp.successfulPaymentsCount,
      sp.pendingAmount,
      sp.overdueAmount,
      sp.collectionPercentage,
      sp.totalCourseFee,
      sp.totalAmountPaid,
    ]);
    exportToCsv(`LogicBox_Sales_Leaderboard_${format(new Date(), "yyyyMMdd")}.csv`, headers, rows);
  };

  const handleExportPending = () => {
    const headers = [
      "Student Name",
      "Parent Name",
      "Contact Number",
      "Email",
      "Course / Batch",
      "Salesperson",
      "Total Course Fee (INR)",
      "Amount Paid (INR)",
      "Remaining Balance (INR)",
      "Monthly Installment (INR)",
      "Next Payment Due Date",
      "Overdue Days",
      "Payment Status",
      "Last Payment Date",
    ];
    const rows = monthlyPendingBySalesperson.map((s: any) => [
      s.studentName,
      s.parentName,
      s.contactNumber,
      s.email,
      s.courseName,
      s.salesperson,
      s.courseFee,
      s.totalPaid,
      s.remainingBalance,
      s.monthlyInstallment,
      s.nextPaymentDueDate,
      s.overdueDays,
      s.paymentStatus,
      s.lastPaymentDate ? format(new Date(s.lastPaymentDate), "yyyy-MM-dd") : "",
    ]);
    exportToCsv(`LogicBox_Pending_Receivables_${format(new Date(), "yyyyMMdd")}.csv`, headers, rows);
  };

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
            Complete overview of monthly collections, salesperson performance leaderboard, pending receivables, and automated class completion triggers
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          <button
            onClick={() => setShowConfigModal(true)}
            className="px-3.5 py-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm"
          >
            <Sliders className="w-4 h-4 text-amber-400" />
            Due Rules
          </button>

          <button
            onClick={handleExportPayments}
            className="px-3.5 py-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            Export CSV
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

      {/* Main Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-neutral-800 pb-2 overflow-x-auto custom-scrollbar">
        {[
          { id: "overview", label: "Monthly Overview & KPIs", icon: BarChart3 },
          {
            id: "leaderboard",
            label: `Sales Leaderboard (${salespersonRanking.length})`,
            icon: Trophy,
          },
          {
            id: "pending",
            label: `Pending Receivables (${monthlyPendingBySalesperson.length})`,
            icon: AlertCircle,
          },
          {
            id: "records",
            label: `All Student Records (${filteredPayments.length})`,
            icon: CreditCard,
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
                isActive
                  ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20"
                  : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Universal Monthly & Attribute Filters Bar */}
      <div className="bg-neutral-900/90 p-4 rounded-2xl border border-neutral-800 space-y-3.5 shadow-lg">
        {/* Row 1: Time Quick Pills, Month Picker, Year Picker */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Time range selector pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 custom-scrollbar text-xs">
            <span className="text-neutral-400 text-xs font-semibold flex items-center gap-1 mr-1 shrink-0">
              <Calendar className="w-3.5 h-3.5 text-amber-400" /> Range:
            </span>
            {[
              { id: "month", label: "This Month" },
              { id: "week", label: "This Week" },
              { id: "today", label: "Today" },
              { id: "all", label: "All Time" },
              { id: "custom", label: "Custom Range" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTimeRangeFilter(t.id as any);
                  if (t.id === "month" && selectedMonth === 0) {
                    setSelectedMonth(currentNow.getMonth() + 1);
                  }
                  if (t.id !== "month") {
                    setSelectedDate("");
                  }
                }}
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

          {/* Month & Year Selectors with Specific Date Option */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {timeRangeFilter === "month" && (
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(Number(e.target.value));
                    setSelectedDate("");
                  }}
                  className="bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs font-semibold text-white outline-none focus:border-amber-500 transition-colors"
                >
                  {MONTH_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(Number(e.target.value));
                    setSelectedDate("");
                  }}
                  className="bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs font-semibold text-white outline-none focus:border-amber-500 transition-colors"
                >
                  {YEAR_OPTIONS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>

                {/* Specific Date Filter (Near Month & Year) */}
                <div className="flex items-center gap-1.5 bg-neutral-950 border border-neutral-800 rounded-xl px-2.5 py-1 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-[11px] text-neutral-400 font-medium hidden sm:inline">Date:</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedDate(val);
                      if (val) {
                        const parts = val.split("-");
                        if (parts.length === 3) {
                          const y = parseInt(parts[0], 10);
                          const m = parseInt(parts[1], 10);
                          if (!isNaN(y) && !isNaN(m)) {
                            setSelectedMonth(m);
                            setSelectedYear(y);
                          }
                        }
                      }
                    }}
                    className="bg-transparent text-white outline-none text-xs cursor-pointer font-medium"
                    title="Filter by specific closed date"
                  />
                  {selectedDate && (
                    <button
                      type="button"
                      onClick={() => setSelectedDate("")}
                      className="p-0.5 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors"
                      title="Clear date filter"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Custom Date Range Inputs */}
            {timeRangeFilter === "custom" && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-neutral-950 border border-neutral-800 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500"
                />
                <span className="text-neutral-500 text-xs">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-neutral-950 border border-neutral-800 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500"
                />
              </div>
            )}

            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="px-2.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold flex items-center gap-1 transition-colors"
                title="Reset all filters to current month defaults"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Salesperson, Payment Method, Status, and Search */}
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between pt-2.5 border-t border-neutral-800/80">
          {/* Search box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student, mobile number, parent, course, or salesperson..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm text-white outline-none focus:border-amber-500 transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Salesperson Dropdown */}
            <div className="flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <select
                value={salesFilter}
                onChange={(e) => setSalesFilter(e.target.value)}
                className="bg-neutral-950 border border-neutral-800 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500 transition-colors"
              >
                <option value="all">All Sales Representatives</option>
                {salesExecutives.map((se) => (
                  <option key={se} value={se}>
                    {se}
                  </option>
                ))}
              </select>
            </div>

            {/* Payment Method Dropdown */}
            <div className="flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                className="bg-neutral-950 border border-neutral-800 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500 transition-colors"
              >
                <option value="all">All Payment Methods</option>
                {PAYMENT_METHODS.filter((m) => m !== "all").map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Selector Pills */}
            <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar text-xs">
              {[
                "All",
                "Closed This Month",
                "Balance Completed",
                "Paid This Month",
                "Due",
                "Partially Paid",
                "Paid",
              ].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap transition-colors ${
                    statusFilter === st
                      ? "bg-amber-500 text-black font-bold"
                      : "bg-neutral-850 text-neutral-400 hover:text-white"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tab 1: Monthly Overview & Collections */}
      {activeTab === "overview" && (
        <PaymentAnalyticsOverview
          kpis={kpis}
          monthlyTrend={monthlyTrend}
          salespersonRanking={salespersonRanking}
          onNavigateToLeaderboard={() => setActiveTab("leaderboard")}
          onNavigateToPending={() => setActiveTab("pending")}
          onNavigateToAll={() => setActiveTab("records")}
        />
      )}

      {/* Tab 2: Salesperson Ranking (Leaderboard) */}
      {activeTab === "leaderboard" && (
        <SalespersonLeaderboard
          rankings={salespersonRanking}
          selectedMonthName={selectedMonthLabel}
          onSelectSalespersonForPending={handleSelectSalespersonForPending}
          onExportCsv={handleExportLeaderboard}
        />
      )}

      {/* Tab 3: Month-Wise Pending Payments by Salesperson */}
      {activeTab === "pending" && (
        <SalespersonPendingReport
          pendingStudents={monthlyPendingBySalesperson}
          salesExecutives={salesExecutives}
          selectedSalesperson={salesFilter}
          onSelectSalesperson={(name) => setSalesFilter(name)}
          onRecordPayment={handleOpenRecordModal}
          onViewHistory={handleOpenHistoryModal}
          onExportCsv={handleExportPending}
        />
      )}

      {/* Tab 4: All Student Records & Transaction Audit */}
      {activeTab === "records" && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="px-5 py-3.5 border-b border-neutral-800 bg-neutral-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                <CreditCard className="w-4 h-4 text-amber-400" />
                All Student Payment Records ({filteredPayments.length})
                {selectedDate ? (
                  <span className="text-[11px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                    Closed on {selectedMonthLabel}
                  </span>
                ) : timeRangeFilter === "month" && selectedMonth > 0 ? (
                  <span className="text-[11px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                    Closed in {selectedMonthLabel}
                  </span>
                ) : null}
              </h3>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Class progress milestone triggers, payment records, and fee status
              </p>
            </div>
            <button
              onClick={handleExportPayments}
              className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" /> Download Full CSV
            </button>
          </div>

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
                {selectedDate
                  ? `No student admissions were closed on ${selectedMonthLabel}.`
                  : timeRangeFilter === "month" && selectedMonth > 0
                  ? `No student admissions were closed in ${selectedMonthLabel}.`
                  : "Confirmed demo admissions or manually added fees matching filters will appear here."}
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

                        {/* Closed By (Sales Person) & Month Credits */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5 font-medium text-neutral-200">
                            <UserCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="truncate max-w-[130px]">{closedByPerson}</span>
                          </div>
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {p.closingMonth && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  p.isClosedInPeriod
                                    ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                    : "bg-neutral-800 text-neutral-400"
                                }`}
                                title={`Admission closing credited to ${p.closingMonth}`}
                              >
                                Closed: {p.closingMonth}
                              </span>
                            )}
                            {p.balanceCompletedMonth ? (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  p.isBalanceCompletedInPeriod
                                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                    : "bg-neutral-800 text-emerald-400/80"
                                }`}
                                title={`Full balance settlement completed in ${p.balanceCompletedMonth}`}
                              >
                                Settled: {p.balanceCompletedMonth}
                              </span>
                            ) : remaining > 0 ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-800 text-neutral-400">
                                Bal. Pending
                              </span>
                            ) : null}
                          </div>
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
                            {Number(p.periodCollected) > 0 && timeRangeFilter === "month" && (
                              <div className="text-[10px] font-bold text-sky-400 flex items-center gap-1">
                                <CreditCard className="w-3 h-3" />
                                ₹{Number(p.periodCollected).toLocaleString("en-IN")} in {selectedMonthLabel}
                              </div>
                            )}
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
                                onClick={() => handleOpenRecordModal(p)}
                                className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl flex items-center gap-1 transition-colors shadow-sm"
                                title="Record Next Payment"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                                Pay
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenHistoryModal(p)}
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
      )}

      {/* Record Payment Modal */}
      {selectedPaymentForRecord && (
        <RecordPaymentModal
          isOpen={true}
          onClose={() => {
            setSelectedPaymentForRecord(null);
            refetch();
          }}
          payment={selectedPaymentForRecord}
        />
      )}

      {/* Config Rules Modal */}
      {showConfigModal && (
        <ConfigRulesModal
          isOpen={true}
          onClose={() => {
            setShowConfigModal(false);
            refetch();
          }}
        />
      )}

      {/* Create Payment Modal */}
      <CreatePaymentModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          refetch();
        }}
      />

      {/* Edit Payment Modal */}
      <EditPaymentModal
        isOpen={!!selectedPaymentForEdit}
        payment={selectedPaymentForEdit}
        onClose={() => {
          setSelectedPaymentForEdit(null);
          refetch();
        }}
      />

      {/* Delete Payment Confirmation Modal */}
      <DeletePaymentConfirmModal
        isOpen={!!selectedPaymentForDelete}
        payment={selectedPaymentForDelete}
        onClose={() => {
          setSelectedPaymentForDelete(null);
          refetch();
        }}
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
                      ₹{Number(selectedPaymentForHistory.totalFee || 0).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block">Total Paid</span>
                    <span className="text-sm font-bold text-emerald-400 mt-0.5 block">
                      ₹{Number(selectedPaymentForHistory.amountPaid || 0).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block">Remaining Balance</span>
                    <span className="text-sm font-bold text-amber-400 mt-0.5 block">
                      ₹{Math.max(
                        0,
                        Number(selectedPaymentForHistory.totalFee || 0) -
                          Number(selectedPaymentForHistory.amountPaid || 0)
                      ).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>

                {/* Closing & Balance Status Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 bg-neutral-950/70 border border-neutral-800 rounded-xl text-xs">
                  <div>
                    <span className="text-neutral-500 block text-[10px]">Admission Closing Month</span>
                    <span className="font-bold text-amber-400 mt-0.5 flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5" />
                      {selectedPaymentForHistory.closingMonth || (selectedPaymentForHistory.admissionDate ? format(new Date(selectedPaymentForHistory.admissionDate), "MMMM yyyy") : "Recorded")}
                    </span>
                    <span className="text-[10px] text-neutral-400 block mt-0.5">
                      Closer: {selectedPaymentForHistory.closedBy || selectedPaymentForHistory.salesExecutive || "Direct / Admin"}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[10px]">Balance Completed History</span>
                    {selectedPaymentForHistory.balanceCompletedMonth ? (
                      <div>
                        <span className="font-bold text-emerald-400 mt-0.5 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Settled in {selectedPaymentForHistory.balanceCompletedMonth}
                        </span>
                        <span className="text-[10px] text-emerald-500/80 block mt-0.5">
                          100% Course Fee Cleared
                        </span>
                      </div>
                    ) : (
                      <div>
                        <span className="font-bold text-amber-400 mt-0.5 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          Balance Pending
                        </span>
                        <span className="text-[10px] text-neutral-400 block mt-0.5">
                          ₹{Math.max(0, Number(selectedPaymentForHistory.totalFee || 0) - Number(selectedPaymentForHistory.amountPaid || 0)).toLocaleString("en-IN")} remaining
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* History list */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                    Transaction Timeline & Credited Months
                  </h4>

                  {!selectedPaymentForHistory.paymentHistory ||
                  selectedPaymentForHistory.paymentHistory.length === 0 ? (
                    <p className="text-xs text-neutral-500 py-4 text-center">
                      No transactions recorded yet.
                    </p>
                  ) : (
                    selectedPaymentForHistory.paymentHistory.map((tx: any, idx: number) => (
                      <div
                        key={tx.id || idx}
                        className="p-3.5 bg-neutral-950/70 border border-neutral-800 rounded-xl space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                            <span className="font-bold text-white">
                              Payment #{selectedPaymentForHistory.paymentHistory.length - idx}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-800 text-neutral-300">
                              {tx.isClosing ? "Admission Closing" : tx.isBalanceCompletion ? "Final Settlement" : (tx.paymentType || "Installment")}
                            </span>
                            {(tx.paymentMonth || tx.paymentDate) && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                Credited: {tx.paymentMonth || format(new Date(tx.paymentDate), "yyyy-MM")}
                              </span>
                            )}
                          </div>
                          <span className="font-extrabold text-sm text-emerald-400">
                            ₹{Number(tx.amount || 0).toLocaleString("en-IN")}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-400 pt-1 border-t border-neutral-850">
                          <div>
                            Date:{" "}
                            <span className="text-white font-medium">
                              {tx.paymentDate
                                ? format(new Date(tx.paymentDate), "dd MMM yyyy")
                                : "-"}
                            </span>
                          </div>
                          <div>
                            Method:{" "}
                            <span className="text-white font-medium">
                              {tx.paymentMethod || "Bank Transfer"}
                            </span>
                          </div>
                          <div>
                            Recorded By:{" "}
                            <span className="text-white font-medium">
                              {tx.recordedBy || "Admin"}
                            </span>
                          </div>
                          <div>
                            Balance After:{" "}
                            <span className="text-amber-400 font-bold">
                              ₹{Number(tx.remainingBalance || 0).toLocaleString("en-IN")}
                            </span>
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
