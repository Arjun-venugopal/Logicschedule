import { Request, Response } from 'express';
import crypto from 'crypto';
import Payment from '../models/Payment';
import Student from '../models/Student';
import Batch from '../models/Batch';
import Schedule from '../models/Schedule';
import DemoSession from '../models/DemoSession';
import RecycleBin from '../models/RecycleBin';
import { getSupabase } from '../config/supabase';
import {
  getPaymentConfig,
  savePaymentConfig,
  calculateDueAfterClasses,
  calculatePaymentStatus,
} from '../utils/paymentRules';

// Timezone normalization for Asia/Kolkata
export function toKolkataDateString(dateVal: any): string {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // 'YYYY-MM-DD'
}

export function toKolkataMonthKey(dateVal: any): string {
  const dStr = toKolkataDateString(dateVal);
  return dStr ? dStr.substring(0, 7) : ''; // 'YYYY-MM'
}

// Helper: Get completed classes count for a batch
async function getCompletedClassesForBatch(batchId: string): Promise<number> {
  if (!batchId) return 0;
  try {
    const [count, batch] = await Promise.all([
      Schedule.countDocuments({
        batch: batchId,
        status: 'Completed',
      }),
      Batch.findById(batchId),
    ]);
    const preCompleted = Number(batch?.preCompletedClasses) || 0;
    return Math.max(count || 0, preCompleted);
  } catch {
    return 0;
  }
}

// @desc    Create or update initial admission fee payment
// @route   POST /payments/admission
// @access  Private (Admin, Super Admin, Sales Person)
export const createAdmissionPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      studentId,
      demoSessionId,
      batchId,
      totalFee: rawTotalFee,
      amountPaid: rawAmountPaid,
      paidAmount,
      paymentType: rawPaymentType,
      paymentOption,
      paymentMethod,
      transactionId,
      paymentDate,
      assignedClasses: rawAssignedClasses,
      salesExecutive: rawSalesExecutive,
      closedBy: rawClosedBy,
      notes,
    } = req.body;

    const totalFee = Math.max(0, Number(rawTotalFee) || 0);
    const assignedClasses = Math.max(1, Number(rawAssignedClasses) || 15);
    const dueAfterClasses = calculateDueAfterClasses(assignedClasses);

    // Normalize payment option / type
    const chosenType = (rawPaymentType || paymentOption || 'Full Payment').toString();
    let paymentType = 'Full Payment';
    if (chosenType.toLowerCase().includes('half')) {
      paymentType = 'Half Payment';
    } else if (chosenType.toLowerCase().includes('custom') || chosenType.toLowerCase().includes('other')) {
      paymentType = 'Custom Payment';
    } else {
      paymentType = 'Full Payment';
    }

    let amountPaid = 0;
    if (paymentType === 'Full Payment') {
      amountPaid = totalFee;
    } else if (paymentType === 'Half Payment') {
      amountPaid = Math.round(totalFee * 0.5);
    } else {
      // Custom Payment
      const inputAmount = rawAmountPaid !== undefined ? rawAmountPaid : paidAmount;
      amountPaid = Math.max(0, Math.min(totalFee, Number(inputAmount) || 0));
    }

    const remainingAmount = Math.max(0, totalFee - amountPaid);

    // Initial status calculation
    const paymentStatus = calculatePaymentStatus({
      totalFee,
      amountPaid,
      completedClasses: 0,
      dueAfterClasses,
    });

    // Locate or create student if coming from demo session
    let targetStudent: any = null;
    let targetBatchId = batchId;

    if (studentId) {
      targetStudent = await Student.findById(studentId);
    }

    let demoSession: any = null;
    if (demoSessionId) {
      demoSession = await DemoSession.findById(demoSessionId);
      if (demoSession) {
        if (!targetBatchId && demoSession.batchAssigned) {
          targetBatchId = demoSession.batchAssigned;
        }
        if (!targetStudent) {
          // Look up student by email or phone or name in this batch
          const studentQuery: any = {};
          if (demoSession.studentEmail) studentQuery.email = demoSession.studentEmail;
          else if (demoSession.phoneNumber) studentQuery.mobileNumber = demoSession.phoneNumber;
          else if (demoSession.studentName) studentQuery.name = demoSession.studentName;
          
          if (Object.keys(studentQuery).length > 0) {
            targetStudent = await Student.findOne(studentQuery);
          }
        }

        // Mark demo admission confirmed
        if (demoSession.admissionConfirmed !== 'Yes' && demoSession.admissionConfirmed !== 'Won') {
          demoSession.admissionConfirmed = 'Yes';
          await demoSession.save();
        }
      }
    }

    if (!targetStudent && targetBatchId) {
      targetStudent = await Student.findOne({ batch: targetBatchId });
    }

    let salesExecutive = rawSalesExecutive || rawClosedBy || demoSession?.salesExecutive || '';
    if (!salesExecutive && targetStudent?.email) {
      const ds = await DemoSession.findOne({ studentEmail: targetStudent.email });
      if (ds?.salesExecutive) salesExecutive = ds.salesExecutive;
    }
    if (!salesExecutive && targetStudent?.mobileNumber) {
      const ds = await DemoSession.findOne({ phoneNumber: targetStudent.mobileNumber });
      if (ds?.salesExecutive) salesExecutive = ds.salesExecutive;
    }
    salesExecutive = (salesExecutive || 'Unassigned').trim();

    const txDateStr = paymentDate || new Date().toISOString();
    const paymentMonth = toKolkataMonthKey(txDateStr);
    const isFullSettlement = remainingAmount <= 0;

    const initialTx = {
      id: crypto.randomUUID(),
      amount: amountPaid,
      paymentDate: txDateStr,
      paymentMethod: paymentMethod || 'Bank Transfer',
      transactionId: transactionId || '',
      recordedBy: (req as any).user?.name || 'Admin',
      paymentType: isFullSettlement ? 'Full Payment' : 'Initial Payment',
      isClosing: true,
      isBalanceCompletion: isFullSettlement,
      paymentMonth,
      remainingBalance: remainingAmount,
      salesExecutive,
      closedBy: salesExecutive,
      notes: notes || '',
      createdAt: new Date().toISOString(),
    };

    const paymentPayload: any = {
      student: targetStudent ? targetStudent._id : (studentId || null),
      batch: targetBatchId || (targetStudent?.batch ? (targetStudent.batch._id || targetStudent.batch) : null),
      demoSession: demoSessionId || null,
      totalFee,
      amountPaid,
      remainingAmount,
      paymentType: paymentType || 'Full Payment',
      paymentStatus,
      assignedClasses,
      dueAfterClasses,
      reminderBeforeClasses: 2,
      salesExecutive,
      closedBy: salesExecutive,
      admissionDate: txDateStr,
      closingMonth: paymentMonth,
      balanceCompletedDate: isFullSettlement ? txDateStr : null,
      balanceCompletedMonth: isFullSettlement ? paymentMonth : null,
      paymentHistory: [initialTx],
      notes: notes || '',
    };

    // Check if an existing payment record exists for this student
    let existingPayment = null;
    if (targetStudent?._id) {
      existingPayment = await Payment.safeFindOne({ student: targetStudent._id.toString() });
    } else if (studentId) {
      existingPayment = await Payment.safeFindOne({ student: studentId });
    }

    let savedPayment: any = null;
    if (existingPayment) {
      // Overwrite / update to avoid duplicate payment records
      savedPayment = await Payment.safeFindByIdAndUpdate(existingPayment._id, {
        $set: {
          ...paymentPayload,
          admissionDate: existingPayment.admissionDate || txDateStr,
          closingMonth: existingPayment.closingMonth || paymentMonth,
          balanceCompletedDate: isFullSettlement ? txDateStr : (existingPayment.balanceCompletedDate || null),
          balanceCompletedMonth: isFullSettlement ? paymentMonth : (existingPayment.balanceCompletedMonth || null),
          paymentHistory: [initialTx, ...(existingPayment.paymentHistory || [])],
        },
      });
    } else {
      savedPayment = await Payment.safeCreate(paymentPayload);
    }

    // Save copy in student document for seamless Supabase JSONB sync
    if (targetStudent?._id) {
      await Student.findByIdAndUpdate(targetStudent._id, { payment: savedPayment });
    }

    res.status(201).json({
      success: true,
      message: 'Admission fee recorded successfully',
      payment: savedPayment,
    });
  } catch (error: any) {
    console.error('Create admission payment error:', error);
    res.status(500).json({ message: error.message || 'Error recording admission fee' });
  }
};

