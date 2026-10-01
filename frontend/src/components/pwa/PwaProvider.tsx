"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Download, WifiOff, Wifi, RefreshCw, X, CheckCircle2, Share2, PlusSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface PwaContextType {
  isInstalled: boolean;
  canInstall: boolean;
  isOnline: boolean;
  hasUpdate: boolean;
  promptInstall: () => Promise<void>;
  updateApp: () => void;
}

const PwaContext = createContext<PwaContextType>({
  isInstalled: false,
  canInstall: false,
  isOnline: true,
  hasUpdate: false,
  promptInstall: async () => {},
  updateApp: () => {},
});

export const usePwa = () => useContext(PwaContext);

const DISMISS_KEY = "schedulix_pwa_dismissed_until";
const DISMISS_DURATION_DAYS = 7;

export default function PwaProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [showOnlineToast, setShowOnlineToast] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  // 1. Check if user recently dismissed
  const isDismissed = useCallback(() => {
    if (typeof window === "undefined") return false;
    const dismissedUntil = localStorage.getItem(DISMISS_KEY);
    if (!dismissedUntil) return false;
    return new Date().getTime() < parseInt(dismissedUntil, 10);
  }, []);

  const dismissPrompt = useCallback(() => {
    setShowBanner(false);
    setShowIosGuide(false);
    if (typeof window !== "undefined") {
      const expiry = new Date().getTime() + DISMISS_DURATION_DAYS * 24 * 60 * 60 * 1000;
      localStorage.setItem(DISMISS_KEY, expiry.toString());
    }
  }, []);

  // 2. Register Service Worker & Handle Updates
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check online status initially
    setIsOnline(navigator.onLine);

    // Online / Offline listeners
    const handleOnline = () => {
      setIsOnline(true);
      setShowOnlineToast(true);
      setTimeout(() => setShowOnlineToast(false), 3500);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowOnlineToast(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Check standalone mode
    const checkStandalone = () => {
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes("android-app://");
      setIsInstalled(isStandalone);
      return isStandalone;
    };

    const standalone = checkStandalone();

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);

    // Register Service Worker
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            console.log("[PWA] Service Worker registered with scope:", registration.scope);

            // Check if there is an updated worker waiting
            if (registration.waiting) {
              setHasUpdate(true);
            }

            registration.addEventListener("updatefound", () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener("statechange", () => {
                  if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                    setHasUpdate(true);
                  }
                });
              }
            });
          })
          .catch((error) => {
            console.warn("[PWA] Service Worker registration failed:", error);
          });
      });

      // Reload when the waiting worker takes over
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }

    // Capture beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);

      if (!standalone && !isDismissed()) {
        // Show after a subtle delay for optimal UX
        setTimeout(() => setShowBanner(true), 2500);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowBanner(false);
      setShowIosGuide(false);
      console.log("[PWA] App installed successfully!");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    // If iOS Safari and not standalone and not dismissed, show friendly guide after delay
    if (isIosDevice && !standalone && !isDismissed()) {
      const isSafari = /safari/.test(userAgent) && !/chrome|crios|fxios/.test(userAgent);
      if (isSafari) {
        setTimeout(() => setShowIosGuide(true), 4000);
      }
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [isDismissed]);

  // Prompt install function
  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) {
      if (isIos) {
        setShowIosGuide(true);
      }
      return;
    }

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        setIsInstalled(true);
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.error("[PWA] Install prompt error:", err);
    }
  }, [deferredPrompt, isIos]);

  // Update app function
  const updateApp = useCallback(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg && reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        } else {
          window.location.reload();
        }
      });
    } else {
      window.location.reload();
    }
  }, []);

  const canInstall = Boolean(deferredPrompt) || (isIos && !isInstalled);

  return (
    <PwaContext.Provider
      value={{
        isInstalled,
        canInstall,
        isOnline,
        hasUpdate,
        promptInstall,
        updateApp,
      }}
    >
      {children}

      {/* 1. Offline Warning Banner (Top Bar) */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="fixed top-0 inset-x-0 z-[100] bg-neutral-900 border-b border-amber-500/30 px-4 py-2 flex items-center justify-center gap-2 text-xs sm:text-sm text-neutral-200 shadow-lg shadow-black/50"
          >
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
            <span className="font-medium text-amber-300">You are offline.</span>
            <span className="text-neutral-400 hidden sm:inline">Operating from local cache. Schedulix will reconnect automatically.</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Back Online Toast */}
      <AnimatePresence>
        {showOnlineToast && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] bg-emerald-950/90 border border-emerald-500/40 text-emerald-200 px-4 py-2 rounded-xl text-xs sm:text-sm shadow-xl flex items-center gap-2 backdrop-blur-md"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Connection restored. You are back online!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. New Version Available Notification */}
      <AnimatePresence>
        {hasUpdate && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[95] bg-neutral-900 border border-amber-500/40 rounded-2xl p-4 shadow-2xl max-w-sm w-full mx-auto backdrop-blur-md flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                <RefreshCw className="w-5 h-5 animate-spin" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Update Ready</p>
                <p className="text-xs text-neutral-400">A new version of Schedulix is available.</p>
              </div>
            </div>
            <button
              onClick={updateApp}
              className="px-3 py-1.5 brand-gradient text-black font-semibold text-xs rounded-lg hover:opacity-95 transition-opacity shrink-0 cursor-pointer"
            >
              Update Now
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. Desktop/Mobile Install App Banner */}
      <AnimatePresence>
        {showBanner && deferredPrompt && !isInstalled && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-6 z-[90] max-w-md w-full bg-neutral-900/95 border border-neutral-700/80 rounded-2xl p-4 shadow-2xl backdrop-blur-xl shadow-black/80"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-neutral-800 border border-neutral-700 p-1 flex items-center justify-center shrink-0 shadow-inner">
                <img src="/icons/icon-96x96.png" alt="Schedulix" className="w-10 h-10 rounded-lg object-contain" />
              </div>
              <div className="flex-1 min-w-0 pr-6">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-sm font-bold text-white tracking-wide">Install Schedulix App</h4>
                  <span className="text-[10px] px-1.5 py-0.2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded font-semibold">PWA</span>
                </div>
                <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                  Install for fast one-click access, instant full-screen experience, and offline schedule viewing.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={promptInstall}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 brand-gradient text-black font-semibold text-xs rounded-xl hover:opacity-95 transition-opacity shadow-md shadow-amber-500/10 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Install App</span>
                  </button>
                  <button
                    onClick={dismissPrompt}
                    className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700/80 rounded-xl transition-colors cursor-pointer"
                  >
                    Not now
                  </button>
                </div>
              </div>
              <button
                onClick={dismissPrompt}
                className="absolute top-3 right-3 p-1.5 text-neutral-500 hover:text-neutral-300 rounded-lg hover:bg-neutral-800 transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 5. iOS Safari Install Guide Banner */}
      <AnimatePresence>
        {showIosGuide && !isInstalled && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-6 z-[90] max-w-sm w-full bg-neutral-900/95 border border-amber-500/30 rounded-2xl p-4 shadow-2xl backdrop-blur-xl shadow-black/80"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 p-1 flex items-center justify-center shrink-0">
                <img src="/icons/icon-96x96.png" alt="Schedulix" className="w-8 h-8 rounded-lg object-contain" />
              </div>
              <div className="flex-1 min-w-0 pr-6">
                <h4 className="text-sm font-bold text-white">Install on iPhone / iPad</h4>
                <p className="text-xs text-neutral-300 mt-1.5 leading-relaxed">
                  1. Tap the <Share2 className="w-3.5 h-3.5 inline mx-0.5 text-amber-400" /> <span className="font-semibold text-white">Share</span> button in Safari.
                  <br />
                  2. Scroll down and tap <PlusSquare className="w-3.5 h-3.5 inline mx-0.5 text-amber-400" /> <span className="font-semibold text-white">Add to Home Screen</span>.
                </p>
                <button
                  onClick={dismissPrompt}
                  className="mt-3 px-3 py-1 text-xs text-neutral-400 hover:text-white bg-neutral-800 rounded-lg transition-colors cursor-pointer"
                >
                  Got it
                </button>
              </div>
              <button
                onClick={dismissPrompt}
                className="absolute top-3 right-3 p-1.5 text-neutral-500 hover:text-neutral-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PwaContext.Provider>
  );
}
