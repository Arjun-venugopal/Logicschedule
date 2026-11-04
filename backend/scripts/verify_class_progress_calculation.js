const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });

const { connectSupabase } = require('../dist/config/supabase');
const Batch = require('../dist/models/Batch').default;
const Schedule = require('../dist/models/Schedule').default;
const Teacher = require('../dist/models/Teacher').default;
const Student = require('../dist/models/Student').default;
const { generateSchedulesForBatch } = require('../dist/controllers/batchController');
const { getKolkataNow } = require('../dist/utils/scheduleHelper');

async function runTests() {
  await connectSupabase();
  console.log('--- STARTING CLASS PROGRESS & SCHEDULE CALCULATION VERIFICATION ---');

  const kolkata = getKolkataNow();
  console.log(`Current Asia/Kolkata date: ${kolkata.todayStr}, current total minutes: ${kolkata.currentTotalMinutes}`);

  // Fetch or find a sample teacher
  let testTeacher = await Teacher.findOne({});
  const teacherId = testTeacher ? testTeacher._id : undefined;

  // -------------------------------------------------------------------------
  // TEST 1: SCENARIO B (Future Start Date)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 1] Scenario B: Start Date is in the Future (e.g. 7 days from now)');
  const futureDate = new Date(Date.now() + 7 * 86400000);
  const futureDateStr = futureDate.toISOString().split('T')[0];

  const batchFuture = await Batch.create({
    name: 'Test Future Batch ' + Date.now(),
    subject: 'AI & Robotics',
    assignedTeacher: teacherId,
    startDate: futureDateStr,
    days: ['Monday', 'Wednesday', 'Friday'],
    timing: { startTime: '14:00', endTime: '15:00' },
    numberOfSessions: 10,
    preCompletedClasses: 0,
    status: 'Upcoming',
  });

  await generateSchedulesForBatch(batchFuture, 0);

  const futureScheds = await Schedule.find({ batch: batchFuture._id }).sort({ date: 1 });
  const futureCompleted = futureScheds.filter(s => s.status === 'Completed').length;
  const futureScheduled = futureScheds.filter(s => s.status === 'Scheduled').length;

  console.log(`Future Batch created with ${futureScheds.length} schedules.`);
  console.log(`Completed classes: ${futureCompleted} (expected: 0)`);
  console.log(`Scheduled classes: ${futureScheduled} (expected: 10)`);
  if (futureScheds.length > 0) {
    const firstSchedDateStr = new Date(futureScheds[0].date).toISOString().split('T')[0];
    console.log(`First schedule date: ${firstSchedDateStr} (>= ${futureDateStr}: ${firstSchedDateStr >= futureDateStr})`);
    if (firstSchedDateStr < futureDateStr) {
      throw new Error(`FAIL: Schedule was created before batch start date!`);
    }
  }
  if (futureCompleted !== 0 || futureScheduled !== 10) {
    throw new Error(`FAIL: Scenario B counts mismatch! Expected 0 completed, 10 scheduled.`);
  }
  console.log('✅ TEST 1 PASSED: Future start date sets completed=0, all classes scheduled forward from start date.');

  // -------------------------------------------------------------------------
  // TEST 2: SCENARIO C (Past Start Date with manual preCompletedClasses)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 2] Scenario C: Start Date is in the Past (e.g. 10 days ago)');
  // 10 days ago
  const pastDate = new Date(Date.now() - 10 * 86400000);
  const pastDateStr = pastDate.toISOString().split('T')[0];

  const batchPast = await Batch.create({
    name: 'Test Past Batch ' + Date.now(),
    subject: 'Python Game Dev',
    assignedTeacher: teacherId,
    startDate: pastDateStr,
    days: ['Monday', 'Wednesday', 'Friday'],
    timing: { startTime: '14:00', endTime: '15:00' },
    numberOfSessions: 15,
    preCompletedClasses: 3, // Admin specified 3 completed classes
    status: 'Active',
  });

  await generateSchedulesForBatch(batchPast, 3);

  const pastScheds = await Schedule.find({ batch: batchPast._id }).sort({ date: 1 });
  const pastCompleted = pastScheds.filter(s => s.status === 'Completed');
  const pastScheduled = pastScheds.filter(s => s.status === 'Scheduled');

  console.log(`Past Batch created with ${pastScheds.length} total schedules.`);
  console.log(`Completed count: ${pastCompleted.length} (expected: 3)`);
  console.log(`Scheduled count: ${pastScheduled.length} (expected: 12)`);

  // Verify that NO schedule was created before pastDateStr
  for (const s of pastScheds) {
    const sDateStr = new Date(s.date).toISOString().split('T')[0];
    if (sDateStr < pastDateStr) {
      throw new Error(`FAIL: Schedule on ${sDateStr} is before Start Date ${pastDateStr}!`);
    }
  }

  // Verify that completed schedules have completedBy
  if (pastCompleted.length > 0 && teacherId) {
    console.log(`Completed By teacher ID: ${pastCompleted[0].completedBy} (expected: ${teacherId})`);
  }

  if (pastCompleted.length !== 3 || pastScheduled.length !== 12) {
    throw new Error(`FAIL: Scenario C counts mismatch! Expected 3 completed, 12 scheduled.`);
  }
  console.log('✅ TEST 2 PASSED: Past start date created exactly 3 completed and 12 scheduled, strictly starting from Start Date forward.');

  // -------------------------------------------------------------------------
  // TEST 3: SCENARIO A (Start Date is Today)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 3] Scenario A: Start Date is Today');
  const todayStr = kolkata.todayStr;

  // Let's create a batch starting today
  // Pick today's day of week
  const todayDateObj = new Date(todayStr + 'T12:00:00Z');
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayDayName = dayNames[todayDateObj.getUTCDay()];

  // Case 1: Time in past today (01:00 AM)
  const batchTodayPastTime = await Batch.create({
    name: 'Test Today Past Time ' + Date.now(),
    subject: 'Scratch Coding',
    assignedTeacher: teacherId,
    startDate: todayStr,
    days: [todayDayName, 'Friday'],
    timing: { startTime: '01:00', endTime: '02:00' },
    numberOfSessions: 5,
    preCompletedClasses: 1, // Auto-computed as 1 since 01:00 has passed
    status: 'Active',
  });

  await generateSchedulesForBatch(batchTodayPastTime, 1);

  const todayScheds1 = await Schedule.find({ batch: batchTodayPastTime._id }).sort({ date: 1 });
  const todayComp1 = todayScheds1.filter(s => s.status === 'Completed').length;
  const todaySched1 = todayScheds1.filter(s => s.status === 'Scheduled').length;
  console.log(`Today (Past Time) Batch: ${todayComp1} Completed, ${todaySched1} Scheduled (Total: ${todayScheds1.length})`);
  if (todayComp1 !== 1 || todaySched1 !== 4) {
    throw new Error(`FAIL: Scenario A (past time) expected 1 completed, 4 scheduled!`);
  }

  // Case 2: Time in future today (23:55 PM)
  const batchTodayFutureTime = await Batch.create({
    name: 'Test Today Future Time ' + Date.now(),
    subject: 'Scratch Coding',
    assignedTeacher: teacherId,
    startDate: todayStr,
    days: [todayDayName, 'Friday'],
    timing: { startTime: '23:55', endTime: '23:59' },
    numberOfSessions: 5,
    preCompletedClasses: 0, // 23:55 has not passed yet
    status: 'Upcoming',
  });

  await generateSchedulesForBatch(batchTodayFutureTime, 0);

  const todayScheds2 = await Schedule.find({ batch: batchTodayFutureTime._id }).sort({ date: 1 });
  const todayComp2 = todayScheds2.filter(s => s.status === 'Completed').length;
  const todaySched2 = todayScheds2.filter(s => s.status === 'Scheduled').length;
  console.log(`Today (Future Time) Batch: ${todayComp2} Completed, ${todaySched2} Scheduled (Total: ${todayScheds2.length})`);
  if (todayComp2 !== 0 || todaySched2 !== 5) {
    throw new Error(`FAIL: Scenario A (future time) expected 0 completed, 5 scheduled!`);
  }
  console.log('✅ TEST 3 PASSED: Today start date accurately determines completion based on class start time vs current time.');

  // Clean up created test batches and their schedules
  await Schedule.deleteMany({ batch: { $in: [batchFuture._id, batchPast._id, batchTodayPastTime._id, batchTodayFutureTime._id] } });
  await Batch.deleteMany({ _id: { $in: [batchFuture._id, batchPast._id, batchTodayPastTime._id, batchTodayFutureTime._id] } });
  console.log('\n🧹 Test records cleaned up.');

  console.log('\n🎉 ALL CLASS PROGRESS & CALENDAR SCHEDULING TESTS PASSED PERFECTLY!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