// @desc    Record follow-up payment / installment
// @route   POST /payments/record
// @access  Private
export const recordPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      paymentId,
      studentId,
      amount: rawAmount,
      paymentMethod,
      transactionId,
      paymentDate,
      notes,
    } = req.body;

    const amount = Number(rawAmount);
    if (!amount || amount <= 0) {
      res.status(400).json({ message: 'Payment amount must be greater than 0' });
      return;
    }

    let payment = null;
    if (paymentId) {
      payment = await Payment.safeFindById(paymentId);
    } else if (studentId) {
      payment = await Payment.safeFindOne({ student: studentId });
      if (!payment) {
        const student = await Student.findById(studentId);
        if (student?.payment) {
          payment = student.payment;
        }
      }
    }

    if (!payment) {
      res.status(404).json({ message: 'Payment record not found' });
      return;
    }

    const previousPaid = Number(payment.amountPaid) || 0;
    const totalFee = Number(payment.totalFee) || 0;
    const newAmountPaid = previousPaid + amount;
    const newRemainingAmount = Math.max(0, totalFee - newAmountPaid);

    // Get live completed classes
    const batchId = payment.batch?._id || payment.batch;
    const completedClasses = await getCompletedClassesForBatch(batchId);

    const newStatus = calculatePaymentStatus({
      totalFee,
      amountPaid: newAmountPaid,
      completedClasses,
      dueAfterClasses: payment.dueAfterClasses || 5,
    });

    const isFullSettlement = newRemainingAmount <= 0;
    const txDateStr = paymentDate || new Date().toISOString();
    const paymentMonth = toKolkataMonthKey(txDateStr);
    const salesExec = (payment.salesExecutive || payment.closedBy || 'Unassigned').trim();

    const tx = {
      id: crypto.randomUUID(),
      amount,
      paymentDate: txDateStr,
      paymentMethod: paymentMethod || 'Bank Transfer',
      transactionId: transactionId || '',
      recordedBy: (req as any).user?.name || 'Admin',
      paymentType: isFullSettlement ? 'Final Payment' : 'Installment',
      isClosing: false,
      isBalanceCompletion: isFullSettlement,
      paymentMonth,
      salesExecutive: salesExec,
      closedBy: salesExec,
      remainingBalance: newRemainingAmount,
      notes: notes || '',
      createdAt: new Date().toISOString(),
    };

    const updateSet: any = {
      amountPaid: newAmountPaid,
      remainingAmount: newRemainingAmount,
      paymentStatus: newStatus,
    };

    if (isFullSettlement && !payment.balanceCompletedDate) {
      updateSet.balanceCompletedDate = txDateStr;
      updateSet.balanceCompletedMonth = paymentMonth;
    }

    const updatedPayment = await Payment.safeFindByIdAndUpdate(payment._id, {
      $set: updateSet,
      $push: {
        paymentHistory: tx,
      },
    });

    // Also update student.payment
    const sId = payment.student?._id || payment.student;
    if (sId) {
      await Student.findByIdAndUpdate(sId, { payment: updatedPayment });
    }

    res.json({
      success: true,
      message: isFullSettlement ? 'Course fee fully paid! Status marked as Paid.' : 'Payment installment recorded successfully',
      payment: updatedPayment,
    });
  } catch (error: any) {
    console.error('Record payment error:', error);
    res.status(500).json({ message: error.message || 'Error recording payment' });
  }
};

