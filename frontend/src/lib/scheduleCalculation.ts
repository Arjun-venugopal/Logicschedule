import { formatTime12h, computeEndTime } from "./utils";

export interface SlotTiming {
  startTime: string;
  endTime: string;
}

export interface SchedulePreviewItem {
  classNumber: number;
  dateStr: string; // YYYY-MM-DD
  displayDate: string; // "Mon, 02 Nov 2026"
  dayOfWeek: string; // "Monday"
  startTime: string;
  endTime: string;
  formattedTime: string; // "2:00 PM – 3:00 PM"
  status: "Completed" | "Scheduled";
  isToday: boolean;
  isPast: boolean;
}

export interface ClassProgressCalculation {
  scenario: "none" | "past" | "today" | "future";
  isManualCompletedRequired: boolean;
  todayStr: string;
  currentMinutes: number;
  autoCompletedCount: number;
  effectiveCompletedCount: number;
  totalClasses: number;
  remainingClasses: number | "Ongoing";
  formattedStartDate: string;
  schedulePreview: SchedulePreviewItem[];
  validationError: string | null;
  statusHint: string;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Returns current date and time in Asia/Kolkata (IST).
 */
export function getKolkataNowDetails(): {
  todayStr: string;
  currentMinutes: number;
  now: Date;
} {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  let year = "",
    month = "",
    day = "",
    hour = "0",
    minute = "0";
  for (const p of parts) {
    if (p.type === "year") year = p.value;
    else if (p.type === "month") month = p.value;
    else if (p.type === "day") day = p.value;
    else if (p.type === "hour") hour = p.value;
    else if (p.type === "minute") minute = p.value;
  }
  const h = parseInt(hour, 10) % 24;
  const m = parseInt(minute, 10);
  return {
    todayStr: `${year}-${month}-${day}`,
    currentMinutes: (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m),
    now,
  };
}

/**
 * Parse "HH:mm" into total minutes from midnight (0..1439).
 */
export function parseTimeToMinutes(timeStr?: string): number {
  if (!timeStr) return 0;
  const [hStr, mStr] = timeStr.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr || "0", 10);
  if (isNaN(h)) return 0;
  return (h % 24) * 60 + (isNaN(m) ? 0 : m);
}

/**
 * Format a Date object into "Mon, 02 Nov 2026".
 */
