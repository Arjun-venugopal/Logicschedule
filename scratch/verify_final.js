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

async function check() {
  const { data: st } = await supabase
    .from("students")
    .select("name, assignedTutor, batch")
    .eq("_id", "8b252228-939e-46dc-8e93-3c748eaa8521")
    .single();

  const { data: b } = await supabase
    .from("batches")
    .select("name, assignedTeacher")
    .eq("_id", st.batch)
    .single();

  const { data: s } = await supabase
    .from("schedules")
    .select("status, teacher")
    .eq("batch", st.batch);

  const sandraTeacherId = "6a1d6399f4fa931125282e5d";
  const shabanaTeacherId = "6a1d5ba5f4fa931125282e45";

  const sandraScheds = s.filter((x) => x.teacher === sandraTeacherId).length;
  const shabanaScheds = s.filter((x) => x.teacher === shabanaTeacherId).length;
  const completedScheds = s.filter((x) => x.status === "Completed").length;
  const scheduledScheds = s.filter((x) => x.status === "Scheduled").length;

  console.log(
    JSON.stringify(
      {
        student: st.name,
        studentAssignedTutor: st.assignedTutor,
        batch: b.name,
        batchAssignedTeacher: b.assignedTeacher,
        totalSchedules: s.length,
        completedClasses: completedScheds,
        upcomingScheduledClasses: scheduledScheds,
        schedulesWithSandra: sandraScheds,
        schedulesWithShabana: shabanaScheds,
      },
      null,
      2
    )
  );
}

check();
