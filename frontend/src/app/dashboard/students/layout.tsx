import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Student Roster | Teacher Schedule',
  description: 'Manage your students, upload rosters, and assign batches efficiently.',
};

export default function StudentsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
