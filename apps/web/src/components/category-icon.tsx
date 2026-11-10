import { Camera, ClipboardList, Flower2, Landmark, LucideIcon, Sparkles, Store, Tent, Utensils, Video } from 'lucide-react';
const ICONS: Record<string, LucideIcon> = { landmark: Landmark, tent: Tent, utensils: Utensils, flower: Flower2, camera: Camera, video: Video, sparkles: Sparkles, clipboard: ClipboardList };
export function CategoryIcon({ name, className }: { name?: string | null; className?: string }) {
  const I = (name && ICONS[name]) || Store;
  return <I className={className} aria-hidden />;
}
