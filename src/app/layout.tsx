import type { Metadata } from 'next';
import './globals.css';
import { Tutorial } from '@/components/Tutorial';
import { AppNav } from '@/components/AppNav';

export const metadata: Metadata = {
  title: 'BumTeacherBypass — Interaktive Arbeitsblätter',
  description: 'Upload PDF and Word files, convert them into organized and editable pages using AI',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className="bg-[var(--bg)]">
        <AppNav />
        <div className="lg:pl-60">
          <main className="pb-24 lg:pb-8">{children}</main>
        </div>
        <Tutorial />
      </body>
    </html>
  );
}