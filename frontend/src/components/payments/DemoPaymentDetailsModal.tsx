"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
  Receipt,
  Edit2,
  Plus,
} from "lucide-react";
import { format } from "date-fns";

interface DemoPaymentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  demoSession: any;
  onRecordPayment?: (payment: any) => void;
  onEditPayment?: (payment: any) => void;
  onAddAdmissionPayment?: () => void;
}

export function DemoPaymentDetailsModal({
  isOpen,
  onClose,
  demoSession,
  onRecordPayment,
  onEditPayment,
  onAddAdmissionPayment,
}: DemoPaymentDetailsModalProps) {
  const sessionId = demoSession?._id;

  const { data, isLoading } = useQuery({
    queryKey: ["demo-session-payment", sessionId],
    queryFn: async () => (await api.get(`/payments/demo-session/${sessionId}`)).data,
    enabled: isOpen && !!sessionId,
    staleTime: 5000,
  });

  if (!isOpen) return null;

  // Use queried payment if available; fallback to session.payment
  const payment = data?.hasPayment && data?.payment ? data.payment : (demoSession?.payment || null);
  const student = data?.student || null;

  const studentName = demoSession?.studentName || student?.name || "Student";
  const courseName = demoSession?.subject || payment?.batch?.subject || "Course";
  const salesExecutive = payment?.salesExecutive || demoSession?.salesExecutive || "Unassigned";

  const totalFee = Number(payment?.totalFee) || 0;
  const amountPaid = Number(payment?.amountPaid) || 0;
  const remainingAmount = Number(
    payment?.remainingAmount !== undefined
      ? payment.remainingAmount
      : Math.max(0, totalFee - amountPaid)
  );

  const isFullPayment =
    payment &&
    (payment.paymentStatus === "Paid" ||
      remainingAmount <= 0 ||
      (String(payment.paymentType || "").toLowerCase().includes("full") && remainingAmount <= 0));

  const isHalfPayment =
    payment &&
    !isFullPayment &&
    (String(payment.paymentType || "").toLowerCase().includes("half") ||
      payment.paymentStatus === "Partially Paid" ||
      (amountPaid > 0 && remainingAmount > 0));

  const assignedClasses = Number(payment?.assignedClasses) || 15;
  const dueAfterClasses = Number(payment?.dueAfterClasses) || 5;
  const completedClasses = Number(payment?.completedClasses) || 0;
  const paymentHistory: any[] = Array.isArray(payment?.paymentHistory) ? payment.paymentHistory : [];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-neutral-800 bg-neutral-900/90 sticky top-0 z-10 shrink-0">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                  isFullPayment
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : isHalfPayment
                    ? "bg-orange-500/15 text-orange-400 border-orange-500/30"
                    : "bg-neutral-800 text-neutral-400 border-neutral-700"
                }`}
              >
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-white">Payment & Fee Details</h2>
                  {payment && (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border inline-flex items-center gap-1.5 ${
                        isFullPayment
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : isHalfPayment
                          ? "bg-orange-500/15 text-orange-400 border-orange-500/30"
                          : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                      }`}
                    >
                      {isFullPayment ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Full Payment (Paid in Full)
                        </>
                      ) : isHalfPayment ? (
                        <>
                          <Clock className="w-3.5 h-3.5" /> Half Payment Recorded
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3.5 h-3.5" /> {payment.paymentStatus || "Pending"}
                        </>
                      )}
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Student: <span className="text-white font-medium">{studentName}</span> · Course:{" "}
                  <span className="text-amber-400 font-medium">{courseName}</span> · Sales:{" "}
                  <span className="text-neutral-300 font-medium">{salesExecutive}</span>
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

          {/* Body Content */}
          <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
            {isLoading && !payment ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-neutral-400">
                <div className="w-7 h-7 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs">Loading payment details...</p>
              </div>
            ) : !payment ? (
              /* No payment found state */
              <div className="p-6 bg-neutral-950/60 border border-neutral-800 rounded-2xl text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                  <CreditCard className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">No Payment Record Found</h3>
                  <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
                    This student does not have any admission or fee records yet. Record an admission fee payment
                    now to start tracking collections.
                  </p>
                </div>
                {onAddAdmissionPayment && (
                  <button
                    onClick={() => {
                      onClose();
                      onAddAdmissionPayment();
                    }}
                    className="px-4 py-2 brand-gradient text-black font-semibold rounded-xl text-xs inline-flex items-center gap-1.5 shadow-lg shadow-amber-500/10 hover:opacity-95"
                  >
                    <Plus className="w-4 h-4" />
                    Record Admission Payment
                  </button>
                )}
              </div>
            ) : (
              /* Active Payment Details View */
              <div className="space-y-4">
                {/* 4 Financial KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs">
                  <div className="p-3 bg-neutral-950/80 rounded-xl border border-neutral-800/80">
                    <span className="text-neutral-500 block text-[10px] uppercase font-semibold">Total Fee</span>
                    <span className="text-white font-bold text-base mt-0.5 block">
                      ₹{totalFee.toLocaleString("en-IN")}
                    </span>
                  </div>

                  <div className="p-3 bg-neutral-950/80 rounded-xl border border-neutral-800/80">
                    <span className="text-neutral-500 block text-[10px] uppercase font-semibold">Amount Paid</span>
                    <span className="text-emerald-400 font-bold text-base mt-0.5 block">
                      ₹{amountPaid.toLocaleString("en-IN")}
                    </span>
                  </div>

                  <div className="p-3 bg-neutral-950/80 rounded-xl border border-neutral-800/80">
                    <span className="text-neutral-500 block text-[10px] uppercase font-semibold">Remaining Balance</span>
                    <span
                      className={`font-bold text-base mt-0.5 block ${
                        remainingAmount === 0 ? "text-emerald-400" : "text-orange-400"
                      }`}
                    >
                      ₹{remainingAmount.toLocaleString("en-IN")}
                    </span>
                  </div>

                  <div className="p-3 bg-neutral-950/80 rounded-xl border border-neutral-800/80">
                    <span className="text-neutral-500 block text-[10px] uppercase font-semibold">Classes / Due Trigger</span>
                    <span className="text-amber-400 font-bold text-base mt-0.5 block">
                      {assignedClasses} Cls
                    </span>
                    <span className="text-[10px] text-neutral-500 block">Due after {dueAfterClasses}</span>
                  </div>
                </div>

                {/* Status & Option Details Card */}
                <div className="p-4 bg-neutral-950/50 rounded-xl border border-neutral-800 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] text-neutral-500 uppercase font-semibold block">Payment Option</span>
                      <span className="font-semibold text-white mt-0.5 block">
                        {payment.paymentType || (remainingAmount <= 0 ? "Full Payment" : "Half Payment")}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-neutral-500 uppercase font-semibold block">Payment Status</span>
                      <span
                        className={`font-semibold mt-0.5 inline-flex items-center gap-1.5 ${
                          isFullPayment ? "text-emerald-400" : isHalfPayment ? "text-orange-400" : "text-amber-400"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isFullPayment ? "bg-emerald-400" : isHalfPayment ? "bg-orange-400" : "bg-amber-400"
                          }`}
                        />
                        {isFullPayment ? "Full Payment (Paid)" : isHalfPayment ? "Half Payment (Partial)" : payment.paymentStatus}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-neutral-500 uppercase font-semibold block">Admission / First Payment</span>
                      <span className="text-neutral-300 font-medium mt-0.5 block">
                        {payment.admissionDate
                          ? format(new Date(payment.admissionDate), "dd MMM yyyy")
                          : payment.createdAt
                          ? format(new Date(payment.createdAt), "dd MMM yyyy")
                          : "—"}
                      </span>
                    </div>
                  </div>

                  {payment.notes && (
                    <div className="pt-2 border-t border-neutral-800/70 text-xs">
                      <span className="text-[10px] text-neutral-500 uppercase font-semibold block">Notes:</span>
                      <p className="text-neutral-300 mt-0.5 italic">{payment.notes}</p>
                    </div>
                  )}
                </div>

                {/* Class Due Trigger Progress Bar */}
                {assignedClasses > 0 && (
                  <div className="p-3.5 bg-neutral-950/50 rounded-xl border border-neutral-800 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-neutral-400 font-medium">Class Attendance &amp; Due Trigger:</span>
                      <span className="text-amber-400 font-bold">
                        {completedClasses >= dueAfterClasses
                          ? "Trigger Reached (Payment Due)"
                          : `${dueAfterClasses - completedClasses} classes remaining before 2nd installment`}
                      </span>
                    </div>
                    <div className="relative w-full h-2.5 bg-neutral-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, Math.round((completedClasses / assignedClasses) * 100))}%`,
                        }}
                      />
                      <div
                        className="absolute top-0 bottom-0 w-1.5 bg-amber-400 z-10"
                        style={{
                          left: `${Math.min(100, Math.round((dueAfterClasses / assignedClasses) * 100))}%`,
                        }}
                        title={`Due trigger threshold at ${dueAfterClasses} classes`}
                      />
                    </div>
                  </div>
                )}

                {/* Payment History Timeline */}
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                      Payment History ({paymentHistory.length} Record{paymentHistory.length === 1 ? "" : "s"})
                    </span>
                    <span className="text-[11px] text-neutral-500">
                      Total Collected:{" "}
                      <span className="text-emerald-400 font-bold">₹{amountPaid.toLocaleString("en-IN")}</span>
                    </span>
                  </div>

                  {paymentHistory.length === 0 ? (
                    <div className="p-3 bg-neutral-950/40 rounded-xl border border-neutral-800 text-center text-xs text-neutral-500">
                      No transaction records logged yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {paymentHistory.map((tx: any, idx: number) => (
                        <div
                          key={tx.id || idx}
                          className="p-3 bg-neutral-950/80 border border-neutral-800/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:border-neutral-700 transition-colors"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">
                                Payment #{paymentHistory.length - idx}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 font-medium">
                                {tx.paymentType || "Payment"}
                              </span>
                              {tx.paymentMethod && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                                  {tx.paymentMethod}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-neutral-400">
                              {tx.paymentDate
                                ? format(new Date(tx.paymentDate), "dd MMM yyyy, hh:mm a")
                                : tx.createdAt
                                ? format(new Date(tx.createdAt), "dd MMM yyyy")
                                : "—"}{" "}
                              {tx.transactionId ? `· Ref: ${tx.transactionId}` : ""}{" "}
                              {tx.recordedBy ? `· By: ${tx.recordedBy}` : ""}
                            </p>
                            {tx.notes && <p className="text-[10px] text-neutral-500 italic">{tx.notes}</p>}
                          </div>

                          <div className="text-left sm:text-right shrink-0">
                            <span className="font-extrabold text-sm text-emerald-400 block">
                              +₹{Number(tx.amount || 0).toLocaleString("en-IN")}
                            </span>
                            <span className="text-[11px] text-neutral-500 block">
                              Balance: ₹{Number(tx.remainingBalance !== undefined ? tx.remainingBalance : remainingAmount).toLocaleString("en-IN")}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-4 sm:p-5 border-t border-neutral-800 bg-neutral-900 flex flex-wrap items-center justify-between gap-2.5">
            <div className="text-xs text-neutral-400">
              {payment && remainingAmount > 0 && (
                <span>
                  Outstanding:{" "}
                  <strong className="text-orange-400">₹{remainingAmount.toLocaleString("en-IN")}</strong>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {payment && remainingAmount > 0 && onRecordPayment && (
                <button
                  onClick={() => {
                    onClose();
                    onRecordPayment(payment);
                  }}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors shadow-md shadow-emerald-500/10"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  Record Balance Payment
                </button>
              )}

              {payment && onEditPayment && (
                <button
                  onClick={() => {
                    onClose();
                    onEditPayment(payment);
                  }}
                  className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors border border-neutral-700"
                >
                  <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                  Edit Payment
                </button>
              )}

              <button
                onClick={onClose}
                className="px-4 py-2 bg-neutral-800/80 hover:bg-neutral-800 text-neutral-300 text-xs font-semibold rounded-xl transition-colors border border-neutral-700/60"
              >
                Close
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default DemoPaymentDetailsModal;

