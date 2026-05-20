import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/teacher_schedule');
  const users = await mongoose.connection.db!.collection('users').find({}).toArray();
  users.forEach(u => console.log(`  ${u.email} → role: "${u.role}"`));
  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
