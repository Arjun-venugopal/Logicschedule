"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Calendar,
  IndianRupee,
  Layers,
  ArrowRight,
  ShieldCheck,
  Percent,
} from "lucide-react";
import { format } from "date-fns";

interface AdmissionPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId?: string;
  demoSessionId?: string;
  batchId?: string;
  studentName?: string;
  courseName?: string;
  initialFee?: number | string;
  initialSessions?: number | string;
  onSuccess?: (payment: any) => void;
}

export function AdmissionPaymentModal({
  isOpen,
  onClose,
  studentId,
  demoSessionId,
  batchId,
  studentName = "Student",
  courseName = "Course",
  initialFee,
  initialSessions,
  onSuccess,
}: AdmissionPaymentModalProps) {
  const queryClient = useQueryClient();

  // Parse initial values
  const cleanInitialFee = () => {
    if (!initialFee) return 15000;
    const num = Number(String(initialFee).replace(/[^\d.]/g, ""));
    return isNaN(num) || num <= 0 ? 15000 : num;
  };

  const cleanInitialSessions = () => {
    if (!initialSessions) return 15;
    const num = Number(initialSessions);
    return isNaN(num) || num <= 0 ? 15 : num;
  };

  const [totalFee, setTotalFee] = useState<number>(cleanInitialFee());
  const [assignedClasses, setAssignedClasses] = useState<number>(cleanInitialSessions());
  const [paymentType, setPaymentType] = useState<"Full Payment" | "Half Payment" | "Custom Payment">("Half Payment");
  const [customAmount, setCustomAmount] = useState<number>(Math.round(cleanInitialFee() * 0.5));
  const [paymentMethod, setPaymentMethod] = useState<string>("Bank Transfer");
  const [transactionId, setTransactionId] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      const parsedFee = cleanInitialFee();
      const parsedSessions = cleanInitialSessions();
      setTotalFee(parsedFee);
      setAssignedClasses(parsedSessions);
      setCustomAmount(Math.round(parsedFee * 0.5));
      setErrorMsg("");
    }
  }, [isOpen, initialFee, initialSessions]);

  // Dynamic Due Classes Rule:
  // 15 Classes -> 5 Classes
  // 25 Classes -> 12 Classes
  // Others -> Math.round(assignedClasses * (5/15))
  const calculateDueAfterClasses = (classes: number) => {
    const num = Number(classes) || 15;
    if (num === 15) return 5;
    if (num === 25) return 12;
    if (num <= 15) return Math.max(1, Math.round(num * (5 / 15)));
    return Math.max(1, Math.round(num * (12 / 25)));
  };

  const dueAfterClasses = calculateDueAfterClasses(assignedClasses);

  // Compute amounts based on selected type
  let amountPaid = 0;
  if (paymentType === "Full Payment") {
    amountPaid = totalFee;
  } else if (paymentType === "Half Payment") {
    amountPaid = Math.round(totalFee * 0.5);
  } else {
    amountPaid = Math.max(0, Math.min(totalFee, Number(customAmount) || 0));
  }

  const remainingAmount = Math.max(0, totalFee - amountPaid);

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post("/payments/admission", payload);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["demo-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["all-students"] });
      queryClient.invalidateQueries({ queryKey: ["payment-notifications"] });
      if (studentId) {
        queryClient.invalidateQueries({ queryKey: ["student", studentId] });
        queryClient.invalidateQueries({ queryKey: ["student-payment", studentId] });
      }
      if (onSuccess) onSuccess(data.payment);
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.message || err.message || "Failed to record payment");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (totalFee <= 0) {
      setErrorMsg("Course fee must be greater than 0");
      return;
    }
    if (paymentType === "Custom Payment" && (customAmount <= 0 || customAmount > totalFee)) {
      setErrorMsg(`Custom amount must be between ₹1 and ₹${totalFee.toLocaleString("en-IN")}`);
      return;
    }

    mutation.mutate({
      studentId,
      demoSessionId,
      batchId,
      totalFee,
      assignedClasses,
      paymentType,
      amountPaid,
      paymentMethod,
      transactionId,
      paymentDate,
      notes,
    });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-neutral-800 bg-neutral-900/90 sticky top-0 z-10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-white">Student Admission & Fee Collection</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Confirmed
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Student: <span className="text-white font-medium">{studentName}</span> · Course: <span className="text-amber-400 font-medium">{courseName}</span>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-neutral-400 hover:text-white bg-neutral-800/60 hover:bg-neutral-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
            {errorMsg && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2.5 text-xs text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Course Fee & Sessions Input */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-neutral-950/60 p-4 rounded-xl border border-neutral-800">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">
                  <IndianRupee className="w-3.5 h-3.5 text-amber-400" /> Total Course Fee (₹) *
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={totalFee}
                  onChange={(e) => {
                    const val = Math.max(0, Number(e.target.value) || 0);
                    setTotalFee(val);
                    if (paymentType === "Half Payment") {
                      setCustomAmount(Math.round(val * 0.5));
                    }
                  }}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3.5 py-2 text-sm text-white font-bold outline-none focus:border-amber-500 transition-colors"
                  placeholder="e.g. 15000"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-400" /> Assigned Classes *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={assignedClasses}
                  onChange={(e) => setAssignedClasses(Math.max(1, Number(e.target.value) || 15))}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3.5 py-2 text-sm text-white font-bold outline-none focus:border-amber-500 transition-colors"
                  placeholder="e.g. 15 or 25"
                />
                <p className="text-[11px] text-neutral-500">
                  Threshold: Due after {dueAfterClasses} completed classes
                </p>
              </div>
            </div>

            {/* Select Payment Option */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-neutral-300 uppercase tracking-wider block">
                Select Payment Option *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Full Payment */}
                <button
                  type="button"
                  onClick={() => setPaymentType("Full Payment")}
                  className={`p-3.5 rounded-xl border text-left transition-all relative ${
                    paymentType === "Full Payment"
                      ? "bg-amber-500/10 border-amber-500 text-white shadow-lg shadow-amber-500/10"
                      : "bg-neutral-800/40 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-white"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" /> Full Payment
                    </span>
                    {paymentType === "Full Payment" && (
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-400">100% upfront payment</p>
                  <p className="text-sm font-bold text-amber-400 mt-2">
                    ₹{totalFee.toLocaleString("en-IN")}
                  </p>
                </button>

                {/* Half Payment */}
                <button
                  type="button"
                  onClick={() => {
                    setPaymentType("Half Payment");
                    setCustomAmount(Math.round(totalFee * 0.5));
                  }}
                  className={`p-3.5 rounded-xl border text-left transition-all relative ${
                    paymentType === "Half Payment"
                      ? "bg-amber-500/10 border-amber-500 text-white shadow-lg shadow-amber-500/10"
                      : "bg-neutral-800/40 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-white"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Percent className="w-4 h-4 text-amber-400" /> Half Payment (50%)
                    </span>
                    {paymentType === "Half Payment" && (
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-400">50% now, remainder due later</p>
                  <p className="text-sm font-bold text-amber-400 mt-2">
                    ₹{Math.round(totalFee * 0.5).toLocaleString("en-IN")}
                  </p>
                </button>

                {/* Custom Payment */}
                <button
                  type="button"
                  onClick={() => setPaymentType("Custom Payment")}
                  className={`p-3.5 rounded-xl border text-left transition-all relative ${
                    paymentType === "Custom Payment"
                      ? "bg-amber-500/10 border-amber-500 text-white shadow-lg shadow-amber-500/10"
                      : "bg-neutral-800/40 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-white"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <IndianRupee className="w-4 h-4 text-purple-400" /> Custom / Other
                    </span>
                    {paymentType === "Custom Payment" && (
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-400">Enter custom received amount</p>
                  <p className="text-sm font-bold text-purple-400 mt-2">
                    Custom Amount
                  </p>
                </button>
              </div>
            </div>

            {/* Custom Amount Input if Custom Selected */}
            {paymentType === "Custom Payment" && (
              <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl space-y-2">
                <label className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                  <IndianRupee className="w-3.5 h-3.5" /> Enter Amount Received Now *
                </label>
                <input
                  type="number"
                  min="1"
                  max={totalFee}
                  required
                  value={customAmount}
                  onChange={(e) => setCustomAmount(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full bg-neutral-900 border border-purple-500/40 rounded-xl px-3.5 py-2 text-sm text-white font-bold outline-none focus:border-purple-400 transition-colors"
                  placeholder="e.g. 7000"
                />
              </div>
            )}

            {/* Auto Calculation Live Summary Card */}
            <div className="p-4 bg-gradient-to-r from-neutral-950 via-neutral-900 to-neutral-950 rounded-xl border border-neutral-800 space-y-3">
              <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">
                Automatic Fee Breakdown
              </span>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-lg bg-neutral-900/80 border border-neutral-800/80">
                  <span className="text-[10px] text-neutral-400 block font-medium">Paying Now</span>
                  <span className="text-sm sm:text-base font-bold text-emerald-400 mt-0.5 block">
                    ₹{amountPaid.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-neutral-900/80 border border-neutral-800/80">
                  <span className="text-[10px] text-neutral-400 block font-medium">Remaining Due</span>
                  <span className={`text-sm sm:text-base font-bold mt-0.5 block ${remainingAmount === 0 ? "text-emerald-400" : "text-amber-400"}`}>
                    ₹{remainingAmount.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-neutral-900/80 border border-neutral-800/80">
                  <span className="text-[10px] text-neutral-400 block font-medium">Due Trigger</span>
                  <span className="text-xs sm:text-sm font-bold text-white mt-1 block">
                    {remainingAmount === 0 ? "No Due" : `After ${dueAfterClasses} Classes`}
                  </span>
                </div>
              </div>

              {/* Status Preview */}
              <div className="flex items-center justify-between pt-1 border-t border-neutral-800/60 text-xs">
                <span className="text-neutral-400 font-medium">Payment Status:</span>
                <span className={`px-2.5 py-0.5 rounded-md font-bold text-[11px] border ${
                  remainingAmount === 0
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                }`}>
                  {remainingAmount === 0 ? "● Paid (Full)" : "● Partially Paid (Due Trigger Active)"}
                </span>
              </div>
            </div>

            {/* Payment Details */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-400">Payment Method *</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-white outline-none focus:border-amber-500 transition-colors"
                >
                  <option value="UPI">UPI / GPay / PhonePe</option>
                  <option value="Bank Transfer">Bank Transfer (IMPS/NEFT)</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Debit / Credit Card</option>
                  <option value="Net Banking">Net Banking</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-400">Payment Date *</label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-white outline-none focus:border-amber-500 [&::-webkit-calendar-picker-indicator]:invert transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-400">Transaction / Ref ID</label>
                <input
                  type="text"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="e.g. UPI-2394827"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-white outline-none focus:border-amber-500 transition-colors placeholder:text-neutral-600"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-400">Remarks / Notes</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional payment notes or customer request..."
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white outline-none focus:border-amber-500 transition-colors placeholder:text-neutral-600 resize-none"
              />
            </div>

            {/* Footer Buttons */}
            <div className="pt-2 flex items-center justify-end gap-3 border-t border-neutral-800 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-black bg-amber-500 hover:bg-amber-400 transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50"
              >
                {mutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    Recording Fee...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Confirm Admission & Record Fee
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
