import { connectFirebase, getDb } from './config/firebase';
import dotenv from 'dotenv';
dotenv.config();

async function backfillDemoStatus() {
  await connectFirebase();
  const db = getDb();
  const snap = await db.collection('demos').get();
  let updatedCount = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (!data.status) {
      await doc.ref.update({ status: 'Scheduled' });
      updatedCount++;
      console.log(`Updated demo ${doc.id} (${data.studentName}) status to 'Scheduled'`);
    }
  }

  console.log(`Successfully backfilled ${updatedCount} demo sessions.`);
  process.exit(0);
}

backfillDemoStatus().catch(err => {
  console.error('Backfill error:', err);
  process.exit(1);
});
