import { connectFirebase, getDb } from './config/firebase';
import dotenv from 'dotenv';
dotenv.config();

async function inspectUsers() {
  await connectFirebase();
  const db = getDb();
  const snap = await db.collection('users').get();
  console.log(snap.docs.map(d => ({ id: d.id, email: d.data().email, role: d.data().role, name: d.data().name })));
  process.exit(0);
}

inspectUsers().catch(err => {
  console.error(err);
  process.exit(1);
});
