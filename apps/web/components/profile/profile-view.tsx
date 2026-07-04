'use client';

import { useState, useEffect } from 'react';
import {
  Loader2, AlertCircle, Save, User as UserIcon, Image as ImageIcon, Phone, Mail, Globe,
  MapPin, Heart, Calendar, Shield, Camera,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useMyProfile, useUpdateMyProfile } from '@/hooks/use-platform';
import { useAuthContext } from '@/components/providers/auth-provider';

const INTEREST_OPTIONS = ['UMRAH', 'HAJJ', 'FAMILY_TRIP', 'SOLO_TRAVEL', 'BUDGET_TRAVEL', 'LUXURY_TRAVEL', 'GROUP_TRAVEL', 'EDUCATION_TRIP', 'PILGRIMAGE'];

export function ProfileView() {
  const { user } = useAuthContext();
  const { data: profile, isLoading, error, refetch } = useMyProfile();
  const update = useUpdateMyProfile();

  const [form, setForm] = useState<any>({
    displayName: '',
    bio: '',
    avatarUrl: '',
    coverUrl: '',
    phone: '',
    nationality: '',
    city: '',
    travelInterests: [] as string[],
    preferredDateFrom: '',
    preferredDateTo: '',
    profileVisibility: 'PUBLIC',
    contactVisibility: 'CONNECTIONS',
  });

  useEffect(() => {
    if (profile) {
      setForm({
        displayName: profile.displayName ?? '',
        bio: profile.bio ?? '',
        avatarUrl: profile.avatarUrl ?? '',
        coverUrl: profile.coverUrl ?? '',
        phone: profile.phone ?? '',
        nationality: profile.nationality ?? '',
        city: profile.city ?? '',
        travelInterests: profile.travelInterests ?? [],
        preferredDateFrom: profile.preferredDateFrom?.slice(0, 10) ?? '',
        preferredDateTo: profile.preferredDateTo?.slice(0, 10) ?? '',
        profileVisibility: profile.profileVisibility ?? 'PUBLIC',
        contactVisibility: profile.contactVisibility ?? 'CONNECTIONS',
      });
    }
  }, [profile]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-gray-400 text-sm"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>;
  }
  if (error || !profile) {
    return <div className="py-20 text-center bg-white rounded-2xl border border-gray-100">
      <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
      <p className="text-sm text-red-500">Failed to load profile</p>
    </div>;
  }

  const toggleInterest = (i: string) => {
    setForm((f: any) => ({
      ...f,
      travelInterests: f.travelInterests.includes(i)
        ? f.travelInterests.filter((x: string) => x !== i)
        : [...f.travelInterests, i],
    }));
  };

  const save = async () => {
    try {
      await update.mutateAsync({
        ...form,
        preferredDateFrom: form.preferredDateFrom || null,
        preferredDateTo: form.preferredDateTo || null,
      } as any);
      toast.success('Profile saved');
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed to save profile');
    }
  };

  const initials = (form.displayName || user?.displayName || 'U').split(' ').map((s: string) => s[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-5 pb-10 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">Update your photo, contact info, travel interests, and privacy.</p>
      </div>

      {/* Cover + avatar */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="relative h-40 bg-gradient-to-r from-brand-100 via-saudi-100 to-brand-200">
          {form.coverUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={form.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          )}
          <label className="absolute right-3 top-3 bg-white/90 rounded-full px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white shadow flex items-center gap-1.5 cursor-pointer">
            <ImageIcon className="h-3.5 w-3.5" /> Cover URL
            <input
              type="text"
              value={form.coverUrl}
              onChange={(e) => setForm({ ...form, coverUrl: e.target.value })}
              placeholder="https://…"
              className="ml-2 text-xs bg-transparent outline-none w-44 placeholder:text-gray-400"
            />
          </label>
        </div>
        <div className="px-5 pb-5 -mt-10 flex items-end gap-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-4 border-white bg-brand-500 flex items-center justify-center text-white text-xl font-bold shadow-lg overflow-hidden">
              {form.avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={form.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : initials}
            </div>
            <label className="absolute -bottom-1 -right-1 bg-white border border-gray-200 rounded-full p-1.5 shadow hover:bg-gray-50 cursor-pointer">
              <Camera className="h-3.5 w-3.5 text-gray-600" />
              <input
                type="text"
                value={form.avatarUrl}
                onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })}
                placeholder="Avatar URL"
                className="hidden"
              />
            </label>
          </div>
          <div className="flex-1 min-w-0 pt-10">
            <input
              value={form.avatarUrl}
              onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })}
              placeholder="Avatar image URL (paste a public URL)"
              className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-brand-400"
            />
          </div>
        </div>
      </div>

      {/* Basic info */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
          <UserIcon className="h-4 w-4" /> Basic info
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Display name">
            <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className="input" />
          </Field>
          <Field label="Email (read only)">
            <input value={user?.email ?? ''} readOnly className="input bg-gray-50 text-gray-500" />
          </Field>
          <Field label="Phone">
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" placeholder="+966 5xx xxx xxx" />
          </Field>
          <Field label="Nationality (ISO-2)">
            <input value={form.nationality} maxLength={2} onChange={(e) => setForm({ ...form, nationality: e.target.value.toUpperCase() })} className="input" placeholder="SA" />
          </Field>
          <Field label="City">
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="input" />
          </Field>
        </div>
        <Field label="Bio">
          <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={3} className="input resize-none" placeholder="A few words about yourself…" />
        </Field>
      </div>

      {/* Travel interests */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
          <Heart className="h-4 w-4" /> Travel interests
        </h3>
        <div className="flex flex-wrap gap-2">
          {INTEREST_OPTIONS.map((i) => {
            const active = form.travelInterests.includes(i);
            return (
              <button
                key={i}
                onClick={() => toggleInterest(i)}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-full border font-medium transition-colors',
                  active ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-600 hover:border-brand-300',
                )}
              >
                {i.replace(/_/g, ' ')}
              </button>
            );
          })}
        </div>
        <div className="pt-3 border-t border-gray-50 grid grid-cols-2 gap-3">
          <Field label="Preferred travel from">
            <input type="date" value={form.preferredDateFrom} onChange={(e) => setForm({ ...form, preferredDateFrom: e.target.value })} className="input" />
          </Field>
          <Field label="Preferred travel to">
            <input type="date" value={form.preferredDateTo} onChange={(e) => setForm({ ...form, preferredDateTo: e.target.value })} className="input" />
          </Field>
        </div>
      </div>

      {/* Privacy */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
          <Shield className="h-4 w-4" /> Privacy
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Who can see my profile">
            <select value={form.profileVisibility} onChange={(e) => setForm({ ...form, profileVisibility: e.target.value })} className="input bg-white">
              <option value="PUBLIC">Everyone</option>
              <option value="CONNECTIONS">My connections</option>
              <option value="PRIVATE">Only me</option>
            </select>
          </Field>
          <Field label="Who can see my contact info">
            <select value={form.contactVisibility} onChange={(e) => setForm({ ...form, contactVisibility: e.target.value })} className="input bg-white">
              <option value="PUBLIC">Everyone</option>
              <option value="CONNECTIONS">My connections</option>
              <option value="PRIVATE">Only me</option>
            </select>
          </Field>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={update.isPending}
          className="flex items-center gap-2 px-5 py-2.5 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-xl shadow-sm shadow-brand-500/30 disabled:opacity-50"
        >
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save profile
        </button>
      </div>

      <style jsx>{`
        :global(.input) { width: 100%; font-size: 14px; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; outline: none; }
        :global(.input:focus) { border-color: #d4831a; box-shadow: 0 0 0 2px #fef3e6; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
