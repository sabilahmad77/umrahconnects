import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { MessageSquare, Plus, Send, X } from 'lucide-react-native';
import { GreenHeader } from '@/components/brand';
import { EmptyState } from '@/components/UI';
import {
  useConversations, useDiscoverPeople, useMessages, useOpenConversation, useSendMessage,
} from '@/hooks/use-api';
import { useAuthStore } from '@/lib/auth-store';
import { colors, font, fontSize, radius, spacing, shadow } from '@/lib/theme';

const initial = (n?: string) => (n ?? 'C').trim().slice(0, 2).toUpperCase();

export default function MessagesScreen() {
  const convs = useConversations();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const items: any[] = convs.data?.items ?? [];

  if (activeId) {
    const conv = items.find((c) => c.id === activeId);
    return <Thread conversationId={activeId} title={conv?.name ?? 'Conversation'} onBack={() => setActiveId(null)} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.gray50 }}>
      <GreenHeader
        title="Messages"
        right={<Pressable onPress={() => setComposeOpen(true)} hitSlop={8}><Plus color={colors.white} size={22} /></Pressable>}
      />
      <FlatList
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 120 }}
        data={items}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <Pressable style={s.row} onPress={() => setActiveId(item.id)}>
            <View style={s.avatar}><Text style={s.avatarTxt}>{initial(item.name ?? item.title)}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={1}>{item.name ?? item.title ?? 'Conversation'}</Text>
              <Text style={s.meta} numberOfLines={1}>
                {item.lastMessage?.body ?? (item.lastMessageAt ? new Date(item.lastMessageAt).toLocaleString() : 'No messages yet')}
              </Text>
            </View>
            {item.unreadCount > 0 && <View style={s.unread}><Text style={s.unreadTxt}>{item.unreadCount}</Text></View>}
          </Pressable>
        )}
        ListEmptyComponent={
          convs.isLoading
            ? <ActivityIndicator color={colors.brand500} style={{ marginTop: 40 }} />
            : <EmptyState icon={<MessageSquare color={colors.gray300} size={40} />} title="No conversations" subtitle="Tap + to start a direct message." />
        }
      />
      {composeOpen && (
        <NewMessage onClose={() => setComposeOpen(false)} onOpened={(id) => { setComposeOpen(false); setActiveId(id); }} />
      )}
    </View>
  );
}

function Thread({ conversationId, title, onBack }: { conversationId: string; title: string; onBack: () => void }) {
  const msgs = useMessages(conversationId);
  const send = useSendMessage();
  const me = useAuthStore((st) => st.user);
  const [text, setText] = useState('');
  const listRef = useRef<FlatList>(null);
  const items: any[] = (Array.isArray(msgs.data) ? msgs.data : msgs.data?.items) ?? [];

  useEffect(() => { setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 300); }, [items.length]);

  const submit = async () => {
    if (!text.trim()) return;
    try { await send.mutateAsync({ conversationId, body: text.trim() }); setText(''); }
    catch (e: any) { Alert.alert('Send failed', String(e?.response?.data?.error?.message ?? e?.message ?? e)); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.gray50 }}>
      <GreenHeader title={title} onBack={onBack} />
      <FlatList
        ref={listRef}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        data={items}
        keyExtractor={(m, i) => String(m.id ?? i)}
        renderItem={({ item }) => {
          const mine = item.senderUserId === me?.id || item.senderId === me?.id;
          return (
            <View style={[s.bubbleWrap, mine && { alignItems: 'flex-end' }]}>
              <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleTheirs]}>
                <Text style={[s.bubbleTxt, mine && { color: colors.white }]}>{item.body ?? item.content}</Text>
              </View>
              <Text style={s.bubbleTime}>{item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</Text>
            </View>
          );
        }}
        ListEmptyComponent={msgs.isLoading ? <ActivityIndicator color={colors.brand500} /> : (
          <Text style={{ textAlign: 'center', color: colors.gray400, fontFamily: font.body, marginTop: 30 }}>No messages yet — say salaam 👋</Text>
        )}
      />
      <View style={s.composer}>
        <TextInput
          value={text} onChangeText={setText}
          placeholder="Type a message…" placeholderTextColor={colors.gray400} style={s.input}
        />
        <Pressable onPress={submit} disabled={send.isPending || !text.trim()} style={s.sendBtn}>
          {send.isPending ? <ActivityIndicator color={colors.white} size="small" /> : <Send color={colors.white} size={18} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function NewMessage({ onClose, onOpened }: { onClose: () => void; onOpened: (id: string) => void }) {
  const people = useDiscoverPeople();
  const open = useOpenConversation();
  const items: any[] = people.data?.items ?? people.data ?? [];

  const start = async (p: any) => {
    try {
      const conv = await open.mutateAsync(p.userId ?? p.id);
      if (conv?.id) onOpened(conv.id);
    } catch (e: any) {
      Alert.alert('Could not open conversation', String(e?.response?.data?.error?.message ?? e?.message ?? e));
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={s.modalCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Text style={s.modalTitle}>New message</Text>
            <Pressable onPress={onClose}><X color={colors.gray500} size={20} /></Pressable>
          </View>
          {people.isLoading ? <ActivityIndicator color={colors.brand500} /> :
            items.length === 0 ? <Text style={{ color: colors.gray400, fontFamily: font.body }}>No one to message yet.</Text> :
            items.map((p: any) => (
              <Pressable key={p.id} style={s.personRow} onPress={() => start(p)} disabled={open.isPending}>
                <View style={s.avatar}><Text style={s.avatarTxt}>{initial(p.displayName ?? p.name)}</Text></View>
                <Text style={s.name}>{p.displayName ?? p.name ?? 'Member'}</Text>
              </Pressable>
            ))}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.md, borderWidth: 1, borderColor: colors.gray100, ...shadow.card },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand500, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: colors.white, fontFamily: font.heading, fontSize: 13 },
  name: { fontSize: fontSize.sm, fontFamily: font.headingSemi, color: colors.gray900 },
  meta: { fontSize: 12, color: colors.gray500, fontFamily: font.body, marginTop: 2 },
  unread: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.gold500, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  unreadTxt: { color: colors.white, fontSize: 11, fontFamily: font.bodySemi },

  bubbleWrap: { width: '100%' },
  bubble: { maxWidth: '80%', borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: 10 },
  bubbleMine: { backgroundColor: colors.brand500, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100, borderBottomLeftRadius: 4 },
  bubbleTxt: { fontSize: fontSize.sm, color: colors.gray800, fontFamily: font.body, lineHeight: 20 },
  bubbleTime: { fontSize: 10, color: colors.gray400, fontFamily: font.body, marginTop: 2, marginHorizontal: 4 },

  composer: { flexDirection: 'row', gap: 8, padding: spacing.sm, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.gray100 },
  input: { flex: 1, backgroundColor: colors.gray100, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: fontSize.sm, fontFamily: font.body, color: colors.gray900 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brand500, alignItems: 'center', justifyContent: 'center' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg, width: '100%', maxWidth: 420 },
  modalTitle: { fontSize: fontSize.base, fontFamily: font.heading, color: colors.gray900 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 },
});
