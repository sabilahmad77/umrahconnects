import { useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import {
  Bookmark, Heart, MessageCircle, MoreHorizontal, Newspaper, Plus, Search, Send, Share2, X,
} from 'lucide-react-native';
import { GreenHeader, SegmentedTabs, MediaPanel } from '@/components/brand';
import { EmptyState, Skeleton } from '@/components/UI';
import {
  useAddComment, useCreatePost, usePostComments, useReactToPost, useSavePost, useSocialFeed,
} from '@/hooks/use-api';
import { colors, font, fontSize, radius, spacing, shadow } from '@/lib/theme';

type Tab = 'foryou' | 'following' | 'groups';
const initial = (n?: string | null) => (n ?? '').trim()[0]?.toUpperCase() ?? 'U';
const fmtDate = (iso?: string | null) => { try { const d = new Date(iso ?? ''); return isNaN(d.getTime()) ? '' : d.toLocaleDateString(); } catch { return ''; } };
const POST_TONES = ['green', 'emerald', 'sand', 'navy', 'gold'] as const;

export default function SocialScreen() {
  const [tab, setTab] = useState<Tab>('foryou');
  const [refreshing, setRefreshing] = useState(false);
  const [composer, setComposer] = useState(false);
  const [commentsId, setCommentsId] = useState<string | null>(null);

  const feed = useSocialFeed({ page: 1, limit: 20 });
  const items: any[] = feed.data?.items ?? [];
  const react = useReactToPost();
  const save = useSavePost();

  const onLike = (id: string) => react.mutate({ postId: id, type: 'LIKE' });
  const onShare = (id: string) => react.mutate({ postId: id, type: 'SHARE' });
  const onSave = (id: string) => save.mutate({ postId: id });

  return (
    <View style={{ flex: 1, backgroundColor: colors.gray50 }}>
      <GreenHeader title="Social Hub" right={<Search color={colors.white} size={20} />} />
      <SegmentedTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'foryou', label: 'For You' },
          { key: 'following', label: 'Following' },
          { key: 'groups', label: 'Groups' },
        ]}
      />

      <FlatList
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 130, gap: spacing.md }}
        data={items}
        keyExtractor={(it, i) => String(it?.id ?? i)}
        renderItem={({ item, index }) => {
          const author = item?.author ?? item?.account ?? {};
          const name = author.displayName ?? author.handle ?? 'Umrah Traveler';
          const role = author.role ?? author.headline ?? 'Community';
          const body = item?.body ?? item?.content ?? '';
          // Real post image when present (reference shows posts with photos)
          const postImg = (Array.isArray(item?.mediaUrls) ? item.mediaUrls[0] : undefined) ?? item?.attachmentUrl ?? item?.imageUrl;
          return (
            <View style={s.card}>
              <View style={s.head}>
                <View style={s.avatar}><Text style={s.avatarTxt}>{initial(name)}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={1}>{name}</Text>
                  <Text style={s.meta} numberOfLines={1}>{role} · {fmtDate(item?.createdAt) || 'just now'}</Text>
                </View>
                <MoreHorizontal color={colors.gray400} size={18} />
              </View>
              {body ? <Text style={s.body}>{body}</Text> : null}
              {postImg ? (
                <MediaPanel
                  tone={POST_TONES[index % POST_TONES.length]}
                  height={200}
                  image={postImg}
                  style={{ borderRadius: radius.lg, marginTop: spacing.sm }}
                />
              ) : null}
              <View style={s.actions}>
                <Pressable style={s.action} onPress={() => onLike(item.id)}>
                  <Heart color={colors.red500} size={18} /><Text style={s.aText}>{item?.likeCount ?? 0}</Text>
                </Pressable>
                <Pressable style={s.action} onPress={() => setCommentsId(item.id)}>
                  <MessageCircle color={colors.blue500} size={18} /><Text style={s.aText}>{item?.commentCount ?? 0}</Text>
                </Pressable>
                <Pressable style={s.action} onPress={() => onShare(item.id)}>
                  <Share2 color={colors.green600} size={18} /><Text style={s.aText}>{item?.shareCount ?? 0}</Text>
                </Pressable>
                <View style={{ flex: 1 }} />
                <Pressable style={s.action} onPress={() => onSave(item.id)}>
                  <Bookmark color={colors.gold600} size={18} />
                </Pressable>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          feed.isLoading
            ? <View style={{ gap: spacing.sm }}>{[0, 1, 2].map(i => <Skeleton key={i} h={200} style={{ borderRadius: radius.xl }} />)}</View>
            : <EmptyState icon={<Newspaper color={colors.gray300} size={40} />} title="No posts yet" subtitle="Tap + to share your journey." />
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); try { await feed.refetch(); } catch {} setRefreshing(false); }} />}
      />

      <Pressable style={s.fab} onPress={() => setComposer(true)}><Plus color={colors.white} size={24} /></Pressable>
      <Composer open={composer} onClose={() => setComposer(false)} />
      <Comments postId={commentsId} onClose={() => setCommentsId(null)} />
    </View>
  );
}

