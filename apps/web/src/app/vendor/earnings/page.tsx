'use client';
import { formatPKR } from '@mehfil/shared';
import { ListPage } from '@/components/list-page';
import { Card, ErrorBox, Spinner, Stat, Status } from '@/components/ui';
import { useApi } from '@/lib/api';
import { fmtDate } from '@/lib/format';
export default function Page() {
  const { data: e, error } = useApi<any>('/vendor/earnings');
  if (error) return <ErrorBox error={error} />;
  if (!e) return <Spinner />;
  return (
    <>
      <div className="mb-8">
        <h1 className="mb-5 text-3xl">Earnings</h1>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Customer payments" value={formatPKR(e.customerPayments)} sub={e.refunds ? `${formatPKR(e.refunds)} refunded` : undefined} /><Stat label="Mehfil commission" value={formatPKR(e.commission)} /><Stat label="Your net earnings" value={formatPKR(e.net)} /><Stat label="Paid to your bank" value={formatPKR(e.paidOut)} /><Stat label="Pending (event not finished)" value={formatPKR(e.pending)} sub={e.onHold ? `${formatPKR(e.onHold)} on hold` : undefined} /><Stat label="Available for payout" value={formatPKR(e.availableForPayout)} sub={e.clawback ? `After ${formatPKR(e.clawback)} recovered for refunds` : undefined} /><Stat label="In process" value={formatPKR(e.inProcess)} />{e.commissionOwed > 0 && <Stat label="Commission you owe Mehfil" value={formatPKR(e.commissionOwed)} sub="On payments you collected directly" />}</div>
      </div>
      <ListPage<any> title="Transactions" endpoint="/vendor/transactions" emptyTitle="No transactions yet" columns={[{ h: 'Booking', c: (s) => s.booking.code }, { h: 'Customer', c: (s) => s.booking.customer.name }, { h: 'Event', c: (s) => fmtDate(s.booking.eventDate) }, { h: 'Collected', right: true, c: (s) => formatPKR(s.gross) }, { h: 'Commission', right: true, c: (s) => formatPKR(s.commission) }, { h: 'Your share', right: true, c: (s) => formatPKR(s.payable) }, { h: 'Payout', c: (s) => <Status value={s.status} /> }]} />
    </>
  );
}
