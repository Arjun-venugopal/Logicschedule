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
  IndianRupee,
  Calendar,
  Receipt,
  ArrowRight,
} from "lucide-react";
import { format } from "date-fns";

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: any;
  onSuccess?: (payment: any) => void;
}

export function RecordPaymentModal({
  isOpen,
  onClose,
  payment,
  onSuccess,
}: RecordPaymentModalProps) {
  const queryClient = useQueryClient();

  const totalFee = Number(payment?.totalFee) || 0;
  const currentPaid = Number(payment?.amountPaid) || 0;
  const currentRemaining = Math.max(0, totalFee - currentPaid);

  const [amount, setAmount] = useState<number>(currentRemaining);
  const [paymentMethod, setPaymentMethod] = useState<string>("UPI");
  const [transactionId, setTransactionId] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    if (isOpen && payment) {
      const rem = Math.max(0, (Number(payment.totalFee) || 0) - (Number(payment.amountPaid) || 0));
      setAmount(rem);
      setErrorMsg("");
    }
  }, [isOpen, payment]);

  const newPaid = currentPaid + (Number(amount) || 0);
  const newRemaining = Math.max(0, totalFee - newPaid);
  const isFullSettlement = newRemaining <= 0;

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post("/payments/record", payload);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payment-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["all-students"] });
      if (payment?.student?._id) {
        queryClient.invalidateQueries({ queryKey: ["student", payment.student._id] });
        queryClient.invalidateQueries({ queryKey: ["student-payment", payment.student._id] });
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

    const payVal = Number(amount);
    if (!payVal || payVal <= 0) {
      setErrorMsg("Please enter an amount greater than 0");
      return;
    }

    mutation.mutate({
      paymentId: payment._id,
      studentId: payment.student?._id || payment.student,
      amount: payVal,
      paymentMethod,
      transactionId,
      paymentDate,
      notes,
    });
  };

  if (!isOpen || !payment) return null;

  const studentName = payment.student?.name || payment.studentName || "Student";
  const courseName = payment.batch?.subject || payment.batch?.name || payment.courseName || "Course";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden max-h-[92vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-neutral-800 bg-neutral-900/90 sticky top-0 z-10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">Record Fee Payment</h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Student: <span className="text-white font-medium">{studentName}</span> · <span className="text-amber-400 font-medium">{courseName}</span>
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

          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
            {errorMsg && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2.5 text-xs text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Current Balance Overview */}
            <div className="grid grid-cols-3 gap-2.5 p-3.5 bg-neutral-950/70 border border-neutral-800 rounded-xl text-center">
              <div>
                <span className="text-[10px] text-neutral-500 uppercase font-semibold block">Total Fee</span>
                <span className="text-sm font-bold text-white mt-0.5 block">
                  ₹{totalFee.toLocaleString("en-IN")}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-neutral-500 uppercase font-semibold block">Already Paid</span>
                <span className="text-sm font-bold text-emerald-400 mt-0.5 block">
                  ₹{currentPaid.toLocaleString("en-IN")}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-neutral-500 uppercase font-semibold block">Current Due</span>
                <span className="text-sm font-bold text-amber-400 mt-0.5 block">
                  ₹{currentRemaining.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {/* Amount input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <IndianRupee className="w-3.5 h-3.5 text-amber-400" /> Payment Amount (₹) *
                </label>
                <button
                  type="button"
                  onClick={() => setAmount(currentRemaining)}
                  className="text-[11px] font-bold text-amber-400 hover:text-amber-300 underline"
                >
                  Pay Full Balance (₹{currentRemaining.toLocaleString("en-IN")})
                </button>
              </div>
              <input
                type="number"
                min="1"
                required
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-base font-bold text-white outline-none focus:border-amber-500 transition-colors"
                placeholder="Enter amount"
              />
            </div>

            {/* Live Remaining Balance Calculation */}
            <div className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950/50 flex items-center justify-between text-xs">
              <span className="text-neutral-400 font-medium">Balance After Payment:</span>
              <div className="flex items-center gap-2">
                <span className={`font-bold text-sm ${isFullSettlement ? "text-emerald-400" : "text-amber-400"}`}>
                  ₹{newRemaining.toLocaleString("en-IN")}
                </span>
                {isFullSettlement && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Will Mark as PAID
                  </span>
                )}
              </div>
            </div>

            {/* Payment Method & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            </div>

            {/* Transaction Ref */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-400">Transaction / Ref ID</label>
              <input
                type="text"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="e.g. UPI-REF-99238"
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white outline-none focus:border-amber-500 transition-colors placeholder:text-neutral-600"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-400">Notes / Remarks</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional payment notes..."
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white outline-none focus:border-amber-500 transition-colors placeholder:text-neutral-600 resize-none"
              />
            </div>

            {/* Footer Buttons */}
            <div className="pt-2 flex items-center justify-end gap-3 border-t border-neutral-800">
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
                    Recording...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Record Payment
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
