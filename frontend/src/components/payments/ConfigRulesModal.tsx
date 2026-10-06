"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sliders, CheckCircle2, Plus, Trash2, AlertCircle, Clock } from "lucide-react";

interface ConfigRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConfigRulesModal({ isOpen, onClose }: ConfigRulesModalProps) {
  const queryClient = useQueryClient();

  const { data: configData, isLoading } = useQuery({
    queryKey: ["payment-config"],
    queryFn: async () => (await api.get("/payments/config")).data,
    enabled: isOpen,
  });

  const [rules, setRules] = useState<{ assignedClasses: number; dueAfterClasses: number }[]>([
    { assignedClasses: 15, dueAfterClasses: 5 },
    { assignedClasses: 25, dueAfterClasses: 12 },
  ]);
  const [reminderLead, setReminderLead] = useState<number>(2);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string>("");

  useEffect(() => {
    if (configData) {
      if (Array.isArray(configData.rules)) {
        setRules(configData.rules);
      }
      if (typeof configData.reminderLeadClasses === "number") {
        setReminderLead(configData.reminderLeadClasses);
      }
    }
  }, [configData]);

  const updateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.put("/payments/config", payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-config"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payment-notifications"] });
      setSuccessMsg("Rules updated successfully!");
      setTimeout(() => {
        setSuccessMsg("");
        onClose();
      }, 1000);
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.message || err.message || "Failed to update rules");
    },
  });

  const handleAddRule = () => {
    setRules([...rules, { assignedClasses: 30, dueAfterClasses: 15 }]);
  };

  const handleRemoveRule = (index: number) => {
    if (rules.length <= 1) {
      setErrorMsg("Must have at least one rule defined");
      return;
    }
    setRules(rules.filter((_, i) => i !== index));
  };

  const handleRuleChange = (index: number, field: "assignedClasses" | "dueAfterClasses", val: number) => {
    const updated = [...rules];
    updated[index][field] = Math.max(1, Number(val) || 1);
    setRules(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    updateMutation.mutate({
      rules,
      reminderLeadClasses: Math.max(0, Number(reminderLead) || 2),
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
          className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-neutral-800 bg-neutral-900 sticky top-0 z-10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">Payment Due Rules Configuration</h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Configure class completion thresholds & reminders
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

          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
            {errorMsg && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2.5 text-xs text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            {successMsg && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2.5 text-xs text-emerald-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Rules List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                  Class Threshold Rules
                </label>
                <button
                  type="button"
                  onClick={handleAddRule}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-neutral-800 hover:bg-neutral-700 text-amber-400 flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Rule
                </button>
              </div>

              <div className="space-y-2">
                {rules.map((rule, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-3 bg-neutral-950 border border-neutral-800 rounded-xl"
                  >
                    <div className="flex-1 space-y-1">
                      <span className="text-[10px] text-neutral-500 block uppercase font-medium">Assigned Classes</span>
                      <input
                        type="number"
                        min="1"
                        value={rule.assignedClasses}
                        onChange={(e) => handleRuleChange(idx, "assignedClasses", Number(e.target.value))}
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white outline-none focus:border-amber-500"
                      />
                    </div>

                    <span className="text-neutral-500 text-sm mt-4">➔</span>

                    <div className="flex-1 space-y-1">
                      <span className="text-[10px] text-neutral-500 block uppercase font-medium">Due After Classes</span>
                      <input
                        type="number"
                        min="1"
                        value={rule.dueAfterClasses}
                        onChange={(e) => handleRuleChange(idx, "dueAfterClasses", Number(e.target.value))}
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-amber-400 outline-none focus:border-amber-500"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveRule(idx)}
                      className="mt-4 p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Remove Rule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Reminder Lead configuration */}
            <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl space-y-2">
              <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" /> Upcoming Reminder Lead (Classes Prior)
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={reminderLead}
                onChange={(e) => setReminderLead(Math.max(1, Number(e.target.value) || 2))}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs font-bold text-white outline-none focus:border-amber-500"
              />
              <p className="text-[11px] text-neutral-500 leading-relaxed">
                Example: If due after 5 classes and lead is {reminderLead}, reminder triggers at {Math.max(1, 5 - reminderLead)} completed classes.
              </p>
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
                disabled={updateMutation.isPending}
                className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-black bg-amber-500 hover:bg-amber-400 transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50"
              >
                {updateMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Save Rule Changes
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
