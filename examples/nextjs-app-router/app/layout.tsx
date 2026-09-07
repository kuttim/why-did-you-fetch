import type { ReactNode } from 'react';
import { WhyDidYouFetchInit } from './wdyf-init';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WhyDidYouFetchInit />
        {children}
      </body>
    </html>
  );
}