// @desc    Get all payments with live class completion & KPI analytics & filters (month, week, day, salesPerson)
// @route   GET /payments
// @access  Private
export const getPayments = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawPayments = await Payment.safeFind({});
    const students = await Student.find({});
    const batches = await Batch.find({});
    const completedSchedules = await Schedule.find({ status: 'Completed' });
    const demoSessions = await DemoSession.find({});

    let salesUsers: any[] = [];
    try {
      const { data } = await getSupabase().from('users').select('name').eq('role', 'Sales Person');
      salesUsers = data || [];
    } catch {
      // ignore
    }

    // Filter query parameters
    const timeRange = ((req.query.timeRange as string) || 'all').toLowerCase(); // 'all' | 'today' | 'day' | 'week' | 'month' | 'custom'
    const salesFilter = ((req.query.salesExecutive as string) || (req.query.closedBy as string) || 'all').trim();
    const statusFilter = ((req.query.status as string) || 'all').trim();
    const searchQuery = ((req.query.search as string) || '').trim().toLowerCase();
    const paymentMethodFilter = ((req.query.paymentMethod as string) || 'all').trim().toLowerCase();

    const queryDate = req.query.date ? (req.query.date as string).trim() : null;
    const queryMonth = req.query.month ? parseInt(req.query.month as string, 10) : null;
    const queryYear = req.query.year ? parseInt(req.query.year as string, 10) : null;
    const customStart = req.query.startDate as string;
    const customEnd = req.query.endDate as string;

    // Calculate time range boundary dates in local time
    const now = new Date();
    let startDate: Date | null = null;
    let endDate: Date | null = null;
    let prevStartDate: Date | null = null;
    let prevEndDate: Date | null = null;
    let periodLabel = 'All Time';
    let targetMonthKey: string | null = null;
    let prevMonthKey: string | null = null;

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    if (queryDate) {
      startDate = new Date(`${queryDate}T00:00:00.000`);
      endDate = new Date(`${queryDate}T23:59:59.999`);
      targetMonthKey = queryDate.substring(0, 7);
      prevStartDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
      prevEndDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
      periodLabel = queryDate;
    } else if (customStart && customEnd) {
      startDate = new Date(`${customStart}T00:00:00.000`);
      endDate = new Date(`${customEnd}T23:59:59.999`);
      const durationMs = Math.max(0, endDate.getTime() - startDate.getTime());
      prevEndDate = new Date(startDate.getTime() - 1);
      prevStartDate = new Date(prevEndDate.getTime() - durationMs);
      periodLabel = `${customStart} to ${customEnd}`;
      targetMonthKey = toKolkataMonthKey(startDate);
    } else if (queryMonth && queryYear) {
      targetMonthKey = `${queryYear}-${String(queryMonth).padStart(2, '0')}`;
      const prevM = queryMonth === 1 ? 12 : queryMonth - 1;
      const prevY = queryMonth === 1 ? queryYear - 1 : queryYear;
      prevMonthKey = `${prevY}-${String(prevM).padStart(2, '0')}`;
      startDate = new Date(queryYear, queryMonth - 1, 1, 0, 0, 0, 0);
      endDate = new Date(queryYear, queryMonth, 0, 23, 59, 59, 999);
      prevStartDate = new Date(prevY, prevM - 1, 1, 0, 0, 0, 0);
      prevEndDate = new Date(prevY, prevM, 0, 23, 59, 59, 999);
      periodLabel = `${monthNames[queryMonth - 1]} ${queryYear}`;
    } else if (timeRange === 'today' || timeRange === 'day') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      prevStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      prevEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      periodLabel = 'Today';
      targetMonthKey = toKolkataMonthKey(startDate);
    } else if (timeRange === 'week') {
      const currentDay = now.getDay();
      const diffToMonday = (currentDay === 0 ? -6 : 1) - currentDay;
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday, 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday + 6, 23, 59, 59, 999);
      prevStartDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() - 7, 0, 0, 0, 0);
      prevEndDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - 7, 23, 59, 59, 999);
      periodLabel = 'This Week';
      targetMonthKey = toKolkataMonthKey(startDate);
    } else if (timeRange === 'month') {
      const nowKolkata = toKolkataDateString(now);
      targetMonthKey = nowKolkata.substring(0, 7);
      const [curY, curM] = targetMonthKey.split('-').map(Number);
      const prevM = curM === 1 ? 12 : curM - 1;
      const prevY = curM === 1 ? curY - 1 : curY;
      prevMonthKey = `${prevY}-${String(prevM).padStart(2, '0')}`;
      startDate = new Date(curY, curM - 1, 1, 0, 0, 0, 0);
      endDate = new Date(curY, curM, 0, 23, 59, 59, 999);
      prevStartDate = new Date(prevY, prevM - 1, 1, 0, 0, 0, 0);
      prevEndDate = new Date(prevY, prevM, 0, 23, 59, 59, 999);
      periodLabel = `${monthNames[curM - 1]} ${curY}`;
    } else {
      // timeRange === 'all'
      prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      prevEndDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      periodLabel = 'All Time';
    }

    // Map batch to completed classes count
    const batchCompletedCount = new Map<string, number>();
    for (const sch of completedSchedules) {
      const bId = sch.batch?._id ? sch.batch._id.toString() : sch.batch?.toString();
      if (bId) {
        batchCompletedCount.set(bId, (batchCompletedCount.get(bId) || 0) + 1);
      }
    }

    // Map students by ID
    const studentMap = new Map<string, any>();
    for (const s of students) {
      studentMap.set(s._id.toString(), s);
    }

    // Map batches by ID
    const batchMap = new Map<string, any>();
    for (const b of batches) {
      batchMap.set(b._id.toString(), b);
    }

    // Map demo session sales executives
    const demoSalesByEmail = new Map<string, string>();
    const demoSalesByPhone = new Map<string, string>();
    const demoSalesByName = new Map<string, string>();
    const salesExecutivesSet = new Set<string>();

    for (const u of salesUsers) {
      if (u.name) salesExecutivesSet.add(u.name.trim());
    }

    for (const ds of demoSessions) {
      if (ds.salesExecutive) {
        const sName = ds.salesExecutive.trim();
        salesExecutivesSet.add(sName);
        if (ds.studentEmail) demoSalesByEmail.set(ds.studentEmail.toLowerCase(), sName);
        if (ds.phoneNumber) demoSalesByPhone.set(ds.phoneNumber, sName);
        if (ds.studentName) demoSalesByName.set(ds.studentName.toLowerCase(), sName);
      }
    }

    // Merge payments from students if not in rawPayments
    const paymentMap = new Map<string, any>();
    for (const p of rawPayments) {
      const sId = p.student?._id ? p.student._id.toString() : (p.student ? p.student.toString() : p._id);
      paymentMap.set(sId, p);
    }

    for (const s of students) {
      if (s.payment && !paymentMap.has(s._id.toString())) {
        paymentMap.set(s._id.toString(), {
          ...s.payment,
          student: s._id.toString(),
        });
      }
    }

    const processedPayments: any[] = [];
    const allPendingStudents: any[] = [];
    const salespersonStatsMap = new Map<string, {
      name: string;
      collectedAmount: number;
      closingsCount: number;
      closingsRevenue: number;
      balanceCompletionsCount: number;
      balanceCompletionsRevenue: number;
      enrolledStudents: number;
      successfulPaymentsCount: number;
      pendingAmount: number;
      overdueAmount: number;
      totalCourseFee: number;
      totalAmountPaid: number;
    }>();

    let filteredCollected = 0;
    let filteredPrevCollected = 0;
    let filteredOutstanding = 0;
    let dueCount = 0;
    let upcomingCount = 0;
    let paidCount = 0;
    let partiallyPaidCount = 0;
    let overdueCount = 0;
    let totalDueAmount = 0;
    let totalTxCount = 0;

    let periodClosingsCount = 0;
    let periodClosingsRevenue = 0;
    let periodBalanceCompletedCount = 0;
    let periodBalanceCompletedRevenue = 0;

    let overallCollected = 0;
    let overallOutstanding = 0;

    for (const p of paymentMap.values()) {
      const sId = p.student?._id ? p.student._id.toString() : (p.student ? p.student.toString() : '');
      const student = studentMap.get(sId);
      const bId = p.batch?._id ? p.batch._id.toString() : (p.batch ? p.batch.toString() : (student?.batch?._id || student?.batch));
      const batch = batchMap.get(bId);

      const completedClasses = Math.max(
        bId ? (batchCompletedCount.get(bId) || 0) : 0,
        Number(batch?.preCompletedClasses) || 0
      );
      const assignedClasses = Number(p.assignedClasses) || Number(batch?.numberOfSessions) || 15;
      const dueAfterClasses = Number(p.dueAfterClasses) || calculateDueAfterClasses(assignedClasses);
      const totalFee = Number(p.totalFee) || 0;
      const amountPaid = Number(p.amountPaid) || 0;
      const remainingAmount = Math.max(0, totalFee - amountPaid);

      const dynamicStatus = calculatePaymentStatus({
        totalFee,
        amountPaid,
        completedClasses,
        dueAfterClasses,
      });

      // Attribute Sales Executive
      let salesExec = (p.salesExecutive || p.closedBy || '').trim();
      if (!salesExec && student) {
        salesExec = (student.email && demoSalesByEmail.get(student.email.toLowerCase())) ||
                    (student.mobileNumber && demoSalesByPhone.get(student.mobileNumber)) ||
                    (student.phone && demoSalesByPhone.get(student.phone)) ||
                    (student.name && demoSalesByName.get(student.name.toLowerCase())) ||
                    '';
      }
      if (!salesExec) salesExec = 'Unassigned';
      salesExecutivesSet.add(salesExec);

      overallCollected += amountPaid;
      overallOutstanding += remainingAmount;

      // Extract transaction history
      const history: any[] = Array.isArray(p.paymentHistory) && p.paymentHistory.length > 0
        ? p.paymentHistory.map((t: any) => ({ ...t }))
        : [];
      if (history.length === 0 && amountPaid > 0) {
        history.push({
          id: `initial_${p._id || sId}`,
          amount: amountPaid,
          paymentDate: p.paymentDate || p.createdAt || new Date().toISOString(),
          paymentMethod: p.paymentMethod || 'Bank Transfer',
          paymentType: remainingAmount <= 0 ? 'Full Payment' : 'Initial Payment',
          isClosing: true,
          isBalanceCompletion: remainingAmount <= 0,
          paymentMonth: toKolkataMonthKey(p.paymentDate || p.createdAt || new Date()),
          recordedBy: salesExec || 'Admin',
          salesExecutive: salesExec,
          closedBy: salesExec,
          remainingBalance: remainingAmount,
          notes: p.notes || '',
        });
      }

      // Determine closing date & closing month
      const closingDate = p.admissionDate || (history[0]?.paymentDate) || p.paymentDate || p.createdAt || student?.joiningDate || student?.createdAt || '';
      const closingDateStr = toKolkataDateString(closingDate);
      const closingMonth = p.closingMonth || toKolkataMonthKey(closingDate);

      let isClosedInPeriod = false;
      if (queryDate) {
        isClosedInPeriod = (closingDateStr === queryDate);
      } else if (targetMonthKey) {
        isClosedInPeriod = (closingMonth === targetMonthKey);
      } else if (startDate && endDate) {
        const cd = new Date(closingDate);
        isClosedInPeriod = !isNaN(cd.getTime()) && cd >= startDate && cd <= endDate;
      } else {
        isClosedInPeriod = true;
      }

      const closingTx = history.find((t: any) => t.isClosing) || history[0];
      const closingAmount = closingTx ? (Number(closingTx.amount) || 0) : (amountPaid > 0 ? amountPaid : totalFee);

      // Determine balance completed date & balance completed month
      let balanceCompletedDate = p.balanceCompletedDate || null;
      let balanceCompletedMonth = p.balanceCompletedMonth || null;
      if (remainingAmount <= 0) {
        if (!balanceCompletedDate || !balanceCompletedMonth) {
          const settlementTx = history.slice().reverse().find((t: any) => t.isBalanceCompletion) || history[history.length - 1];
          balanceCompletedDate = settlementTx?.paymentDate || settlementTx?.createdAt || p.updatedAt || closingDate;
          balanceCompletedMonth = toKolkataMonthKey(balanceCompletedDate);
        }
      } else {
        balanceCompletedDate = null;
        balanceCompletedMonth = null;
      }

      const isBalanceCompletedInPeriod = (remainingAmount <= 0 && balanceCompletedMonth)
        ? (targetMonthKey
            ? (balanceCompletedMonth === targetMonthKey)
            : (startDate && endDate ? (!isNaN(new Date(balanceCompletedDate).getTime()) && new Date(balanceCompletedDate) >= startDate && new Date(balanceCompletedDate) <= endDate) : true))
        : false;

      // Analyze transactions for time window & payment method
      let periodCollected = 0;
      let prevPeriodCollected = 0;
      let periodTxCount = 0;
      let hasMatchingMethodTx = false;
      let latestTxDate: string | null = null;
      let balanceCompletedInPeriodRevenue = 0;

      for (const tx of history) {
        const txAmt = Number(tx.amount) || 0;
        const txDate = tx.paymentDate || tx.createdAt || tx.date;
        const txMonthKey = tx.paymentMonth || toKolkataMonthKey(txDate);
        const txD = new Date(txDate);
        const txMethod = ((tx.paymentMethod || p.paymentMethod || 'Bank Transfer') as string).trim().toLowerCase();

        const methodMatches = paymentMethodFilter === 'all' || txMethod === paymentMethodFilter;
        if (methodMatches) {
          hasMatchingMethodTx = true;
        }

        if (!latestTxDate || (!isNaN(txD.getTime()) && txD > new Date(latestTxDate))) {
          latestTxDate = txDate;
        }

        if (methodMatches) {
          let inPeriod = false;
          if (targetMonthKey) {
            inPeriod = txMonthKey === targetMonthKey;
          } else if (startDate && endDate) {
            inPeriod = !isNaN(txD.getTime()) && txD >= startDate && txD <= endDate;
          } else {
            inPeriod = true;
          }

          if (inPeriod) {
            periodCollected += txAmt;
            periodTxCount++;
            if (tx.isBalanceCompletion || (isBalanceCompletedInPeriod && (tx.paymentType?.includes('Final') || tx.paymentType?.includes('Settlement')))) {
              balanceCompletedInPeriodRevenue += txAmt;
            }
          }

          let inPrevPeriod = false;
          if (prevMonthKey) {
            inPrevPeriod = txMonthKey === prevMonthKey;
          } else if (prevStartDate && prevEndDate) {
            inPrevPeriod = !isNaN(txD.getTime()) && txD >= prevStartDate && txD <= prevEndDate;
          }
          if (inPrevPeriod) {
            prevPeriodCollected += txAmt;
          }
        }
      }

      // Update Salesperson Leaderboard stats
      let spStat = salespersonStatsMap.get(salesExec);
      if (!spStat) {
        spStat = {
          name: salesExec,
          collectedAmount: 0,
          closingsCount: 0,
          closingsRevenue: 0,
          balanceCompletionsCount: 0,
          balanceCompletionsRevenue: 0,
          enrolledStudents: 0,
          successfulPaymentsCount: 0,
          pendingAmount: 0,
          overdueAmount: 0,
          totalCourseFee: 0,
          totalAmountPaid: 0,
        };
        salespersonStatsMap.set(salesExec, spStat);
      }

      if (isClosedInPeriod) {
        spStat.closingsCount++;
        spStat.closingsRevenue += closingAmount;
        spStat.enrolledStudents++;
      } else if (!targetMonthKey && !startDate) {
        spStat.enrolledStudents++;
      }

      if (isBalanceCompletedInPeriod) {
        spStat.balanceCompletionsCount++;
        spStat.balanceCompletionsRevenue += (balanceCompletedInPeriodRevenue || remainingAmount);
      }

      spStat.collectedAmount += periodCollected;
      spStat.successfulPaymentsCount += periodTxCount;
      spStat.totalCourseFee += totalFee;
      spStat.totalAmountPaid += amountPaid;
      spStat.pendingAmount += remainingAmount;
      if (dynamicStatus === 'Due' || dynamicStatus === 'Overdue') {
        spStat.overdueAmount += remainingAmount;
      }

      // Calculate overdue days
      let overdueDays = 0;
      if (dynamicStatus === 'Overdue') {
        if (p.dueDate) {
          const dueD = new Date(p.dueDate);
          if (!isNaN(dueD.getTime()) && now > dueD) {
            overdueDays = Math.max(1, Math.floor((now.getTime() - dueD.getTime()) / (1000 * 60 * 60 * 24)));
          }
        } else if (completedClasses > dueAfterClasses) {
          overdueDays = Math.max(3, (completedClasses - dueAfterClasses) * 3);
        } else {
          overdueDays = 5;
        }
      }

      const isTimeFiltered = !!(queryDate || targetMonthKey || (startDate && endDate));

      // Collect pending student record for dedicated pending report (students closed in this period who have pending balance)
      if (remainingAmount > 0) {
        const matchesPending = isTimeFiltered ? isClosedInPeriod : true;
        if (matchesPending) {
          allPendingStudents.push({
            paymentId: p._id || sId,
            studentId: sId,
            studentName: student?.name || p.studentName || 'Student',
            parentName: student?.parentName || (student?.name ? `${student.name}'s Parent` : 'Parent'),
            contactNumber: student?.mobileNumber || student?.phone || student?.whatsappNumber || '',
            email: student?.email || '',
            courseName: batch?.subject || batch?.name || p.courseName || 'Course',
            batchId: batch?._id || bId,
            courseFee: totalFee,
            discount: Number(p.discount) || 0,
            totalPaid: amountPaid,
            remainingBalance: remainingAmount,
            monthlyInstallment: Number(p.installmentAmount) || Math.round(remainingAmount / (dueAfterClasses > 0 ? 2 : 1)),
            nextPaymentDueDate: p.dueDate || (dynamicStatus === 'Due' || dynamicStatus === 'Overdue' ? 'Immediate' : 'Next Milestone'),
            overdueDays,
            paymentStatus: dynamicStatus,
            closingDate,
            closingMonth,
            balanceCompletedDate,
            balanceCompletedMonth,
            isClosedInPeriod,
            isBalanceCompletedInPeriod,
            periodCollected,
            lastPaymentDate: latestTxDate ? new Date(latestTxDate).toISOString() : null,
            salesperson: salesExec,
            completedClasses,
            assignedClasses,
            dueAfterClasses,
            paymentHistory: history,
          });
        }
      }

      // Filters
      const matchesSales = salesFilter === 'all' || salesExec.toLowerCase() === salesFilter.toLowerCase();
      const statusLower = statusFilter.toLowerCase().trim();
      let matchesStatus = true;
      if (statusFilter !== 'all' && statusFilter !== 'All') {
        if (statusLower === 'due') {
          matchesStatus = (dynamicStatus === 'Due' || dynamicStatus === 'Overdue');
        } else if (statusLower === 'closed this month' || statusLower === 'closed_this_month') {
          matchesStatus = isClosedInPeriod;
        } else if (statusLower === 'balance completed this month' || statusLower === 'balance_completed_this_month' || statusLower === 'balance completed') {
          matchesStatus = isBalanceCompletedInPeriod;
        } else if (statusLower === 'paid this month' || statusLower === 'paid_this_month') {
          matchesStatus = periodCollected > 0;
        } else {
          matchesStatus = dynamicStatus.toLowerCase() === statusLower;
        }
      }

      let matchesTime = false;
      if (!isTimeFiltered) {
        matchesTime = (statusFilter !== 'all' && statusFilter !== 'All' ? matchesStatus : true);
      } else {
        if (statusFilter !== 'all' && statusFilter !== 'All') {
          if (statusLower === 'paid this month' || statusLower === 'paid_this_month') {
            matchesTime = periodCollected > 0;
          } else if (statusLower === 'balance completed this month' || statusLower === 'balance_completed_this_month' || statusLower === 'balance completed') {
            matchesTime = isBalanceCompletedInPeriod;
          } else {
            // Must be closed in this month and match status
            matchesTime = isClosedInPeriod && matchesStatus;
          }
        } else {
          // In month-wise or date-wise view: strictly show students closed in that month / on that date!
          matchesTime = isClosedInPeriod;
        }
      }

      const matchesMethod = paymentMethodFilter === 'all' || hasMatchingMethodTx;
      const matchesSearch = !searchQuery || (
        (student?.name || '').toLowerCase().includes(searchQuery) ||
        (student?.email || '').toLowerCase().includes(searchQuery) ||
        (student?.phone || student?.mobileNumber || '').toLowerCase().includes(searchQuery) ||
        (student?.parentName || '').toLowerCase().includes(searchQuery) ||
        (batch?.name || '').toLowerCase().includes(searchQuery) ||
        (p.notes || '').toLowerCase().includes(searchQuery) ||
        salesExec.toLowerCase().includes(searchQuery)
      );

      if (matchesTime && matchesSales && matchesStatus && matchesMethod && matchesSearch) {
        filteredCollected += (targetMonthKey || startDate ? periodCollected : amountPaid);
        filteredPrevCollected += prevPeriodCollected;
        filteredOutstanding += remainingAmount;
        totalTxCount += (targetMonthKey || startDate ? periodTxCount : history.length);

        if (isClosedInPeriod) {
          periodClosingsCount++;
          periodClosingsRevenue += closingAmount;
        }
        if (isBalanceCompletedInPeriod) {
          periodBalanceCompletedCount++;
          periodBalanceCompletedRevenue += (balanceCompletedInPeriodRevenue || remainingAmount);
        }

        if (dynamicStatus === 'Paid') {
          paidCount++;
        } else if (dynamicStatus === 'Partially Paid') {
          partiallyPaidCount++;
        } else if (dynamicStatus === 'Due') {
          dueCount++;
          totalDueAmount += remainingAmount;
        } else if (dynamicStatus === 'Upcoming') {
          upcomingCount++;
        } else if (dynamicStatus === 'Overdue') {
          dueCount++;
          overdueCount++;
          totalDueAmount += remainingAmount;
        }

        processedPayments.push({
          ...p,
          salesExecutive: salesExec,
          closedBy: salesExec,
          admissionDate: closingDate,
          closingMonth,
          balanceCompletedDate,
          balanceCompletedMonth,
          isClosedInPeriod,
          isBalanceCompletedInPeriod,
          periodCollected: (targetMonthKey || startDate ? periodCollected : amountPaid),
          periodTxCount,
          student: student ? {
            _id: student._id,
            name: student.name,
            email: student.email,
            phone: student.mobileNumber || student.phone,
            parentName: student.parentName,
            batch: student.batch,
          } : (p.student || { name: 'Unknown Student' }),
          batch: batch ? {
            _id: batch._id,
            name: batch.name,
            subject: batch.subject,
          } : (p.batch || { name: 'Direct Admission' }),
          completedClasses,
          assignedClasses,
          dueAfterClasses,
          remainingAmount,
          paymentStatus: dynamicStatus,
          paymentHistory: history,
          lastPaymentDate: latestTxDate ? new Date(latestTxDate).toISOString() : null,
          overdueDays,
        });
      }
    }

    // Salesperson performance ranking (sorted by actual payments collected descending!)
    const salespersonRanking = Array.from(salespersonStatsMap.values())
      .map((sp) => {
        const collectionPercentage = sp.totalCourseFee > 0
          ? Math.round((sp.totalAmountPaid / sp.totalCourseFee) * 100)
          : 0;
        const periodCollectionRate = (sp.collectedAmount + sp.overdueAmount) > 0
          ? Math.round((sp.collectedAmount / (sp.collectedAmount + sp.overdueAmount)) * 100)
          : (sp.collectedAmount > 0 ? 100 : 0);
        return {
          ...sp,
          collectionPercentage,
          periodCollectionRate,
        };
      })
      .sort((a, b) => {
        if (b.collectedAmount !== a.collectedAmount) {
          return b.collectedAmount - a.collectedAmount;
        }
        if (b.closingsCount !== a.closingsCount) {
          return b.closingsCount - a.closingsCount;
        }
        if (b.successfulPaymentsCount !== a.successfulPaymentsCount) {
          return b.successfulPaymentsCount - a.successfulPaymentsCount;
        }
        return b.balanceCompletionsCount - a.balanceCompletionsCount;
      })
      .map((sp, idx) => ({
        rank: idx + 1,
        ...sp,
      }));

    // Historical monthly collections trend (past 6 months)
    const monthlyTrend: Array<{
      monthKey: string;
      monthName: string;
      month: number;
      year: number;
      collected: number;
      txCount: number;
      pending: number;
    }> = [];

    for (let i = 5; i >= 0; i--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = targetDate.getMonth() + 1;
      const y = targetDate.getFullYear();
      const mStart = new Date(y, m - 1, 1, 0, 0, 0, 0);
      const mEnd = new Date(y, m, 0, 23, 59, 59, 999);
      const label = targetDate.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      const barMonthKey = `${y}-${String(m).padStart(2, '0')}`;

      let mCollected = 0;
      let mTxCount = 0;

      for (const p of paymentMap.values()) {
        const hist: any[] = p.paymentHistory || [];
        for (const tx of hist) {
          const txMKey = tx.paymentMonth || toKolkataMonthKey(tx.paymentDate || tx.createdAt || tx.date);
          const txd = new Date(tx.paymentDate || tx.createdAt || tx.date);
          if (txMKey === barMonthKey || (!isNaN(txd.getTime()) && txd >= mStart && txd <= mEnd)) {
            mCollected += Number(tx.amount) || 0;
            mTxCount++;
          }
        }
        if (hist.length === 0 && Number(p.amountPaid) > 0) {
          const cd = new Date(p.paymentDate || p.createdAt || now);
          const pMKey = p.closingMonth || toKolkataMonthKey(cd);
          if (pMKey === barMonthKey || (!isNaN(cd.getTime()) && cd >= mStart && cd <= mEnd)) {
            mCollected += Number(p.amountPaid) || 0;
            mTxCount++;
          }
        }
      }

      monthlyTrend.push({
        monthKey: barMonthKey,
        monthName: label,
        month: m,
        year: y,
        collected: mCollected,
        txCount: mTxCount,
        pending: overallOutstanding,
      });
    }

    // Monthly collection growth calculation
    let monthlyGrowthPercentage = 0;
    if (filteredPrevCollected > 0) {
      monthlyGrowthPercentage = Number((((filteredCollected - filteredPrevCollected) / filteredPrevCollected) * 100).toFixed(1));
    } else if (filteredCollected > 0) {
      monthlyGrowthPercentage = 100;
    }

    // Expected collection for the month (already collected in period + currently due/overdue balance)
    const totalExpectedCollection = filteredCollected + totalDueAmount;

    const kpisData = {
      totalCollected: filteredCollected,
      totalFeesCollected: filteredCollected,
      periodCollected: filteredCollected,
      prevMonthCollected: filteredPrevCollected,
      monthlyGrowthPercentage,
      closingsCount: periodClosingsCount,
      closingsRevenue: periodClosingsRevenue,
      balanceCompletedCount: periodBalanceCompletedCount,
      balanceCompletedRevenue: periodBalanceCompletedRevenue,
      totalOutstanding: filteredOutstanding,
      pendingAmount: filteredOutstanding,
      dueAmount: totalDueAmount,
      totalExpectedCollection,
      numberOfPaymentsReceived: totalTxCount,
      paymentCount: totalTxCount,
      dueCount,
      upcomingCount,
      paidCount,
      partiallyPaidCount,
      overdueCount,
      totalStudentsWithFee: processedPayments.length,
      periodLabel,
      targetMonthKey,
    };

    res.json({
      payments: processedPayments,
      kpis: kpisData,
      filteredKpis: kpisData,
      overallKpis: {
        totalCollected: overallCollected,
        totalOutstanding: overallOutstanding,
      },
      salespersonRanking,
      monthlyPendingBySalesperson: allPendingStudents,
      monthlyTrend,
      salesExecutives: Array.from(salesExecutivesSet).filter(Boolean).sort(),
      rules: getPaymentConfig(),
    });
  } catch (error: any) {
    console.error('Get payments error:', error);
    res.status(500).json({ message: error.message || 'Error fetching payments' });
  }
};

