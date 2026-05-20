import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function fixAdmin() {
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/teacher_schedule';
  await mongoose.connect(MONGO_URI);
  console.log('Connected');

  const result = await mongoose.connection.db!.collection('users').updateOne(
    { email: 'admin@gmail.com' },
    { $set: { role: 'Admin' } }
  );
  console.log('Updated:', result.modifiedCount, 'docs');
  process.exit(0);
}

fixAdmin().catch(e => { console.error(e); process.exit(1); });
