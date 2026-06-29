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

    const demoSlots = await DemoSlot.find(query).populate('teacher', 'name email status');
    
    // Check booking status for each slot
    const slotsWithBookingStatus = await Promise.all(
      demoSlots.map(async (slot: any) => {
        // Find if there is any demo session overlapping with this slot
        const dateObj = new Date(slot.date);
        
        // Match day exactly. Since dates might have time components, we match just the date string if we can,
        // or ensure they fall on the same day.
        
        // Start of day and end of day for the slot's date
        const startOfDay = new Date(dateObj);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(dateObj);
        endOfDay.setHours(23, 59, 59, 999);

        const overlappingSession = await DemoSession.findOne({
          teacher: slot.teacher._id || slot.teacher,
          date: { $gte: startOfDay, $lte: endOfDay },
          status: { $ne: 'Cancelled' },
          $or: [
            { startTime: { $lt: slot.endTime }, endTime: { $gt: slot.startTime } },
          ],
        });

        return {
          ...slot,
          isBooked: !!overlappingSession,
        };
      })
    );

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
      if (!teacherProfile || teacherProfile._id.toString() !== teacher.toString()) {
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
    res.status(201).json({ ...populated, isBooked: false });
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
      if (!teacherProfile || demoSlot.teacher.toString() !== teacherProfile._id.toString()) {
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
