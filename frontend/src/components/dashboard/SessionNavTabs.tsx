"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle, FileText, Users, GraduationCap } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

interface SessionNavTabsProps {
  className?: string;
}

export function SessionNavTabs({ className = "" }: SessionNavTabsProps) {
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

  const tabs = [
    {
      id: "completed-classes",
      label: "Completed Classes",
      href: "/dashboard/completed-classes",
      icon: CheckCircle,
      show: isTeacher || canAccess("completedClasses"),
      description: "Finished class records & verified status",
    },
    {
      id: "class-notes",
      label: "Class Notes",
      href: "/dashboard/class-notes",
      icon: FileText,
      // Teacher role does not have access to class-notes page
      show: !isTeacher && canAccess("classNotes"),
      description: "Teacher remarks & curriculum notes",
    },
    {
      id: "attendance",
      label: "Attendance",
      href: "/dashboard/attendance",
      icon: Users,
      show: isTeacher || canAccess("attendance"),
      description: "Student attendance records & tracking",
    },
  ].filter((t) => t.show);

  if (tabs.length <= 1) return null;

  return (
    <div className={`flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar ${className}`}>
      <div className="inline-flex items-center p-1 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-inner gap-1">
        <div className="px-2.5 py-1 text-[11px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5 border-r border-neutral-800 pr-3 mr-1 shrink-0 hidden sm:flex">
          <GraduationCap className="w-3.5 h-3.5 text-amber-500" />
          <span>Session</span>
        </div>

        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(tab.href);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`relative flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors shrink-0 ${
                isActive ? "text-white font-semibold" : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50"
              }`}
              title={tab.description}
            >
              {isActive && (
                <motion.div
                  layoutId="sessionNavTabActive"
                  className="absolute inset-0 bg-gradient-to-r from-amber-500/20 via-amber-500/15 to-amber-500/10 border border-amber-500/40 rounded-xl shadow-sm"
                  transition={{ type: "spring", stiffness: 450, damping: 35 }}
                />
              )}
              <Icon className={`w-4 h-4 relative z-10 ${isActive ? "text-amber-400" : "text-neutral-500"}`} />
              <span className="relative z-10">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
