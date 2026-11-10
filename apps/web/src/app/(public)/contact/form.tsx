'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button, FormError, Input, Textarea, useForm } from '@/components/ui';
export function ContactForm() {
  const f = useForm({ name: '', email: '', phone: '', message: '' });
  const [sent, setSent] = useState(false);
  if (sent) return <p className="mt-8 rounded-xl bg-blush p-5">Thank you. We will get back to you soon.</p>;
  return <div className="mt-8 space-y-3"><Input label="Name" {...f.bind('name')} /><Input label="Email" type="email" {...f.bind('email')} /><Input label="Phone (optional)" {...f.bind('phone')} /><Textarea label="Message" {...f.bind('message')} /><FormError message={f.formError} /><Button busy={f.busy} onClick={() => f.submit(async () => { await api('/contact', { body: f.values }); setSent(true); })}>Send message</Button></div>;
}
