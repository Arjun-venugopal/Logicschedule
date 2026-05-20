import { Request, Response } from 'express';
import Teacher from '../models/Teacher';
import User from '../models/User';

// @desc    Get all teachers
// @route   GET /teachers
// @access  Private
export const getTeachers = async (req: Request, res: Response) => {
  try {
    const teachers = await Teacher.find({}).populate('user', 'name email role mustChangePassword');
    res.json(teachers);
  } catch (error: any) {
    console.error('Get teachers error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Create a teacher directly (also creates login User)
// @route   POST /teachers
// @access  Private/Admin
export const createTeacher = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, phone, subjectExpertise, experience, status, tempPassword } = req.body;

    if (!name || !email) {
      res.status(400).json({ message: 'Name and email are required' });
      return;
    }

    const normalizedEmail = email.toLowerCase();

    // Create or find login User
    let user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      user = await User.create({
        name,
        email: normalizedEmail,
        password: tempPassword || 'Temp@1234',
        role: 'Teacher',
        mustChangePassword: true,
      });
    }

    // Check for duplicate Teacher profile
    const teacherExists = await Teacher.findOne({ email: normalizedEmail });
    if (teacherExists) {
      res.status(400).json({ message: 'Teacher profile with this email already exists' });
      return;
    }

    const teacher = await Teacher.create({
      user: user._id,
      name,
      email: normalizedEmail,
      phone: phone || '',
      subjectExpertise: subjectExpertise || [],
      experience: experience || 0,
      status: status || 'Available',
    });

    const populated = await teacher.populate('user', 'name email role');
    res.status(201).json(populated);
  } catch (error: any) {
    console.error('Create teacher error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Update a teacher
// @route   PUT /teachers/:id
// @access  Private/Admin
export const updateTeacher = async (req: Request, res: Response): Promise<void> => {
  try {
    const teacher = await Teacher.findById(req.params.id);

    if (!teacher) {
      res.status(404).json({ message: 'Teacher not found' });
      return;
    }

    teacher.name              = req.body.name ?? teacher.name;
    teacher.phone             = req.body.phone ?? teacher.phone;
    teacher.subjectExpertise  = req.body.subjectExpertise ?? teacher.subjectExpertise;
    teacher.experience        = req.body.experience ?? teacher.experience;
    teacher.status            = req.body.status ?? teacher.status;
    teacher.availability      = req.body.availability ?? teacher.availability;
    teacher.workloadPercentage = req.body.workloadPercentage ?? teacher.workloadPercentage;

    const updated = await teacher.save();
    res.json(updated);
  } catch (error: any) {
    console.error('Update teacher error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Delete a teacher
// @route   DELETE /teachers/:id
// @access  Private/Admin
export const deleteTeacher = async (req: Request, res: Response): Promise<void> => {
  try {
    const teacher = await Teacher.findById(req.params.id);

    if (!teacher) {
      res.status(404).json({ message: 'Teacher not found' });
      return;
    }

    await Teacher.deleteOne({ _id: teacher._id });
    res.json({ message: 'Teacher removed' });
  } catch (error: any) {
    console.error('Delete teacher error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};
