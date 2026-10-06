import fs from 'fs';
import path from 'path';

export interface IDueRule {
  assignedClasses: number;
  dueAfterClasses: number;
}

export interface IPaymentConfig {
  rules: IDueRule[];
  reminderLeadClasses: number;
}

const DEFAULT_CONFIG: IPaymentConfig = {
  rules: [
    { assignedClasses: 15, dueAfterClasses: 5 },
    { assignedClasses: 25, dueAfterClasses: 12 },
  ],
  reminderLeadClasses: 2,
};

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'paymentRules.json');

let inMemoryConfig: IPaymentConfig | null = null;

export const getPaymentConfig = (): IPaymentConfig => {
  if (inMemoryConfig) return inMemoryConfig;

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.rules) && typeof parsed?.reminderLeadClasses === 'number') {
        inMemoryConfig = parsed;
        return inMemoryConfig!;
      }
    }
  } catch (err: any) {
    console.warn('Unable to read paymentRules.json, using defaults:', err.message);
  }

  inMemoryConfig = { ...DEFAULT_CONFIG };
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(inMemoryConfig, null, 2), 'utf-8');
  } catch {
    // Non-fatal
  }
  return inMemoryConfig;
};

export const savePaymentConfig = (newConfig: Partial<IPaymentConfig>): IPaymentConfig => {
  const current = getPaymentConfig();
  const updated: IPaymentConfig = {
    rules: Array.isArray(newConfig.rules) && newConfig.rules.length > 0 
      ? newConfig.rules.map(r => ({ assignedClasses: Number(r.assignedClasses), dueAfterClasses: Number(r.dueAfterClasses) }))
      : current.rules,
    reminderLeadClasses: typeof newConfig.reminderLeadClasses === 'number' && newConfig.reminderLeadClasses >= 0
      ? newConfig.reminderLeadClasses
      : current.reminderLeadClasses,
  };

  inMemoryConfig = updated;
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (err: any) {
    console.error('Failed to write paymentRules.json:', err.message);
  }

  return updated;
};

export const calculateDueAfterClasses = (assignedClasses: number): number => {
  const config = getPaymentConfig();
  const numClasses = Number(assignedClasses) || 15;

  // Exact rule match
  const exact = config.rules.find(r => Number(r.assignedClasses) === numClasses);
  if (exact) {
    return Number(exact.dueAfterClasses);
  }

  // Nearest match or proportional ratio:
  // e.g. 15 -> 5 (ratio 1/3)
  if (numClasses <= 15) {
    return Math.max(1, Math.round(numClasses * (5 / 15)));
  }

  // e.g. 25 -> 12 (ratio 12/25 = 0.48)
  if (numClasses >= 25) {
    return Math.max(1, Math.round(numClasses * (12 / 25)));
  }

  // Between 15 and 25
  const ratio = 5 / 15 + ((numClasses - 15) / 10) * ((12 / 25) - (5 / 15));
  return Math.max(1, Math.round(numClasses * ratio));
};

export type PaymentStatus = 'Pending' | 'Partially Paid' | 'Paid' | 'Upcoming' | 'Due' | 'Overdue';

export const calculatePaymentStatus = ({
  totalFee,
  amountPaid,
  completedClasses,
  dueAfterClasses,
  reminderLeadClasses,
}: {
  totalFee: number;
  amountPaid: number;
  completedClasses: number;
  dueAfterClasses: number;
  reminderLeadClasses?: number;
}): PaymentStatus => {
  const total = Number(totalFee) || 0;
  const paid = Number(amountPaid) || 0;
  const remaining = Math.max(0, total - paid);
  const completed = Number(completedClasses) || 0;
  const dueThreshold = Number(dueAfterClasses) || 5;
  const lead = reminderLeadClasses !== undefined ? Number(reminderLeadClasses) : getPaymentConfig().reminderLeadClasses;

  // 1. If paid completely
  if (remaining <= 0 && total > 0) {
    return 'Paid';
  }

  // 2. If nothing paid yet
  if (paid <= 0) {
    if (completed >= dueThreshold) return 'Due';
    if (completed >= Math.max(1, dueThreshold - lead)) return 'Upcoming';
    return 'Pending';
  }

  // 3. Partial payment made
  if (completed >= dueThreshold) {
    // If student has done more classes past dueThreshold without paying balance, mark Overdue
    if (completed >= dueThreshold + 2) {
      return 'Overdue';
    }
    return 'Due';
  }

  if (completed >= Math.max(1, dueThreshold - lead)) {
    return 'Upcoming';
  }

  return 'Partially Paid';
};
