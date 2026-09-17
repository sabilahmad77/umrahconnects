'use client';
import { PASSWORD_HINT, passwordProblem } from '@/lib/password-policy';
import { apiErrorMessage } from '@/lib/api-error';
import { Input , Button } from '@/components/ui/system';


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

// Role interest is sent to registration; it does not assign permissions or activate a workspace.
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
    password: passwordProblem(form.password),
  };
  const fieldErr = (k: string) => (touched[k] ? fieldErrors[k] : '');
  const roleMeta = ROLES.find((r) => r.id === role);

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
      toast.success('Account created. Sign in to check your account setup.');
      router.push(`/login?email=${encodeURIComponent(form.email.trim())}`);
    } catch (e: any) {
      setErr(apiErrorMessage(e, 'Could not create your account. This email may already be registered.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-ivory text-gray-900 flex flex-col">
      <PublicHeader />
      <main id="public-main" tabIndex={-1} className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          {/* progress */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <span className={`flex items-center gap-1.5 text-[12px] font-semibold ${step === 1 ? 'text-brand-600' : 'text-brand-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 1 ? 'bg-brand-500 text-white' : 'bg-brand-100 text-brand-600'}`}>1</span> Choose role
            </span>
            <span className="w-8 h-px bg-sandstone" />
            <span className={`flex items-center gap-1.5 text-[12px] font-semibold ${step === 2 ? 'text-brand-600' : 'text-gray-600'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 2 ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600'}`}>2</span> Your details
            </span>
          </div>

          {step === 1 ? (
            <div>
              <div className="text-center mb-7">
                <h1 className="font-heading text-3xl font-extrabold text-brand-600">Get started with Umrah Connect</h1>
                <p className="text-[15px] text-gray-600 mt-2">Tell us which workspace you’re interested in. Workspace access depends on the roles assigned to your account.</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {ROLES.map(({ id, label, desc, Icon }) => (
                  <Button variant="quiet" type="button" aria-label={label}
                    key={id} onClick={() => { setRole(id); setStep(2); }}
                    className="text-left bg-white rounded-2xl border border-sandstone/60 p-4 flex items-center gap-3.5 hover:border-brand-400 hover:shadow-lg hover:shadow-brand-900/5 transition-all group"
                  >
                    <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center shrink-0 group-hover:bg-brand-500 transition-colors">
                      <Icon className="h-5 w-5 text-brand-600 group-hover:text-white transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-heading font-bold text-gray-900 text-[14px]">{label}</p>
                      <p className="text-[12px] text-gray-600">{desc}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-brand-500 transition-colors" />
                  </Button>
                ))}
              </div>
              <p className="text-center text-[13px] text-gray-600 mt-6">
                Already have an account? <Link href="/login" className="font-semibold text-brand-600 hover:underline">Log in</Link>
              </p>
            </div>
          ) : (
            <div className="max-w-md mx-auto">
              <Button variant="quiet" type="button" onClick={() => setStep(1)} className="inline-flex items-center gap-1.5 text-[13px] text-gray-600 hover:text-brand-600 mb-4">
                <ArrowLeft className="h-4 w-4" /> Back to roles
              </Button>
              <div className="bg-white rounded-2xl border border-sandstone/60 p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-5">
                  {roleMeta && <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center"><roleMeta.Icon className="h-5 w-5 text-brand-600" /></div>}
                  <div>
                    <p className="font-heading font-bold text-gray-900">Create your account</p>
                    <p className="text-[12px] text-gray-600">Signing up as <span className="text-brand-600 font-semibold">{roleMeta?.label}</span></p>
                  </div>
                </div>
                {role && (
                  <div className="flex items-start gap-2 bg-gold-50 border border-gold-200 rounded-xl p-3 mb-4">
                    <CheckCircle2 className="h-4 w-4 text-gold-800 shrink-0 mt-0.5" />
                    <p className="text-[12px] text-gold-800">Role interest does not grant workspace access. Contact support if your account setup is incomplete.</p>
                  </div>
                )}
                <form onSubmit={event => { event.preventDefault(); void submit(); }} method="post" className="space-y-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="signup-firstName" className="mb-2 block text-sm font-medium">First name</label><Input id="signup-firstName" name="firstName" autoComplete="given-name" aria-describedby="signup-firstName-error" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} onBlur={() => touch('firstName')} aria-invalid={!!fieldErr('firstName')} placeholder="First name" className={`w-full text-sm px-3.5 py-2.5 border rounded-xl outline-none focus:border-brand-400 ${fieldErr('firstName') ? 'border-red-300' : 'border-sandstone'}`} />
                      {fieldErr('firstName') && <p id="signup-firstName-error" className="text-sm text-red-700 mt-1">{fieldErr('firstName')}</p>}
                    </div>
                    <div><label htmlFor="signup-lastName" className="mb-2 block text-sm font-medium">Last name</label><Input id="signup-lastName" name="lastName" autoComplete="family-name" aria-describedby="signup-lastName-error" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} placeholder="Last name" className="text-sm px-3.5 py-2.5 border border-sandstone rounded-xl outline-none focus:border-brand-400" /></div>
                  </div>
                  <div>
                    <label htmlFor="signup-email" className="mb-2 block text-sm font-medium">Email address</label><Input id="signup-email" name="email" autoComplete="email" aria-describedby="signup-email-error" value={form.email} onChange={(e) => set('email', e.target.value)} onBlur={() => touch('email')} type="email" aria-invalid={!!fieldErr('email')} placeholder="Email address" className={`w-full text-sm px-3.5 py-2.5 border rounded-xl outline-none focus:border-brand-400 ${fieldErr('email') ? 'border-red-300' : 'border-sandstone'}`} />
                    {fieldErr('email') && <p id="signup-email-error" className="text-sm text-red-700 mt-1">{fieldErr('email')}</p>}
                  </div>
                  <div>
                    <label htmlFor="signup-password" className="mb-2 block text-sm font-medium">Password</label><Input id="signup-password" name="password" autoComplete="new-password" aria-describedby="signup-password-hint signup-password-error" value={form.password} onChange={(e) => set('password', e.target.value)} onBlur={() => touch('password')} type="password" aria-invalid={!!fieldErr('password')} placeholder="Password" title={PASSWORD_HINT} className={`w-full text-sm px-3.5 py-2.5 border rounded-xl outline-none focus:border-brand-400 ${fieldErr('password') ? 'border-red-300' : 'border-sandstone'}`} />
                    <p id="signup-password-hint" className="text-xs text-gray-600 mt-1">{PASSWORD_HINT}</p>
                    {fieldErr('password') && <p id="signup-password-error" className="text-sm text-red-700 mt-1">{fieldErr('password')}</p>}
                  </div>
                  {err && <p role="alert" className="text-[13px] text-red-600">{err}</p>}
                  <Button variant="quiet" type="submit" disabled={busy} className="w-full inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm py-3 rounded-xl transition-colors disabled:opacity-60">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Create account
                  </Button>
                  <p className="text-[11px] text-gray-600 text-center">By continuing you agree to our <Link href="/terms" className="text-brand-600 hover:underline">Terms</Link> and <Link href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link>.</p>
                </form>
              </div>
            </div>
          )}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