// @desc    Get single payment record
// @route   GET /payments/:id
// @access  Private
export const getSinglePayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id || '');
    const payment = await Payment.safeFindById(id);
    if (!payment) {
      res.status(404).json({ message: 'Payment record not found' });
      return;
    }

    const sId = payment.student?._id || payment.student;
    const student = sId ? await Student.findById(sId) : null;
    const bId = payment.batch?._id || payment.batch;
    const batch = bId ? await Batch.findById(bId) : null;
    const completedClasses = bId ? await getCompletedClassesForBatch(bId.toString()) : 0;
    const assignedClasses = Number(payment.assignedClasses) || 15;
    const dueAfterClasses = Number(payment.dueAfterClasses) || calculateDueAfterClasses(assignedClasses);
    const totalFee = Number(payment.totalFee) || 0;
    const amountPaid = Number(payment.amountPaid) || 0;
    const remainingAmount = Math.max(0, totalFee - amountPaid);

    const dynamicStatus = calculatePaymentStatus({
      totalFee,
      amountPaid,
      completedClasses,
      dueAfterClasses,
    });

    res.json({
      success: true,
      payment: {
        ...payment,
        closedBy: payment.closedBy || payment.salesExecutive || '',
        salesExecutive: payment.salesExecutive || payment.closedBy || '',
        student: student || payment.student,
        batch: batch || payment.batch,
        completedClasses,
        assignedClasses,
        dueAfterClasses,
        remainingAmount,
        paymentStatus: dynamicStatus,
      },
    });
  } catch (error: any) {
    console.error('Get single payment error:', error);
    res.status(500).json({ message: error.message || 'Error fetching payment' });
  }
};

