-- ==============================================================================
-- LOGICSCHEDULE - SUPABASE DATABASE SCHEMA
-- Run this in the Supabase Dashboard -> SQL Editor -> New Query
-- ==============================================================================

-- 1. Enable pgcrypto for UUID generation if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Users Table
CREATE TABLE IF NOT EXISTS public.users (
  _id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT,
  email TEXT UNIQUE,
  password TEXT,
  role TEXT DEFAULT 'User',
  "mustChangePassword" BOOLEAN DEFAULT false,
  permissions JSONB DEFAULT '{}'::jsonb,
  "isVerified" BOOLEAN DEFAULT true,
  "verificationToken" TEXT,
  "verificationExpires" TIMESTAMPTZ,
  "resetPasswordToken" TEXT,
  "resetPasswordExpires" TIMESTAMPTZ,
  "failedLoginAttempts" INT DEFAULT 0,
  "lockUntil" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  data JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- 3. Teachers Table
CREATE TABLE IF NOT EXISTS public.teachers (
  _id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "user" TEXT,
  subjects JSONB DEFAULT '[]'::jsonb,
  batches JSONB DEFAULT '[]'::jsonb,
  "dutyStatusSchedule" JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'Available',
  timing JSONB DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  data JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_teachers_user ON public.teachers("user");
CREATE INDEX IF NOT EXISTS idx_teachers_status ON public.teachers(status);

-- 4. Batches Table
CREATE TABLE IF NOT EXISTS public.batches (
  _id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT,
  subject TEXT,
  "assignedTeacher" TEXT,
  "replacementTeacher" TEXT,
  students JSONB DEFAULT '[]'::jsonb,
  schedule JSONB DEFAULT '[]'::jsonb,
  timing JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'Active',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  data JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_batches_teacher ON public.batches("assignedTeacher");
CREATE INDEX IF NOT EXISTS idx_batches_status ON public.batches(status);

-- 5. Students Table
CREATE TABLE IF NOT EXISTS public.students (
  _id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT,
  email TEXT,
  phone TEXT,
  batch TEXT,
  status TEXT DEFAULT 'Active',
  "assignedTutor" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  data JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_students_batch ON public.students(batch);
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students(status);

-- 6. Schedules Table
CREATE TABLE IF NOT EXISTS public.schedules (
  _id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  batch TEXT,
  teacher TEXT,
  date TEXT,
  "startTime" TEXT,
  "endTime" TEXT,
  status TEXT DEFAULT 'Scheduled',
  attendance JSONB DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  data JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_schedules_batch ON public.schedules(batch);
CREATE INDEX IF NOT EXISTS idx_schedules_teacher ON public.schedules(teacher);
CREATE INDEX IF NOT EXISTS idx_schedules_date ON public.schedules(date);

-- 7. Demo Slots Table ("demoSlots")
CREATE TABLE IF NOT EXISTS public."demoSlots" (
  _id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher TEXT,
  date TEXT,
  "startTime" TEXT,
  "endTime" TEXT,
  status TEXT DEFAULT 'Available',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  data JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_demo_slots_teacher ON public."demoSlots"(teacher);
CREATE INDEX IF NOT EXISTS idx_demo_slots_date ON public."demoSlots"(date);

-- 8. Demo Sessions Table ("demos")
CREATE TABLE IF NOT EXISTS public.demos (
  _id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slot TEXT,
  student TEXT,
  teacher TEXT,
  "salesPerson" TEXT,
  status TEXT DEFAULT 'Scheduled',
  notes TEXT,
  report TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  data JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_demos_teacher ON public.demos(teacher);
CREATE INDEX IF NOT EXISTS idx_demos_status ON public.demos(status);

-- 9. Demo Reports Table ("demoReports")
CREATE TABLE IF NOT EXISTS public."demoReports" (
  _id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session TEXT,
  feedback TEXT,
  status TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  data JSONB DEFAULT '{}'::jsonb
);

-- ==============================================================================
-- Security: Disable RLS for backend service-role access or configure policies
-- Note: When using SUPABASE_SERVICE_ROLE_KEY from the backend, RLS is automatically bypassed.
-- ==============================================================================
