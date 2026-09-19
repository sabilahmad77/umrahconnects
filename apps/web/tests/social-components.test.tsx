import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// What the server says about the viewer and the data; the components must only
// offer what those flags allow (the server re-checks every action anyway).
const state = vi.hoisted(() => ({
  caps: ['social:post:read', 'social:post:create'] as string[],
  comments: [] as any[],
}));

vi.mock('../hooks/use-capabilities', () => ({
  useCapabilities: () => ({ ready: true, permissions: state.caps, can: (c: string) => state.caps.includes(c) }),
}));

vi.mock('../hooks/use-social', () => {
  const mutation = () => ({ mutateAsync: vi.fn(), isPending: false, variables: undefined });
  return {
    usePostComments: () => ({
      data: { pages: [{ items: state.comments, total: state.comments.length, page: 1, limit: 10, totalPages: 1 }] },
      isLoading: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    }),
    useAddComment: mutation,
    useEditComment: mutation,
    useDeleteComment: mutation,
    useSetLike: mutation,
    useSetSaved: mutation,
    useDeletePost: mutation,
    useUpdatePost: mutation,
  };
});

import { PostComments } from '../components/social/post-comments';
import { PostCard } from '../components/social/post-card';

const comment = (over: Record<string, unknown>) => ({
  id: 'c1',
  postId: 'p1',
  parentId: null,
  body: 'Salam',
  author: { id: 'a1', displayName: 'Bilal TravelerB' },
  createdAt: new Date().toISOString(),
  editedAt: null,
  isMine: false,
  canEdit: false,
  canDelete: false,
  replyCount: 0,
  ...over,
});

const post = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  authorId: 'a1',
  author: { id: 'a1', displayName: 'Yusuf Traveler', isVerified: false },
  type: 'UPDATE',
  visibility: 'PUBLIC',
  body: 'First day in Makkah',
  mediaUrls: [],
  tags: ['makkah'],
  createdAt: new Date().toISOString(),
  editedAt: null,
  likeCount: 2,
  commentCount: 3,
  saveCount: 0,
  likedByMe: true,
  savedByMe: false,
  isMine: false,
  ...over,
});

describe('comment thread', () => {
  it('offers edit and delete only on the viewer\'s own comments, and reply only on top-level ones', () => {
    state.comments = [
      comment({ id: 'mine', body: 'my words', isMine: true, canEdit: true, canDelete: true, editedAt: new Date().toISOString() }),
      comment({ id: 'theirs', body: 'their words', replyCount: 2 }),
    ];
    const html = renderToStaticMarkup(<PostComments postId="p1" />);
    const mine = html.slice(html.indexOf('data-comment-id="mine"'), html.indexOf('data-comment-id="theirs"'));
    const theirs = html.slice(html.indexOf('data-comment-id="theirs"'));
    expect(mine).toContain('Edit');
    expect(mine).toContain('Delete');
    expect(mine).toContain('Edited');
    expect(theirs).not.toContain('Edit');
    expect(theirs).not.toContain('Delete');
    expect(theirs).toContain('Reply');
    expect(theirs).toContain('View 2 replies');
    expect(html).toContain('aria-label="Write a comment"');
  });

  it('is read-only without the social:post:create capability', () => {
    state.caps = ['social:post:read'];
    state.comments = [comment({ id: 'mine', isMine: true, canEdit: true, canDelete: true })];
    const html = renderToStaticMarkup(<PostComments postId="p1" />);
    expect(html).not.toContain('aria-label="Write a comment"');
    expect(html).not.toContain('Reply');
    expect(html).not.toContain('Delete');
    state.caps = ['social:post:read', 'social:post:create'];
  });

  it('says so when a post has no comments yet', () => {
    state.comments = [];
    expect(renderToStaticMarkup(<PostComments postId="p1" />)).toContain('No comments yet.');
  });
});

describe('post card', () => {
  it('shows the viewer\'s like state, live counts, the audience and the edited marker', () => {
    const html = renderToStaticMarkup(<PostCard post={post({ visibility: 'FOLLOWER_SET', editedAt: new Date().toISOString() }) as any} />);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Liked');
    expect(html).toContain('2 likes');
    expect(html).toContain('3 comments');
    expect(html).toContain('Followers');
    expect(html).toContain('Edited');
    expect(html).toContain('href="/social?tag=makkah"');
  });

  it('hides like and save controls from viewers without the capabilities', () => {
    state.caps = [];
    const html = renderToStaticMarkup(<PostCard post={post() as any} />);
    expect(html).not.toContain('aria-label="Unlike"');
    expect(html).not.toContain('Save post');
    state.caps = ['social:post:read', 'social:post:create'];
  });
});
