'use client';

import { useState } from 'react';
import {
  Heart, MessageCircle, Share2, Bookmark, MoreHorizontal,
  BadgeCheck, Send, Image, FileText, Tag, Globe, Lock,
  Users, Rss, TrendingUp, Star, Bell,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────

type PostType = 'UPDATE' | 'OFFER' | 'GUIDELINE' | 'QUESTION' | 'PARTNERSHIP' | 'STORY' | 'EVENT';

interface Post {
  id: string;
  type: PostType;
  author: {
    name: string;
    handle: string;
    avatarInitials: string;
    accountType: string;
    isVerified: boolean;
    country: string;
  };
  body?: string;
  structuredData?: Record<string, any>;
  tags: string[];
  likeCount: number;
  commentCount: number;
  shareCount: number;
  isLiked: boolean;
  isSaved: boolean;
  createdAt: string;
  language: string;
}

// ── Mock data ──────────────────────────────────────────────────────

const MOCK_POSTS: Post[] = [
  {
    id: '1',
    type: 'OFFER',
    author: { name: 'Makkah Palace Hotel', handle: 'makkahpalace', avatarInitials: 'MP', accountType: 'VENDOR_HOTEL', isVerified: true, country: 'SA' },
    body: undefined,
    structuredData: {
      vendorType: 'hotel',
      serviceDescription: 'Deluxe Double Room — 200m from Haram Gate 3',
      price: 'SAR 850 / night',
      validFrom: '2026-05-01',
      validUntil: '2026-06-30',
      eligibleMarkets: ['ID', 'PK', 'MY', 'NG'],
      contactCta: 'WhatsApp: +966501234567',
    },
    tags: ['makkah', 'hotel', 'ramadan', 'allotment'],
    likeCount: 24, commentCount: 7, shareCount: 12,
    isLiked: false, isSaved: true,
    createdAt: '2h ago', language: 'en',
  },
  {
    id: '2',
    type: 'GUIDELINE',
    author: { name: 'Nusuk Masar', handle: 'nusuk_official', avatarInitials: 'NK', accountType: 'OPERATOR', isVerified: true, country: 'SA' },
    body: 'Important update: All Umrah operators must complete digital health declaration submission through SISKOPATUH before pilgrim departure, effective 1 June 2026. Non-compliance will result in visa issuance delays. Please update your workflow accordingly.',
    structuredData: { source: 'regulator', sourceLabel: 'Nusuk Masar — Official' },
    tags: ['visa', 'health-declaration', 'SISKOPATUH', 'compliance'],
    likeCount: 156, commentCount: 43, shareCount: 89,
    isLiked: true, isSaved: true,
    createdAt: '4h ago', language: 'en',
  },
  {
    id: '3',
    type: 'QUESTION',
    author: { name: 'Pak Hendra Wijaya', handle: 'hendra_ppiu', avatarInitials: 'HW', accountType: 'OPERATOR', isVerified: true, country: 'ID' },
    body: 'Kepada rekan-rekan PPIU: apakah ada yang sudah berhasil submit batch SISKOPATUH dengan format baru (v2.4.1)? Kami mendapat error pada field NPU_batch_reference. Mohon share pengalaman.',
    structuredData: { topicTags: ['siskopatuh', 'npU', 'batch-submission'] },
    tags: ['siskopatuh', 'indonesia', 'PPIU'],
    likeCount: 8, commentCount: 14, shareCount: 3,
    isLiked: false, isSaved: false,
    createdAt: '6h ago', language: 'id',
  },
  {
    id: '4',
    type: 'PARTNERSHIP',
    author: { name: 'Dawn Travels Pakistan', handle: 'dawntravels', avatarInitials: 'DT', accountType: 'OPERATOR', isVerified: true, country: 'PK' },
    body: undefined,
    structuredData: {
      lookingFor: 'Saudi mu\'assasa partner for 2026 Hajj season',
      offering: '800 confirmed Pakistani pilgrims, all visa-ready, Hajj season 1446',
      region: 'KSA',
      urgency: 'HIGH',
    },
    tags: ['partnership', 'hajj', 'pakistan', 'mu-assasa'],
    likeCount: 31, commentCount: 9, shareCount: 5,
    isLiked: false, isSaved: false,
    createdAt: '1d ago', language: 'en',
  },
  {
    id: '5',
    type: 'UPDATE',
    author: { name: 'Ustaz Khaled Al-Ghamdi', handle: 'khaled_mutawif', avatarInitials: 'KG', accountType: 'MUTAWIF', isVerified: true, country: 'SA' },
    body: 'Alhamdulillah — completed my 14th consecutive Hajj season as mutawif. This year I guided 85 pilgrims from Malaysia and Nigeria. Availability for Umrah groups: Jun–Aug 2026. Languages: Arabic, English, Bahasa Malaysia. 22 years experience. DM for rates.',
    structuredData: undefined,
    tags: ['mutawif', 'guide', 'hajj', 'availability'],
    likeCount: 47, commentCount: 12, shareCount: 8,
    isLiked: true, isSaved: false,
    createdAt: '2d ago', language: 'en',
  },
];

const POST_TYPE_CONFIG: Record<PostType, { label: string; color: string; bg: string }> = {
  UPDATE: { label: 'Update', color: 'text-gray-600', bg: 'bg-gray-100' },
  OFFER: { label: 'Offer', color: 'text-brand-700', bg: 'bg-brand-100' },
  GUIDELINE: { label: 'Guideline', color: 'text-blue-700', bg: 'bg-blue-100' },
  QUESTION: { label: 'Question', color: 'text-purple-700', bg: 'bg-purple-100' },
  PARTNERSHIP: { label: 'Partnership', color: 'text-green-700', bg: 'bg-green-100' },
  STORY: { label: 'Story', color: 'text-pink-700', bg: 'bg-pink-100' },
  EVENT: { label: 'Event', color: 'text-orange-700', bg: 'bg-orange-100' },
};

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  OPERATOR: 'Operator',
  SUB_AGENT: 'Sub-agent',
  VENDOR_HOTEL: 'Hotel',
  VENDOR_TRANSPORT: 'Transport',
  MUTAWIF: 'Mutawif',
  VISA_PROCESSOR: 'Visa Agent',
  PILGRIM: 'Pilgrim',
};

