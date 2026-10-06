"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Trash2, X, Loader2 } from "lucide-react";
import { useState } from "react";

interface DeletePaymentConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: any;
  onSuccess?: () => void;
}

export function DeletePaymentConfirmModal({
  isOpen,
  onClose,
  payment,
  onSuccess,
}: DeletePaymentConfirmModalProps) {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState("");

  const studentName = payment?.student?.name || payment?.studentName || "Student";
  const courseName = payment?.batch?.subject || payment?.batch?.name || payment?.courseName || "Course";
  const paymentId = payment?._id || payment?.id;

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await api.delete(`/payments/${paymentId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["payment-notifications"] });
      const sId = payment?.student?._id || payment?.student;
      if (sId) {
        queryClient.invalidateQueries({ queryKey: ["student", sId] });
        queryClient.invalidateQueries({ queryKey: ["student-payment", sId] });
      }
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.message || err.message || "Failed to delete payment record");
    },
  });

  if (!isOpen || !payment) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-neutral-800 bg-red-950/20">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Payment Record</h3>
                <p className="text-xs text-neutral-400">Confirmation required</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            {errorMsg && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                {errorMsg}
              </div>
            )}

            <p className="text-sm text-neutral-300 leading-relaxed">
              Are you sure you want to delete the fee and payment records for{" "}
              <strong className="text-white font-semibold">{studentName}</strong> ({courseName})?
            </p>

            <div className="p-3.5 bg-neutral-950/60 border border-neutral-800 rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between text-neutral-400">
                <span>Total Fee:</span>
                <span className="font-semibold text-neutral-200">
                  ₹{(payment.totalFee || 0).toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Amount Paid:</span>
                <span className="font-semibold text-emerald-400">
                  ₹{(payment.amountPaid || 0).toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Recorded Transactions:</span>
                <span className="font-semibold text-neutral-200">
                  {payment.paymentHistory?.length || 0}
                </span>
              </div>
            </div>

            <p className="text-xs text-red-400/90 bg-red-500/5 p-2.5 rounded-lg border border-red-500/15">
              ⚠️ This operation will permanently remove the fee plan, all installment records, and payment notifications for this student.
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 sm:p-5 border-t border-neutral-800 bg-neutral-950/40">
            <button
              type="button"
              onClick={onClose}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-xl text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-red-900/20"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" /> Yes, Delete Record
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
