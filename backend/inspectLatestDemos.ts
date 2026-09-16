import { connectFirebase, getDb } from './config/firebase';
import dotenv from 'dotenv';
dotenv.config();

async function inspectLatestDemos() {
  await connectFirebase();
  const db = getDb();
  
  const snap = await db.collection('demos').get();
  let missing = 0;
  let scheduled = 0;
  let completed = 0;
  let rescheduled = 0;
  let cancelled = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    if (!d.status) missing++;
    else if (d.status === 'Scheduled') scheduled++;
    else if (d.status === 'Completed') completed++;
    else if (d.status === 'Rescheduled') rescheduled++;
    else if (d.status === 'Cancelled') cancelled++;
  }
  console.log(`Total demos: ${snap.docs.length}`);
  console.log(`Missing status: ${missing}, Scheduled: ${scheduled}, Completed: ${completed}, Rescheduled: ${rescheduled}, Cancelled: ${cancelled}`);
  process.exit(0);
}

inspectLatestDemos().catch(err => {
  console.error(err);
  process.exit(1);
});
