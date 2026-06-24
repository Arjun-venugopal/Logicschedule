const fs = require('fs');
const tsNode = require('ts-node');

tsNode.register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });

async function test() {
  require('dotenv').config();
  const { connectFirebase } = require('./config/firebase');
  connectFirebase();

  const Schedule = require('./models/Schedule').default;

  try {
    const schedules = await Schedule.find({});
    const withAttendance = schedules.filter(s => s.attendance && s.attendance.length > 0);
    console.log(`Total schedules: ${schedules.length}`);
    console.log(`Schedules with attendance: ${withAttendance.length}`);
    if (withAttendance.length > 0) {
      console.log('Sample attendance:', JSON.stringify(withAttendance[0].attendance, null, 2));
    }
  } catch (e) {
    console.error('ERROR:', e.message);
    console.error(e.stack);
  }
}

test();