// ── Post Card ──────────────────────────────────────────────────────

function PostCard({ post }: { post: Post }) {
  const [liked, setLiked] = useState(post.isLiked);
  const [saved, setSaved] = useState(post.isSaved);
  const typeCfg = POST_TYPE_CONFIG[post.type];

  return (
    <article className="bg-white rounded-xl border border-border p-5 space-y-4">
      {/* Author row */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold text-sm shrink-0">
            {post.author.avatarInitials}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold">{post.author.name}</span>
              {post.author.isVerified && (
                <BadgeCheck className="h-4 w-4 text-blue-500" />
              )}
              <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded-full">
                {ACCOUNT_TYPE_LABEL[post.author.accountType] ?? post.author.accountType}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-muted-foreground">@{post.author.handle}</span>
              <span className="text-muted-foreground text-xs">·</span>
              <span className="text-xs text-muted-foreground">{post.createdAt}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', typeCfg.bg, typeCfg.color)}>
            {typeCfg.label}
          </span>
          <button className="p-1 hover:bg-muted rounded-md transition-colors">
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Guideline source badge */}
      {post.type === 'GUIDELINE' && post.structuredData?.sourceLabel && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-100">
          <BadgeCheck className="h-4 w-4 text-blue-600 shrink-0" />
          <span className="text-xs font-medium text-blue-700">{post.structuredData.sourceLabel}</span>
        </div>
      )}

      {/* Post body */}
      {post.body && (
        <p
          className={cn('text-sm leading-relaxed', post.language === 'ar' || post.language === 'ur' ? 'text-right font-arabic' : '')}
          dir={post.language === 'ar' || post.language === 'ur' ? 'rtl' : 'ltr'}
        >
          {post.body}
        </p>
      )}

      {/* Post media (real image when present) */}
      {(() => {
        const img = (post as any).imageUrl ?? (Array.isArray((post as any).mediaUrls) ? (post as any).mediaUrls[0] : undefined);
        if (!img) return null;
        return (
          <div className="rounded-xl overflow-hidden border border-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} alt="" className="w-full max-h-96 object-cover" />
          </div>
        );
      })()}

      {/* Offer structured card */}
      {post.type === 'OFFER' && post.structuredData && (
        <div className="border border-brand-200 bg-brand-50/50 rounded-lg p-4 space-y-2">
          <p className="text-sm font-semibold text-brand-800">{post.structuredData.serviceDescription}</p>
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-brand-700">{post.structuredData.price}</span>
            <span className="text-xs text-muted-foreground">
              Valid until {post.structuredData.validUntil}
            </span>
          </div>
          {post.structuredData.eligibleMarkets && (
            <div className="flex gap-1 flex-wrap">
              {post.structuredData.eligibleMarkets.map((m: string) => (
                <span key={m} className="text-xs px-2 py-0.5 bg-white border border-brand-200 rounded-full text-brand-600">
                  {m}
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{post.structuredData.contactCta}</p>
          <button className="w-full mt-1 py-1.5 bg-brand-500 text-white text-sm font-medium rounded-md hover:bg-brand-600 transition-colors">
            Request Quote
          </button>
        </div>
      )}

      {/* Partnership structured card */}
      {post.type === 'PARTNERSHIP' && post.structuredData && (
        <div className="border border-green-200 bg-green-50/50 rounded-lg p-4 space-y-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Looking for</p>
            <p className="text-sm text-foreground mt-0.5">{post.structuredData.lookingFor}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Offering</p>
            <p className="text-sm text-foreground mt-0.5">{post.structuredData.offering}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
              {post.structuredData.region}
            </span>
            {post.structuredData.urgency === 'HIGH' && (
              <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                Urgent
              </span>
            )}
          </div>
          <button className="w-full py-1.5 border border-green-500 text-green-700 text-sm font-medium rounded-md hover:bg-green-50 transition-colors">
            Send Partnership Request
          </button>
        </div>
      )}

      {/* Tags */}
      {post.tags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {post.tags.map((tag) => (
            <span key={tag} className="text-xs text-brand-600 hover:text-brand-700 cursor-pointer">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-1 border-t border-border">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setLiked(!liked)}
            className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors', liked ? 'text-red-600 bg-red-50' : 'text-muted-foreground hover:bg-muted')}
          >
            <Heart className={cn('h-4 w-4', liked && 'fill-current')} />
            {post.likeCount + (liked && !post.isLiked ? 1 : !liked && post.isLiked ? -1 : 0)}
          </button>
          <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
            <MessageCircle className="h-4 w-4" />
            {post.commentCount}
          </button>
          <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Share2 className="h-4 w-4" />
            {post.shareCount}
          </button>
        </div>
        <button
          onClick={() => setSaved(!saved)}
          className={cn('p-1.5 rounded-md transition-colors', saved ? 'text-brand-600 bg-brand-50' : 'text-muted-foreground hover:bg-muted')}
        >
          <Bookmark className={cn('h-4 w-4', saved && 'fill-current')} />
        </button>
      </div>
    </article>
  );
}

// ── Compose Post ───────────────────────────────────────────────────

function ComposePost() {
  const [body, setBody] = useState('');
  const [selectedType, setSelectedType] = useState<PostType>('UPDATE');

  return (
    <div className="bg-white rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-brand-500 text-white flex items-center justify-center font-semibold text-sm shrink-0">
          AS
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share an update, offer, guideline, or question with the Umrah community..."
          className="flex-1 text-sm bg-transparent outline-none resize-none min-h-[60px] placeholder:text-muted-foreground"
          rows={2}
        />
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3">
        {/* Post type selector */}
        <div className="flex gap-1 flex-wrap">
          {(['UPDATE', 'OFFER', 'GUIDELINE', 'QUESTION', 'PARTNERSHIP'] as PostType[]).map((t) => (
            <button
              key={t}
              onClick={() => setSelectedType(t)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-full border transition-colors',
                selectedType === t
                  ? `${POST_TYPE_CONFIG[t].bg} ${POST_TYPE_CONFIG[t].color} border-transparent`
                  : 'border-border text-muted-foreground hover:border-foreground',
              )}
            >
              {POST_TYPE_CONFIG[t].label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button className="p-1.5 hover:bg-muted rounded-md transition-colors">
            <Image className="h-4 w-4 text-muted-foreground" />
          </button>
          <button className="p-1.5 hover:bg-muted rounded-md transition-colors">
            <Tag className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            disabled={!body.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 text-white text-sm font-medium rounded-md hover:bg-brand-600 disabled:opacity-40 transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
            Post
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────

function FeedSidebar() {
  return (
    <div className="space-y-4">
      {/* Trending tags */}
      <div className="bg-white rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold">Trending</h3>
        </div>
        <div className="space-y-2">
          {['#ramadan2026', '#siskopatuh', '#makkahhotel', '#hajjpartnership', '#mutawif'].map((tag, i) => (
            <div key={tag} className="flex items-center justify-between">
              <span className="text-sm text-brand-600 hover:text-brand-700 cursor-pointer">{tag}</span>
              <span className="text-xs text-muted-foreground">{[89, 67, 54, 41, 33][i]} posts</span>
            </div>
          ))}
        </div>
      </div>

      {/* Verified operators to follow */}
      <div className="bg-white rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold">Suggested to Follow</h3>
        </div>
        <div className="space-y-3">
          {[
            { name: 'Al-Haramain Services', type: 'Mu\'assasa · KSA', initials: 'AH' },
            { name: 'Maktour Indonesia', type: 'PPIU · Indonesia', initials: 'MI' },
            { name: 'Al-Noor Travels', type: 'Operator · Pakistan', initials: 'AN' },
          ].map((account) => (
            <div key={account.name} className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold shrink-0">
                {account.initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{account.name}</p>
                <p className="text-xs text-muted-foreground">{account.type}</p>
              </div>
              <button className="text-xs px-2 py-1 border border-brand-300 text-brand-600 rounded-full hover:bg-brand-50 transition-colors shrink-0">
                Follow
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Regulator updates */}
      <div className="bg-blue-50 rounded-xl border border-blue-100 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bell className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-blue-800">Regulator Notices</h3>
        </div>
        <div className="space-y-2">
          <p className="text-xs text-blue-700 font-medium">SISKOPATUH v2.4.1 live — format changes apply from 1 Jun 2026</p>
          <p className="text-xs text-blue-600">Nusuk: Hajj quota 2026 allocations finalized</p>
        </div>
      </div>
    </div>
  );
}

// ── Main Feed ──────────────────────────────────────────────────────

const FEED_FILTERS = ['For You', 'Offers', 'Guidelines', 'Questions', 'Partnerships'];

export function SocialFeed() {
  const [activeFilter, setActiveFilter] = useState('For You');

  const filteredPosts = MOCK_POSTS.filter((p) => {
    if (activeFilter === 'For You') return true;
    if (activeFilter === 'Offers') return p.type === 'OFFER';
    if (activeFilter === 'Guidelines') return p.type === 'GUIDELINE';
    if (activeFilter === 'Questions') return p.type === 'QUESTION';
    if (activeFilter === 'Partnerships') return p.type === 'PARTNERSHIP';
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Rss className="h-5 w-5 text-brand-500" />
            Social Feed
          </h1>
          <p className="text-sm text-muted-foreground">
            Connect with operators, vendors, mutawifs, and pilgrims globally
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Globe className="h-3.5 w-3.5" />
          <span>Showing verified operators only</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Main column */}
        <div className="xl:col-span-2 space-y-4">
          {/* Compose */}
          <ComposePost />

          {/* Feed filter tabs */}
          <div className="flex gap-1 border-b border-border pb-2">
            {FEED_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={cn(
                  'text-sm px-3 py-1.5 rounded-md transition-colors',
                  activeFilter === f
                    ? 'bg-brand-50 text-brand-700 font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Posts */}
          <div className="space-y-3">
            {filteredPosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="hidden xl:block">
          <FeedSidebar />
        </div>
      </div>
    </div>
  );
}
