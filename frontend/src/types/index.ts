export interface Batch {
  _id: string;
  name: string;
  subject: string;
  assignedTeacher: string | Teacher;
  studentsCount: number;
  days: string[];
  timing: {
    startTime: string;
    endTime: string;
  };
  startDate?: string;
  endDate?: string;
  status: 'Active' | 'Ongoing' | 'Completed' | 'Dropped' | 'Cancelled' | 'Upcoming' | 'Inactive';
  durationType: 'Monthly' | 'Custom';
  numberOfSessions?: number;
  completedClassesCount?: number;
  cancelledClassesCount?: number;
  upcomingClassesCount?: number;
  totalClassesCount?: number;
  scheduledClassesCount?: number;
  isCompleted?: boolean;
  meetingLink?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSubmission {
  id?: string;
  milestone: number;
  batchId?: string;
  batchName?: string;
  courseName?: string;
  projectTitle: string;
  projectLink: string;
  submissionDate: string;
  teacherRemarks?: string;
  teacherName?: string;
  teacherId?: string;
  status: 'Pending' | 'Link Submitted' | 'Reviewed';
  submittedAt?: string;
  updatedAt?: string;
}

export interface Student {
  _id: string;
  name: string;
  batch: string | Batch;
  currentLevel?: string;
  level?: string;
  classesNeeded?: number;
  assignedTutor?: string | Teacher;
  parentName?: string;
  mobileNumber?: string;
  whatsappNumber?: string;
  email?: string;
  projectSubmissions?: ProjectSubmission[];
  pastBatches?: {
    batch: string | Batch;
    batchName?: string;
    batchSubject?: string;
    level?: string;
    teacher?: string | Teacher;
    teacherName?: string;
    numberOfClasses?: number;
    completedClasses?: number;
    status?: string;
    joinedAt?: string;
    leftAt?: string;
    reason?: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface Teacher {
  _id: string;
  name: string;
  email: string;
  mobileNumber?: string;
  address?: string;
  employmentType?: 'Full Time' | 'Part Time';
  hourlyRate?: number;
  subjects: string[];
  status: 'Active' | 'Inactive';
  user: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceRecord {
  studentId: string | Student;
  isPresent: boolean;
  notes?: string;
  date?: string;
}

export interface Schedule {
  _id: string;
  teacher: string | Teacher;
  batch: string | Batch;
  date: string;
  startTime: string;
  endTime: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled';
  replacementTeacher?: string | Teacher | null;
  conflict: boolean;
  meetingLink?: string;
  subject?: string;
  notes?: string;
  isExtraClass?: boolean;
  extraClassReason?: string;
  nextExtraClassDate?: string;
  nextExtraClassStartTime?: string;
  nextExtraClassEndTime?: string;
  attendance?: AttendanceRecord[];
  createdAt: string;
  updatedAt: string;
}
