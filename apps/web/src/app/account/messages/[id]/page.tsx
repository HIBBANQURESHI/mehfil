'use client';
import { useParams } from 'next/navigation';
import { ConversationThread } from '@/components/shared-pages';
export default function Page() { const { id } = useParams<{ id: string }>(); return <ConversationThread id={id} />; }
