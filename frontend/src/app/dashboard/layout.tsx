"use client";

import { Calendar, Users, Home, Settings, LogOut, Bell, Search, Menu, ChevronRight, BookOpen, FileText, CheckCircle, Video, TrendingUp } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/authStore";
import { useSearchStore } from "@/store/searchStore";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mounted, setMounted] = useState(false);
  const { user, token, logout } = useAuthStore();
  const { searchQuery, setSearchQuery } = useSearchStore();

  useEffect(() => {
    setSearchQuery("");
  }, [pathname, setSearchQuery]);

  useEffect(() => {
    setMounted(true);
    if (!token) router.push("/login");
  }, [token, router]);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const isTeacher = user?.role === "Teacher";

  const isSubAdmin = user?.role === "Sub Admin";
  const isSalesPerson = user?.role === "Sales Person";
  const permissions = user?.permissions || {};

  const canAccess = (module: string) => {
    if (isTeacher) return true; // Handled separately
    if (isSalesPerson) return module === "demoSessions" || module === "settings";
    if (!isSubAdmin && !isSalesPerson) return true; // Admin/Super Admin
    return permissions[module]?.read === true;
  };

  const navItems = [
    { icon: Home, label: isTeacher ? "My Overview" : "Dashboard", href: "/dashboard", show: canAccess("dashboard") },
    { icon: Calendar, label: isTeacher ? "My Schedule" : "Schedule", href: "/dashboard/schedule", show: canAccess("schedule") },
    ...(isTeacher
      ? [
          { icon: BookOpen, label: "My Batches", href: "/dashboard/batches", show: true },
          { icon: Video, label: "Demo Sessions", href: "/dashboard/demo-sessions", show: true },
          { icon: CheckCircle, label: "Completed Classes", href: "/dashboard/completed-classes", show: true },
          { icon: Users, label: "Attendance", href: "/dashboard/attendance", show: true },
          { icon: TrendingUp, label: "Performance", href: "/dashboard/performance", show: true }
        ]
      : [
          { icon: BookOpen, label: "Batches", href: "/dashboard/batches", show: canAccess("batches") },
          { icon: Users, label: "Teachers", href: "/dashboard/teachers", show: canAccess("teachers") },
          { icon: Users, label: "Students", href: "/dashboard/students", show: canAccess("students") },
          { icon: Users, label: "Sales People", href: "/dashboard/sales-people", show: canAccess("salesPeople") },
          { icon: Video, label: "Demo Sessions", href: "/dashboard/demo-sessions", show: canAccess("demoSessions") },
          { icon: FileText, label: "Class Notes", href: "/dashboard/class-notes", show: canAccess("classNotes") },
          { icon: Users, label: "Attendance", href: "/dashboard/attendance", show: canAccess("attendance") },
        ]),
    { icon: Settings, label: "Settings", href: "/dashboard/settings", show: canAccess("settings") },
  ].filter(item => item.show);

  if (!mounted || !token) return null;

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex overflow-hidden">
      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? 240 : 64 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="h-screen bg-neutral-900 border-r border-neutral-800 flex flex-col shrink-0 relative z-20 overflow-hidden"
      >
        {/* Sidebar Header */}
        <div className="h-16 flex items-center border-b border-neutral-800 shrink-0 px-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-neutral-800 transition-colors shrink-0"
          >
            <Menu className="w-5 h-5 text-neutral-400" />
          </button>
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
                className="ml-3 flex items-center gap-2 overflow-hidden whitespace-nowrap"
              >
                <div className="w-7 h-7 brand-gradient rounded-lg flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 text-black" />
                </div>
                <span className="font-bold text-white tracking-tight">Schedulix</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative ${
                  isActive
                    ? "bg-amber-500/10 text-amber-400"
                    : "text-neutral-400 hover:text-white hover:bg-neutral-800"
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-amber-500 rounded-r-full" />
                )}
                <item.icon className="w-5 h-5 shrink-0" />
                <AnimatePresence>
                  {sidebarOpen && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="font-medium text-sm whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            );
          })}
        </nav>

        {/* User + Logout */}
        <div className="p-3 border-t border-neutral-800 shrink-0 space-y-1">
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-3 py-2 flex items-center gap-3 mb-1"
              >
                <div className="w-7 h-7 rounded-full brand-gradient flex items-center justify-center text-xs font-bold text-black shrink-0">
                  {user?.name?.charAt(0) || "A"}
                </div>
                <div className="overflow-hidden">
                  <p className="text-xs font-medium text-white truncate">{user?.name || "Admin"}</p>
                  <p className="text-[10px] text-neutral-500 capitalize">{user?.role || "Admin"}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition-all w-full"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <AnimatePresence>
              {sidebarOpen && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm font-medium whitespace-nowrap">
                  Sign out
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </motion.aside>

      {/* Main */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-6 shrink-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <span className="text-neutral-600">App</span>
            <ChevronRight className="w-3.5 h-3.5 text-neutral-700" />
            <span className="text-white font-medium capitalize">
              {pathname.split("/").pop() || "dashboard"}
            </span>
          </div>

          {/* Search + Actions */}
          <div className="flex items-center gap-3">
            <div className="relative hidden md:block">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="bg-neutral-800 border border-neutral-700 rounded-lg pl-9 pr-4 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 transition-all w-48 placeholder-neutral-600"
              />
            </div>
            <button className="relative p-2 rounded-lg hover:bg-neutral-800 transition-colors">
              <Bell className="w-5 h-5 text-neutral-400" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
