'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { AlertCircle, Inbox, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const controlClass = 'uc-control';
export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; busy?: boolean }>(function Button({ variant = 'primary', busy, className, children, disabled, type = 'button', ...props }, ref) {
  const iconOnly = React.isValidElement(children) && typeof children.type !== 'string';
  // A busy button is disabled so the action cannot be submitted twice. The
  // browser then moves focus to the document (HTML focus fixup), which leaves
  // a keyboard or screen-reader user nowhere: WCAG 2.4.3. Remember that this
  // button had focus and take it back when the action finishes (unless the
  // page moved focus somewhere else meanwhile).
  const node = React.useRef<HTMLButtonElement | null>(null);
  const hadFocus = React.useRef(false);
  const wasBusy = React.useRef(false);
  if (busy && !wasBusy.current && typeof document !== 'undefined' && node.current && document.activeElement === node.current) hadFocus.current = true;
  wasBusy.current = !!busy;
  React.useEffect(() => {
    if (busy || !hadFocus.current) return;
    hadFocus.current = false;
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (node.current && (!active || active === document.body)) node.current.focus();
  }, [busy]);
  const assign = (element: HTMLButtonElement | null) => {
    node.current = element;
    if (typeof ref === 'function') ref(element);
    else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = element;
  };
  return <button ref={assign} type={type} disabled={disabled || busy} aria-busy={busy || undefined} className={cn('uc-button', `uc-button-${variant}`, iconOnly && 'px-3', className)} {...props}>{busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}{children}</button>;
});
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) { return <input ref={ref} className={cn(controlClass, className)} {...props} />; });
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) { return <textarea ref={ref} className={cn(controlClass, 'min-h-28', className)} {...props} />; });
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) { return <select ref={ref} className={cn(controlClass, className)} {...props} />; });
export function Checkbox(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...props} type="checkbox" className={cn('h-5 w-5 accent-brand-500', props.className)} />; }
export function Radio(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...props} type="radio" className={cn('h-5 w-5 accent-brand-500', props.className)} />; }
export function Switch({ label, ...props }: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> & { label: string }) { return <label className="flex items-center justify-between gap-4"><span>{label}</span><SwitchPrimitive.Root {...props} className="relative h-6 w-11 rounded-full bg-gray-500 data-[state=checked]:bg-brand-500 disabled:opacity-50"><SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-5" /></SwitchPrimitive.Root></label>; }
export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) { return <span className={cn('inline-flex rounded-md border px-2 py-1 text-xs font-medium', { neutral: 'border-gray-200 bg-gray-50 text-gray-700', success: 'border-brand-200 bg-brand-50 text-brand-700', warning: 'border-amber-200 bg-amber-50 text-amber-900', danger: 'border-red-200 bg-red-50 text-red-700' }[tone])}>{children}</span>; }
export const StatusDisplay = Badge;
export function Avatar({ name, url }: { name: string; url?: string }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [url]);
  const usable = url && (/^https?:\/\//.test(url) || url.startsWith('/') && !url.startsWith('//'));
  if (usable && !failed) return <Image unoptimized loading="lazy" src={url} alt={name} width={40} height={40} sizes="40px" onError={() => setFailed(true)} className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  return <span aria-label={name} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">{name.split(' ').map(part => part[0]).filter(Boolean).join('').slice(0, 2)}</span>;
}
export function Tooltip({ label, children }: { label: string; children: React.ReactElement }) { return <TooltipPrimitive.Provider><TooltipPrimitive.Root><TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger><TooltipPrimitive.Portal><TooltipPrimitive.Content sideOffset={6} className="z-[100] rounded-md bg-midnight px-3 py-2 text-xs text-white">{label}</TooltipPrimitive.Content></TooltipPrimitive.Portal></TooltipPrimitive.Root></TooltipPrimitive.Provider>; }
export function Alert({ title, children, tone = 'error' }: { title: string; children?: React.ReactNode; tone?: 'error' | 'info' }) { return <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-lg border p-4 text-sm', tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-brand-200 bg-brand-50 text-brand-800')}><p className="font-semibold">{title}</p>{children && <div className="mt-1">{children}</div>}</div>; }
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('uc-card', className)} {...props} />; }
export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) { return <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-[28px]">{title}</h1>{description && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-600">{description}</p>}</div>{action}</div>; }
export function FormSection({ title, children }: { title: string; children: React.ReactNode }) { return <fieldset className="space-y-4"><legend className="mb-4 text-base font-semibold">{title}</legend>{children}</fieldset>; }
export function StatBlock({ label, value, description }: { label: string; value?: string | number; description?: string }) { return <Card><p className="text-sm text-gray-600">{label}</p><p className="mt-2 break-words text-2xl font-semibold tabular-nums">{value ?? '—'}</p><p className="mt-1 text-xs text-gray-600">{description ?? (value == null ? 'Data unavailable' : '')}</p></Card>; }
export function Skeleton({ className }: { className?: string }) { return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-gray-100', className)} />; }
export function LoadingState({ label = 'Loading…' }: { label?: string }) { return <div role="status" className="flex items-center justify-center gap-3 p-8 text-sm text-gray-600"><Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />{label}</div>; }
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) { return <div className="flex flex-col items-center gap-3 px-4 py-10 text-center"><Inbox aria-hidden="true" className="h-7 w-7 text-gray-600" /><p className="text-sm font-semibold text-gray-800">{title}</p>{description && <p className="max-w-md text-sm text-gray-600">{description}</p>}{action}</div>; }
export function ErrorState({ title = 'Unable to load this information', description = 'Try again. If the problem continues, contact support.', onRetry }: { title?: string; description?: string; onRetry?: () => void }) { return <Alert title={title}><div className="flex flex-wrap items-center justify-between gap-3"><p>{description}</p>{onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}</div></Alert>; }
export function DataTable({ label, children }: { label: string; children: React.ReactNode }) { return <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto rounded-lg border border-gray-200"><table className="w-full text-left text-sm">{children}</table></div>; }
export function FilterBar({ children }: { children: React.ReactNode }) { return <div className="flex flex-wrap items-end gap-3">{children}</div>; }
export function Search({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { return <Input {...props} type="search" aria-label={label} placeholder={props.placeholder ?? label} />; }
export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) { return <nav aria-label="Pagination" className="flex flex-wrap items-center justify-end gap-3"><Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button><span aria-live="polite" className="text-sm">Page {page} of {Math.max(1, pages)}</span><Button variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</Button></nav>; }
export function FileUpload({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { const id = React.useId(); return <label htmlFor={id} className="block space-y-2 text-sm font-medium"><span>{label}</span><Input {...props} id={id} type="file" /></label>; }
export const Tabs = TabsPrimitive.Root;
export const TabsList = TabsPrimitive.List;
export const TabsTrigger = TabsPrimitive.Trigger;
export const TabsContent = TabsPrimitive.Content;
export function Dialog({ open, onOpenChange, title, description, children, drawer = false }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: React.ReactNode; drawer?: boolean }) { const previousFocus = React.useRef<HTMLElement | null>(null); const wasOpen = React.useRef(false); if (open && !wasOpen.current && typeof document !== 'undefined') previousFocus.current = document.activeElement as HTMLElement; wasOpen.current = open; return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-midnight/40" /><DialogPrimitive.Content onCloseAutoFocus={event => { event.preventDefault(); previousFocus.current?.focus(); }} {...(description ? {} : { 'aria-describedby': undefined })} className={cn('fixed z-50 overflow-y-auto bg-white p-5 shadow-xl outline-none', drawer ? 'inset-y-0 left-0 w-[min(320px,90vw)]' : 'left-1/2 top-1/2 max-h-[90dvh] w-[calc(100%_-_32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl sm:p-6')}><div className="mb-5 flex items-start justify-between gap-3"><div><DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>{description && <DialogPrimitive.Description className="mt-1 text-sm text-gray-600">{description}</DialogPrimitive.Description>}</div><DialogPrimitive.Close asChild><Button variant="quiet" aria-label="Close dialog"><X aria-hidden="true" className="h-5 w-5" /></Button></DialogPrimitive.Close></div>{children}</DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>; }
export function Drawer(props: Omit<React.ComponentProps<typeof Dialog>, 'drawer'>) { return <Dialog {...props} drawer />; }

/** Adapter for existing domain forms while their layouts migrate to the shared system. */
export function ModalSurface({ title, onClose, children, busy = false }: { title: string; onClose: () => void; children: React.ReactNode; busy?: boolean }) {
  const previousFocus = React.useRef<HTMLElement | null>(typeof document === 'undefined' ? null : document.activeElement as HTMLElement);
  return <DialogPrimitive.Root open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-midnight/40" /><DialogPrimitive.Content aria-describedby={undefined} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onCloseAutoFocus={event => { event.preventDefault(); previousFocus.current?.focus(); }} onClick={event => { if (!busy && event.target === event.currentTarget) onClose(); }} className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 sm:p-5"><DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>{children}</DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>;
}

export function QueryFailure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const status = (error as { response?: { status?: number } })?.response?.status;
  const title = status === 403 ? 'Permission required' : status === 404 ? 'Information unavailable' : 'Unable to load this information';
  const description = status === 403 ? 'Your account does not have access to this information. Contact your workspace administrator.' : status === 404 ? 'The record or service is unavailable. Check the link or contact support.' : 'The service could not return this information. Try again; unavailable data is not an empty result.';
  return <ErrorState title={title} description={description} onRetry={onRetry} />;
}

export function FieldInput({ label, value, onChange, full, type = 'text', placeholder }: { label: string; value: string; onChange: (value: string) => void; full?: boolean; type?: string; placeholder?: string }) {
  const id = React.useId();
  return <div className={full ? 'col-span-2' : undefined}><label htmlFor={id} className="mb-2 block text-sm font-medium text-gray-700">{label}</label><Input id={id} type={type} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} /></div>;
}
export function LinkedStatBlock({ label, value, sub, icon: Icon, color, href }: { label: string; value: React.ReactNode; sub?: string; icon: React.ElementType; color: string; href: string }) {
  return <Link href={href} className="uc-card block transition-colors hover:border-brand-300"><span className={cn('mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg', color)}><Icon aria-hidden="true" className="h-5 w-5" /></span><span className="block break-words text-2xl font-semibold tabular-nums text-gray-900">{value ?? '—'}</span><span className="mt-2 block text-sm text-gray-600">{label}</span>{sub && <span className="mt-1 block text-xs text-gray-600">{sub}</span>}</Link>;
}
export function CountTile({ label, value, dot }: { label: string; value: number; dot: string }) { return <Card><p className="flex items-center gap-2 text-sm text-gray-600"><span aria-hidden="true" className={cn('h-2 w-2 rounded-full', dot)} />{label}</p><p className="mt-3 text-xl font-semibold tabular-nums">{value ?? '—'}</p></Card>; }
