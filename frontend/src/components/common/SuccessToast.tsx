"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, X } from "lucide-react";

export interface SuccessToastProps {
  message: string | null;
  onClose: () => void;
}

export function SuccessToast({ message, onClose }: SuccessToastProps) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          className="fixed top-5 right-5 z-[9999] flex items-center gap-3 px-4 py-3 bg-neutral-900 border border-emerald-500/50 text-emerald-300 rounded-xl shadow-2xl backdrop-blur-md"
        >
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <span className="text-sm font-semibold text-white">{message}</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
