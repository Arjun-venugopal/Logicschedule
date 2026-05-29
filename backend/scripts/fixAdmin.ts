import mongoose from 'mongoose';
import { config } from '../config/config';

async function fixAdmin() {
  const MONGO_URI = config.MONGO_URI;
  await mongoose.connect(MONGO_URI);
  console.log('Connected');

  const result = await mongoose.connection.db!.collection('users').updateOne(
    { email: config.ADMIN_EMAIL.toLowerCase() },
    { $set: { role: 'Admin' } }
  );
  console.log('Updated:', result.modifiedCount, 'docs');
  process.exit(0);
}

fixAdmin().catch(e => { console.error(e); process.exit(1); });
