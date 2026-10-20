"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { GraduationCap, CheckCircle, FileText, Users, ChevronDown, Sparkles, ArrowRight } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

export function SessionMenuDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { user } = useAuthStore();

  const isTeacher = user?.role === "Teacher";
  const isSubAdmin = user?.role === "Sub Admin";
  const permissions = user?.permissions || {};

  const canAccess = (module: string) => {
    if (isTeacher) return true;
    if (!isSubAdmin) return true;
    return permissions[module]?.read === true;
  };

  const sessionItems = [
    {
      id: "completed-classes",
      title: "Completed Classes",
      description: "Class history, status & completion notes",
      href: "/dashboard/completed-classes",
      icon: CheckCircle,
      iconColor: "text-emerald-400",
      bgGlow: "bg-emerald-500/10 border-emerald-500/20 group-hover:border-emerald-500/40",
      badge: "Classes",
      show: isTeacher || canAccess("completedClasses"),
    },
    {
      id: "class-notes",
      title: "Class Notes",
      description: "Teacher remarks & curriculum coverage",
      href: "/dashboard/class-notes",
      icon: FileText,
      iconColor: "text-sky-400",
      bgGlow: "bg-sky-500/10 border-sky-500/20 group-hover:border-sky-500/40",
      badge: "Notes",
      // Class notes page explicitly denies access to teachers
      show: !isTeacher && canAccess("classNotes"),
    },
    {
      id: "attendance",
      title: "Attendance",
      description: "Unified student presence & date records",
      href: "/dashboard/attendance",
      icon: Users,
      iconColor: "text-amber-400",
      bgGlow: "bg-amber-500/10 border-amber-500/20 group-hover:border-amber-500/40",
      badge: "Attendance",
      show: isTeacher || canAccess("attendance"),
    },
  ].filter((item) => item.show);

  // Determine active item if currently on one of the session routes
  const activeSessionItem = sessionItems.find(
    (item) => pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))
  );

  const isSessionActive = !!activeSessionItem;

  // Close on outside click or escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (sessionItems.length === 0) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Menu Bar Selector Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-medium transition-all ${
          isOpen
            ? "bg-neutral-800 text-white border-neutral-700 shadow-lg shadow-black/40"
            : isSessionActive
            ? "bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/15"
            : "bg-neutral-800/80 hover:bg-neutral-800 text-neutral-300 hover:text-white border-neutral-700/60"
        }`}
        title="Session Menu: Completed Classes, Class Notes, Attendance"
      >
        <div
          className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
            isSessionActive ? "bg-amber-500/20 text-amber-400" : "bg-neutral-700/60 text-neutral-300"
          }`}
        >
          <GraduationCap className="w-3.5 h-3.5" />
        </div>

        {/* Label: dynamic active item or generic "Sessions" */}
        <div className="flex items-center gap-1 text-left min-w-0">
          <span className="font-semibold tracking-tight">Sessions</span>
          {isSessionActive && (
            <span className="hidden lg:inline text-neutral-400 font-normal">
              : <span className="text-white font-medium">{activeSessionItem.title}</span>
            </span>
          )}
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-neutral-400 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-white" : ""
          }`}
        />

        {/* Small active badge dot */}
        {isSessionActive && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse ml-0.5" />
        )}
      </button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-72 sm:w-80 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-neutral-800/80 bg-neutral-900/90 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <GraduationCap className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Session Menu</h4>
                  <p className="text-[10px] text-neutral-400">Class completion, notes & attendance</p>
                </div>
              </div>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-neutral-800 text-neutral-400 border border-neutral-700/50">
                {sessionItems.length} views
              </span>
            </div>

            {/* List of Session items */}
            <div className="p-2 space-y-1">
              {sessionItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));
                const IconComponent = item.icon;

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={`group flex items-start gap-3 p-2.5 rounded-xl transition-all border ${
                      isActive
                        ? "bg-amber-500/10 border-amber-500/30 text-white"
                        : "border-transparent hover:bg-neutral-800/80 hover:border-neutral-700/60 text-neutral-300 hover:text-white"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border transition-all ${
                        isActive
                          ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                          : `${item.bgGlow} ${item.iconColor}`
                      }`}
                    >
                      <IconComponent className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs font-semibold ${isActive ? "text-amber-300" : "text-white"}`}>
                          {item.title}
                        </span>
                        {isActive && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-400 truncate mt-0.5 leading-tight">
                        {item.description}
                      </p>
                    </div>

                    <ArrowRight
                      className={`w-3.5 h-3.5 shrink-0 self-center transition-transform ${
                        isActive
                          ? "text-amber-400 translate-x-0"
                          : "text-neutral-600 group-hover:text-neutral-400 group-hover:translate-x-0.5"
                      }`}
                    />
                  </Link>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-3 py-2 bg-neutral-950/40 border-t border-neutral-800/60 flex items-center justify-between text-[10px] text-neutral-500">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400/80" />
                Quick-select from any page
              </span>
              <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-400 border border-neutral-700/40 text-[9px]">
                Esc to close
              </kbd>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
