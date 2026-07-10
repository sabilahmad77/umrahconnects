import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock, ArrowRight } from 'lucide-react';
import { PublicShell, CTASection } from '@/components/public/public-chrome';
import { ARTICLES, getArticle } from '@/lib/articles';

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const a = getArticle(params.slug);
  return { title: a ? `${a.title} — Umrah Connect` : 'Resources — Umrah Connect' };
}

export default function ArticlePage({ params }: { params: { slug: string } }) {
  const article = getArticle(params.slug);
  if (!article) notFound();

  const related = ARTICLES.filter((a) => a.slug !== article.slug).slice(0, 3);

  return (
    <PublicShell>
      <article className="max-w-3xl mx-auto px-6 lg:px-8 pt-12 pb-12">
        <Link href="/resources" className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-brand-600 mb-6">
          <ArrowLeft className="h-4 w-4" /> All resources
        </Link>
        <span className="block text-[10.5px] font-bold tracking-[0.16em] text-gold-600 bg-gold-50 px-2.5 py-1 rounded-md w-fit">
          {article.category.toUpperCase()}
        </span>
        <h1 className="font-heading text-3xl lg:text-[40px] font-extrabold text-brand-600 leading-tight mt-4">{article.title}</h1>
        <p className="flex items-center gap-1.5 text-[12px] text-gray-500 mt-3">
          <Clock className="h-3.5 w-3.5" /> {article.minutes} min read · Umrah Connect team
        </p>
        <p className="text-[16px] text-gray-700 leading-relaxed mt-6 border-l-2 border-gold-400 pl-4">{article.intro}</p>

        <div className="mt-8 space-y-8">
          {article.sections.map((s) => (
            <section key={s.h}>
              <h2 className="font-heading font-bold text-xl text-gray-900">{s.h}</h2>
              {s.p.map((para, i) => (
                <p key={i} className="text-[15px] text-gray-700 leading-relaxed mt-3">{para}</p>
              ))}
            </section>
          ))}
        </div>
      </article>

      <section className="max-w-3xl mx-auto px-6 lg:px-8 pb-12">
        <h3 className="font-heading font-bold text-lg text-gray-900 mb-4">Keep reading</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          {related.map((r) => (
            <Link key={r.slug} href={`/resources/${r.slug}`} className="bg-white rounded-2xl border border-sandstone/60 p-4 hover:shadow-lg hover:shadow-brand-900/5 transition-all group">
              <span className="text-[9.5px] font-bold tracking-wider text-gold-600">{r.category.toUpperCase()}</span>
              <p className="font-heading font-bold text-[13.5px] text-gray-900 mt-2 leading-snug group-hover:text-brand-600 transition-colors">{r.title}</p>
              <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-600 mt-2">Read <ArrowRight className="h-3 w-3" /></span>
            </Link>
          ))}
        </div>
      </section>
      <CTASection />
    </PublicShell>
  );
}
