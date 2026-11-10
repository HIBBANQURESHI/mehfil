import { ReactNode } from 'react';
export const LEGAL_NAME = process.env.NEXT_PUBLIC_LEGAL_NAME ?? 'Mehfil';
export const SUPPORT = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'our support team';
export function Legal({ title, children }: { title: string; children: ReactNode }) {
  return <div className="prose-legal mx-auto max-w-3xl px-4 py-12"><h1 className="text-4xl">{title}</h1><div className="mt-6">{children}</div></div>;
}
