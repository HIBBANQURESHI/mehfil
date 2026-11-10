export const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' }) : '—');
export const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Karachi' }) : '—');
export const SLOT_LABEL: Record<string, string> = { LUNCH: 'Lunch', DINNER: 'Dinner', FULL_DAY: 'Full day' };
