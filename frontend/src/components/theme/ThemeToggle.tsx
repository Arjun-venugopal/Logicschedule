"use client";

import React, { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export function ThemeToggle({ className = "", showLabel = false }: ThemeToggleProps) {
  const { theme, toggleTheme, isDark } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Avoid layout shift before mount
  if (!mounted) {
    return (
      <div
        className={`w-9 h-9 rounded-lg animate-pulse ${className}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`relative p-2 rounded-lg text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition-colors cursor-pointer flex items-center justify-center select-none ${className}`}
      aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      title={isDark ? "Switch to ☀️ Light Mode" : "Switch to 🌙 Dark Mode"}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.div
            key="dark-icon"
            initial={{ opacity: 0, rotate: -90, scale: 0.7 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 90, scale: 0.7 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="flex items-center justify-center text-amber-400"
          >
            <Moon className="w-5 h-5" />
          </motion.div>
        ) : (
          <motion.div
            key="light-icon"
            initial={{ opacity: 0, rotate: 90, scale: 0.7 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: -90, scale: 0.7 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="flex items-center justify-center text-amber-600"
          >
            <Sun className="w-5 h-5" />
          </motion.div>
        )}
      </AnimatePresence>

      {showLabel && (
        <span className="text-xs sm:text-sm font-semibold text-neutral-800 dark:text-neutral-200">
          {isDark ? "Dark Mode" : "Light Mode"}
        </span>
      )}
    </button>
  );
}

/**
 * Segmented toggle card useful for Settings page with explicit Light/Dark cards
 */
export function ThemeSegmentedControl() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="grid grid-cols-2 gap-3 max-w-md">
      {/* Dark Theme Option */}
      <button
        type="button"
        onClick={() => setTheme("dark")}
        className={`p-3.5 sm:p-4 rounded-xl border flex flex-col items-center gap-2.5 transition-all cursor-pointer ${
          theme === "dark"
            ? "border-amber-500 bg-amber-500/15 text-white shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/40"
            : "border-neutral-300 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-400 hover:text-black dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-850 shadow-sm"
        }`}
      >
        <div className="w-9 h-9 rounded-lg bg-neutral-900 border border-neutral-700 flex items-center justify-center text-amber-400 shadow-sm">
          <Moon className="w-4.5 h-4.5" />
        </div>
        <div className="text-center">
          <span className="text-xs sm:text-sm font-bold block text-neutral-900 dark:text-white">🌙 Dark Mode</span>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400">Classic elegant dark</span>
        </div>
      </button>

      {/* Light Theme Option */}
      <button
        type="button"
        onClick={() => setTheme("light")}
        className={`p-3.5 sm:p-4 rounded-xl border flex flex-col items-center gap-2.5 transition-all cursor-pointer ${
          theme === "light"
            ? "border-amber-500 bg-[#FFF7E6] text-neutral-900 shadow-md ring-1 ring-amber-500/40"
            : "border-neutral-300 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-400 hover:text-black dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-850 shadow-sm"
        }`}
      >
        <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-sm">
          <Sun className="w-4.5 h-4.5" />
        </div>
        <div className="text-center">
          <span className="text-xs sm:text-sm font-bold block text-neutral-900 dark:text-white">☀️ Light Mode</span>
          <span className="text-[11px] text-neutral-600 dark:text-neutral-400">Clean SaaS white</span>
        </div>
      </button>
    </div>
  );
}