// @desc    Update fee/payment record
// @route   PUT /payments/:id
// @access  Private (Admin, Super Admin)
export const updatePayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id || '');
    const payment = await Payment.safeFindById(id);
    if (!payment) {
      res.status(404).json({ message: 'Payment record not found' });
      return;
    }

    const {
      totalFee: rawTotalFee,
      assignedClasses: rawAssignedClasses,
      dueAfterClasses: rawDueAfterClasses,
      salesExecutive: rawSalesExecutive,
      closedBy: rawClosedBy,
      paymentStatus: manualStatus,
      paymentType,
      notes,
    } = req.body;

    const totalFee = rawTotalFee !== undefined ? Math.max(0, Number(rawTotalFee) || 0) : Number(payment.totalFee) || 0;
    const assignedClasses = rawAssignedClasses !== undefined ? Math.max(1, Number(rawAssignedClasses) || 15) : (Number(payment.assignedClasses) || 15);
    const dueAfterClasses = rawDueAfterClasses !== undefined ? Number(rawDueAfterClasses) : calculateDueAfterClasses(assignedClasses);
    const amountPaid = Number(payment.amountPaid) || 0;
    const remainingAmount = Math.max(0, totalFee - amountPaid);

    const batchId = payment.batch?._id || payment.batch;
    const completedClasses = batchId ? await getCompletedClassesForBatch(batchId.toString()) : 0;

    let finalStatus = manualStatus;
    if (!finalStatus || finalStatus === 'auto') {
      finalStatus = calculatePaymentStatus({
        totalFee,
        amountPaid,
        completedClasses,
        dueAfterClasses,
      });
    }

    const salesPerson = (rawSalesExecutive || rawClosedBy || payment.salesExecutive || payment.closedBy || 'Unassigned').trim();

    const updatedPayment = await Payment.safeFindByIdAndUpdate(id, {
      $set: {
        totalFee,
        assignedClasses,
        dueAfterClasses,
        remainingAmount,
        paymentStatus: finalStatus,
        paymentType: paymentType || payment.paymentType || 'Full Payment',
        salesExecutive: salesPerson,
        closedBy: salesPerson,
        notes: notes !== undefined ? notes : (payment.notes || ''),
      },
    });

    // Sync student record
    const sId = payment.student?._id || payment.student;
    if (sId) {
      const sIdStr = typeof sId === 'object' ? (sId._id || sId.id || '').toString() : sId.toString();
      if (sIdStr) await Student.findByIdAndUpdate(sIdStr, { payment: updatedPayment });
    }

    res.json({
      success: true,
      message: 'Payment record updated successfully',
      payment: updatedPayment,
    });
  } catch (error: any) {
    console.error('Update payment error:', error);
    res.status(500).json({ message: error.message || 'Error updating payment' });
  }
};

