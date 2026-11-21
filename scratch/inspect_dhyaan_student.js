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
  const { data: st, error } = await supabase
    .from("students")
    .select("*")
    .eq("_id", "8b252228-939e-46dc-8e93-3c748eaa8521")
    .single();

  if (error) {
    console.error("Error:", error);
    return;
  }
  console.log("Student:", st.name, "_id:", st._id);
  console.log("assignedTutor:", st.assignedTutor);
  console.log("batch:", st.batch);
  console.log("data.teacherHistory:", JSON.stringify(st.data?.teacherHistory, null, 2));
  console.log("data.pastBatches:", JSON.stringify(st.data?.pastBatches, null, 2));

  const { data: batch } = await supabase
    .from("batches")
    .select("*")
    .eq("_id", st.batch)
    .single();
  console.log("Batch:", batch?.name, "assignedTeacher:", batch?.assignedTeacher);
}

run();
