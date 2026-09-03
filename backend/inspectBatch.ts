import { connectFirebase, getDb } from './config/firebase';
import dotenv from 'dotenv';
dotenv.config();

async function inspectBatch() {
  await connectFirebase();
  const db = getDb();
  
  const bDoc = await db.collection('batches').doc('c1JCCY63qF8tNnqRnb8H').get();
  console.log('Batch c1JCCY63qF8tNnqRnb8H exists?', bDoc.exists);
  if (bDoc.exists) {
    console.log('Batch Data:', bDoc.data());
  }

  console.log('\n=== ALL BATCHES ===');
  const allBatches = await db.collection('batches').get();
  allBatches.forEach(d => {
    console.log(d.id, d.data().name, 'assignedTeacher:', d.data().assignedTeacher);
  });

  process.exit(0);
}

inspectBatch().catch(err => {
  console.error(err);
  process.exit(1);
});
