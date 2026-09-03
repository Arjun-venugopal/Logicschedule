import { connectFirebase, getDb } from './config/firebase';
import dotenv from 'dotenv';
dotenv.config();

async function checkStudents() {
  await connectFirebase();
  const db = getDb();
  
  const sreebala = await db.collection('students').where('name', '==', 'Sreebala arun').get();
  console.log('Sreebala students:', sreebala.docs.map(d => ({ id: d.id, ...d.data() })));

  const evana = await db.collection('students').where('name', '==', 'EVANA AND DAVID').get();
  console.log('Evana students:', evana.docs.map(d => ({ id: d.id, ...d.data() })));

  process.exit(0);
}

checkStudents().catch(err => {
  console.error(err);
  process.exit(1);
});