export function formatDisplayDate(dateObj: Date): string {
  try {
    return dateObj.toLocaleDateString("en-US", {
      timeZone: "UTC",
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/**
 * Intelligent class progress and calendar schedule calculator.
 * Evaluates Start Date against current date in Asia/Kolkata (IST),
 * handles Scenarios A, B, and C, calculates remaining classes, and
 * generates a calendar schedule preview starting strictly from Start Date.
 */
export function calculateBatchProgressAndSchedule(params: {
  startDate?: string;
  days: string[];
  dayTimings?: Record<string, { startTime: string; endTime: string }>;
  fallbackStartTime?: string;
  fallbackEndTime?: string;
  numberOfSessions?: number | string | null;
  preCompletedClassesInput?: number | string | null;
  existingCompletedCount?: number;
  isEditing?: boolean;
}): ClassProgressCalculation {
  const {
    startDate,
    days = [],
    dayTimings = {},
    fallbackStartTime = "09:00",
    fallbackEndTime = "10:00",
    numberOfSessions,
    preCompletedClassesInput,
    existingCompletedCount = 0,
    isEditing = false,
  } = params;

  const kolkata = getKolkataNowDetails();
  const cleanStartDate = startDate ? startDate.split("T")[0] : "";

  let scenario: "none" | "past" | "today" | "future" = "none";
  if (cleanStartDate) {
    if (cleanStartDate > kolkata.todayStr) scenario = "future";
    else if (cleanStartDate === kolkata.todayStr) scenario = "today";
    else scenario = "past";
  }

  const isManualCompletedRequired = scenario === "past";

  const totalClasses =
    numberOfSessions !== "" && numberOfSessions !== null && numberOfSessions !== undefined
      ? Math.max(0, Math.floor(Number(numberOfSessions) || 0))
      : 0;

  // Determine slot timing helper
  const getSlotTiming = (dayName: string): { startTime: string; endTime: string } => {
    const custom = dayTimings[dayName] || dayTimings[dayName.toLowerCase()];
    if (custom?.startTime) {
      return {
        startTime: custom.startTime,
        endTime: custom.endTime || computeEndTime(custom.startTime, 60),
      };
    }
    const s = fallbackStartTime || "09:00";
    const e = fallbackEndTime || computeEndTime(s, 60);
    return { startTime: s, endTime: e };
  };

  // Scenario A: Auto completed calculation for today
  let autoCompletedCount = 0;
  if (scenario === "today") {
    const todayParts = kolkata.todayStr.split("-").map(Number);
    const todayUtc = new Date(Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2], 12, 0, 0));
    const todayDayName = DAY_NAMES[todayUtc.getUTCDay()];

    if (days.includes(todayDayName)) {
      const timing = getSlotTiming(todayDayName);
      const slotMins = parseTimeToMinutes(timing.startTime);
      if (kolkata.currentMinutes >= slotMins) {
        autoCompletedCount = 1; // Today's class time has already passed
      }
    }
  }

  // Effective completed count
  let effectiveCompletedCount = 0;
  let validationError: string | null = null;
  let statusHint = "";

  if (scenario === "future") {
    effectiveCompletedCount = isEditing ? Math.min(existingCompletedCount, totalClasses || Infinity) : 0;
    statusHint = "Batch starts in the future — completed classes default to 0.";
  } else if (scenario === "today") {
    effectiveCompletedCount = Math.max(existingCompletedCount, autoCompletedCount);
    if (autoCompletedCount > 0) {
      statusHint = "Batch starts today — today's scheduled class time has passed and is counted as completed.";
    } else {
      statusHint = "Batch starts today — today's scheduled class is upcoming.";
    }
  } else if (scenario === "past") {
    statusHint = "Batch start date is in the past. Specify completed classes.";
    if (
      preCompletedClassesInput === "" ||
      preCompletedClassesInput === null ||
      preCompletedClassesInput === undefined
    ) {
      validationError = "Total Completed Classes is required when Start Date is in the past.";
      effectiveCompletedCount = existingCompletedCount || 0;
    } else {
      const numVal = Number(preCompletedClassesInput);
      if (isNaN(numVal) || numVal < 0 || !Number.isInteger(numVal)) {
        validationError = "Total Completed Classes must be a whole number (0 or greater).";
        effectiveCompletedCount = 0;
      } else if (totalClasses > 0 && numVal > totalClasses) {
        validationError = `Total Completed Classes cannot exceed total classes (${totalClasses}).`;
        effectiveCompletedCount = numVal;
      } else {
        effectiveCompletedCount = numVal;
      }
    }
  }

  const remainingClasses: number | "Ongoing" =
    totalClasses > 0 ? Math.max(0, totalClasses - effectiveCompletedCount) : "Ongoing";

  // Formatted Start Date
  let formattedStartDate = "";
  if (cleanStartDate) {
    const [y, m, d] = cleanStartDate.split("-").map(Number);
    if (y && m && d) {
      formattedStartDate = formatDisplayDate(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
    }
  }

  // Generate Schedule Preview (strictly starting from cleanStartDate forward)
  const schedulePreview: SchedulePreviewItem[] = [];

  if (cleanStartDate && days.length > 0) {
    const [sy, sm, sd] = cleanStartDate.split("-").map(Number);
    if (sy && sm && sd) {
      const cursor = new Date(Date.UTC(sy, sm - 1, sd, 12, 0, 0));
      const targetCount = totalClasses > 0 ? totalClasses : 15;
      let daysScanned = 0;

      while (schedulePreview.length < targetCount && daysScanned < 400) {
        const dayOfWeek = DAY_NAMES[cursor.getUTCDay()];

        if (days.includes(dayOfWeek)) {
          const cy = cursor.getUTCFullYear();
          const cm = String(cursor.getUTCMonth() + 1).padStart(2, "0");
          const cd = String(cursor.getUTCDate()).padStart(2, "0");
          const dateStr = `${cy}-${cm}-${cd}`;

          const timing = getSlotTiming(dayOfWeek);
          const classNum = schedulePreview.length + 1;
          const isSlotCompleted = classNum <= effectiveCompletedCount;
          const isToday = dateStr === kolkata.todayStr;
          const isPast = dateStr < kolkata.todayStr;

          schedulePreview.push({
            classNumber: classNum,
            dateStr,
            displayDate: formatDisplayDate(cursor),
            dayOfWeek,
            startTime: timing.startTime,
            endTime: timing.endTime,
            formattedTime: `${formatTime12h(timing.startTime)} – ${formatTime12h(timing.endTime)}`,
            status: isSlotCompleted ? "Completed" : "Scheduled",
            isToday,
            isPast,
          });
        }

        cursor.setUTCDate(cursor.getUTCDate() + 1);
        daysScanned++;
      }
    }
  }

  return {
    scenario,
    isManualCompletedRequired,
    todayStr: kolkata.todayStr,
    currentMinutes: kolkata.currentMinutes,
    autoCompletedCount,
    effectiveCompletedCount,
    totalClasses,
    remainingClasses,
    formattedStartDate,
    schedulePreview,
    validationError,
    statusHint,
  };
}

