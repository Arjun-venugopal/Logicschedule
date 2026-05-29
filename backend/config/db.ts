import mongoose from 'mongoose';
import { config } from './config';

const connectDB = async () => {
  const MONGO_URI = config.MONGO_URI;
  try {
    const conn = await mongoose.connect(MONGO_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.error(`❌ MongoDB connection failed: ${error.message}`);
    console.log('   Please update MONGO_URI in backend/.env with your MongoDB Atlas connection string.');
    throw error;
  }
};

export default connectDB;
