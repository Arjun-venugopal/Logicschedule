import { Response } from 'express';
import DemoReport from '../models/DemoReport';
import DemoSession from '../models/DemoSession';
import Teacher from '../models/Teacher';

// @desc    Get all demo reports (filtered by role)
// @route   GET /demo-reports
// @access  Private
export const getDemoReports = async (req: any, res: Response): Promise<void> => {
  try {
    let reports: any[];

    if (req.user.role === 'Teacher') {
      const teacher = await Teacher.findOne({ user: req.user._id });
      if (!teacher) {
        res.json([]);
        return;
      }
      // Get demo sessions for this teacher, then find reports
      const sessions = await DemoSession.find({ teacher: teacher._id });
      const sessionIds = sessions.map((s: any) => s._id);
      reports = await DemoReport.find({});
      reports = reports.filter((r: any) => sessionIds.includes(r.demoSession));
    } else if (req.user.role === 'Sales Person') {
      // Sales Person can only see reports for their completed demo students
      const sessions = await DemoSession.find({
        $or: [
          { createdBy: req.user._id.toString() },
          { salesExecutive: req.user.name }
        ],
        status: 'Completed'
      });
      const sessionIds = sessions.map((s: any) => s._id);
      reports = await DemoReport.find({});
      reports = reports.filter((r: any) => sessionIds.includes(r.demoSession));
    } else {
      // Admin, Super Admin, Sub Admin — all reports
      reports = await DemoReport.find({});
    }

    res.json(reports);
  } catch (error: any) {
    console.error('Get demo reports error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get single demo report by ID
// @route   GET /demo-reports/:id
// @access  Private
export const getDemoReportById = async (req: any, res: Response): Promise<void> => {
  try {
    const report = await DemoReport.findById(req.params.id);
    if (!report) {
      res.status(404).json({ message: 'Report not found' });
      return;
    }

    // Authorization check
    if (req.user.role === 'Teacher') {
      const teacher = await Teacher.findOne({ user: req.user._id });
      const session = await DemoSession.findById(report.demoSession);
      if (!teacher || !session || session.teacher.toString() !== teacher._id.toString()) {
        res.status(403).json({ message: 'Not authorized to view this report' });
        return;
      }
    } else if (req.user.role === 'Sales Person') {
      const session = await DemoSession.findById(report.demoSession);
      if (!session || session.status !== 'Completed') {
        res.status(403).json({ message: 'Not authorized to view this report' });
        return;
      }
      const isOwner = session.createdBy === req.user._id.toString() ||
        session.salesExecutive?.trim().toLowerCase() === req.user.name?.trim().toLowerCase();
      if (!isOwner) {
        res.status(403).json({ message: 'Not authorized to view this report' });
        return;
      }
    }

    res.json(report);
  } catch (error: any) {
    console.error('Get demo report error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get report by demo session ID
// @route   GET /demo-reports/by-session/:sessionId
// @access  Private
export const getDemoReportBySession = async (req: any, res: Response): Promise<void> => {
  try {
    const report = await DemoReport.findOne({ demoSession: req.params.sessionId });
    if (!report) {
      res.status(404).json({ message: 'No report found for this session' });
      return;
    }

    // Authorization check
    if (req.user.role === 'Teacher') {
      const teacher = await Teacher.findOne({ user: req.user._id });
      const session = await DemoSession.findById(report.demoSession);
      if (!teacher || !session || session.teacher.toString() !== teacher._id.toString()) {
        res.status(403).json({ message: 'Not authorized to view this report' });
        return;
      }
    } else if (req.user.role === 'Sales Person') {
      const session = await DemoSession.findById(report.demoSession);
      if (!session || session.status !== 'Completed') {
        res.status(403).json({ message: 'Not authorized to view this report' });
        return;
      }
      const isOwner = session.createdBy === req.user._id.toString() ||
        session.salesExecutive?.trim().toLowerCase() === req.user.name?.trim().toLowerCase();
      if (!isOwner) {
        res.status(403).json({ message: 'Not authorized to view this report' });
        return;
      }
    }

    res.json(report);
  } catch (error: any) {
    console.error('Get demo report by session error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create a demo report
// @route   POST /demo-reports
// @access  Private (Teacher/Admin/Sub Admin)
export const createDemoReport = async (req: any, res: Response): Promise<void> => {
  try {
    const { demoSession, studentName, age, className, tutor, courseSelected, scores, taskRemarks, overallRemarks, date } = req.body;

    if (!demoSession || !studentName || !scores) {
      res.status(400).json({ message: 'Please provide demoSession, studentName, and scores' });
      return;
    }

    // Check the demo session exists
    const session = await DemoSession.findById(demoSession);
    if (!session) {
      res.status(404).json({ message: 'Demo session not found' });
      return;
    }

    // Authorization: Teachers can only create reports for their own sessions
    if (req.user.role === 'Teacher') {
      const teacher = await Teacher.findOne({ user: req.user._id });
      if (!teacher || session.teacher.toString() !== teacher._id.toString()) {
        res.status(403).json({ message: 'Not authorized to create report for this session' });
        return;
      }
    }

    // Sales Persons cannot create reports
    if (req.user.role === 'Sales Person') {
      res.status(403).json({ message: 'Sales persons are not authorized to create reports' });
      return;
    }

    // Check if report already exists for this session
    const existingReport = await DemoReport.findOne({ demoSession });
    if (existingReport) {
      res.status(400).json({ message: 'A report already exists for this demo session. Use update instead.' });
      return;
    }

    // Calculate total score
    const totalScore = (scores.introductionToInterface || 0) +
      (scores.blocksAndCommands || 0) +
      (scores.logicAndProblemSolving || 0) +
      (scores.creativityAndProjectBuilding || 0) +
      (scores.communicationAndParticipation || 0) +
      (scores.timeManagement || 0);

    const report = await DemoReport.create({
      demoSession,
      studentName,
      age: age || null,
      className: className || '',
      tutor: tutor || '',
      courseSelected: courseSelected || '',
      scores,
      taskRemarks: taskRemarks || {},
      totalScore,
      overallRemarks: overallRemarks || '',
      createdBy: req.user._id.toString(),
      date: date ? new Date(date) : new Date(),
    });

    res.status(201).json(report);
  } catch (error: any) {
    console.error('Create demo report error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Update a demo report
// @route   PUT /demo-reports/:id
// @access  Private (Teacher/Admin/Sub Admin)
export const updateDemoReport = async (req: any, res: Response): Promise<void> => {
  try {
    const report = await DemoReport.findById(req.params.id);
    if (!report) {
      res.status(404).json({ message: 'Report not found' });
      return;
    }

    // Authorization: Teachers can only edit reports for their own sessions
    if (req.user.role === 'Teacher') {
      const teacher = await Teacher.findOne({ user: req.user._id });
      const session = await DemoSession.findById(report.demoSession);
      
      let sessionTeacherId = session?.teacher;
      // If session.teacher is populated, extract the ID
      if (sessionTeacherId && typeof sessionTeacherId === 'object' && sessionTeacherId._id) {
          sessionTeacherId = sessionTeacherId._id;
      }

      if (!teacher || !session || sessionTeacherId?.toString() !== teacher._id?.toString()) {
        console.error("403 Forbidden: Teacher mismatch.", "Session Teacher:", sessionTeacherId, "Logged in Teacher:", teacher?._id);
        res.status(403).json({ message: 'Not authorized to update this report' });
        return;
      }
    }

    // Sales Persons cannot edit reports
    if (req.user.role === 'Sales Person') {
      res.status(403).json({ message: 'Sales persons are not authorized to edit reports' });
      return;
    }

    // Update fields
    report.studentName = req.body.studentName || report.studentName;
    report.age = req.body.age !== undefined ? req.body.age : report.age;
    report.className = req.body.className !== undefined ? req.body.className : report.className;
    report.tutor = req.body.tutor !== undefined ? req.body.tutor : report.tutor;
    report.courseSelected = req.body.courseSelected !== undefined ? req.body.courseSelected : report.courseSelected;
    report.overallRemarks = req.body.overallRemarks !== undefined ? req.body.overallRemarks : report.overallRemarks;
    report.date = req.body.date ? new Date(req.body.date) : report.date;

    if (req.body.scores) {
      report.scores = { ...report.scores, ...req.body.scores };
    }
    if (req.body.taskRemarks) {
      report.taskRemarks = { ...report.taskRemarks, ...req.body.taskRemarks };
    }

    // Recalculate total score
    report.totalScore = (report.scores.introductionToInterface || 0) +
      (report.scores.blocksAndCommands || 0) +
      (report.scores.logicAndProblemSolving || 0) +
      (report.scores.creativityAndProjectBuilding || 0) +
      (report.scores.communicationAndParticipation || 0) +
      (report.scores.timeManagement || 0);

    const updated = await report.save();
    res.json(updated);
  } catch (error: any) {
    console.error('Update demo report error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Delete a demo report
// @route   DELETE /demo-reports/:id
// @access  Private (Admin/Sub Admin only)
export const deleteDemoReport = async (req: any, res: Response): Promise<void> => {
  try {
    const report = await DemoReport.findById(req.params.id);
    if (!report) {
      res.status(404).json({ message: 'Report not found' });
      return;
    }

    const isAdmin = req.user.role === 'Admin' || req.user.role === 'Super Admin' || req.user.role === 'Sub Admin';
    if (!isAdmin) {
      res.status(403).json({ message: 'Only admins can delete reports' });
      return;
    }

    await DemoReport.deleteOne({ _id: report._id });
    res.json({ message: 'Report removed' });
  } catch (error: any) {
    console.error('Delete demo report error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};
