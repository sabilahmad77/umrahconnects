'use client';

import { useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Select, Textarea } from '@/components/ui/system';
import { apiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/components/providers/auth-provider';
import { useCreatePost, useUploadImage } from '@/hooks/use-social';
import { RolePicker } from './post-card';
import { AUDIENCES, extractHashtags, initialsOf, MAX_POST_LENGTH, MAX_POST_PHOTOS, POST_TYPES, type PostVisibility } from './social-utils';

/** What POST /uploads accepts for public media (sniffed server-side): JPEG, PNG, WebP, GIF up to 5 MB. */
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export function PostComposer() {
  const { user } = useAuthContext();
  const [body, setBody] = useState('');
  const [type, setType] = useState<string>('UPDATE');
  const [visibility, setVisibility] = useState<PostVisibility>('PUBLIC');
  const [roles, setRoles] = useState<string[]>([]);
  const [photos, setPhotos] = useState<{ url: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(0);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const upload = useUploadImage();
  const create = useCreatePost();

  const audience = AUDIENCES.find((a) => a.value === visibility);
  const needsRoles = visibility === 'ROLE_SET' && roles.length === 0;
  const canSubmit = (body.trim().length > 0 || photos.length > 0) && !needsRoles && uploading === 0 && !create.isPending;

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_POST_PHOTOS - photos.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > room) toast.info(`A post can carry up to ${MAX_POST_PHOTOS} photos.`);
    for (const file of picked) {
      if (!PHOTO_TYPES.includes(file.type)) {
        toast.error(`${file.name}: only JPEG, PNG, WebP or GIF images can be attached.`);
        continue;
      }
      if (file.size > PHOTO_MAX_BYTES) {
        toast.error(`${file.name} is larger than 5 MB.`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const stored = await upload.mutateAsync(file);
        setPhotos((prev) => [...prev, { url: stored.url, name: file.name }]);
      } catch (error) {
        toast.error(apiErrorMessage(error, `${file.name} could not be uploaded. Try again.`));
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileInput.current) fileInput.current.value = '';
  };

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await create.mutateAsync({
        type,
        content: body.trim(),
        visibility,
        targetRoles: roles,
        tags: extractHashtags(body),
        mediaUrls: photos.map((p) => p.url),
      });
      setBody('');
      setPhotos([]);
      toast.success(visibility === 'PUBLIC' ? 'Posted to the community' : `Posted — visible to: ${audience?.label ?? 'your audience'}`);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Your post could not be published. Try again.'));
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white">
          {initialsOf(user?.displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <Textarea
            aria-label="Write a post"
            value={body}
            maxLength={MAX_POST_LENGTH}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share an update, tip, or experience with the Umrah community… Add #hashtags to make it easy to find."
            rows={3}
            className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition-all placeholder:text-gray-600 focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
          />
          {body.length > MAX_POST_LENGTH - 200 && (
            <p className="mt-1 text-right text-xs text-gray-600">
              {body.length}/{MAX_POST_LENGTH}
            </p>
          )}

          {photos.length > 0 && (
            <ul className="mt-2 grid grid-cols-4 gap-2" aria-label="Attached photos">
              {photos.map((p) => (
                <li key={p.url} className="relative overflow-hidden rounded-lg border border-gray-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.name} className="h-20 w-full object-cover" />
                  <button
                    type="button"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => setPhotos((prev) => prev.filter((x) => x.url !== p.url))}
                    className="absolute right-1 top-1 rounded-full bg-white/90 p-0.5 text-gray-700 shadow"
                  >
                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2 border-b border-gray-50 pb-2.5">
            <input
              ref={fileInput}
              type="file"
              accept={PHOTO_TYPES.join(',')}
              multiple
              className="sr-only"
              aria-label="Attach photos"
              onChange={(e) => addPhotos(e.target.files)}
            />
            <Button
              variant="quiet"
              onClick={() => fileInput.current?.click()}
              disabled={photos.length >= MAX_POST_PHOTOS || uploading > 0}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              {uploading > 0 ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <ImageIcon aria-hidden="true" className="h-4 w-4 text-emerald-600" />}
              {uploading > 0 ? 'Uploading…' : 'Photo'}
            </Button>
            <label htmlFor="post-audience" className="ml-auto text-xs font-semibold text-gray-600">
              Audience
            </label>
            <Select
              id="post-audience"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as PostVisibility)}
              className="min-h-0 w-auto py-1.5 text-xs"
            >
              {AUDIENCES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </Select>
          </div>
          {audience && visibility !== 'PUBLIC' && <p className="mt-1.5 text-xs text-gray-600">{audience.description}.</p>}
          {visibility === 'ROLE_SET' && (
            <div className="mt-2">
              <RolePicker value={roles} onChange={setRoles} />
            </div>
          )}

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Post type">
              {POST_TYPES.map((t) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={type === t.type}
                  key={t.type}
                  onClick={() => setType(t.type)}
                  className={cn(
                    'rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors',
                    type === t.type ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <Button
              variant="quiet"
              onClick={submit}
              disabled={!canSubmit}
              busy={create.isPending}
              className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm text-white shadow-sm transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {!create.isPending && <Send aria-hidden="true" className="h-3.5 w-3.5" />}
              Post
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
