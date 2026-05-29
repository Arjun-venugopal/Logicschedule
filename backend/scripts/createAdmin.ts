import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { config } from '../config/config';

async function createAdmin() {
  const MONGO_URI = config.MONGO_URI;

  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const { default: User } = await import('../models/User' as any);

    const adminEmail = config.ADMIN_EMAIL;
    const adminPassword = config.ADMIN_PASSWORD;

    const existing = await User.findOne({ email: adminEmail.toLowerCase() });
    if (existing) {
      console.log('⚠️  Admin user already exists:', existing.email);
      process.exit(0);
    }

    const user = await User.create({
      name: 'Super Admin',
      email: adminEmail.toLowerCase(),
      password: adminPassword,
      role: 'Admin',
    });

    console.log('✅ Admin user created!');
    console.log(`   Email:    ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

createAdmin();
