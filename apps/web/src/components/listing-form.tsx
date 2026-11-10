'use client';
import { paisaToRupees, rupeesToPaisa } from '@mehfil/shared';
import { useRouter } from 'next/navigation';
import { Button, Card, FormError, Input, Select, Textarea, useForm, useToast } from './ui';
import { api, useApi } from '@/lib/api';

export function ListingForm({ listing, onSaved }: { listing?: any; onSaved?: () => void }) {
  const { data: cats } = useApi<any[]>('/categories');
  const { data: cities } = useApi<any[]>('/cities');
  const router = useRouter();
  const toast = useToast();
  const f = useForm({ categoryId: listing?.categoryId ?? '', title: listing?.title ?? '', description: listing?.description ?? '', cityId: listing?.cityId ?? '', areaId: listing?.areaId ?? '', address: listing?.address ?? '', capacityMin: listing?.capacityMin?.toString() ?? '', capacityMax: listing?.capacityMax?.toString() ?? '', indoorOutdoor: listing?.indoorOutdoor ?? '', startingPrice: listing ? String(paisaToRupees(listing.startingPrice)) : '', priceUnit: listing?.priceUnit ?? 'FLAT', dailyCapacity: listing?.dailyCapacity?.toString() ?? '1' });
  const amenitiesInitial: string[] = listing?.amenities ?? [];
  const category = cats?.find((c) => c.id === f.values.categoryId);
  const city = cities?.find((c) => c.id === f.values.cityId);
  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const amenities = new FormData(e.currentTarget).getAll('amenity') as string[];
    f.submit(async () => {
      const v = f.values;
      const n = (s: string) => (s ? Number(s) : null);
      const body = { categoryId: v.categoryId, title: v.title, description: v.description, cityId: v.cityId, areaId: v.areaId || null, address: v.address || null, capacityMin: n(v.capacityMin), capacityMax: n(v.capacityMax), indoorOutdoor: v.indoorOutdoor || null, amenities, startingPrice: rupeesToPaisa(Number(v.startingPrice || 0)), priceUnit: v.priceUnit, dailyCapacity: Number(v.dailyCapacity || 1) };
      if (listing) { await api(`/vendor/listings/${listing.id}`, { method: 'PATCH', body }); toast('Saved'); onSaved?.(); }
      else { const l = await api('/vendor/listings', { body }); router.push(`/vendor/listings/${l.id}`); }
    });
  };
  return (
    <form onSubmit={save}><Card title="Details">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Listing name" className="sm:col-span-2" {...f.bind('title')} />
        <Select label="Category" {...f.bind('categoryId')}><option value="">Choose</option>{cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select label="Indoor or outdoor" {...f.bind('indoorOutdoor')}><option value="">Not applicable</option><option value="INDOOR">Indoor</option><option value="OUTDOOR">Outdoor</option><option value="BOTH">Both</option></Select>
        <Textarea label="Description" className="sm:col-span-2" {...f.bind('description')} />
        <Select label="City" {...f.bind('cityId')}><option value="">Choose</option>{cities?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select label="Area" {...f.bind('areaId')}><option value="">Choose</option>{city?.areas.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        <Input label="Address" className="sm:col-span-2" {...f.bind('address')} />
        <Input label="Starting price (Rs.)" type="number" min={0} {...f.bind('startingPrice')} />
        <Select label="Price is" {...f.bind('priceUnit')}><option value="FLAT">Per event</option><option value="PER_PERSON">Per person</option></Select>
        <Input label="Minimum guests" type="number" min={0} {...f.bind('capacityMin')} />
        <Input label="Maximum guests" type="number" min={0} {...f.bind('capacityMax')} />
        {category?.availabilityMode === 'CAPACITY' && <Input label="Events you can serve per slot" type="number" min={1} max={100} hint="How many bookings you can take at the same time" {...f.bind('dailyCapacity')} />}
      </div>
      {category && category.amenityOptions.length > 0 && <fieldset className="mt-4"><legend className="mb-2 text-sm font-medium">Facilities</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{category.amenityOptions.map((a: string) => <label key={a} className="flex items-center gap-2 text-sm"><input type="checkbox" name="amenity" value={a} defaultChecked={amenitiesInitial.includes(a)} className="accent-[#8F3048]" />{a}</label>)}</div></fieldset>}
      <div className="mt-4"><FormError message={f.formError} /></div>
      <Button className="mt-3" busy={f.busy}>{listing ? 'Save changes' : 'Create listing'}</Button>
    </Card></form>
  );
}
