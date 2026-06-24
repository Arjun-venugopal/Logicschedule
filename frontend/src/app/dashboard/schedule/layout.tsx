import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Teacher Schedule | Teacher Dashboard',
  description: 'Manage class schedules, view upcoming classes, and track attendance.',
};

export default function ScheduleLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
