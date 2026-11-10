'use client';
import Link from 'next/link';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthShell } from '@/components/auth-shell';
import { Button, FormError, Input, useForm } from '@/components/ui';
import { ApiError, session } from '@/lib/api';
import { safeNext } from '@/lib/session';

function Form() {
  const f = useForm({ identifier: '', password: '' });
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    f.submit(async () => {
      try {
        await session('login', f.values);
        window.location.href = safeNext(next, '/after-login');
      } catch (err) {
        if (err instanceof ApiError && err.code === 'PHONE_NOT_VERIFIED') router.push(`/verify?phone=${encodeURIComponent(String(err.data?.phone))}&next=${encodeURIComponent(next ?? '')}`);
        else throw err;
      }
    });
  };
  return (
    <form onSubmit={go} className="space-y-3">
      <Input label="Phone or email" autoComplete="username" {...f.bind('identifier')} />
      <Input label="Password" type="password" autoComplete="current-password" {...f.bind('password')} />
      <FormError message={f.formError} />
      <Button className="w-full" busy={f.busy}>Sign in</Button>
      <div className="flex justify-between text-sm"><Link href="/forgot-password" className="text-ruby">Forgot password?</Link><Link href="/register" className="text-ruby">Create account</Link></div>
    </form>
  );
}

export default function Login() { return <AuthShell title="Welcome back"><Suspense><Form /></Suspense></AuthShell>; }
