import mongoose from 'mongoose';
import { config } from '../config/config';

async function check() {
  await mongoose.connect(config.MONGO_URI);
  const users = await mongoose.connection.db!.collection('users').find({}).toArray();
  users.forEach(u => console.log(`  ${u.email} → role: "${u.role}"`));
  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
