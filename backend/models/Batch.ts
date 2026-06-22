import mongoose from 'mongoose';

const batchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    subject: {
      type: String,
      required: true,
    },
    assignedTeacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
    },
    studentsCount: {
      type: Number,
      default: 0,
    },
    timing: {
      startTime: String,
      endTime: String,
    },
    days: [{
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    }],
    meetingLink: {
      type: String,
    },
    // Duration fields
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    durationType: {
      type: String,
      enum: ['1 Week', '2 Weeks', '1 Month', '3 Months', '6 Months', '1 Year', 'Custom'],
      default: '1 Month',
    },
    numberOfSessions: {
      type: Number,
      default: null,
    },
    status: {
      type: String,
      enum: ['Upcoming', 'Active', 'Completed', 'Cancelled'],
      default: 'Upcoming',
    },
  },
  {
    timestamps: true,
  }
);

batchSchema.index({ assignedTeacher: 1 });

const Batch = mongoose.model('Batch', batchSchema);
export default Batch;
