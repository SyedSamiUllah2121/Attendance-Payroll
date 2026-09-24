import type { Metadata } from 'next';
import '../src/index.css';

export const metadata: Metadata = {
  title: 'WorkPulse',
  description: 'Attendance and payroll management system',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