// @desc    Delete fee/payment record
// @route   DELETE /payments/:id
// @access  Private (Admin, Super Admin)
export const deletePayment = async (req: any, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id || '');
    const payment = await Payment.safeFindById(id);
    if (!payment) {
      res.status(404).json({ message: 'Payment record not found' });
      return;
    }

    const sName = payment.student?.name || (typeof payment.student === 'object' ? payment.student._id : payment.student);

    // Save to Recycle Bin
    await RecycleBin.addToBin({
      entityType: 'payment',
      entityId: payment._id,
      name: `Payment (${sName || 'Student'} - ₹${payment.totalFee || 0})`,
      secondaryInfo: `Amount: ₹${payment.totalFee || 0} • Paid: ₹${payment.amountPaid || 0} • Status: ${payment.paymentStatus || 'Pending'}`,
      itemData: payment,
      deletedBy: req.user,
    });

    const sId = payment.student?._id || payment.student;
    if (sId) {
      const sIdStr = typeof sId === 'object' ? (sId._id || sId.id || '').toString() : sId.toString();
      if (sIdStr) await Student.findByIdAndUpdate(sIdStr, { payment: null });
    }

    await Payment.safeFindByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Payment record moved to Recycle Bin successfully',
    });
  } catch (error: any) {
    console.error('Delete payment error:', error);
    res.status(500).json({ message: error.message || 'Error deleting payment' });
  }
};

