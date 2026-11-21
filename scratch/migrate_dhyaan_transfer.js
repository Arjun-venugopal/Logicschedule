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
  const batchId = "b8e26884-1028-4cad-961b-9495e6c8aaf7";
  const sandraTeacherId = "6a1d6399f4fa931125282e5d";
  const shabanaTeacherId = "6a1d5ba5f4fa931125282e45";

  console.log("=== STEP 1: Updating upcoming Scheduled sessions for Dhyaan's batch ===");
  const { data: schedsToUpdate, error: fetchErr } = await supabase
    .from("schedules")
    .select("_id, date, status, teacher")
    .eq("batch", batchId)
    .eq("status", "Scheduled")
    .eq("teacher", shabanaTeacherId);

  if (fetchErr) {
    console.error("Fetch error:", fetchErr);
    return;
  }

  console.log(`Found ${schedsToUpdate.length} scheduled sessions with Shabana to update to Sandra.`);

  if (schedsToUpdate.length > 0) {
    const ids = schedsToUpdate.map((s) => s._id);
    const { error: updateErr } = await supabase
      .from("schedules")
      .update({ teacher: sandraTeacherId, updatedAt: new Date().toISOString() })
      .in("_id", ids);

    if (updateErr) {
      console.error("Update error:", updateErr);
      return;
    }
    console.log(`Successfully updated ${ids.length} schedules to Sandra Sabu (${sandraTeacherId})!`);
  }

  console.log("\n=== STEP 2: Verifying all schedules for batch ===");
  const { data: allScheds, error: allErr } = await supabase
    .from("schedules")
    .select("_id, date, startTime, endTime, status, teacher")
    .eq("batch", batchId)
    .order("date", { ascending: true });

  if (allErr) {
    console.error("All scheds fetch error:", allErr);
    return;
  }

  console.log(`Total schedules for batch: ${allScheds.length}`);
  allScheds.forEach((s, idx) => {
    console.log(
      `${idx + 1}\t${s.date?.split("T")[0]}\t${s.startTime}-${s.endTime}\tstatus: ${s.status}\tteacher: ${s.teacher}`
    );
  });

  console.log("\n=== STEP 3: Checking system-wide schedule mismatches ===");
  const { data: batches } = await supabase.from("batches").select("_id, name, assignedTeacher");
  const batchMap = new Map();
  batches.forEach((b) => batchMap.set(b._id, b));

  const { data: allUpcoming } = await supabase.from("schedules").select("_id, batch, teacher, date").eq("status", "Scheduled");
  let remainingMismatches = 0;
  allUpcoming.forEach((s) => {
    const b = batchMap.get(s.batch);
    if (!b) return;
    if (b.assignedTeacher && s.teacher && b.assignedTeacher !== s.teacher) {
      remainingMismatches++;
      console.warn(`Mismatch still found: Schedule ${s._id} for batch ${b.name} (${s.batch}): batch teacher ${b.assignedTeacher} vs sched teacher ${s.teacher}`);
    }
  });

  console.log(`Remaining system-wide mismatches: ${remainingMismatches}`);
}

run();
