import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

async function createAdmin() {
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/teacher_schedule';

  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const { default: User } = await import('../models/User' as any);

    const existing = await User.findOne({ email: 'admin@gmail.com' });
    if (existing) {
      console.log('⚠️  Admin user already exists:', existing.email);
      process.exit(0);
    }

    const user = await User.create({
      name: 'Super Admin',
      email: 'admin@gmail.com',
      password: 'Admin@12345',
      role: 'Admin',
    });

    console.log('✅ Admin user created!');
    console.log('   Email:    admin@gmail.com');
    console.log('   Password: Admin@12345');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

createAdmin();
