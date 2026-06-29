import { getDb } from './backend/config/firebase';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, './backend/.env') });

async function check() {
  const db = getDb();
  const demos = await db.collection('demos').get();
  console.log("Total demos in DB:", demos.docs.length);
  
  demos.docs.forEach(doc => {
    const data = doc.data();
    console.log(`- ${doc.id}: ${data.studentName}, CreatedBy: ${data.createdBy}`);
  });
  process.exit(0);
}

check();
