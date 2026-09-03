import { connectFirebase, getDb } from './config/firebase';
import dotenv from 'dotenv';
dotenv.config();

async function fixSreebala() {
  await connectFirebase();
  const db = getDb();
  
  const teacherId = '6a2255bd3bd0720486b78cde'; // Limmy Mariat
  const demoId = 'hQMEaWx5bEojHLVwkhBc';
  const studentId = 'HOp0oO7GxJe0v3r7KXsy';

  const countSnap = await db.collection('batches').count().get();
  const serialNo = countSnap.data().count + 1;
  const batchName = `Sreebala arun 1:1 ${serialNo}`;

  console.log(`Creating batch: "${batchName}" assigned to Limmy Mariat (${teacherId})...`);

  const batchRef = await db.collection('batches').add({
    name: batchName,
    subject: 'SCRATCH',
    assignedTeacher: teacherId,
    studentsCount: 1,
    status: 'Upcoming',
    timing: { startTime: '07:00', endTime: '07:30' },
    days: [],
    durationType: 'Custom',
    numberOfSessions: 20,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  console.log(`Batch created with ID: ${batchRef.id}`);

  console.log(`Updating Demo Session ${demoId}...`);
  await db.collection('demos').doc(demoId).update({
    batchAssigned: batchRef.id,
    classAssignedTutor: teacherId,
    teacher: teacherId,
    updatedAt: new Date()
  });

  console.log(`Updating Student ${studentId}...`);
  await db.collection('students').doc(studentId).update({
    batch: batchRef.id,
    parentName: 'Amartha sathyan.',
    updatedAt: new Date()
  });

  console.log('✅ Successfully created batch and assigned Sreebala to Limmy Mariat!');
  process.exit(0);
}

fixSreebala().catch(err => {
  console.error(err);
  process.exit(1);
});
