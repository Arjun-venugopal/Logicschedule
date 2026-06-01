import mongoose from 'mongoose';

const teacherSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    phone: {
      type: String,
    },
    subjectExpertise: [{
      type: String,
    }],
    experience: {
      type: Number, // In years
    },
    availability: [{
      day: { type: String, enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
      slots: [{
        startTime: String, // e.g., '09:00'
        endTime: String,   // e.g., '10:00'
      }]
    }],
    status: {
      type: String,
      enum: ['Available', 'Busy', 'On Leave'],
      default: 'Available',
    },
    profilePicture: {
      type: String,
    },
    workloadPercentage: {
      type: Number,
      default: 0,
    },
    tempPassword: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

teacherSchema.index({ user: 1 });

const Teacher = mongoose.model('Teacher', teacherSchema);
export default Teacher;
