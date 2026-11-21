const path = require("path");
require(path.resolve(__dirname, "../backend/node_modules/dotenv")).config({
  path: path.resolve(__dirname, "../backend/.env"),
});
const { createClient } = require(path.resolve(
  __dirname,
  "../backend/node_modules/@supabase/supabase-js"
));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function run() {
  const { data: batches, error: bErr } = await supabase
    .from("batches")
    .select("_id, name, assignedTeacher");
  if (bErr) {
    console.error("Batch fetch error:", bErr);
    return;
  }

  const batchMap = new Map();
  batches.forEach((b) => batchMap.set(b._id, b));

  const { data: scheds, error: sErr } = await supabase
    .from("schedules")
    .select("_id, batch, teacher, date, status")
    .eq("status", "Scheduled");
  if (sErr) {
    console.error("Schedule fetch error:", sErr);
    return;
  }

  const mismatched = [];
  scheds.forEach((s) => {
    const b = batchMap.get(s.batch);
    if (!b) return;
    const bTeacher = b.assignedTeacher;
    if (bTeacher && s.teacher && bTeacher !== s.teacher) {
      mismatched.push({
        scheduleId: s._id,
        batchId: s.batch,
        batchName: b.name,
        batchTeacher: bTeacher,
        scheduleTeacher: s.teacher,
        date: s.date,
      });
    }
  });

  console.log(`Total Scheduled sessions: ${scheds.length}`);
  console.log(`Mismatched upcoming sessions: ${mismatched.length}`);
  if (mismatched.length > 0) {
    console.table(mismatched.slice(0, 30));
  }
}

run();
