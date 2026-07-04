'use client';

import { useState } from 'react';
import { Loader2, CheckCircle2, Send } from 'lucide-react';
import { apiClient } from '@/lib/api';

type Field = 'name' | 'email' | 'phone' | 'company' | 'subject' | 'message';

export function InquiryForm({
  type,
  fields = ['name', 'email', 'message'],
  cta = 'Send message',
  metadata,
  successText = 'Thank you — your message has been received. Our team will get back to you shortly.',
}: {
  type: 'CONTACT' | 'PARTNER' | 'CAREERS' | 'DEMO' | 'SUPPORT';
  fields?: Field[];
  cta?: string;
  metadata?: Record<string, unknown>;
  successText?: string;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setError('');
    if (!form.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) {
      setError('Please enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      await apiClient.post('/inquiries', { type, ...form, metadata });
      setDone(true);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="bg-white rounded-2xl border border-sandstone/60 p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="h-6 w-6 text-brand-600" />
        </div>
        <p className="font-heading font-bold text-lg text-gray-900">Message sent</p>
        <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">{successText}</p>
      </div>
    );
  }

  const LABELS: Record<Field, string> = {
    name: 'Full name', email: 'Email address', phone: 'Phone number',
    company: 'Company / organization', subject: 'Subject', message: 'Message',
  };

  return (
    <div className="bg-white rounded-2xl border border-sandstone/60 p-6 sm:p-8">
      <div className="space-y-4">
        {fields.map((f) => (
          <div key={f}>
            <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">{LABELS[f]}</label>
            {f === 'message' ? (
              <textarea
                rows={4} value={form[f] ?? ''} onChange={(e) => set(f, e.target.value)}
                placeholder={`Tell us how we can help…`}
                className="w-full text-sm px-3.5 py-2.5 border border-sandstone rounded-xl outline-none focus:border-brand-400 resize-none"
              />
            ) : (
              <input
                type={f === 'email' ? 'email' : f === 'phone' ? 'tel' : 'text'}
                value={form[f] ?? ''} onChange={(e) => set(f, e.target.value)}
                className="w-full text-sm px-3.5 py-2.5 border border-sandstone rounded-xl outline-none focus:border-brand-400"
              />
            )}
          </div>
        ))}
        {error && <p className="text-[13px] text-red-500">{error}</p>}
        <button
          onClick={submit} disabled={busy}
          className="w-full inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm py-3 rounded-xl transition-colors disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {cta}
        </button>
      </div>
    </div>
  );
}
