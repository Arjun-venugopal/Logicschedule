import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Batch',
      required: true,
    },
    parentName: {
      type: String,
    },
    mobileNumber: {
      type: String,
    },
    whatsappNumber: {
      type: String,
    },
    email: {
      type: String,
    },
    pastBatches: [
      {
        batch: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Batch',
        },
        leftAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

studentSchema.index({ batch: 1 });

const Student = mongoose.model('Student', studentSchema);
export default Student;
