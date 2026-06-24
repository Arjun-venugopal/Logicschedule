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
  status: 'Active' | 'Inactive' | 'Completed';
  durationType: 'Monthly' | 'Custom';
  numberOfSessions?: number;
  meetingLink?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Student {
  _id: string;
  name: string;
  batch: string | Batch;
  parentName?: string;
  mobileNumber?: string;
  whatsappNumber?: string;
  email?: string;
  pastBatches?: {
    batch: string | Batch;
    joinedAt: string;
    leftAt: string;
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
  attendance?: AttendanceRecord[];
  createdAt: string;
  updatedAt: string;
}
