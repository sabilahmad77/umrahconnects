'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  UserRound, Building2, Hotel, Bus, FileCheck2, Wallet,
  ArrowRight, ArrowLeft, Loader2, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { PublicHeader, PublicFooter } from '@/components/public/public-chrome';
import { apiClient } from '@/lib/api';

// FIX-01: public signup offers ONLY self-service roles. This list mirrors the
// server-authoritative PUBLIC_SIGNUP_ROLES allow-list (auth/dto/register.dto.ts);
// privileged roles (Super Admin) are never selectable publicly and are rejected
// server-side (403) even if injected via direct API call.
const ROLES = [
  { id: 'pilgrim', label: 'Traveler / Pilgrim', desc: 'Plan and book your Umrah journey', Icon: UserRound },
  { id: 'operator', label: 'Umrah Operator / Agency', desc: 'Full CRM & operations', Icon: Building2 },
  { id: 'hotel', label: 'Hotel / Accommodation', desc: 'Manage rooms and bookings', Icon: Hotel },
  { id: 'transport', label: 'Transport Company', desc: 'Fleet, drivers and routes', Icon: Bus },
  { id: 'compliance', label: 'Visa Agency', desc: 'Visa processing & compliance', Icon: FileCheck2 },
  { id: 'finance', label: 'Finance Manager', desc: 'Invoices and reconciliation', Icon: Wallet },
];

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [role, setRole] = useState('');
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }));
  // Inline field errors, shown on blur; input is always preserved.
  const fieldErrors: Record<string, string> = {
    firstName: form.firstName.trim() ? '' : 'First name is required.',
    email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email) ? '' : 'Enter a valid email address.',
    password: form.password.length >= 8 ? '' : 'Password must be at least 8 characters.',
  };
  const fieldErr = (k: string) => (touched[k] ? fieldErrors[k] : '');
  const roleMeta = ROLES.find((r) => r.id === role);
  const isProvider = role && role !== 'pilgrim';

  const submit = async () => {
    setErr('');
    setTouched({ firstName: true, email: true, password: true });
    if (fieldErrors.firstName || fieldErrors.email || fieldErrors.password) return;
    setBusy(true);
    try {
      await apiClient.post('/auth/register', {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || form.firstName.trim(),
        email: form.email.trim(),
        password: form.password,
        roleInterest: role,
      });
      // Providers also register their interest so our team can complete onboarding
      if (isProvider) {
        apiClient.post('/inquiries', {
          type: 'CONTACT', email: form.email.trim(), name: `${form.firstName} ${form.lastName}`.trim(),
          subject: `New ${roleMeta?.label} signup`, message: `Self-service signup as ${roleMeta?.label}. Please complete provider onboarding.`,
          metadata: { source: 'signup', roleInterest: role },
        }).catch(() => undefined);
      }
      toast.success('Account created — please sign in to continue.');
      router.push(`/login?email=${encodeURIComponent(form.email.trim())}`);
    } catch (e: any) {
      setErr(e?.response?.data?.error?.message ?? 'Could not create your account. This email may already be registered.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-ivory text-gray-900 flex flex-col">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          {/* progress */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <span className={`flex items-center gap-1.5 text-[12px] font-semibold ${step === 1 ? 'text-brand-600' : 'text-brand-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 1 ? 'bg-brand-500 text-white' : 'bg-brand-100 text-brand-600'}`}>1</span> Choose role
            </span>
            <span className="w-8 h-px bg-sandstone" />
            <span className={`flex items-center gap-1.5 text-[12px] font-semibold ${step === 2 ? 'text-brand-600' : 'text-gray-500'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 2 ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500'}`}>2</span> Your details
            </span>
          </div>

          {step === 1 ? (
            <div>
              <div className="text-center mb-7">
                <h1 className="font-heading text-3xl font-extrabold text-brand-600">Get started with Umrah Connect</h1>
                <p className="text-[15px] text-gray-500 mt-2">Choose the role that best describes you to set up the right workspace.</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {ROLES.map(({ id, label, desc, Icon }) => (
                  <button
                    key={id} onClick={() => { setRole(id); setStep(2); }}
                    className="text-left bg-white rounded-2xl border border-sandstone/60 p-4 flex items-center gap-3.5 hover:border-brand-400 hover:shadow-lg hover:shadow-brand-900/5 transition-all group"
                  >
                    <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center shrink-0 group-hover:bg-brand-500 transition-colors">
                      <Icon className="h-5 w-5 text-brand-600 group-hover:text-white transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-heading font-bold text-gray-900 text-[14px]">{label}</p>
                      <p className="text-[12px] text-gray-500">{desc}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-brand-500 transition-colors" />
                  </button>
                ))}
              </div>
              <p className="text-center text-[13px] text-gray-500 mt-6">
                Already have an account? <Link href="/login" className="font-semibold text-brand-600 hover:underline">Log in</Link>
              </p>
            </div>
          ) : (
            <div className="max-w-md mx-auto">
              <button onClick={() => setStep(1)} className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-brand-600 mb-4">
                <ArrowLeft className="h-4 w-4" /> Back to roles
              </button>
              <div className="bg-white rounded-2xl border border-sandstone/60 p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-5">
                  {roleMeta && <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center"><roleMeta.Icon className="h-5 w-5 text-brand-600" /></div>}
                  <div>
                    <p className="font-heading font-bold text-gray-900">Create your account</p>
                    <p className="text-[12px] text-gray-500">Signing up as <span className="text-brand-600 font-semibold">{roleMeta?.label}</span></p>
                  </div>
                </div>
                {isProvider && (
                  <div className="flex items-start gap-2 bg-gold-50 border border-gold-200 rounded-xl p-3 mb-4">
                    <CheckCircle2 className="h-4 w-4 text-gold-600 shrink-0 mt-0.5" />
                    <p className="text-[12px] text-gold-800">Your account is created instantly. Our team will reach out to complete provider verification and onboarding.</p>
                  </div>
                )}
                <div className="space-y-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} onBlur={() => touch('firstName')} aria-label="First name" aria-invalid={!!fieldErr('firstName')} placeholder="First name" className={`w-full text-sm px-3.5 py-2.5 border rounded-xl outline-none focus:border-brand-400 ${fieldErr('firstName') ? 'border-red-300' : 'border-sandstone'}`} />
                      {fieldErr('firstName') && <p className="text-[11.5px] text-red-600 mt-1">{fieldErr('firstName')}</p>}
                    </div>
                    <input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} aria-label="Last name" placeholder="Last name" className="text-sm px-3.5 py-2.5 border border-sandstone rounded-xl outline-none focus:border-brand-400" />
                  </div>
                  <div>
                    <input value={form.email} onChange={(e) => set('email', e.target.value)} onBlur={() => touch('email')} type="email" aria-label="Email address" aria-invalid={!!fieldErr('email')} placeholder="Email address" className={`w-full text-sm px-3.5 py-2.5 border rounded-xl outline-none focus:border-brand-400 ${fieldErr('email') ? 'border-red-300' : 'border-sandstone'}`} />
                    {fieldErr('email') && <p className="text-[11.5px] text-red-600 mt-1">{fieldErr('email')}</p>}
                  </div>
                  <div>
                    <input value={form.password} onChange={(e) => set('password', e.target.value)} onBlur={() => touch('password')} type="password" aria-label="Password" aria-invalid={!!fieldErr('password')} placeholder="Password (min 8 characters)" className={`w-full text-sm px-3.5 py-2.5 border rounded-xl outline-none focus:border-brand-400 ${fieldErr('password') ? 'border-red-300' : 'border-sandstone'}`} />
                    {fieldErr('password') && <p className="text-[11.5px] text-red-600 mt-1">{fieldErr('password')}</p>}
                  </div>
                  {err && <p role="alert" className="text-[13px] text-red-600">{err}</p>}
                  <button onClick={submit} disabled={busy} className="w-full inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm py-3 rounded-xl transition-colors disabled:opacity-60">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Create account
                  </button>
                  <p className="text-[11px] text-gray-500 text-center">By continuing you agree to our <Link href="/terms" className="text-brand-600 hover:underline">Terms</Link> and <Link href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link>.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
