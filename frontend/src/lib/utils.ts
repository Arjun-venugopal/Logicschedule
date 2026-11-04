import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safely format a 24-hour time string ("HH:mm") into 12-hour AM/PM format ("h:mm A").
 * Consolidated across Batches, Demo Sessions, and Teacher timing modals.
 */
export function formatTime12h(time24?: string): string {
  if (!time24) return "—";
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr || "0", 10);
  if (isNaN(h)) return time24;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Safely extract "YYYY-MM-DD" from any Date object or ISO string without timezone shift.
 * Consolidated across Batches and Schedule calendar views.
 */
export function getSafeDateOnly(val?: any): string {
  if (!val) return "";
  if (typeof val === "string") return val.split("T")[0];
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, "0");
    const d = String(val.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(val).split("T")[0];
}

/**
 * Extract level number from course or level text (e.g. "Level 2", "Lvl-3" -> "Level 2").
 * Consolidated across Student details and backend student controllers.
 */
export function extractLevel(text?: string, fallback = "Level 1"): string {
  if (!text) return fallback;
  const match = text.match(/level\s*[-]?\s*(\d+)/i) || text.match(/lvl\s*[-]?\s*(\d+)/i);
  return match ? `Level ${match[1]}` : fallback;
}
