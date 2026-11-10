import { ContactForm } from './form';
export const metadata = { title: 'Contact' };
export default function Contact() {
  return <div className="mx-auto max-w-xl px-4 py-12"><h1 className="text-4xl">Contact us</h1><p className="mt-3 text-muted">Questions, feedback or partnership ideas? We read everything.{process.env.NEXT_PUBLIC_SUPPORT_EMAIL ? ` You can also write to ${process.env.NEXT_PUBLIC_SUPPORT_EMAIL}.` : ''}</p><ContactForm /></div>;
}
