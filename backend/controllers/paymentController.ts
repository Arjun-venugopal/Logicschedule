import { Request, Response } from 'express';
import crypto from 'crypto';
import Payment from '../models/Payment';
import Student from '../models/Student';
import Batch from '../models/Batch';
import Schedule from '../models/Schedule';
import DemoSession from '../models/DemoSession';
import { getSupabase } from '../config/supabase';
import {
  getPaymentConfig,
  savePaymentConfig,
  calculateDueAfterClasses,
  calculatePaymentStatus,
} from '../utils/paymentRules';

// Helper: Get completed classes count for a batch
async function getCompletedClassesForBatch(batchId: string): Promise<number> {
  if (!batchId) return 0;
  try {
    const count = await Schedule.countDocuments({
      batch: batchId,
      status: 'Completed',
    });
    return count || 0;
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

    const initialTx = {
      id: crypto.randomUUID(),
      amount: amountPaid,
      paymentDate: paymentDate || new Date().toISOString(),
      paymentMethod: paymentMethod || 'Bank Transfer',
      transactionId: transactionId || '',
      recordedBy: (req as any).user?.name || 'Admin',
      paymentType: paymentType === 'Full Payment' ? 'Full Payment' : 'Initial Payment',
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
    const tx = {
      id: crypto.randomUUID(),
      amount,
      paymentDate: paymentDate || new Date().toISOString(),
      paymentMethod: paymentMethod || 'Bank Transfer',
      transactionId: transactionId || '',
      recordedBy: (req as any).user?.name || 'Admin',
      paymentType: isFullSettlement ? 'Final Payment' : 'Installment',
      remainingBalance: newRemainingAmount,
      notes: notes || '',
      createdAt: new Date().toISOString(),
    };

    const updatedPayment = await Payment.safeFindByIdAndUpdate(payment._id, {
      $set: {
        amountPaid: newAmountPaid,
        remainingAmount: newRemainingAmount,
        paymentStatus: newStatus,
      },
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
    const timeRange = ((req.query.timeRange as string) || 'all').toLowerCase(); // 'all' | 'today' | 'day' | 'week' | 'month'
    const salesFilter = ((req.query.salesExecutive as string) || (req.query.closedBy as string) || 'all').trim();
    const statusFilter = ((req.query.status as string) || 'all').trim();
    const searchQuery = ((req.query.search as string) || '').trim().toLowerCase();

    // Calculate time range boundary dates in local time
    const now = new Date();
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    if (timeRange === 'today' || timeRange === 'day') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (timeRange === 'week') {
      const currentDay = now.getDay();
      const diffToMonday = (currentDay === 0 ? -6 : 1) - currentDay;
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday, 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday + 6, 23, 59, 59, 999);
    } else if (timeRange === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
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
    let filteredCollected = 0;
    let filteredOutstanding = 0;
    let dueCount = 0;
    let upcomingCount = 0;
    let paidCount = 0;
    let overdueCount = 0;

    let overallCollected = 0;
    let overallOutstanding = 0;

    for (const p of paymentMap.values()) {
      const sId = p.student?._id ? p.student._id.toString() : (p.student ? p.student.toString() : '');
      const student = studentMap.get(sId);
      const bId = p.batch?._id ? p.batch._id.toString() : (p.batch ? p.batch.toString() : (student?.batch?._id || student?.batch));
      const batch = batchMap.get(bId);

      const completedClasses = bId ? (batchCompletedCount.get(bId) || 0) : 0;
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

      // Filter by time range
      let matchesTime = true;
      let periodCollected = amountPaid;

      if (startDate && endDate) {
        const history = p.paymentHistory || [];
        const txsInRange = history.filter((tx: any) => {
          const d = new Date(tx.paymentDate || tx.createdAt || tx.date);
          return !isNaN(d.getTime()) && d >= startDate! && d <= endDate!;
        });
        const createdDate = p.createdAt ? new Date(p.createdAt) : null;
        const createdInRange = createdDate && !isNaN(createdDate.getTime()) && createdDate >= startDate! && createdDate <= endDate!;

        if (txsInRange.length > 0) {
          matchesTime = true;
          periodCollected = txsInRange.reduce((acc: number, t: any) => acc + (Number(t.amount) || 0), 0);
        } else if (createdInRange) {
          matchesTime = true;
          periodCollected = amountPaid;
        } else {
          matchesTime = false;
          periodCollected = 0;
        }
      }

      // Filter by sales executive
      const matchesSales = salesFilter === 'all' || salesExec.toLowerCase() === salesFilter.toLowerCase();

      // Filter by status
      const matchesStatus = statusFilter === 'all' || dynamicStatus.toLowerCase() === statusFilter.toLowerCase();

      // Filter by search query
      const matchesSearch = !searchQuery || (
        (student?.name || '').toLowerCase().includes(searchQuery) ||
        (student?.email || '').toLowerCase().includes(searchQuery) ||
        (student?.phone || student?.mobileNumber || '').toLowerCase().includes(searchQuery) ||
        (batch?.name || '').toLowerCase().includes(searchQuery) ||
        (p.notes || '').toLowerCase().includes(searchQuery) ||
        salesExec.toLowerCase().includes(searchQuery)
      );

      if (matchesTime && matchesSales && matchesStatus && matchesSearch) {
        filteredCollected += (startDate ? periodCollected : amountPaid);
        filteredOutstanding += remainingAmount;

        if (dynamicStatus === 'Paid') paidCount++;
        else if (dynamicStatus === 'Due') dueCount++;
        else if (dynamicStatus === 'Upcoming') upcomingCount++;
        else if (dynamicStatus === 'Overdue') {
          dueCount++;
          overdueCount++;
        }

        processedPayments.push({
          ...p,
          salesExecutive: salesExec,
          closedBy: salesExec,
          periodCollected,
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
        });
      }
    }

    const kpisData = {
      totalCollected: filteredCollected,
      periodCollected: filteredCollected,
      totalOutstanding: filteredOutstanding,
      dueCount,
      upcomingCount,
      paidCount,
      overdueCount,
      totalStudentsWithFee: processedPayments.length,
    };

    res.json({
      payments: processedPayments,
      kpis: kpisData,
      filteredKpis: kpisData,
      overallKpis: {
        totalCollected: overallCollected,
        totalOutstanding: overallOutstanding,
      },
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
export const deletePayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id || '');
    const payment = await Payment.safeFindById(id);
    if (!payment) {
      res.status(404).json({ message: 'Payment record not found' });
      return;
    }

    const sId = payment.student?._id || payment.student;
    if (sId) {
      const sIdStr = typeof sId === 'object' ? (sId._id || sId.id || '').toString() : sId.toString();
      if (sIdStr) await Student.findByIdAndUpdate(sIdStr, { payment: null });
    }

    await Payment.safeFindByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Payment record deleted successfully',
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

      const completedClasses = bId ? (batchCompletedCount.get(bId) || 0) : 0;
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
