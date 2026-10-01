"use client";

import { Calendar, Users, Home, Settings, LogOut, Bell, Search, Menu, ChevronRight, BookOpen, FileText, CheckCircle, Video, TrendingUp, Download, WifiOff } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/authStore";
import { useSearchStore } from "@/store/searchStore";
import { usePwa } from "@/components/pwa/PwaProvider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { user, token, logout } = useAuthStore();
  const { searchQuery, setSearchQuery } = useSearchStore();
  const { canInstall, isInstalled, promptInstall, isOnline } = usePwa();

  useEffect(() => {
    setSearchQuery("");
  }, [pathname, setSearchQuery]);

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(true);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    if (!token) router.push("/login");
    return () => window.removeEventListener("resize", checkMobile);
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

  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  if (!mounted || !token) return null;

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex overflow-hidden">
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobile && sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: isMobile ? (sidebarOpen ? 280 : 0) : (sidebarOpen ? 240 : 64) }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className={`h-screen bg-neutral-900 border-r border-neutral-800 flex flex-col shrink-0 z-50 overflow-hidden ${isMobile ? "fixed inset-y-0 left-0" : "relative"}`}
      >
        {/* Sidebar Header */}
        <div className="h-14 sm:h-16 flex items-center justify-between border-b border-neutral-800 shrink-0 px-4">
          <div className="flex items-center">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-lg hover:bg-neutral-800 transition-colors shrink-0 hidden md:block"
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
          {isMobile && (
            <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-lg hover:bg-neutral-800 transition-colors shrink-0 text-neutral-400">
              <Menu className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => { if (isMobile) setSidebarOpen(false); }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative min-h-[44px] ${
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
          {canInstall && !isInstalled && (
            <button
              onClick={() => promptInstall()}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 transition-all w-full min-h-[44px] cursor-pointer"
              title="Install Schedulix App"
            >
              <Download className="w-5 h-5 shrink-0" />
              <AnimatePresence>
                {sidebarOpen && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center justify-between flex-1 min-w-0"
                  >
                    <span className="text-sm font-medium whitespace-nowrap">Install App</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded font-semibold">PWA</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition-all w-full min-h-[44px]"
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

      {/* Main Container */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden w-full min-w-0">
        {/* Top Bar */}
        <header className="h-14 sm:h-16 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-3 sm:px-4 md:px-6 shrink-0 gap-2 sm:gap-4 relative z-30">
          {/* Mobile Menu & Breadcrumb */}
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            {isMobile && (
              <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors shrink-0">
                <Menu className="w-5 h-5" />
              </button>
            )}
            <div className="flex items-center gap-1.5 md:gap-2 text-xs sm:text-sm text-neutral-400 truncate">
              <span className="text-neutral-600 hidden sm:inline">App</span>
              <ChevronRight className="w-3.5 h-3.5 text-neutral-700 hidden sm:inline" />
              <span className="text-white font-medium capitalize truncate">
                {pathname.split("/").pop() || "dashboard"}
              </span>
              {!isOnline && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-full shrink-0 ml-1">
                  <WifiOff className="w-3 h-3 text-amber-400" />
                  <span>Offline</span>
                </span>
              )}
            </div>
          </div>

          {/* Search + Actions */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Desktop Search */}
            <div className="relative hidden md:block">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="bg-neutral-800 border border-neutral-700 rounded-lg pl-9 pr-4 py-1.5 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 transition-all w-40 lg:w-56 placeholder-neutral-600 text-white"
              />
            </div>

            {/* Mobile Search Toggle */}
            <button
              onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
              className="p-2 rounded-lg hover:bg-neutral-800 transition-colors md:hidden text-neutral-400 hover:text-white"
              title="Search"
            >
              <Search className="w-5 h-5" />
            </button>

            <button className="relative p-2 rounded-lg hover:bg-neutral-800 transition-colors">
              <Bell className="w-5 h-5 text-neutral-400" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
            </button>
          </div>

          {/* Expandable Mobile Search Dropdown */}
          <AnimatePresence>
            {mobileSearchOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute inset-x-0 top-full bg-neutral-900 border-b border-neutral-800 p-3 flex items-center gap-2 md:hidden z-40 shadow-xl"
              >
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                  <input
                    type="text"
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search across page..."
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white outline-none focus:border-amber-500"
                  />
                </div>
                <button
                  onClick={() => setMobileSearchOpen(false)}
                  className="px-3 py-2 text-xs font-semibold text-neutral-400 hover:text-white bg-neutral-800 rounded-xl"
                >
                  Close
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 lg:p-8 w-full min-w-0">
          {children}
        </div>
      </main>
    </div>
  );
}
