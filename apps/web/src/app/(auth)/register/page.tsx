'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { Button, FormError, Input, useForm } from '@/components/ui';
import { api } from '@/lib/api';

function Form() {
  const params = useSearchParams();
  const isVendor = params.get('type') === 'vendor';
  const next = params.get('next');
  const f = useForm({ name: '', phone: '', email: '', password: '' });
  const [terms, setTerms] = useState(false);
  const router = useRouter();
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    f.submit(async () => {
      const r = await api('/auth/register', { body: { ...f.values, acceptTerms: terms } });
      router.push(`/verify?phone=${encodeURIComponent(r.phone)}&next=${encodeURIComponent(next ?? (isVendor ? '/vendor' : '/account'))}`);
    });
  };
  return (
    <form onSubmit={go} className="space-y-3">
      <Input label="Full name" autoComplete="name" {...f.bind('name')} />
      <Input label="Mobile number" inputMode="tel" placeholder="03XXXXXXXXX" autoComplete="tel" {...f.bind('phone')} />
      <Input label="Email (recommended for receipts)" type="email" autoComplete="email" {...f.bind('email')} />
      <Input label="Password" type="password" autoComplete="new-password" hint="At least 10 characters with letters and a number" {...f.bind('password')} />
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-[#8F3048]" checked={terms} onChange={(e) => setTerms(e.target.checked)} /><span>I agree to the <Link href="/terms" className="text-ruby underline">terms</Link> and <Link href="/privacy" className="text-ruby underline">privacy policy</Link></span></label>
      <FormError message={f.formError} />
      <Button className="w-full" busy={f.busy}>Continue</Button>
      <p className="text-center text-sm">Have an account? <Link href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'} className="text-ruby">Sign in</Link></p>
    </form>
  );
}

function Shell() {
  const isVendor = useSearchParams().get('type') === 'vendor';
  return <AuthShell title={isVendor ? 'List your business' : 'Create your account'} sub={isVendor ? 'Start with your personal details. Business details come next.' : undefined}><Form /></AuthShell>;
}
export default function Register() { return <Suspense><Shell /></Suspense>; }
