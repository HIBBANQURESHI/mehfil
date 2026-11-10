'use client';
import { useParams } from 'next/navigation';
import { TicketThread } from '@/components/shared-pages';
export default function Page() { const { id } = useParams<{ id: string }>(); return <TicketThread id={id} />; }
