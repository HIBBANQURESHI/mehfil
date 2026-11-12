import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { c, Text } from '@/components/ui';
import { useApi } from '@/lib/api';

const key = (d: Date) => d.toISOString().slice(0, 10);
const todayPk = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
const MAX_MONTHS_AHEAD = 24;
const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Which dates are taken for a listing: top half lunch, bottom half dinner. Never shows who booked. */
export function AvailabilityCalendar({ listingId, onPick }: { listingId: string; onPick?: (date: string) => void }) {
  const start = todayPk().slice(0, 7);
  const [month, setMonth] = useState(start);
  const { data, error } = useApi<{ unavailable: Record<string, { LUNCH: boolean; DINNER: boolean }> }>(`/listings/${listingId}/availability?month=${month}`);
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (y - Number(start.slice(0, 4))) * 12 + (m - Number(start.slice(5, 7)));
  const shift = (n: number) => setMonth(key(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7));
  const today = todayPk();
  const taken = data?.unavailable ?? {};
  const cells: (string | null)[] = [...Array.from({ length: first.getUTCDay() }, () => null), ...Array.from({ length: days }, (_, i) => key(new Date(Date.UTC(y, m - 1, i + 1))))];
  while (cells.length % 7) cells.push(null);
  const cell = { width: `${100 / 7}%` as const, padding: 2 };

  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" disabled={offset <= 0} onPress={() => shift(-1)} hitSlop={10} style={{ opacity: offset <= 0 ? 0.3 : 1, padding: 6 }}><ChevronLeft size={18} color={c.text} /></Pressable>
        <Text variant="bold" accessibilityLiveRegion="polite">{first.toLocaleDateString('en-PK', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" disabled={offset >= MAX_MONTHS_AHEAD} onPress={() => shift(1)} hitSlop={10} style={{ opacity: offset >= MAX_MONTHS_AHEAD ? 0.3 : 1, padding: 6 }}><ChevronRight size={18} color={c.text} /></Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>{WEEK.map((d, i) => <View key={i} style={cell}><Text variant="small" style={{ textAlign: 'center' }}>{d}</Text></View>)}</View>
      {error ? <Text variant="muted">Availability could not be loaded.</Text> : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {cells.map((d, i) => {
            if (!d) return <View key={`pad${i}`} style={cell} />;
            const past = d < today;
            const t = taken[d];
            const lunch = !past && !!t && !t.LUNCH;
            const dinner = !past && !!t && !t.DINNER;
            const tag = lunch && dinner ? 'FULL DAY' : lunch ? 'LUNCH' : dinner ? 'DINNER' : null;
            const label = past ? 'past' : lunch && dinner ? 'fully booked' : lunch ? 'lunch booked, dinner available' : dinner ? 'dinner booked, lunch available' : 'available';
            const pickable = !!onPick && !past && !(lunch && dinner);
            return (
              <Pressable key={d} style={cell} disabled={!pickable} onPress={() => onPick?.(d)} accessibilityRole={pickable ? 'button' : 'text'} accessibilityLabel={`${d}: ${label}${pickable ? '. Request a quote for this date' : ''}`}>
                <View style={{ aspectRatio: 1, borderRadius: 8, borderWidth: 1, borderColor: past ? 'transparent' : c.border, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                  {lunch && <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', backgroundColor: c.ruby }} />}
                  {dinner && <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', backgroundColor: c.ruby }} />}
                  <Text style={{ fontSize: 13, color: past ? '#C9BDC0' : lunch ? '#fff' : c.text }}>{Number(d.slice(8))}</Text>
                  {tag && <Text numberOfLines={1} style={{ fontSize: 7, fontWeight: '700', letterSpacing: 0.3, color: dinner ? '#fff' : c.text }}>{tag}</Text>}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><View style={{ width: 12, height: 12, borderRadius: 3, borderWidth: 1, borderColor: c.border }} /><Text variant="small">Available</Text></View>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: c.ruby }} /><Text variant="small">Booked</Text></View>
        <Text variant="small">Top half lunch, bottom half dinner</Text>
      </View>
      <Text variant="small">{onPick ? 'Tap an open date to request a quote. ' : ''}The vendor confirms your date when you send it.</Text>
    </View>
  );
}
