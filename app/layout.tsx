import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { NavigationProgress } from '@/components/loading/navigation-progress';
import { ColorModeScript } from '@/components/platform/color-mode-script';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Skyjet Portal',
    template: '%s | Skyjet Portal',
  },
  description: 'Skyjet ERP portal — Skyjet Business Suite, Skyjet Library, and one login',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ColorModeScript />
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
