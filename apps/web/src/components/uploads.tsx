'use client';
import { ImagePlus, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from './ui';

export function ImageUpload({ onUploaded, label = 'Upload photo', multiple }: { onUploaded: (url: string) => void | Promise<void>; label?: string; multiple?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        const { url } = await api<{ url: string }>('/uploads/image', { form });
        await onUploaded(url);
      }
    } catch (e) { toast((e as Error).message, true); }
    finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  return (
    <>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} className="hidden" onChange={(e) => pick(e.target.files)} aria-label={label} />
      <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-dashed border-rose px-4 py-2 text-sm font-medium text-ruby hover:bg-blush disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}{label}</button>
    </>
  );
}
