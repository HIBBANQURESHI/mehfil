import { Camera, ClipboardList, Flower2, Landmark, Sparkles, Store, Tent, Utensils, Video } from 'lucide-react-native';
const ICONS: Record<string, typeof Store> = { landmark: Landmark, tent: Tent, utensils: Utensils, flower: Flower2, camera: Camera, video: Video, sparkles: Sparkles, clipboard: ClipboardList };
export function CategoryIcon({ name, color, size = 22 }: { name?: string | null; color: string; size?: number }) { const I = (name && ICONS[name]) || Store; return <I color={color} size={size} />; }