// @desc    Get payment and fee summary for a single student
// @route   GET /payments/student/:studentId
// @access  Private
export const getStudentPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = Array.isArray(req.params.studentId) ? req.params.studentId[0] : (req.params.studentId || '');
    const student = await Student.findById(studentId);
    if (!student) {
      res.status(404).json({ message: 'Student not found' });
      return;
    }

    let payment = await Payment.safeFindOne({ student: studentId });
    if (!payment && student.payment) {
      payment = student.payment;
    }

    const batchId = student.batch?._id ? student.batch._id.toString() : student.batch?.toString();
    const batch = batchId ? await Batch.findById(batchId) : null;
    const completedClasses = await getCompletedClassesForBatch(batchId);

    if (!payment) {
      // Return unassigned empty profile ready for admission payment
      res.json({
        hasPayment: false,
        student: {
          _id: student._id,
          name: student.name,
          email: student.email,
          phone: student.mobileNumber || student.phone,
          parentName: student.parentName,
          batch,
        },
        completedClasses,
        assignedClasses: batch?.numberOfSessions || 15,
        dueAfterClasses: calculateDueAfterClasses(batch?.numberOfSessions || 15),
      });
      return;
    }

    const assignedClasses = Number(payment.assignedClasses) || Number(batch?.numberOfSessions) || 15;
    const dueAfterClasses = Number(payment.dueAfterClasses) || calculateDueAfterClasses(assignedClasses);
    const totalFee = Number(payment.totalFee) || 0;
    const amountPaid = Number(payment.amountPaid) || 0;
    const remainingAmount = Math.max(0, totalFee - amountPaid);

    const dynamicStatus = calculatePaymentStatus({
      totalFee,
      amountPaid,
      completedClasses,
      dueAfterClasses,
    });

    res.json({
      hasPayment: true,
      payment: {
        ...payment,
        completedClasses,
        assignedClasses,
        dueAfterClasses,
        remainingAmount,
        paymentStatus: dynamicStatus,
        batch: batch || payment.batch,
        student: {
          _id: student._id,
          name: student.name,
          email: student.email,
          phone: student.mobileNumber || student.phone,
          parentName: student.parentName,
        },
      },
    });
  } catch (error: any) {
    console.error('Get student payment error:', error);
    res.status(500).json({ message: error.message || 'Error fetching student payment' });
  }
};

