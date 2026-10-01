import { Response } from 'express';
import DemoSlot from '../models/DemoSlot';
import DemoSession from '../models/DemoSession';
import Teacher from '../models/Teacher';

// @desc    Get all demo slots
// @route   GET /demo-slots
// @access  Private
export const getDemoSlots = async (req: any, res: Response): Promise<void> => {
  try {
    let query: any = {};

    // If logged in user is a Teacher, only fetch their demo slots
    if (req.user && req.user.role === 'Teacher') {
      const teacher = await Teacher.findOne({ user: req.user._id });
      if (teacher) {
        query = { teacher: teacher._id };
      } else {
        res.json([]);
        return;
      }
    }

    const demoSlots = await DemoSlot.find(query).populate('teacher', 'name email status').lean();
    
    if (demoSlots.length === 0) {
      res.json([]);
      return;
    }

    // Eliminate N+1 queries: compute date bounds and teacher IDs for a single batched query
    let minTime = Infinity;
    let maxTime = -Infinity;
    const teacherIdSet = new Set<string>();

    for (const slot of demoSlots) {
      if (slot.date) {
        const d = new Date(slot.date).getTime();
        if (!isNaN(d)) {
          if (d < minTime) minTime = d;
          if (d > maxTime) maxTime = d;
        }
      }
      const tId = (slot.teacher?._id || slot.teacher)?.toString();
      if (tId) teacherIdSet.add(tId);
    }

    const minDate = new Date(minTime);
    minDate.setHours(0, 0, 0, 0);
    const maxDate = new Date(maxTime);
    maxDate.setHours(23, 59, 59, 999);

    const demoSessions = await DemoSession.find({
      teacher: { $in: Array.from(teacherIdSet) },
      date: { $gte: minDate, $lte: maxDate },
      status: { $ne: 'Cancelled' },
    }).select('teacher date startTime endTime status');

    // Index demo sessions by teacherId + dateStr (YYYY-MM-DD) for O(1) overlap checks
    const sessionsByTeacherAndDate = new Map<string, any[]>();
    for (const s of demoSessions) {
      const tId = (s.teacher?._id || s.teacher)?.toString();
      if (!tId || !s.date) continue;
      const dateStr = s.date instanceof Date ? s.date.toISOString().split('T')[0] : String(s.date).split('T')[0];
      const key = `${tId}:${dateStr}`;
      let list = sessionsByTeacherAndDate.get(key);
      if (!list) {
        list = [];
        sessionsByTeacherAndDate.set(key, list);
      }
      list.push(s);
    }

    // Check booking status in memory
    const slotsWithBookingStatus = demoSlots.map((slot: any) => {
      const teacherId = (slot.teacher?._id || slot.teacher)?.toString();
      if (!teacherId || !slot.date || !slot.startTime || !slot.endTime) {
        return { ...slot, isBooked: false };
      }
      const dateStr = slot.date instanceof Date ? slot.date.toISOString().split('T')[0] : String(slot.date).split('T')[0];
      const key = `${teacherId}:${dateStr}`;
      const candidateSessions = sessionsByTeacherAndDate.get(key) || [];

      const isBooked = candidateSessions.some((session: any) => {
        return session.startTime < slot.endTime && session.endTime > slot.startTime;
      });

      return {
        ...slot,
        isBooked,
      };
    });

    res.json(slotsWithBookingStatus);
  } catch (error: any) {
    console.error('Get demo slots error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create a demo slot
// @route   POST /demo-slots
// @access  Private/Admin
export const createDemoSlot = async (req: any, res: Response): Promise<void> => {
  try {
    const { teacher, date, startTime, endTime } = req.body;

    if (!teacher || !date || !startTime || !endTime) {
      res.status(400).json({ message: 'Please provide all required fields: teacher, date, startTime, endTime' });
      return;
    }

    const dateObj = new Date(date);

    if (req.user && req.user.role === 'Teacher') {
      const teacherProfile = await Teacher.findOne({ user: req.user._id });
      const teacherIdStr = (typeof teacher === 'object' && teacher?._id) ? teacher._id.toString() : teacher?.toString();
      if (!teacherProfile || teacherProfile._id.toString() !== teacherIdStr) {
        res.status(403).json({ message: 'Not authorized to create slots for other teachers' });
        return;
      }
    }

    const demoSlot = await DemoSlot.create({
      teacher,
      date: dateObj,
      startTime,
      endTime,
    });

    const populated = await demoSlot.populate('teacher', 'name email status');
    res.status(201).json({ ...(populated.toObject ? populated.toObject() : populated), isBooked: false });
  } catch (error: any) {
    console.error('Create demo slot error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Delete a demo slot
// @route   DELETE /demo-slots/:id
// @access  Private/Admin
export const deleteDemoSlot = async (req: any, res: Response): Promise<void> => {
  try {
    const demoSlot = await DemoSlot.findById(req.params.id);

    if (!demoSlot) {
      res.status(404).json({ message: 'Demo slot not found' });
      return;
    }

    if (req.user && req.user.role === 'Teacher') {
      const teacherProfile = await Teacher.findOne({ user: req.user._id });
      const slotTeacherId = (demoSlot.teacher && typeof demoSlot.teacher === 'object' && demoSlot.teacher._id)
        ? demoSlot.teacher._id.toString()
        : demoSlot.teacher ? demoSlot.teacher.toString() : null;

      if (!teacherProfile || slotTeacherId !== teacherProfile._id.toString()) {
        res.status(403).json({ message: 'Not authorized to delete slots for other teachers' });
        return;
      }
    }

    await demoSlot.deleteOne();
    res.json({ message: 'Demo slot removed' });
  } catch (error: any) {
    console.error('Delete demo slot error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};
