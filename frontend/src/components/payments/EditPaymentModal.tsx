"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  CreditCard,
  IndianRupee,
  Calendar,
  UserCheck,
  BookOpen,
  Sparkles,
  Loader2,
  AlertCircle,
  FileText,
} from "lucide-react";

interface EditPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: any;
  onSuccess?: () => void;
}

export function EditPaymentModal({
  isOpen,
  onClose,
  payment,
  onSuccess,
}: EditPaymentModalProps) {
  const queryClient = useQueryClient();

  const [totalFee, setTotalFee] = useState<number>(0);
  const [assignedClasses, setAssignedClasses] = useState<number>(15);
  const [dueAfterClasses, setDueAfterClasses] = useState<number>(5);
  const [salesExecutive, setSalesExecutive] = useState<string>("");
  const [paymentStatus, setPaymentStatus] = useState<string>("auto");
  const [notes, setNotes] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Fetch sales people for dropdown
  const { data: salesPeople = [] } = useQuery({
    queryKey: ["sales-people"],
    queryFn: async () => (await api.get("/sales-people")).data,
  });

  useEffect(() => {
    if (payment) {
      setTotalFee(Number(payment.totalFee) || 0);
      setAssignedClasses(Number(payment.assignedClasses) || 15);
      setDueAfterClasses(Number(payment.dueAfterClasses) || 5);
      setSalesExecutive(payment.salesExecutive || payment.closedBy || "");
      setPaymentStatus("auto");
      setNotes(payment.notes || "");
      setErrorMsg("");
    }
  }, [payment]);

  // Recalculate remaining amount dynamically
  const amountPaid = Number(payment?.amountPaid) || 0;
  const remainingAmount = Math.max(0, totalFee - amountPaid);

  const studentName = payment?.student?.name || payment?.studentName || "Student";
  const courseName = payment?.batch?.subject || payment?.batch?.name || payment?.courseName || "Course";
  const paymentId = payment?._id || payment?.id;

  const updateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.put(`/payments/${paymentId}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payment-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      const sId = payment?.student?._id || payment?.student;
      if (sId) {
        queryClient.invalidateQueries({ queryKey: ["student", sId] });
        queryClient.invalidateQueries({ queryKey: ["student-payment", sId] });
      }
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.message || err.message || "Failed to update payment record");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (totalFee < amountPaid) {
      setErrorMsg(`Total fee cannot be less than already collected amount (₹${amountPaid.toLocaleString("en-IN")})`);
      return;
    }

    updateMutation.mutate({
      totalFee,
      assignedClasses,
      dueAfterClasses,
      salesExecutive,
      closedBy: salesExecutive,
      paymentStatus: paymentStatus === "auto" ? undefined : paymentStatus,
      notes,
    });
  };

  if (!isOpen || !payment) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden my-8"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-neutral-800 bg-neutral-950/60">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Edit Fee Record & Attribution</h3>
                <p className="text-xs text-neutral-400">
                  {studentName} • {courseName}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {errorMsg && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Fee and Balance Overview Card */}
              <div className="grid grid-cols-3 gap-2.5 p-3.5 bg-neutral-950/70 border border-neutral-800 rounded-xl text-xs">
                <div>
                  <span className="text-neutral-500 block">Already Paid</span>
                  <span className="text-emerald-400 font-bold text-sm">
                    ₹{amountPaid.toLocaleString("en-IN")}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500 block">Remaining</span>
                  <span className="text-amber-400 font-bold text-sm">
                    ₹{remainingAmount.toLocaleString("en-IN")}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500 block">Transactions</span>
                  <span className="text-white font-bold text-sm">
                    {payment.paymentHistory?.length || 0} Records
                  </span>
                </div>
              </div>

              {/* Total Course Fee */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <IndianRupee className="w-3.5 h-3.5 text-amber-400" />
                  Total Course Fee (₹)
                </label>
                <input
                  type="number"
                  min={amountPaid}
                  step="100"
                  value={totalFee}
                  onChange={(e) => setTotalFee(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none transition-colors"
                  required
                />
              </div>

              {/* Class Limits & Due Trigger */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300">
                    Total Assigned Classes
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={assignedClasses}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 1;
                      setAssignedClasses(val);
                      // Proportional due threshold update suggestion
                      setDueAfterClasses(val >= 25 ? 12 : 5);
                    }}
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none transition-colors"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300">
                    Due Trigger (Completed Classes)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={assignedClasses}
                    value={dueAfterClasses}
                    onChange={(e) => setDueAfterClasses(Number(e.target.value) || 1)}
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none transition-colors"
                    required
                  />
                  <p className="text-[11px] text-neutral-500">
                    Marked "Payment Due" after {dueAfterClasses} classes
                  </p>
                </div>
              </div>

              {/* Which Sales Person Closed the Customer */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-sky-400" />
                  Closed By (Sales Executive)
                </label>
                <div className="flex gap-2">
                  <select
                    value={salesExecutive}
                    onChange={(e) => setSalesExecutive(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none transition-colors"
                  >
                    <option value="">Select or Type Below</option>
                    {salesPeople.map((sp: any) => (
                      <option key={sp._id} value={sp.name}>
                        {sp.name}
                      </option>
                    ))}
                    {salesExecutive && !salesPeople.some((sp: any) => sp.name === salesExecutive) && (
                      <option value={salesExecutive}>{salesExecutive}</option>
                    )}
                  </select>
                </div>
                <input
                  type="text"
                  placeholder="Or enter custom sales executive name"
                  value={salesExecutive}
                  onChange={(e) => setSalesExecutive(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800/80 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-neutral-300 focus:outline-none transition-colors"
                />
              </div>

              {/* Payment Status Override */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">
                  Payment Status Handling
                </label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none transition-colors"
                >
                  <option value="auto">⚡ Automatic (Based on Completed Classes & Balance)</option>
                  <option value="Paid">Paid</option>
                  <option value="Partially Paid">Partially Paid</option>
                  <option value="Upcoming">Upcoming (Reminder)</option>
                  <option value="Due">Due</option>
                  <option value="Overdue">Overdue</option>
                </select>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-neutral-400" />
                  Staff Notes
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any fee adjustment remarks or customer terms..."
                  className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-xl p-3 text-sm text-white focus:outline-none transition-colors resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-4 sm:p-5 border-t border-neutral-800 bg-neutral-950/60">
              <button
                type="button"
                onClick={onClose}
                disabled={updateMutation.isPending}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-xl text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-neutral-950 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-amber-500/20"
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> Save Changes
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
