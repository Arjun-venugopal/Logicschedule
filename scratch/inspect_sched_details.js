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
  const { data: scheds, error } = await supabase
    .from("schedules")
    .select("_id, date, startTime, endTime, teacher, status, createdAt, updatedAt, data")
    .eq("batch", "b8e26884-1028-4cad-961b-9495e6c8aaf7")
    .order("date", { ascending: true });

  if (error) {
    console.error("Error:", error);
    return;
  }
  scheds.forEach((s, idx) => {
    console.log(
      `${idx + 1}\t${s.date?.split('T')[0]}\t${s.status}\tteacher: ${s.teacher}\tcreatedAt: ${s.createdAt}\tupdatedAt: ${s.updatedAt}\tsessionNum: ${s.data?.sessionNumber}`
    );
  });
}

run();
