import { connectFirebase, getDb } from './config/firebase';
import dotenv from 'dotenv';
dotenv.config();

async function inspect() {
  await connectFirebase();
  const db = getDb();
  
  console.log('=== SEARCHING TEACHERS FOR "Limmy" ===');
  const teachersSnap = await db.collection('teachers').get();
  teachersSnap.forEach(d => {
    const data = d.data();
    if (data.name?.toLowerCase().includes('limmy')) {
      console.log('Teacher Limmy ID:', d.id, data);
    }
  });

  console.log('\n=== SEARCHING DEMOS FOR "Sreebala" ===');
  const demosSnap = await db.collection('demos').get();
  demosSnap.forEach(d => {
    const data = d.data();
    if (data.studentName?.toLowerCase().includes('sreebala')) {
      console.log('Demo Sreebala ID:', d.id, data);
    }
  });

  console.log('\n=== SEARCHING BATCHES FOR "Sreebala" ===');
  const batchesSnap = await db.collection('batches').get();
  batchesSnap.forEach(d => {
    const data = d.data();
    if (data.name?.toLowerCase().includes('sreebala')) {
      console.log('Batch Sreebala ID:', d.id, data);
    }
  });

  console.log('\n=== SEARCHING STUDENTS FOR "Sreebala" ===');
  const studentsSnap = await db.collection('students').get();
  studentsSnap.forEach(d => {
    const data = d.data();
    if (data.name?.toLowerCase().includes('sreebala')) {
      console.log('Student Sreebala ID:', d.id, data);
    }
  });

  process.exit(0);
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
