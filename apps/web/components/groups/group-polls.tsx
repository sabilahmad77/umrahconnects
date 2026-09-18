'use client';

import { useState } from 'react';
import { Check, Loader2, Lock, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, QueryFailure, Textarea } from '@/components/ui/system';
import { apiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { useCloseGroupPoll, useCreateGroupPoll, useGroupPolls, useVoteGroupPoll } from '@/hooks/use-groups';
import { plural } from '@/components/social/social-utils';

/**
 * Group polls. The organization creates and closes them; members (and the
 * organization) vote and may change their vote until the poll closes. Only the
 * tally and the viewer's own choice are shown — never who voted for what.
 */
export function GroupPolls({ groupId, canCreate }: { groupId: string; canCreate: boolean }) {
  const polls = useGroupPolls(groupId);

  return (
    <div className="space-y-4">
      {canCreate && <CreatePoll groupId={groupId} />}
      {polls.error ? (
        <QueryFailure error={polls.error} onRetry={() => polls.refetch()} />
      ) : polls.isLoading ? (
        <p role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-gray-600">
          <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> Loading polls…
        </p>
      ) : !polls.data?.length ? (
        <div className="rounded-xl border border-gray-200 bg-white py-10 text-center text-sm text-gray-600">
          No polls yet{canCreate ? ' — create one to gather a quick group decision.' : '.'}
        </div>
      ) : (
        <ul className="space-y-3">
          {polls.data.map((p: any) => (
            <PollCard key={p.id} groupId={groupId} poll={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CreatePoll({ groupId }: { groupId: string }) {
  const create = useCreateGroupPoll();
  const [question, setQuestion] = useState('');
  const [optionsText, setOptionsText] = useState('');
  const [isMultiple, setIsMultiple] = useState(false);
  const [closesAt, setClosesAt] = useState('');
  const options = optionsText.split('\n').map((s) => s.trim()).filter(Boolean);

  const submit = async () => {
    if (!question.trim() || options.length < 2) {
      toast.error('Add a question and at least two options (one per line).');
      return;
    }
    try {
      await create.mutateAsync({
        groupId,
        question: question.trim(),
        options,
        isMultiple,
        ...(closesAt ? { closesAt: new Date(closesAt).toISOString() } : {}),
      });
      setQuestion('');
      setOptionsText('');
      setIsMultiple(false);
      setClosesAt('');
      toast.success('Poll created');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'The poll could not be created. Try again.'));
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-gray-900">Create a poll</h3>
      <Input
        aria-label="Poll question"
        value={question}
        maxLength={500}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="What time should we leave the hotel?"
        className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
      />
      <Textarea
        aria-label="Poll options, one per line"
        value={optionsText}
        onChange={(e) => setOptionsText(e.target.value)}
        rows={3}
        placeholder={'Options, one per line\n6:00\n7:00'}
        className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={isMultiple} onChange={(e) => setIsMultiple(e.target.checked)} />
            Allow several choices
          </label>
          <label className="inline-flex items-center gap-2">
            Closes
            <Input type="datetime-local" aria-label="Closing time (optional)" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className="min-h-0 w-auto py-1 text-xs" />
          </label>
        </div>
        <Button
          variant="quiet"
          onClick={submit}
          busy={create.isPending}
          className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {!create.isPending && <Plus aria-hidden="true" className="h-4 w-4" />} Create poll
        </Button>
      </div>
    </div>
  );
}

function PollCard({ groupId, poll }: { groupId: string; poll: any }) {
  const vote = useVoteGroupPoll();
  const close = useCloseGroupPoll();
  const myVotes: number[] = poll.myVotes ?? [];
  const [selection, setSelection] = useState<number[]>(myVotes);
  const voters = poll.voterCount ?? 0;
  const options: any[] = poll.breakdown ?? poll.options ?? [];
  const totalVotes = poll.voteCount ?? 0;

  const submitVote = async (indices: number[]) => {
    if (!indices.length) return;
    try {
      await vote.mutateAsync({ groupId, pollId: poll.id, optionIndices: indices });
      toast.success(myVotes.length ? 'Your vote was changed' : 'Your vote was recorded');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Your vote could not be recorded. Try again.'));
    }
  };
  const closePoll = async () => {
    if (!window.confirm('Close this poll? No one will be able to vote after that.')) return;
    try {
      await close.mutateAsync({ groupId, pollId: poll.id });
      toast.success('Poll closed');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'The poll could not be closed. Try again.'));
    }
  };

  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4" data-poll-id={poll.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900">{poll.question}</p>
        {poll.isClosed ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
            <Lock aria-hidden="true" className="h-3 w-3" /> Closed
          </span>
        ) : (
          poll.canClose && (
            <Button variant="secondary" busy={close.isPending} onClick={closePoll} className="px-3 py-1 text-xs">
              Close poll
            </Button>
          )
        )}
      </div>
      <p className="mb-3 mt-1 text-xs text-gray-600">
        {plural(voters, 'voter')}
        {poll.isMultiple ? ' · several choices allowed' : ''}
        {poll.closesAt && !poll.isClosed ? ` · closes ${new Date(poll.closesAt).toLocaleString()}` : ''}
      </p>
      <ul className="space-y-2">
        {options.map((opt: any) => {
          const pct = totalVotes > 0 ? Math.round(((opt.count ?? 0) / totalVotes) * 100) : 0;
          const mine = myVotes.includes(opt.index);
          const chosen = poll.isMultiple ? selection.includes(opt.index) : mine;
          return (
            <li key={opt.index}>
              <button
                type="button"
                aria-pressed={chosen}
                disabled={poll.isClosed || vote.isPending}
                onClick={() => {
                  if (poll.isMultiple) setSelection((s) => (s.includes(opt.index) ? s.filter((i) => i !== opt.index) : [...s, opt.index]));
                  else if (!mine) submitVote([opt.index]);
                }}
                className={cn(
                  'relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-default',
                  chosen ? 'border-brand-400' : 'border-gray-200 hover:border-brand-300',
                )}
              >
                <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-brand-50" style={{ width: `${pct}%` }} />
                <span className="relative flex items-center justify-between gap-2 text-sm">
                  <span className="inline-flex items-center gap-2">
                    {mine && <Check aria-label="Your vote" className="h-3.5 w-3.5 text-brand-600" />}
                    {opt.label}
                  </span>
                  <span className="text-xs font-semibold text-gray-700">
                    {opt.count ?? 0} ({pct}%)
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {poll.isMultiple && !poll.isClosed && (
        <div className="mt-2 flex justify-end">
          <Button
            busy={vote.isPending}
            disabled={!selection.length || (selection.length === myVotes.length && selection.every((i) => myVotes.includes(i)))}
            onClick={() => submitVote(selection)}
            className="px-3 py-1.5 text-xs"
          >
            {myVotes.length ? 'Change vote' : 'Vote'}
          </Button>
        </div>
      )}
      {!poll.isClosed && !poll.isMultiple && myVotes.length > 0 && <p className="mt-2 text-xs text-gray-600">Choose another option to change your vote.</p>}
    </li>
  );
}