function Composer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const createM = useCreatePost();
  const submit = async () => {
    if (!text.trim()) return;
    try { await createM.mutateAsync({ content: text.trim(), visibility: 'PUBLIC' }); setText(''); onClose(); }
    catch (e: any) { Alert.alert('Post failed', String(e?.response?.data?.error?.message ?? e?.message ?? e)); }
  };
  return (
    <Modal visible={open} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.gray50 }}>
        <View style={s.mHead}>
          <Pressable onPress={onClose}><X size={24} color={colors.gray600} /></Pressable>
          <Text style={s.mTitle}>Share a post</Text>
          <Pressable onPress={submit} disabled={createM.isPending || !text.trim()}>
            {createM.isPending ? <ActivityIndicator color={colors.brand600} /> : <Text style={[s.post, !text.trim() && { color: colors.gray400 }]}>Post</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          <TextInput placeholder="Share an update from your Umrah journey…" placeholderTextColor={colors.gray400} value={text} onChangeText={setText} multiline autoFocus style={s.composerInput} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Comments({ postId, onClose }: { postId: string | null; onClose: () => void }) {
  const comments = usePostComments(postId ?? undefined);
  const addM = useAddComment();
  const [text, setText] = useState('');
  const items: any[] = comments.data?.items ?? [];
  const submit = async () => {
    if (!postId || !text.trim()) return;
    try { await addM.mutateAsync({ postId, body: text.trim() }); setText(''); }
    catch (e: any) { Alert.alert('Comment failed', String(e?.response?.data?.error?.message ?? e?.message ?? e)); }
  };
  return (
    <Modal visible={!!postId} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.gray50 }}>
        <View style={s.mHead}>
          <Pressable onPress={onClose}><X size={24} color={colors.gray600} /></Pressable>
          <Text style={s.mTitle}>Comments</Text>
          <View style={{ width: 24 }} />
        </View>
        <FlatList
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          data={items}
          keyExtractor={(c, i) => String(c?.id ?? i)}
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={[s.avatar, { width: 32, height: 32 }]}><Text style={[s.avatarTxt, { fontSize: 12 }]}>{initial(item?.author?.displayName)}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{item?.author?.displayName ?? 'User'}</Text>
                  <Text style={[s.body, { marginTop: 2 }]}>{item?.body ?? item?.content ?? ''}</Text>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={comments.isLoading ? <ActivityIndicator color={colors.brand500} /> : <EmptyState icon={<MessageCircle color={colors.gray300} size={32} />} title="No comments" subtitle="Be the first to reply." />}
        />
        <View style={s.cBar}>
          <TextInput placeholder="Write a comment…" placeholderTextColor={colors.gray400} value={text} onChangeText={setText} style={s.cInput} />
          <Pressable onPress={submit} disabled={addM.isPending || !text.trim()} style={s.send}>
            {addM.isPending ? <ActivityIndicator color={colors.white} size="small" /> : <Send color={colors.white} size={18} />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.gray100, ...shadow.card },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  avatar: { width: 42, height: 42, borderRadius: radius.full, backgroundColor: colors.brand500, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: colors.white, fontFamily: font.heading, fontSize: fontSize.base },
  name: { fontSize: fontSize.sm, fontFamily: font.headingSemi, color: colors.gray900 },
  meta: { fontSize: 11, color: colors.gray400, fontFamily: font.body, marginTop: 1 },
  body: { fontSize: fontSize.sm, color: colors.gray700, fontFamily: font.body, lineHeight: 21 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.gray100 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 2 },
  aText: { fontSize: 12, color: colors.gray600, fontFamily: font.bodyMedium },

  fab: { position: 'absolute', bottom: 100, right: 20, width: 54, height: 54, borderRadius: 27, backgroundColor: colors.gold500, alignItems: 'center', justifyContent: 'center', ...shadow.raised },

  mHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.gray100, backgroundColor: colors.white },
  mTitle: { fontSize: fontSize.base, fontFamily: font.heading, color: colors.gray900 },
  post: { color: colors.brand600, fontFamily: font.bodySemi, fontSize: fontSize.base },
  composerInput: { fontSize: fontSize.lg, color: colors.gray900, minHeight: 200, textAlignVertical: 'top', fontFamily: font.body },

  cBar: { flexDirection: 'row', gap: 8, padding: spacing.sm, borderTopWidth: 1, borderTopColor: colors.gray100, backgroundColor: colors.white },
  cInput: { flex: 1, backgroundColor: colors.gray100, borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.sm, fontFamily: font.body },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand500, alignItems: 'center', justifyContent: 'center' },
});