// @desc    Get real-time payment notifications for system panel
// @route   GET /payments/notifications
// @access  Private
export const getPaymentNotifications = async (_req: Request, res: Response): Promise<void> => {
  try {
    const rawPayments = await Payment.safeFind({});
    const students = await Student.find({});
    const batches = await Batch.find({});
    const completedSchedules = await Schedule.find({ status: 'Completed' });

    const batchCompletedCount = new Map<string, number>();
    for (const sch of completedSchedules) {
      const bId = sch.batch?._id ? sch.batch._id.toString() : sch.batch?.toString();
      if (bId) {
        batchCompletedCount.set(bId, (batchCompletedCount.get(bId) || 0) + 1);
      }
    }

    const studentMap = new Map<string, any>();
    for (const s of students) studentMap.set(s._id.toString(), s);

    const batchMap = new Map<string, any>();
    for (const b of batches) batchMap.set(b._id.toString(), b);

    // Merge student.payment
    const allPaymentsMap = new Map<string, any>();
    for (const p of rawPayments) {
      const sId = p.student?._id ? p.student._id.toString() : (p.student ? p.student.toString() : p._id);
      allPaymentsMap.set(sId, p);
    }
    for (const s of students) {
      if (s.payment && !allPaymentsMap.has(s._id.toString())) {
        allPaymentsMap.set(s._id.toString(), s.payment);
      }
    }

    const notifications: any[] = [];

    for (const p of allPaymentsMap.values()) {
      const remainingAmount = Math.max(0, (Number(p.totalFee) || 0) - (Number(p.amountPaid) || 0));
      if (remainingAmount <= 0) continue; // Full payment made, no notification needed

      const sId = p.student?._id ? p.student._id.toString() : (p.student ? p.student.toString() : '');
      const student = studentMap.get(sId);
      const bId = p.batch?._id ? p.batch._id.toString() : (p.batch ? p.batch.toString() : (student?.batch?._id || student?.batch));
      const batch = batchMap.get(bId);

      const completedClasses = Math.max(
        bId ? (batchCompletedCount.get(bId) || 0) : 0,
        Number(batch?.preCompletedClasses) || 0
      );
      const assignedClasses = Number(p.assignedClasses) || Number(batch?.numberOfSessions) || 15;
      const dueAfterClasses = Number(p.dueAfterClasses) || calculateDueAfterClasses(assignedClasses);

      const status = calculatePaymentStatus({
        totalFee: Number(p.totalFee) || 0,
        amountPaid: Number(p.amountPaid) || 0,
        completedClasses,
        dueAfterClasses,
      });

      const studentName = student?.name || p.studentName || 'Student';
      const courseName = batch?.subject || batch?.name || p.courseName || 'Course';

      if (status === 'Due' || status === 'Overdue') {
        notifications.push({
          id: `due_${p._id || sId}`,
          paymentId: p._id,
          studentId: sId,
          studentName,
          courseName,
          type: 'due',
          severity: status === 'Overdue' ? 'error' : 'warning',
          title: status === 'Overdue' ? 'Payment Overdue' : 'Payment Due',
          classesCompleted: completedClasses,
          assignedClasses,
          dueAfterClasses,
          outstandingAmount: remainingAmount,
          message: `Payment is now due. Student completed ${completedClasses}/${assignedClasses} classes. Outstanding: ₹${remainingAmount.toLocaleString('en-IN')}`,
          timestamp: p.updatedAt || new Date().toISOString(),
        });
      } else if (status === 'Upcoming') {
        notifications.push({
          id: `upcoming_${p._id || sId}`,
          paymentId: p._id,
          studentId: sId,
          studentName,
          courseName,
          type: 'upcoming',
          severity: 'info',
          title: 'Upcoming Payment Reminder',
          classesCompleted: completedClasses,
          assignedClasses,
          dueAfterClasses,
          outstandingAmount: remainingAmount,
          message: `Upcoming payment reminder. Student completed ${completedClasses}/${assignedClasses} classes. Due after ${dueAfterClasses} classes. Outstanding: ₹${remainingAmount.toLocaleString('en-IN')}`,
          timestamp: p.updatedAt || new Date().toISOString(),
        });
      }
    }

    res.json({
      count: notifications.length,
      notifications,
    });
  } catch (error: any) {
    console.error('Get payment notifications error:', error);
    res.status(500).json({ message: error.message || 'Error fetching notifications' });
  }
};

// @desc    Get configurable due rules
// @route   GET /payments/config
// @access  Private
export const getConfig = (_req: Request, res: Response): void => {
  res.json(getPaymentConfig());
};

// @desc    Update configurable due rules
// @route   PUT /payments/config
// @access  Private (Admin only)
export const updateConfig = (req: Request, res: Response): void => {
  try {
    const updated = savePaymentConfig(req.body);
    res.json({
      success: true,
      message: 'Payment configuration rules updated successfully',
      config: updated,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Error updating payment rules' });
  }
};
