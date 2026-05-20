import mongoose from 'mongoose';

const scheduleSchema = new mongoose.Schema(
  {
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
      required: true,
    },
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Batch',
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    startTime: {
      type: String, // '09:00'
      required: true,
    },
    endTime: {
      type: String, // '10:00'
      required: true,
    },
    status: {
      type: String,
      enum: ['Scheduled', 'Completed', 'Cancelled', 'Rescheduled'],
      default: 'Scheduled',
    },
    replacementTeacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
      default: null,
    },
    conflict: {
      type: Boolean,
      default: false,
    },
    meetingLink: {
      type: String,
      default: '',
    },
    subject: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
      default: '',
    },
    attendance: [{
      studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
      },
      isPresent: {
        type: Boolean,
        default: true,
      }
    }],
  },
  {
    timestamps: true,
  }
);

const Schedule = mongoose.model('Schedule', scheduleSchema);
export default Schedule;
