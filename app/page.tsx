'use client';

import dynamic from 'next/dynamic';

// The app reads auth and data from localStorage, which doesn't exist on the
// server, so render it client-side only to avoid hydration mismatches.
const App = dynamic(() => import('../src/App'), { ssr: false });

export default function HomePage() {
  return <App />;
}
