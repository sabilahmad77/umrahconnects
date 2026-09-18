'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiErrorMessage } from '@/lib/api-error';
import {
  CATEGORY_LABELS,
  LOCALE_LABELS,
  NOTIFICATION_CATEGORIES,
  buildPreferencesUpdate,
  deviceTimeZone,
  draftFrom,
  formatInTimeZone,
  timeZoneOptions,
  type PreferencesDraft,
  type UserPreferences,
} from '@/lib/preferences';
import { usePreferences, useUpdatePreferences } from '@/hooks/use-auth';
import { Alert, Button, LoadingState, QueryFailure, Select, Switch } from '@/components/ui/system';

/** Language, time zone and notification preferences — persisted by `PUT /users/me/preferences`. */
export function PreferencesSection() {
  const query = usePreferences();
  if (query.isLoading) return <LoadingState label="Loading your preferences…" />;
  if (query.error || !query.data) return <QueryFailure error={query.error} onRetry={() => void query.refetch()} />;
  return <PreferencesForm saved={query.data} />;
}

function PreferencesForm({ saved }: { saved: UserPreferences }) {
  const update = useUpdatePreferences();
  const [draft, setDraft] = useState<PreferencesDraft>(() => draftFrom(saved));
  const [status, setStatus] = useState('');
  const zones = useMemo(() => timeZoneOptions(draft.timezone), [draft.timezone]);
  const device = useMemo(() => deviceTimeZone(), []);
  const changes = buildPreferencesUpdate(saved, draft);

  // The server's readback replaces the draft after every save.
  useEffect(() => setDraft(draftFrom(saved)), [saved]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!changes || update.isPending) return;
    setStatus('');
    try {
      await update.mutateAsync(changes);
      setStatus('Preferences saved.');
    } catch {
      // shown below from update.error
    }
  };

  return (
    <form method="post" onSubmit={save} className="space-y-6" aria-labelledby="preferences-title">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="pref-locale" className="mb-2 block text-sm font-medium">
            Email language
          </label>
          <Select id="pref-locale" value={draft.locale} onChange={(e) => setDraft((d) => ({ ...d, locale: e.target.value as PreferencesDraft['locale'] }))} aria-describedby="pref-locale-hint">
            {saved.options.locales.map((locale) => (
              <option key={locale} value={locale}>
                {LOCALE_LABELS[locale as PreferencesDraft['locale']] ?? locale}
              </option>
            ))}
          </Select>
          <p id="pref-locale-hint" className="mt-1 text-xs text-gray-600">
            Used for emails we send you, such as verification and password links. The app itself is in English for now.
          </p>
        </div>
        <div>
          <label htmlFor="pref-timezone" className="mb-2 block text-sm font-medium">
            Time zone
          </label>
          <Select id="pref-timezone" value={draft.timezone} onChange={(e) => setDraft((d) => ({ ...d, timezone: e.target.value }))} aria-describedby="pref-timezone-hint">
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
          <p id="pref-timezone-hint" className="mt-1 text-xs text-gray-600">
            Times in your emails and account settings use this zone. Now: {formatInTimeZone(new Date(), draft.timezone)}.
          </p>
          {device && device !== draft.timezone && (
            <Button variant="quiet" className="mt-1 px-0 text-brand-700" onClick={() => setDraft((d) => ({ ...d, timezone: device }))}>
              Use this device’s time zone ({device.replace(/_/g, ' ')})
            </Button>
          )}
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-base font-semibold">In-app notifications</legend>
        {saved.enforcement.inApp ? (
          <>
            <p className="text-sm text-gray-600">Choose which notifications appear in your notification list. Account and security notices are always shown.</p>
            <div className="divide-y divide-gray-200 rounded-lg border border-gray-200">
              {NOTIFICATION_CATEGORIES.map((category) => (
                <div key={category} className="p-4 text-sm">
                  <Switch
                    label={CATEGORY_LABELS[category].label}
                    checked={draft.inApp[category]}
                    onCheckedChange={(checked) => setDraft((d) => ({ ...d, inApp: { ...d.inApp, [category]: checked } }))}
                  />
                  <p className="mt-1 text-xs text-gray-600">{CATEGORY_LABELS[category].description}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-600">
            Choosing notification types is not available on this deployment yet, so every in-app notification is delivered. Notifications are not sent by email.
          </p>
        )}
      </fieldset>

      {update.error && <Alert title="Preferences not saved">{apiErrorMessage(update.error, 'Your preferences could not be saved. Try again.')}</Alert>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" busy={update.isPending} disabled={!changes}>
          Save preferences
        </Button>
        {!changes && !status && <span className="text-sm text-gray-600">No unsaved changes.</span>}
        {status && !changes && (
          <span role="status" className="text-sm font-medium text-brand-700">
            {status}
          </span>
        )}
      </div>
    </form>
  );
}
