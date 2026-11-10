'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { AuthShell } from '@/components/auth-shell';
import { Button, FormError, Input, useForm } from '@/components/ui';
import { session } from '@/lib/api';

export default function AdminLogin() {
  const f = useForm({ email: '', password: '', totp: '' });
  const [step, setStep] = useState<'creds' | 'totp' | 'enroll'>('creds');
  const [enroll, setEnroll] = useState<{ enrollToken: string; secret: string; otpauthUrl: string } | null>(null);
  const [qr, setQr] = useState('');
  useEffect(() => { if (enroll) QRCode.toDataURL(enroll.otpauthUrl, { margin: 1, width: 200 }).then(setQr); }, [enroll]);
  const done = () => { window.location.href = '/admin'; };
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    f.submit(async () => {
      if (step === 'enroll') { await session('admin-enroll', { enrollToken: enroll!.enrollToken, code: f.values.totp }); return done(); }
      const r = await session('admin-login', { email: f.values.email, password: f.values.password, totp: step === 'totp' ? f.values.totp : undefined });
      if (r.status === 'OK') return done();
      if (r.status === 'TOTP_REQUIRED') setStep('totp');
      if (r.status === 'ENROLL_TOTP') { setEnroll(r); setStep('enroll'); }
      f.set('totp', '');
    });
  };
  return (
    <AuthShell title="Mehfil Admin" sub={step === 'enroll' ? 'Two-factor authentication is required for all staff.' : undefined}>
      <form onSubmit={go} className="space-y-3">
        {step === 'creds' && <><Input label="Email" type="email" autoComplete="username" {...f.bind('email')} /><Input label="Password" type="password" autoComplete="current-password" {...f.bind('password')} /></>}
        {step === 'enroll' && enroll && <div className="text-center">{qr && <img src={qr} alt="QR code for your authenticator app" className="mx-auto size-44" />}<p className="mt-2 text-sm text-muted">Scan with an authenticator app, or enter this key:</p><code className="mt-1 block break-all text-xs">{enroll.secret}</code></div>}
        {step !== 'creds' && <Input label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} {...f.bind('totp')} />}
        <FormError message={f.formError} />
        <Button className="w-full" busy={f.busy}>{step === 'creds' ? 'Continue' : 'Verify'}</Button>
      </form>
    </AuthShell>
  );
}
