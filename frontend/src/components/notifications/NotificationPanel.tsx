"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  AlertTriangle,
  Clock,
  CheckCircle,
  CreditCard,
  X,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { RecordPaymentModal } from "../payments/RecordPaymentModal";

export function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "due" | "upcoming">("all");
  const [selectedPaymentForRecord, setSelectedPaymentForRecord] = useState<any>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["payment-notifications"],
    queryFn: async () => (await api.get("/payments/notifications")).data,
    refetchInterval: 30_000,
  });

  const notifications = data?.notifications || [];
  const dueNotifications = notifications.filter((n: any) => n.type === "due");
  const upcomingNotifications = notifications.filter((n: any) => n.type === "upcoming");

  const displayedList =
    activeTab === "due"
      ? dueNotifications
      : activeTab === "upcoming"
      ? upcomingNotifications
      : notifications;

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const hasDue = dueNotifications.length > 0;
  const count = notifications.length;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-lg transition-colors ${
          isOpen ? "bg-neutral-800 text-white" : "hover:bg-neutral-800 text-neutral-400 hover:text-white"
        }`}
        title="Payment & System Notifications"
      >
        <Bell className="w-5 h-5" />
        {count > 0 && (
          <span
            className={`absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-black ${
              hasDue ? "bg-red-500 animate-pulse text-white" : "bg-amber-500"
            }`}
          >
            {count}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="p-4 border-b border-neutral-800 bg-neutral-900/90 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">System Notifications</h3>
                {count > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {count} Active
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-neutral-500 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Filter Tabs */}
            <div className="flex border-b border-neutral-800 bg-neutral-950/60 p-1.5 gap-1 shrink-0 text-xs">
              <button
                onClick={() => setActiveTab("all")}
                className={`flex-1 py-1 px-2 rounded-lg font-semibold transition-colors ${
                  activeTab === "all" ? "bg-neutral-800 text-white" : "text-neutral-400 hover:text-white"
                }`}
              >
                All ({count})
              </button>
              <button
                onClick={() => setActiveTab("due")}
                className={`flex-1 py-1 px-2 rounded-lg font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === "due" ? "bg-red-500/10 text-red-400 font-bold border border-red-500/20" : "text-neutral-400 hover:text-white"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Due ({dueNotifications.length})
              </button>
              <button
                onClick={() => setActiveTab("upcoming")}
                className={`flex-1 py-1 px-2 rounded-lg font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === "upcoming" ? "bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20" : "text-neutral-400 hover:text-white"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Upcoming ({upcomingNotifications.length})
              </button>
            </div>

            {/* Notification List */}
            <div className="overflow-y-auto p-3 space-y-2.5 flex-1 custom-scrollbar">
              {isLoading ? (
                <div className="py-8 text-center text-xs text-neutral-500">
                  <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  Loading notifications...
                </div>
              ) : displayedList.length === 0 ? (
                <div className="py-8 text-center text-neutral-500">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-neutral-600" />
                  <p className="text-xs font-semibold text-neutral-400">All caught up!</p>
                  <p className="text-[11px] text-neutral-600 mt-0.5">No pending fee notifications right now.</p>
                </div>
              ) : (
                displayedList.map((item: any) => {
                  const isDue = item.type === "due";
                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        isDue
                          ? "bg-red-500/5 border-red-500/20 hover:border-red-500/40"
                          : "bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {isDue ? (
                            <span className="w-2 h-2 rounded-full bg-red-400 shrink-0 animate-ping" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          )}
                          <span
                            className={`text-xs font-bold ${
                              isDue ? "text-red-400" : "text-amber-400"
                            }`}
                          >
                            🔔 {item.title}
                          </span>
                        </div>
                        <span className="text-[11px] font-bold text-white bg-neutral-800 px-2 py-0.5 rounded-md">
                          ₹{Number(item.outstandingAmount).toLocaleString("en-IN")}
                        </span>
                      </div>

                      <div className="mt-2 space-y-1 text-xs">
                        <p className="text-white font-semibold">
                          Student: <span className="text-amber-400 font-bold">{item.studentName}</span>
                        </p>
                        <p className="text-neutral-400 text-[11px]">
                          Course: <span className="text-white">{item.courseName}</span>
                        </p>
                        <p className="text-neutral-400 text-[11px]">
                          Classes Completed: <span className="text-white font-semibold">{item.classesCompleted} / {item.assignedClasses}</span>
                        </p>
                        <p className={`text-[11px] font-semibold mt-1.5 ${isDue ? "text-red-300" : "text-amber-300/90"}`}>
                          {isDue ? "Payment is now due." : `Due after ${item.dueAfterClasses} completed classes.`}
                        </p>
                      </div>

                      {/* Action buttons */}
                      <div className="mt-3 pt-2.5 border-t border-neutral-800/80 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-neutral-500">
                          Due Trigger: {item.dueAfterClasses} Classes
                        </span>
                        <button
                          onClick={() => {
                            setSelectedPaymentForRecord({
                              _id: item.paymentId,
                              student: { _id: item.studentId, name: item.studentName },
                              courseName: item.courseName,
                              amountPaid: 0,
                              totalFee: item.outstandingAmount,
                            });
                            setIsOpen(false);
                          }}
                          className="px-2.5 py-1 text-xs font-bold text-black bg-amber-500 hover:bg-amber-400 rounded-lg flex items-center gap-1 transition-colors"
                        >
                          <CreditCard className="w-3 h-3" /> Record Payment
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Record Payment Modal if triggered from notification */}
      {selectedPaymentForRecord && (
        <RecordPaymentModal
          isOpen={true}
          onClose={() => setSelectedPaymentForRecord(null)}
          payment={selectedPaymentForRecord}
        />
      )}
    </div>
  );
}
