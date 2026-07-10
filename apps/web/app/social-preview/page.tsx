'use client';

import Link from 'next/link';
import { Lock, Heart, MessageCircle, Share2, Users2, TrendingUp, BadgeCheck, Flame, Calendar } from 'lucide-react';
import { PublicHeader, PublicFooter } from '@/components/public/public-chrome';

const POSTS = [
  { author: 'Zamzam Travels', badge: 'Verified Provider', time: '2h', body: 'Alhamdulillah! Another beautiful group has safely arrived in Madinah. May Allah accept everyone\'s Umrah.', likes: 128, comments: 24 },
  { author: 'Umrah First Timers', badge: 'Community Group', time: '5h', body: 'Reminder: the best times to visit the Rawdah are after Fajr and late at night. Plan ahead and be patient with the crowds.', likes: 96, comments: 31 },
  { author: 'Noor Travels', badge: 'Verified Provider', time: '1d', body: 'New Ramadan packages now available — premium hotels within walking distance of the Haram. Limited allotments.', likes: 74, comments: 18 },
];

const TRENDING = ['Best times to visit Rawdah', 'Packing checklist for Umrah', 'Makkah hotel recommendations', 'Transport tips in Saudi Arabia', 'Dua for a blessed journey'];
const GROUPS = [{ n: 'Umrah First Timers', m: '4.2K members' }, { n: 'Madinah Lovers', m: '2.8K members' }, { n: 'Travel Tips & Hacks', m: '3.6K members' }];
const EVENTS = [{ d: 'JUN 25', t: 'Pre-Umrah Briefing', by: 'Zamzam Travels' }, { d: 'JUN 28', t: 'Spiritual Gathering', by: 'Madinah Lovers' }, { d: 'JUL 02', t: 'Q&A with Scholars', by: 'Umrah Connect' }];

function GuardedAction({ children }: { children: React.ReactNode }) {
  return (
    <Link href="/login" className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-brand-600 transition-colors">
      {children}
    </Link>
  );
}

export default function SocialPreviewPage() {
  return (
    <div className="min-h-screen bg-ivory text-gray-900 flex flex-col">
      <PublicHeader />
      <main className="flex-1">
        <div className="bg-brand-600 text-white">
          <div className="max-w-7xl mx-auto px-6 lg:px-8 py-2.5 flex items-center justify-center gap-2 text-[12.5px]">
            <Lock className="h-3.5 w-3.5 text-gold-300" />
            Public community preview. <Link href="/signup" className="font-semibold text-gold-300 hover:underline">Sign up</Link> to post, comment, message, join groups or connect.
          </div>
        </div>

        <section className="max-w-7xl mx-auto px-6 lg:px-8 pt-10 pb-4">
          <span className="inline-flex items-center gap-2 text-[10.5px] font-bold tracking-[0.14em] text-brand-700 bg-brand-50 px-3.5 py-1.5 rounded-full border border-brand-200">SOCIAL HUB</span>
          <h1 className="mt-4 font-heading text-4xl font-extrabold text-brand-600">Connect & Collaborate.</h1>
          <p className="mt-3 text-[15px] text-gray-600 max-w-2xl">A trusted network for pilgrims, operators and providers — public posts, groups, updates and travel discussions.</p>
        </section>

        <section className="max-w-7xl mx-auto px-6 lg:px-8 pb-16 grid lg:grid-cols-3 gap-6">
          {/* Feed */}
          <div className="lg:col-span-2 space-y-4">
            {/* locked composer */}
            <Link href="/login" className="block bg-white rounded-2xl border border-sandstone/60 p-4 hover:border-brand-300 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center"><Lock className="h-4 w-4 text-brand-600" /></div>
                <span className="text-sm text-gray-500">Sign in to share an update with the Umrah community…</span>
              </div>
            </Link>

            {POSTS.map((p) => (
              <div key={p.author} className="bg-white rounded-2xl border border-sandstone/60 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-sm font-bold">{p.author[0]}</div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">{p.author} <BadgeCheck className="h-3.5 w-3.5 text-brand-500" /></p>
                    <p className="text-[11px] text-gray-500">{p.badge} · {p.time}</p>
                  </div>
                </div>
                <p className="text-[14px] text-gray-700 leading-relaxed">{p.body}</p>
                <div className="mt-4 pt-3 border-t border-sandstone/50 flex items-center gap-6">
                  <GuardedAction><Heart className="h-4 w-4" /> {p.likes}</GuardedAction>
                  <GuardedAction><MessageCircle className="h-4 w-4" /> {p.comments}</GuardedAction>
                  <GuardedAction><Share2 className="h-4 w-4" /> Share</GuardedAction>
                </div>
              </div>
            ))}
          </div>

          {/* Right rail */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-sandstone/60 p-5">
              <p className="font-heading font-bold text-gray-900 flex items-center gap-1.5 mb-3"><TrendingUp className="h-4 w-4 text-brand-500" /> Trending Topics</p>
              <ul className="space-y-2.5">
                {TRENDING.map((t) => (
                  <li key={t} className="flex items-center gap-2 text-[13px] text-gray-600"><Flame className="h-3.5 w-3.5 text-gold-500" /> {t}</li>
                ))}
              </ul>
            </div>
            <div className="bg-white rounded-2xl border border-sandstone/60 p-5">
              <p className="font-heading font-bold text-gray-900 flex items-center gap-1.5 mb-3"><Users2 className="h-4 w-4 text-brand-500" /> Popular Groups</p>
              <ul className="space-y-3">
                {GROUPS.map((g) => (
                  <li key={g.n} className="flex items-center justify-between">
                    <div><p className="text-[13px] font-semibold text-gray-800">{g.n}</p><p className="text-[11px] text-gray-500">{g.m}</p></div>
                    <Link href="/login" className="text-[12px] font-semibold text-brand-600 hover:underline">Join</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white rounded-2xl border border-sandstone/60 p-5">
              <p className="font-heading font-bold text-gray-900 flex items-center gap-1.5 mb-3"><Calendar className="h-4 w-4 text-brand-500" /> Upcoming Events</p>
              <ul className="space-y-3">
                {EVENTS.map((e) => (
                  <li key={e.t} className="flex items-center gap-3">
                    <div className="w-11 text-center shrink-0"><p className="text-[10px] font-bold text-gold-600">{e.d.split(' ')[0]}</p><p className="text-sm font-bold text-brand-600">{e.d.split(' ')[1]}</p></div>
                    <div><p className="text-[13px] font-semibold text-gray-800">{e.t}</p><p className="text-[11px] text-gray-500">By {e.by}</p></div>
                  </li>
                ))}
              </ul>
            </div>
            <Link href="/signup" className="block bg-gradient-to-br from-brand-600 to-brand-700 rounded-2xl p-5 text-center text-white">
              <p className="font-heading font-bold">Join the community</p>
              <p className="text-[12px] text-white/75 mt-1">Post, comment, message and connect with the Umrah community.</p>
              <span className="inline-block mt-3 bg-gold-500 text-brand-900 px-4 py-2 rounded-xl font-semibold text-sm">Get Started</span>
            </Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
