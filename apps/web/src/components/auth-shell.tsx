import { brand } from '@mehfil/shared';
import { ReactNode } from 'react';
import { Logo } from './brand';
export function AuthShell({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-b from-blush/70 to-warm p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <div className="rounded-2xl border border-line bg-white p-6"><h1 className="text-2xl">{title}</h1>{sub && <p className="mt-1 text-sm text-muted">{sub}</p>}<div className="mt-5">{children}</div></div>
        <p className="mt-5 text-center text-xs text-muted">{brand.tagline}</p>
      </div>
    </main>
  );
}
