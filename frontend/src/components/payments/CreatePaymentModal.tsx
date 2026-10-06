"use client";

import { useState } from "react";
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
  CheckCircle2,
  Sparkles,
  Loader2,
  AlertCircle,
  FileText,
  User,
} from "lucide-react";

interface CreatePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CreatePaymentModal({
  isOpen,
  onClose,
  onSuccess,
}: CreatePaymentModalProps) {
  const queryClient = useQueryClient();

  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [customStudentName, setCustomStudentName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [batchId, setBatchId] = useState("");
  const [totalFee, setTotalFee] = useState<number>(15000);
  const [assignedClasses, setAssignedClasses] = useState<number>(15);
  const [paymentOption, setPaymentOption] = useState<"Full" | "Half" | "Custom">("Full");
  const [customAmount, setCustomAmount] = useState<number>(7500);
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [transactionId, setTransactionId] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [salesExecutive, setSalesExecutive] = useState("");
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Fetch all students for selector
  const { data: students = [] } = useQuery({
    queryKey: ["students"],
    queryFn: async () => (await api.get("/students")).data,
  });

  // Fetch batches
  const { data: batches = [] } = useQuery({
    queryKey: ["batches"],
    queryFn: async () => (await api.get("/batches")).data,
  });

  // Fetch sales people
  const { data: salesPeople = [] } = useQuery({
    queryKey: ["sales-people"],
    queryFn: async () => (await api.get("/sales-people")).data,
  });

  // Calculate amounts
  let amountPaid = 0;
  if (paymentOption === "Full") {
    amountPaid = totalFee;
  } else if (paymentOption === "Half") {
    amountPaid = Math.round(totalFee * 0.5);
  } else {
    amountPaid = Math.max(0, Math.min(totalFee, Number(customAmount) || 0));
  }
  const remainingAmount = Math.max(0, totalFee - amountPaid);
  const dueAfterClasses = assignedClasses >= 25 ? 12 : 5;

  const handleStudentSelect = (id: string) => {
    setSelectedStudentId(id);
    const s = students.find((item: any) => item._id === id);
    if (s) {
      setCustomStudentName(s.name);
      if (s.batch) {
        const bId = s.batch._id || s.batch;
        setBatchId(bId);
        const b = batches.find((item: any) => item._id === bId);
        if (b) {
          setCourseName(b.subject || b.name || "");
          if (b.numberOfSessions) setAssignedClasses(Number(b.numberOfSessions));
        }
      }
    }
  };

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post("/payments/admission", payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payment-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      if (selectedStudentId) {
        queryClient.invalidateQueries({ queryKey: ["student", selectedStudentId] });
        queryClient.invalidateQueries({ queryKey: ["student-payment", selectedStudentId] });
      }
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.message || err.message || "Failed to create payment record");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!selectedStudentId && !customStudentName.trim()) {
      setErrorMsg("Please select or enter a student name");
      return;
    }
    if (totalFee <= 0) {
      setErrorMsg("Total course fee must be greater than 0");
      return;
    }

    createMutation.mutate({
      studentId: selectedStudentId || undefined,
      studentName: customStudentName,
      batchId: batchId || undefined,
      courseName: courseName || "Standard Course",
      totalFee,
      assignedClasses,
      paymentType: paymentOption === "Full" ? "Full Payment" : paymentOption === "Half" ? "Half Payment" : "Custom Payment",
      amountPaid,
      paymentMethod,
      transactionId,
      paymentDate,
      salesExecutive,
      closedBy: salesExecutive,
      notes,
    });
  };

  if (!isOpen) return null;

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
                <h3 className="text-base font-bold text-white">Create Fee & Payment Record</h3>
                <p className="text-xs text-neutral-400">Direct admission or existing student fee setup</p>
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

              {/* Student Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-amber-400" />
                  Select Student
                </label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => handleStudentSelect(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none transition-colors"
                >
                  <option value="">-- Choose from existing students or type name below --</option>
                  {students.map((s: any) => (
                    <option key={s._id} value={s._id}>
                      {s.name} {s.phone ? `(${s.phone})` : ""}
                    </option>
                  ))}
                </select>
                {!selectedStudentId && (
                  <input
                    type="text"
                    placeholder="Or enter new student name manually"
                    value={customStudentName}
                    onChange={(e) => setCustomStudentName(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none transition-colors mt-1.5"
                  />
                )}
              </div>

              {/* Course & Batch */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-neutral-400" />
                    Course / Subject Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Scratch Level 1"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none transition-colors"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300">
                    Assigned Classes
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={assignedClasses}
                    onChange={(e) => setAssignedClasses(Number(e.target.value) || 15)}
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none transition-colors"
                    required
                  />
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
                  min="1"
                  step="100"
                  value={totalFee}
                  onChange={(e) => setTotalFee(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none transition-colors font-semibold"
                  required
                />
              </div>

              {/* Payment Type Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-neutral-300">
                  Select Payment Option
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["Full", "Half", "Custom"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setPaymentOption(opt)}
                      className={`p-2.5 rounded-xl text-xs font-semibold border transition-all text-center ${
                        paymentOption === opt
                          ? "bg-amber-500/15 border-amber-500 text-amber-300 shadow-sm"
                          : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700"
                      }`}
                    >
                      {opt === "Full" ? "Full (100%)" : opt === "Half" ? "Half (50%)" : "Custom"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Amount input if selected */}
              {paymentOption === "Custom" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300">
                    Custom Paid Amount (₹)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={totalFee}
                    value={customAmount}
                    onChange={(e) => setCustomAmount(Number(e.target.value) || 0)}
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none transition-colors"
                    required
                  />
                </div>
              )}

              {/* Summary Card */}
              <div className="p-3.5 bg-neutral-950/80 border border-neutral-800 rounded-xl grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-neutral-500 block">Paying Now</span>
                  <span className="text-emerald-400 font-bold text-sm">
                    ₹{amountPaid.toLocaleString("en-IN")}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500 block">Remaining Due</span>
                  <span className="text-amber-400 font-bold text-sm">
                    ₹{remainingAmount.toLocaleString("en-IN")}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500 block">Due Trigger</span>
                  <span className="text-neutral-300 font-medium text-xs">
                    {remainingAmount > 0 ? `After ${dueAfterClasses} Cls` : "None (Paid)"}
                  </span>
                </div>
              </div>

              {/* Which Sales Person Closed the Deal */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-sky-400" />
                  Closed By (Sales Person)
                </label>
                <select
                  value={salesExecutive}
                  onChange={(e) => setSalesExecutive(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none transition-colors"
                >
                  <option value="">Select Sales Person (or type below)</option>
                  {salesPeople.map((sp: any) => (
                    <option key={sp._id} value={sp.name}>
                      {sp.name}
                    </option>
                  ))}
                  {salesExecutive && !salesPeople.some((sp: any) => sp.name === salesExecutive) && (
                    <option value={salesExecutive}>{salesExecutive}</option>
                  )}
                </select>
                <input
                  type="text"
                  placeholder="Or enter sales person name"
                  value={salesExecutive}
                  onChange={(e) => setSalesExecutive(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800/80 focus:border-amber-500 rounded-xl px-3 py-1.5 text-xs text-neutral-300 focus:outline-none transition-colors mt-1"
                />
              </div>

              {/* Payment Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300">Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition-colors"
                  >
                    <option value="UPI">UPI</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Debit Card">Debit Card</option>
                    <option value="Cash">Cash</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300">Transaction ID</label>
                  <input
                    type="text"
                    placeholder="Ref # / TXN ID"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300">Payment Date</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Staff Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-neutral-400" />
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Admission or payment remarks..."
                  className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-xl p-3 text-sm text-white focus:outline-none transition-colors resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-4 sm:p-5 border-t border-neutral-800 bg-neutral-950/60">
              <button
                type="button"
                onClick={onClose}
                disabled={createMutation.isPending}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-xl text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-neutral-950 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-amber-500/20"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Recording...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Record Admission Fee
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
