import mongoose from 'mongoose';

const demoSessionSchema = new mongoose.Schema(
  {
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
      required: true,
    },
    studentName: {
      type: String,
      required: true,
    },
    studentEmail: {
      type: String,
      default: '',
    },
    subject: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    startTime: {
      type: String, // e.g. '09:00'
      required: true,
    },
    endTime: {
      type: String, // e.g. '10:00'
      required: true,
    },
    status: {
      type: String,
      enum: ['Scheduled', 'Completed', 'Cancelled'],
      default: 'Scheduled',
    },
    meetingLink: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
      default: '',
    },
    conflict: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

demoSessionSchema.index({ teacher: 1 });
demoSessionSchema.index({ date: 1 });

const DemoSession = mongoose.model('DemoSession', demoSessionSchema);
export default DemoSession;
