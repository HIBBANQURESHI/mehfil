'use client';
import { ConversationList } from '@/components/shared-pages';
export default function Page() { return <ConversationList endpoint="/vendor/conversations" base="/vendor/messages" nameOf={(c) => c.customer.name} />; }
