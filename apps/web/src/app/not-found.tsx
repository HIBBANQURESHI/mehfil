import { LinkButton } from '@/components/ui';
export default function NotFound() {
  return <main className="grid min-h-screen place-items-center p-6 text-center"><div><h1 className="text-4xl">Page not found</h1><p className="mt-2 text-muted">This page has moved or never existed.</p><LinkButton href="/" className="mt-6">Back to Mehfil</LinkButton></div></main>;
}
