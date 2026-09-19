'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ImagePlus, RotateCcw, Star, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/system';
import { apiErrorMessage } from '@/lib/api-error';
import { deleteUploadedImage, uploadImage } from '@/hooks/use-marketplace';
import { IMAGE_MIME_TYPES, imageFileProblem, MAX_LISTING_IMAGES } from '@/components/marketplace/listing-rules';
import { cn } from '@/lib/utils';

interface PendingUpload {
  key: string;
  file: File;
  progress: number;
  status: 'uploading' | 'error';
  error?: string;
}

export interface ImageUploaderProps {
  label: string;
  /** Uploaded image URLs in display order; the first one is the cover. */
  value: string[];
  onChange: (urls: string[]) => void;
  /** URLs already saved on the record. Removing one only detaches it; the orphan cleanup job reclaims it later. */
  savedUrls?: string[];
  max?: number;
  disabled?: boolean;
  /** True while any file is still uploading, so the form can hold its submit button. */
  onBusyChange?: (busy: boolean) => void;
}

let counter = 0;
const nextKey = () => `upload-${Date.now().toString(36)}-${(counter += 1)}`;

/**
 * Public image uploader for listings: pick files, see them validated with the
 * server's own rules, watch each upload's progress, retry a failure, preview,
 * reorder, choose the cover and remove. Uploads go to POST /uploads as soon as
 * they are picked; the parent saves the resulting URLs with the record.
 */
export function ImageUploader({
  label,
  value,
  onChange,
  savedUrls = [],
  max = MAX_LISTING_IMAGES,
  disabled = false,
  onBusyChange,
}: ImageUploaderProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [rejections, setRejections] = useState<string[]>([]);
  // Uploads made in this session: url → media id, so an unsaved one can be deleted on removal.
  const freshIds = useRef<Record<string, string>>({});
  // Several uploads can finish between renders; always extend the latest list.
  const latest = useRef(value);
  latest.current = value;
  const emit = (urls: string[]) => {
    latest.current = urls;
    onChange(urls);
  };

  const uploading = pending.some((p) => p.status === 'uploading');
  useEffect(() => onBusyChange?.(uploading), [uploading, onBusyChange]);

  const start = (item: PendingUpload) => {
    uploadImage(item.file, (progress) =>
      setPending((list) => list.map((p) => (p.key === item.key ? { ...p, progress } : p))),
    )
      .then((media) => {
        freshIds.current[media.url] = media.id;
        setPending((list) => list.filter((p) => p.key !== item.key));
        emit([...latest.current, media.url]);
      })
      .catch((err) => {
        setPending((list) =>
          list.map((p) =>
            p.key === item.key
              ? { ...p, status: 'error', progress: 0, error: apiErrorMessage(err, `${item.file.name} could not be uploaded. Try again.`) }
              : p,
          ),
        );
      });
  };

  const pick = (files: FileList | null) => {
    if (!files?.length) return;
    const problems: string[] = [];
    const accepted: PendingUpload[] = [];
    let room = max - latest.current.length - pending.length;
    for (const file of Array.from(files)) {
      const problem = imageFileProblem(file);
      if (problem) problems.push(problem);
      else if (room <= 0) problems.push(`${file.name} was not added: a listing can have at most ${max} images.`);
      else {
        room -= 1;
        accepted.push({ key: nextKey(), file, progress: 0, status: 'uploading' });
      }
    }
    setRejections(problems);
    if (accepted.length) {
      setPending((list) => [...list, ...accepted]);
      accepted.forEach(start);
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const retry = (key: string) => {
    const item = pending.find((p) => p.key === key);
    if (!item) return;
    const again = { ...item, status: 'uploading' as const, progress: 0, error: undefined };
    setPending((list) => list.map((p) => (p.key === key ? again : p)));
    start(again);
  };

  const move = (index: number, to: number) => {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item);
    emit(next);
  };

  const remove = (url: string) => {
    emit(value.filter((u) => u !== url));
    const id = freshIds.current[url];
    if (id && !savedUrls.includes(url)) {
      delete freshIds.current[url];
      // Never saved anywhere, so it can go right away; a failure just leaves it to the cleanup job.
      deleteUploadedImage(id).catch(() => undefined);
    }
  };

  const full = value.length + pending.length >= max;

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="block text-xs font-semibold text-gray-600">{label}</legend>
      <p className="text-xs text-gray-600">
        JPEG, PNG, WebP or GIF, up to 5 MB each. The first image is the cover. {value.length}/{max}
      </p>

      {value.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label={`${label}: uploaded images`}>
          {value.map((url, i) => (
            <li key={url} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="relative aspect-video bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Listing image ${i + 1}${i === 0 ? ' (cover)' : ''}`} className="h-full w-full object-cover" />
                {i === 0 && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                    <Star className="h-3 w-3" aria-hidden="true" /> Cover
                  </span>
                )}
              </div>
              <div className="space-y-1 p-1.5">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex gap-1">
                    <Button variant="quiet" className="px-2 py-1 text-xs" aria-label={`Move image ${i + 1} earlier`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button variant="quiet" className="px-2 py-1 text-xs" aria-label={`Move image ${i + 1} later`} disabled={i === value.length - 1} onClick={() => move(i, i + 1)}>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                  <Button variant="quiet" className="px-2 py-1 text-xs text-red-700" aria-label={`Remove image ${i + 1}`} onClick={() => remove(url)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
                {i === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-gray-600">Shown first on the listing</p>
                ) : (
                  <Button variant="quiet" className="w-full px-2 py-1 text-xs" onClick={() => move(i, 0)}>
                    Make cover
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pending.length > 0 && (
        <ul className="space-y-2" aria-label={`${label}: uploads in progress`}>
          {pending.map((p) => (
            <li key={p.key} className={cn('rounded-lg border p-2 text-xs', p.status === 'error' ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white')}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-gray-800">{p.file.name}</span>
                {p.status === 'uploading' ? (
                  <span className="tabular-nums text-gray-600">{p.progress}%</span>
                ) : (
                  <span className="flex gap-1">
                    <Button variant="quiet" className="px-2 py-1 text-xs" onClick={() => retry(p.key)}>
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
                    </Button>
                    <Button variant="quiet" className="px-2 py-1 text-xs" aria-label={`Dismiss ${p.file.name}`} onClick={() => setPending((list) => list.filter((x) => x.key !== p.key))}>
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </span>
                )}
              </div>
              {p.status === 'uploading' ? (
                <div
                  role="progressbar"
                  aria-label={`Uploading ${p.file.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={p.progress}
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100"
                >
                  <div className="h-full bg-brand-500 transition-all" style={{ width: `${p.progress}%` }} />
                </div>
              ) : (
                <p role="alert" className="mt-1 text-red-700">{p.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {rejections.length > 0 && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {rejections.map((r) => (
            <p key={r}>{r}</p>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={IMAGE_MIME_TYPES.join(',')}
        multiple
        className="sr-only"
        aria-label={`${label}: choose image files`}
        onChange={(e) => pick(e.target.files)}
        disabled={disabled || full}
      />
      <Button variant="secondary" className="text-sm" disabled={disabled || full} onClick={() => inputRef.current?.click()}>
        <ImagePlus className="h-4 w-4" aria-hidden="true" /> {full ? 'Image limit reached' : 'Add images'}
      </Button>
    </fieldset>
  );
}
