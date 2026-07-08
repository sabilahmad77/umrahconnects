import Link from 'next/link';
import {
  ArrowRight, Bell, Mail, Search, ShieldCheck, Headphones, Users2, Building2,
  Bus, FileCheck2, Wallet, UserRound, Hotel, ShoppingBag, MessagesSquare,
  Sparkles, Smartphone, BellRing, CreditCard, WifiOff,
} from 'lucide-react';
import { PublicHeader, PublicFooter } from '@/components/public/public-chrome';

export const metadata = {
  title: 'Umrah Connect — One platform for every Umrah journey',
  description:
    'Travelers, operators, hotels, transport, visa, and finance working together in one connected ecosystem.',
};

// ── tiny inline charts (no deps) ──────────────────────────────────────────────
function Sparkline({ color = '#2A7A6B' }: { color?: string }) {
  const pts = [14, 11, 16, 12, 19, 15, 22, 18, 24];
  const w = 96, h = 28, max = Math.max(...pts), min = Math.min(...pts);
  const d = pts
    .map((p, i) => `${(i / (pts.length - 1)) * w},${h - ((p - min) / (max - min || 1)) * h}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline points={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={w} cy={h - ((pts[pts.length - 1] - min) / (max - min || 1)) * h} r="2.5" fill={color} />
    </svg>
  );
}

function MiniLine() {
  const pts = [8, 12, 9, 15, 13, 18, 16, 22, 20, 26];
  const w = 280, h = 90, max = Math.max(...pts), min = Math.min(...pts);
  const coords = pts.map((p, i) => [(i / (pts.length - 1)) * w, h - ((p - min) / (max - min || 1)) * (h - 10) - 5]);
  const line = coords.map((c) => c.join(',')).join(' ');
  const area = `0,${h} ${line} ${w},${h}`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2A7A6B" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#2A7A6B" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#lg)" />
      <polyline points={line} fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MiniDonut() {
  const segs = [
    { v: 51, c: '#0F3D37' }, { v: 24, c: '#C8A96B' }, { v: 15, c: '#B54747' }, { v: 10, c: '#2563EB' },
  ];
  const r = 26, cx = 32, cy = 32, circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64">
      {segs.map((s, i) => {
        const len = (s.v / 100) * circ;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.c} strokeWidth="9"
            strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset} transform={`rotate(-90 ${cx} ${cy})`} />
        );
        offset += len; return el;
      })}
      <text x={cx} y={cy + 1} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0F3D37">1,248</text>
      <text x={cx} y={cy + 11} textAnchor="middle" fontSize="5.5" fill="#8A8F98">Total</text>
    </svg>
  );
}

// ── data ──────────────────────────────────────────────────────────────────────
const NAV = ['Solutions', 'Marketplace', 'Resources', 'Pricing', 'About Us'];

const TRUST = [
  { Icon: ShieldCheck, t: 'Trusted by thousands', s: 'of users worldwide' },
  { Icon: ShieldCheck, t: 'Secure & Compliant', s: 'Built for trust & protection' },
  { Icon: Headphones, t: '24/7 Support', s: 'Always here to help' },
  { Icon: Users2, t: 'Built for Umrah', s: 'Purpose-built platform' },
];

const SERVICES = [
  { Icon: Building2, title: 'Operators / Agencies', desc: 'Manage bookings, groups and pilgrims with ease.', metric: 'Active Bookings', value: '1,256', delta: '+18%' },
  { Icon: Hotel, title: 'Hotels / Accommodation', desc: 'Optimize occupancy, pricing and guest experience.', metric: 'Occupancy Rate', value: '85%', delta: '+12%' },
  { Icon: Bus, title: 'Transport / Logistics', desc: 'Smart routing, fleets and real-time updates.', metric: 'Trips Today', value: '128', delta: '+15%' },
  { Icon: FileCheck2, title: 'Visa Services', desc: 'Faster processing, higher approval rates.', metric: 'Applications', value: '4.28M', delta: '+22%' },
  { Icon: Wallet, title: 'Finance / Payments', desc: 'Reconciliation, settlements and financial insights.', metric: 'Total Transactions', value: '18,452', delta: '+17%' },
  { Icon: UserRound, title: 'Travelers / Pilgrims', desc: 'Plan, book & manage your sacred journey.', metric: 'Journeys Booked', value: '12,840', delta: '+19%' },
];

const SHOWCASE = [
  { tag: 'PLATFORM', Icon: Building2, title: 'Role-Based Operating System', desc: 'Unified workspace for every role in the Umrah ecosystem.', link: 'Explore Platform', href: '/login' },
  { tag: 'MARKETPLACE', Icon: ShoppingBag, title: 'Find. Compare. Book.', desc: 'All Umrah services in one intelligent marketplace.', link: 'Explore Marketplace', href: '/marketplace-preview' },
  { tag: 'SOCIAL HUB', Icon: MessagesSquare, title: 'Connect & Collaborate.', desc: 'A trusted network for updates, groups and communications.', link: 'Explore Social Hub', href: '/social-preview' },
  { tag: 'BOOKING WORKFLOW', Icon: Sparkles, title: 'Simple. Smart. Seamless.', desc: 'From search to confirmation in just a few clicks.', link: 'Explore Workflow', href: '/workflow' },
];

const APP_FEATURES = [
  { Icon: Smartphone, t: 'Smart Bookings', s: 'Book and manage all services' },
  { Icon: BellRing, t: 'Live Updates', s: 'Real-time flight, visa and itinerary updates' },
  { Icon: Headphones, t: 'Instant Support', s: 'Chat with support 24/7' },
  { Icon: CreditCard, t: 'Secure Payments', s: 'Safe, fast & flexible payments' },
  { Icon: WifiOff, t: 'Offline Access', s: 'Access itineraries offline' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-ivory text-gray-900">
      <PublicHeader />

      {/* ─── HERO ─── */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8 pt-14 pb-16">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-flex items-center gap-2 text-[10.5px] font-bold tracking-[0.14em] text-brand-700 bg-brand-50 px-3.5 py-1.5 rounded-full border border-brand-200">
              <Sparkles className="h-3 w-3 text-gold-500" />
              THE CONNECTED OPERATING SYSTEM FOR UMRAH
            </span>
            <h1 className="mt-6 font-heading text-5xl lg:text-[64px] font-extrabold leading-[1.04] tracking-tight text-brand-600">
              One platform for<br />every Umrah journey.
            </h1>
            <p className="mt-6 text-[17px] text-gray-600 leading-relaxed max-w-lg">
              Travelers, operators, hotels, transport, visa, and finance working together in one connected ecosystem.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup" className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-6 py-3.5 rounded-xl font-semibold text-sm shadow-md shadow-brand-500/20 transition-colors">
                Get Started <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/contact?type=demo" className="inline-flex items-center gap-2 bg-white hover:bg-sandstone/30 text-brand-600 px-6 py-3.5 rounded-xl font-semibold text-sm border border-sandstone transition-colors">
                Request a Demo
              </Link>
            </div>
            <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-4">
              {TRUST.map(({ Icon, t, s }) => (
                <div key={t} className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gold-50 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-gold-600" />
                  </div>
                  <div>
                    <p className="text-[12px] font-bold text-gray-800 leading-tight">{t}</p>
                    <p className="text-[11px] text-gray-400 leading-tight mt-0.5">{s}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* dashboard preview */}
          <div className="relative">
            <div className="absolute -top-8 -right-8 w-72 h-72 rounded-full bg-brand-200/30 blur-3xl -z-10" />
            <div className="absolute -bottom-10 -left-10 w-64 h-64 rounded-full bg-gold-200/30 blur-3xl -z-10" />
            <div className="bg-white rounded-3xl shadow-2xl shadow-brand-900/10 border border-sandstone/60 p-3 flex gap-3">
              {/* mini sidebar */}
              <div className="w-[88px] rounded-2xl bg-brand-600 p-3 hidden sm:flex flex-col gap-3 shrink-0">
                <div className="flex items-center gap-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo-mark-light.png" alt="" className="w-5 h-5" />
                </div>
                {['Dashboard', 'Bookings', 'Marketplace', 'Social Hub', 'Finance', 'Reports', 'Messages', 'Settings'].map((x, i) => (
                  <div key={x} className={`text-[8px] font-medium rounded-md px-1.5 py-1.5 ${i === 0 ? 'bg-white/15 text-white' : 'text-white/55'}`}>{x}</div>
                ))}
              </div>
              {/* content */}
              <div className="flex-1 min-w-0 p-2">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-heading font-bold text-gray-900 text-sm">Dashboard</p>
                  <div className="flex items-center gap-2 text-gray-300">
                    <Search className="h-3.5 w-3.5" /><Bell className="h-3.5 w-3.5" /><Mail className="h-3.5 w-3.5" />
                    <div className="w-5 h-5 rounded-full bg-brand-100" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[['Total Bookings', '1,248', '+18.2%'], ['Total Revenue', '2.85M', '+16.7%'], ['Active Users', '4.29M', '+21.3%'], ['Completion', '96%', '+8.4%']].map(([l, v, d]) => (
                    <div key={l} className="rounded-xl border border-sandstone/60 bg-ivory/40 px-2 py-2">
                      <p className="text-[6.5px] font-semibold text-gray-400 truncate">{l}</p>
                      <p className="text-[12px] font-bold text-gray-900 leading-tight mt-0.5">{v}</p>
                      <p className="text-[6.5px] font-bold text-brand-500">{d}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-sandstone/60 p-2">
                    <p className="text-[7px] font-semibold text-gray-400 mb-1">Bookings Overview</p>
                    <MiniLine />
                  </div>
                  <div className="rounded-xl border border-sandstone/60 p-2 flex flex-col">
                    <p className="text-[7px] font-semibold text-gray-400 mb-1">By Status</p>
                    <div className="flex items-center gap-2">
                      <MiniDonut />
                      <div className="space-y-1">
                        {[['#0F3D37', 'Confirmed'], ['#C8A96B', 'Pending'], ['#B54747', 'Cancelled'], ['#2563EB', 'On Hold']].map(([c, l]) => (
                          <div key={l} className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
                            <span className="text-[6.5px] text-gray-500">{l}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── SERVICE CARDS ─── */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8 pb-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {SERVICES.map(({ Icon, title, desc, metric, value, delta }) => (
            <div key={title} className="bg-white rounded-2xl border border-sandstone/60 p-4 hover:shadow-lg hover:shadow-brand-900/5 transition-all">
              <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center mb-3">
                <Icon className="h-5 w-5 text-brand-600" />
              </div>
              <p className="font-heading font-bold text-[13px] text-gray-900 leading-tight">{title}</p>
              <p className="text-[11px] text-gray-500 mt-1 leading-snug">{desc}</p>
              <div className="mt-3 pt-3 border-t border-sandstone/50">
                <p className="text-[10px] text-gray-400">{metric}</p>
                <div className="flex items-end justify-between mt-0.5">
                  <p className="text-[15px] font-bold text-gray-900">{value}</p>
                  <Sparkline />
                </div>
                <p className="text-[10px] font-bold text-brand-500 mt-0.5">{delta}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FEATURE SHOWCASE ─── */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8 pb-16">
        <div className="grid md:grid-cols-2 gap-4">
          {SHOWCASE.map(({ tag, Icon, title, desc, link, href }) => (
            <div key={tag} className="bg-white rounded-2xl border border-sandstone/60 p-6 flex items-center gap-6 hover:shadow-lg hover:shadow-brand-900/5 transition-all">
              <div className="flex-1">
                <span className="text-[9.5px] font-bold tracking-[0.16em] text-gold-600 bg-gold-50 px-2 py-1 rounded-md">{tag}</span>
                <p className="font-heading font-bold text-lg text-gray-900 mt-3">{title}</p>
                <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">{desc}</p>
                <Link href={href} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-600 mt-4 hover:gap-2.5 transition-all">
                  {link} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shrink-0">
                <Icon className="h-10 w-10 text-white/90" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── MOBILE APP ─── */}
      <section className="bg-white border-y border-sandstone/60 py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="text-[10.5px] font-bold tracking-[0.16em] text-gold-600 bg-gold-50 px-2.5 py-1 rounded-md">MOBILE APP</span>
            <h2 className="font-heading text-4xl font-extrabold text-brand-600 mt-4 leading-tight">Your journey.<br />In your pocket.</h2>
            <p className="text-[15px] text-gray-600 mt-4 max-w-md leading-relaxed">
              Plan, book and manage your Umrah experience anytime, anywhere.
            </p>
            {/* FIX-08: store listings not live yet — badges marked "coming soon"
                rather than looking like working buttons. */}
            <div className="mt-6 flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-2 bg-brand-700/60 text-white/90 px-4 py-2.5 rounded-xl text-sm font-semibold cursor-default" title="Coming soon">
                App Store <span className="text-[10px] font-normal text-gold-300">Soon</span>
              </span>
              <span className="inline-flex items-center gap-2 bg-brand-700/60 text-white/90 px-4 py-2.5 rounded-xl text-sm font-semibold cursor-default" title="Coming soon">
                Google Play <span className="text-[10px] font-normal text-gold-300">Soon</span>
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {APP_FEATURES.map(({ Icon, t, s }) => (
              <div key={t} className="bg-ivory rounded-2xl border border-sandstone/60 p-4 text-center">
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center mx-auto mb-2.5">
                  <Icon className="h-5 w-5 text-brand-600" />
                </div>
                <p className="text-[12px] font-bold text-gray-800">{t}</p>
                <p className="text-[10px] text-gray-400 mt-1 leading-snug">{s}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
