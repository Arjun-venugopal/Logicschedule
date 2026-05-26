import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env from backend folder
dotenv.config();

// Define/import models so mongoose registers them
import Teacher from '../models/Teacher';
import Batch from '../models/Batch';
import Schedule from '../models/Schedule';
import DemoSession from '../models/DemoSession';

async function testPerformance() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/teacher_schedule';
  console.log('Connecting to MONGO_URI...', uri ? 'URI loaded' : 'URI not found');
  await mongoose.connect(uri);
  console.log('Connected!');

  // Find a teacher
  const teacher = await Teacher.findOne({});
  if (!teacher) {
    console.log('No teacher found in database!');
    process.exit(0);
  }
  console.log('Testing performance query for teacher:', teacher.name, 'ID:', teacher._id);

  try {
    const totalBatches = await Batch.countDocuments({ assignedTeacher: teacher._id });
    console.log('totalBatches:', totalBatches);

    const totalSchedules = await Schedule.countDocuments({ teacher: teacher._id });
    console.log('totalSchedules:', totalSchedules);

    const completedClasses = await Schedule.countDocuments({ teacher: teacher._id, status: 'Completed' });
    console.log('completedClasses:', completedClasses);

    const cancelledClasses = await Schedule.countDocuments({ teacher: teacher._id, status: 'Cancelled' });
    console.log('cancelledClasses:', cancelledClasses);

    const completionRate = totalSchedules > 0 ? Math.round((completedClasses / totalSchedules) * 100) : 0;
    console.log('completionRate:', completionRate);

    const completedSchedulesList = await Schedule.find({ teacher: teacher._id, status: 'Completed' });
    let totalHoursTaught = 0;
    completedSchedulesList.forEach((s: any) => {
      if (s.startTime && s.endTime) {
        const [sh, sm] = s.startTime.split(':').map(Number);
        const [eh, em] = s.endTime.split(':').map(Number);
        totalHoursTaught += (eh + em / 60) - (sh + sm / 60);
      }
    });
    totalHoursTaught = Math.round(totalHoursTaught * 10) / 10;
    console.log('totalHoursTaught:', totalHoursTaught);

    let totalPresent = 0;
    let totalEnrolled = 0;
    completedSchedulesList.forEach((s: any) => {
      if (s.attendance && s.attendance.length > 0) {
        totalEnrolled += s.attendance.length;
        totalPresent += s.attendance.filter((a: any) => a.isPresent).length;
      }
    });
    const avgAttendanceRate = totalEnrolled > 0 ? Math.round((totalPresent / totalEnrolled) * 100) : 0;
    console.log('avgAttendanceRate:', avgAttendanceRate);

    const totalDemos = await DemoSession.countDocuments({ teacher: teacher._id });
    console.log('totalDemos:', totalDemos);
    const completedDemos = await DemoSession.countDocuments({ teacher: teacher._id, status: 'Completed' });
    console.log('completedDemos:', completedDemos);
    const demoConversionRate = totalDemos > 0 ? Math.round((completedDemos / totalDemos) * 100) : 0;
    console.log('demoConversionRate:', demoConversionRate);

    const recentFeedback = await Schedule.find({
      teacher: teacher._id,
      status: 'Completed',
      notes: { $ne: '' }
    })
      .populate('batch', 'name')
      .sort({ date: -1 })
      .limit(5)
      .select('date subject notes batch');
    console.log('recentFeedback count:', recentFeedback.length);

    console.log('All calculations completed successfully!');
  } catch (error: any) {
    console.error('ERROR during performance query execution:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

testPerformance().catch(err => {
  console.error('Unhandled test error:', err);
  process.exit(1);
});
