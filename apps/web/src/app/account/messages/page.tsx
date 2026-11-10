'use client';
import { ConversationList } from '@/components/shared-pages';
export default function Page() { return <ConversationList endpoint="/conversations" base="/account/messages" nameOf={(c) => c.vendor.businessName} />; }
