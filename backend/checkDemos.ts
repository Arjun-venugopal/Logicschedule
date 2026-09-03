import { connectFirebase, getDb } from './config/firebase';
import dotenv from 'dotenv';
dotenv.config();

async function checkAllConfirmedDemos() {
  await connectFirebase();
  const db = getDb();
  
  const demosSnap = await db.collection('demos').get();
  const allBatchesSnap = await db.collection('batches').get();
  const batchIds = new Set(allBatchesSnap.docs.map(d => d.id));

  console.log('=== CHECKING CONFIRMED DEMOS ===');
  for (const doc of demosSnap.docs) {
    const data = doc.data();
    if (data.admissionConfirmed === 'Yes' || data.admissionConfirmed === 'Won') {
      const hasBatch = data.batchAssigned && batchIds.has(data.batchAssigned);
      console.log(`Demo: ${data.studentName} | batchAssigned: ${data.batchAssigned} | Batch Exists in DB? ${hasBatch} | Tutor: ${data.classAssignedTutor || data.teacher}`);
    }
  }

  process.exit(0);
}

checkAllConfirmedDemos().catch(err => {
  console.error(err);
  process.exit(1);
});
