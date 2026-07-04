'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import {
  Eye, EyeOff, Loader2, Building2, Bus, FileCheck2, DollarSign,
  Users, Plane, Zap, ArrowRight, CheckCircle, Star, Globe2, Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { useAuthContext, getDashboardPath } from '@/components/providers/auth-provider';
import { cn } from '@/lib/utils';
import type { DashboardType } from '@/lib/auth';

// ─── Schema ───────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  tenantSlug: z.string().min(1, 'Workspace slug is required'),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password is required'),
});
type LoginForm = z.infer<typeof loginSchema>;

// ─── Demo Roles ───────────────────────────────────────────────────────────────

const DEMO_ROLES: {
  id: DashboardType;
  label: string;
  sublabel: string;
  icon: any;
  emoji: string;
  accent: string;
  badgeBg: string;
  badgeText: string;
  features: string[];
  slug: string;
  email: string;
  password: string;
}[] = [
  {
    id: 'operator',
    label: 'Umrah Operator / Agency',
    sublabel: 'Full CRM & Operations',
    icon: Building2,
    emoji: '🏢',
    accent: 'from-brand-500 to-brand-600',
    badgeBg: 'bg-brand-50',
    badgeText: 'text-brand-700',
    features: ['Pilgrim CRM', 'Bookings', 'Groups', 'Hotels', 'Finance'],
    slug: 'al-haramain-ksa',
    email: 'admin@alharamain.sa',
    password: 'Admin@1234',
  },
  {
    id: 'hotel',
    label: 'Hotel Owner',
    sublabel: 'Inventory & Allotments',
    icon: Building2,
    emoji: '🏨',
    accent: 'from-blue-500 to-blue-600',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    features: ['Hotel Dashboard', 'Room Inventory', 'Bookings', 'Finance'],
    slug: 'al-haramain-ksa',
    email: 'admin@alharamain.sa',
    password: 'Admin@1234',
  },
  {
    id: 'transport',
    label: 'Transport Company',
    sublabel: 'Fleet & Route Management',
    icon: Bus,
    emoji: '🚌',
    accent: 'from-purple-500 to-purple-600',
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-700',
    features: ['Vehicles', 'Drivers', 'Routes', 'Assignments'],
    slug: 'al-haramain-ksa',
    email: 'admin@alharamain.sa',
    password: 'Admin@1234',
  },
  {
    id: 'compliance',
    label: 'Visa Agency',
    sublabel: 'Compliance & Approvals',
    icon: FileCheck2,
    emoji: '📋',
    accent: 'from-green-500 to-green-600',
    badgeBg: 'bg-green-50',
    badgeText: 'text-green-700',
    features: ['Visa Pipeline', 'Document Check', 'Approvals', 'Nusuk'],
    slug: 'al-haramain-ksa',
    email: 'admin@alharamain.sa',
    password: 'Admin@1234',
  },
  {
    id: 'finance',
    label: 'Finance Manager',
    sublabel: 'Invoices & Payments',
    icon: DollarSign,
    emoji: '💰',
    accent: 'from-yellow-500 to-orange-500',
    badgeBg: 'bg-yellow-50',
    badgeText: 'text-yellow-700',
    features: ['Invoices', 'Revenue Reports', 'Payments', 'Analytics'],
    slug: 'al-haramain-ksa',
    email: 'admin@alharamain.sa',
    password: 'Admin@1234',
  },
  {
    id: 'admin',
    label: 'Super Admin',
    sublabel: 'Full Platform Control',
    icon: Shield,
    emoji: '⚡',
    accent: 'from-red-500 to-rose-600',
    badgeBg: 'bg-red-50',
    badgeText: 'text-red-700',
    features: ['All Modules', 'Platform Config', 'All Reports', 'User Mgmt'],
    slug: 'al-haramain-ksa',
    email: 'admin@alharamain.sa',
    password: 'Admin@1234',
  },
  {
    id: 'pilgrim',
    label: 'Pilgrim / Traveller',
    sublabel: 'Social Hub & Journey',
    icon: Users,
    emoji: '🧕',
    accent: 'from-saudi-500 to-saudi-600',
    badgeBg: 'bg-green-50',
    badgeText: 'text-saudi-600',
    features: ['Social Feed', 'Pilgrim Groups', 'Discover Packages', 'Group Chat'],
    slug: '',
    email: '',
    password: '',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [tab, setTab] = useState<'demo' | 'signin'>('demo');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<DashboardType>('operator');
  const [demoLoading, setDemoLoading] = useState<DashboardType | null>(null);
  const router = useRouter();
  const { login, loginAsDemo, isLoading } = useAuth();
  const { setUser } = useAuthContext();

  const { register, handleSubmit, formState: { errors }, setValue, getValues } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { tenantSlug: 'al-haramain-ksa', email: 'admin@alharamain.sa', password: 'Admin@1234' },
  });

  // Quick demo — bypasses real auth
  const handleQuickDemo = async (role: DashboardType) => {
    setDemoLoading(role);
    try {
      const user = await loginAsDemo(role);
      setUser(user);
      toast.success(`Logged in as ${DEMO_ROLES.find((r) => r.id === role)?.label}`);
      router.push(getDashboardPath(role));
    } catch (err) {
      toast.error('Demo login failed');
      setDemoLoading(null);
    }
  };

  // Real login
  const onSubmit = async (data: LoginForm) => {
    try {
      const user = await login(data.tenantSlug, data.email, data.password);
      const final = { ...user, dashboardType: selectedRole };
      setUser(final);
      localStorage.setItem('currentUser', JSON.stringify(final));
      toast.success('Welcome back!');
      router.push(getDashboardPath(selectedRole));
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message ?? err?.message ?? 'Login failed');
    }
  };

  // Pre-fill form when a role is selected on sign-in tab
  const selectRole = (role: typeof DEMO_ROLES[0]) => {
    setSelectedRole(role.id);
    if (role.slug) setValue('tenantSlug', role.slug);
    if (role.email) setValue('email', role.email);
    if (role.password) setValue('password', role.password);
  };

  return (
    <div className="min-h-screen flex bg-[#f7f7f5]">
      {/* ── Left branding panel ── */}
      <div className="hidden xl:flex xl:w-[480px] flex-col bg-[#1a1a2e] text-white relative overflow-hidden shrink-0">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 rounded-full bg-brand-500 -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-saudi-500 translate-x-1/3 translate-y-1/3" />
        </div>

        <div className="relative z-10 flex flex-col h-full p-10">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/10 ring-1 ring-white/20 flex items-center justify-center shadow-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark-light.png" alt="Umrah Connect" className="w-8 h-8 object-contain" />
            </div>
            <div>
              <p className="font-heading font-bold text-lg leading-none">Umrah Connect</p>
              <p className="text-[11px] text-white/50 mt-0.5">Connected journeys</p>
            </div>
          </div>

          {/* Hero text */}
          <div className="mt-auto mb-8">
            <p className="text-3xl font-light leading-snug text-white/90 mb-6">
              The operating system for every licensed Umrah & Hajj operator.
            </p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              {[['900+', 'PPIUs'], ['120+', 'Mu\'assasat'], ['30M+', 'Pilgrims by 2030']].map(([val, lbl]) => (
                <div key={lbl} className="bg-white/10 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-brand-300">{val}</p>
                  <p className="text-xs text-white/60 mt-1">{lbl}</p>
                </div>
              ))}
            </div>

            {/* Features */}
            <div className="space-y-2.5">
              {[
                'Pilgrim CRM & document management',
                'Hotel allotment & real-time availability',
                'Nusuk & SISKOPATUH visa integration',
                'Operator social network & marketplace',
                'Finance, invoicing & payment tracking',
              ].map((f) => (
                <div key={f} className="flex items-center gap-2.5 text-sm text-white/70">
                  <CheckCircle className="h-4 w-4 text-brand-400 shrink-0" />
                  {f}
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-white/30">© 2026 Umrah Connect · All rights reserved</p>
        </div>
      </div>

      {/* ── Right: login area ── */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-2xl">

          {/* Mobile logo */}
          <div className="xl:hidden flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-lg bg-brand-500 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark-light.png" alt="Umrah Connect" className="w-7 h-7 object-contain" />
            </div>
            <div>
              <p className="font-heading font-bold text-base text-brand-500">Umrah Connect</p>
              <p className="text-xs text-muted-foreground">Connected journeys</p>
            </div>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

            {/* Tab bar */}
            <div className="flex border-b border-gray-100">
              <button
                onClick={() => setTab('demo')}
                className={cn(
                  'flex-1 py-4 text-sm font-semibold transition-all',
                  tab === 'demo'
                    ? 'text-brand-600 border-b-2 border-brand-500 bg-brand-50/50'
                    : 'text-gray-400 hover:text-gray-600',
                )}
              >
                <span className="flex items-center justify-center gap-2">
                  <Zap className="h-4 w-4" />
                  Quick Demo Access
                </span>
              </button>
              <button
                onClick={() => setTab('signin')}
                className={cn(
                  'flex-1 py-4 text-sm font-semibold transition-all',
                  tab === 'signin'
                    ? 'text-brand-600 border-b-2 border-brand-500 bg-brand-50/50'
                    : 'text-gray-400 hover:text-gray-600',
                )}
              >
                <span className="flex items-center justify-center gap-2">
                  <Globe2 className="h-4 w-4" />
                  Sign In to Workspace
                </span>
              </button>
            </div>

            {/* ── DEMO TAB ── */}
            {tab === 'demo' && (
              <div className="p-6">
                <div className="text-center mb-6">
                  <p className="text-gray-500 text-sm">
                    Click any role below to instantly preview the platform — no credentials required.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {DEMO_ROLES.map((role) => {
                    const isLoading = demoLoading === role.id;
                    return (
                      <button
                        key={role.id}
                        onClick={() => handleQuickDemo(role.id)}
                        disabled={demoLoading !== null}
                        className="group relative flex items-start gap-4 p-4 rounded-xl border border-gray-200 text-left hover:border-brand-300 hover:shadow-md transition-all duration-200 disabled:opacity-60"
                      >
                        {/* Icon */}
                        <div className={cn(
                          'w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br text-white shadow-sm',
                          role.accent,
                        )}>
                          <role.icon className="h-5 w-5" />
                        </div>

                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm leading-tight">{role.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{role.sublabel}</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {role.features.slice(0, 3).map((f) => (
                              <span key={f} className={cn('text-[10px] px-1.5 py-0.5 rounded-md font-medium', role.badgeBg, role.badgeText)}>
                                {f}
                              </span>
                            ))}
                            {role.features.length > 3 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-gray-100 text-gray-500">
                                +{role.features.length - 3}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Arrow */}
                        <div className="shrink-0 self-center">
                          {isLoading
                            ? <Loader2 className="h-4 w-4 text-brand-500 animate-spin" />
                            : <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all" />
                          }
                        </div>
                      </button>
                    );
                  })}
                </div>

                <p className="text-center text-xs text-gray-400 mt-5">
                  Demo mode uses pre-seeded data. No real data is affected.
                </p>
              </div>
            )}

            {/* ── SIGN IN TAB ── */}
            {tab === 'signin' && (
              <div className="p-6">
                <div className="mb-5">
                  <h2 className="text-lg font-bold text-gray-900">Sign in to your workspace</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Use your operator account credentials</p>
                </div>

                {/* Role selector */}
                <div className="mb-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5">I am signing in as</p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {DEMO_ROLES.filter((r) => r.id !== 'pilgrim').map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => selectRole(role)}
                        className={cn(
                          'flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-center transition-all text-xs',
                          selectedRole === role.id
                            ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300',
                        )}
                      >
                        <role.icon className="h-4 w-4" />
                        <span className="font-medium text-[10px] leading-tight">{role.label.split('/')[0].trim()}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Workspace</label>
                    <div className="flex rounded-lg border border-gray-300 overflow-hidden focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 transition-all">
                      <span className="flex items-center px-3 bg-gray-50 text-gray-400 text-xs border-r border-gray-300 whitespace-nowrap shrink-0">
                        umrahconnects.io/
                      </span>
                      <input
                        {...register('tenantSlug')}
                        placeholder="your-workspace"
                        className="flex-1 px-3 py-2.5 text-sm bg-white outline-none text-gray-900"
                      />
                    </div>
                    {errors.tenantSlug && <p className="text-red-500 text-xs mt-1">{errors.tenantSlug.message}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email address</label>
                    <input
                      type="email"
                      {...register('email')}
                      placeholder="admin@youroperator.com"
                      className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                    />
                    {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-gray-700">Password</label>
                      <button
                        type="button"
                        onClick={async () => {
                          const email = getValues('email');
                          if (!email) { toast.error('Enter your email above first'); return; }
                          try {
                            const { data } = await (await import('@/lib/api')).apiClient.post('/auth/forgot-password', { email });
                            toast.success(data?.data?.message ?? 'Reset link sent');
                            if (data?.data?.devResetLink) window.open(data.data.devResetLink, '_blank');
                          } catch { toast.error('Could not request reset'); }
                        }}
                        className="text-xs text-brand-500 hover:text-brand-600"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        {...register('password')}
                        placeholder="••••••••"
                        className="w-full px-3 py-2.5 pr-10 text-sm rounded-lg border border-gray-300 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white font-semibold text-sm rounded-lg transition-colors shadow-sm shadow-brand-500/30"
                  >
                    {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Sign in
                    {!isLoading && <ArrowRight className="h-4 w-4" />}
                  </button>
                </form>

                {/* Demo credentials hint */}
                <div className="mt-5 p-3.5 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs font-semibold text-amber-700 mb-1.5">🔑 Demo credentials (pre-filled)</p>
                  <div className="grid grid-cols-3 gap-2 text-xs text-amber-600">
                    <div>
                      <p className="font-medium text-amber-500">Workspace</p>
                      <p className="font-mono">al-haramain-ksa</p>
                    </div>
                    <div>
                      <p className="font-medium text-amber-500">Email</p>
                      <p className="font-mono">admin@alharamain.sa</p>
                    </div>
                    <div>
                      <p className="font-medium text-amber-500">Password</p>
                      <p className="font-mono">Admin@1234</p>
                    </div>
                  </div>
                </div>

                <p className="text-center mt-4 text-xs text-gray-400">
                  For instant testing, use{' '}
                  <button onClick={() => setTab('demo')} className="text-brand-500 font-medium hover:underline">
                    Quick Demo Access
                  </button>{' '}
                  instead.
                </p>
              </div>
            )}
          </div>

          {/* Footer links */}
          <div className="flex items-center justify-center gap-6 mt-6 text-xs text-gray-400">
            <span>© 2026 Umrah Connect</span>
            <span>·</span>
            <a href="#" className="hover:text-gray-600">Privacy Policy</a>
            <span>·</span>
            <a href="#" className="hover:text-gray-600">Terms of Service</a>
            <span>·</span>
            <a href="#" className="hover:text-gray-600">Help</a>
          </div>
        </div>
      </div>
    </div>
  );
}
