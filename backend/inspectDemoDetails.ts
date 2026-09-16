import { connectFirebase, getDb } from './config/firebase';
import dotenv from 'dotenv';
dotenv.config();

async function inspectDemoDetails() {
  await connectFirebase();
  const db = getDb();
  const snap = await db.collection('demos').orderBy('date', 'desc').limit(15).get();
  for (const doc of snap.docs) {
    const d = doc.data();
    console.log({
      id: doc.id,
      studentName: d.studentName,
      status: d.status,
      salesExecutive: d.salesExecutive,
      createdBy: d.createdBy,
      teacher: d.teacher,
      admissionConfirmed: d.admissionConfirmed,
      conflict: d.conflict
    });
  }
  process.exit(0);
}

inspectDemoDetails().catch(err => {
  console.error(err);
  process.exit(1);
});
