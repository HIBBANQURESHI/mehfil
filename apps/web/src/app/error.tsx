'use client';
import { Button } from '@/components/ui';
export default function Error({ reset }: { reset: () => void }) {
  return <main className="grid min-h-[60vh] place-items-center p-6 text-center"><div><h1 className="text-3xl">Something went wrong</h1><p className="mt-2 text-muted">Please try again. If it keeps happening, contact support.</p><Button className="mt-6" onClick={reset}>Try again</Button></div></main>;
}
