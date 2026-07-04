import { useMemo, useState } from 'react';
import {
  FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Bed, Bus, FileCheck2, Home, Package, Search, ShoppingBag, Star, UtensilsCrossed, Compass,
} from 'lucide-react-native';
import { GreenHeader, CategoryTile, MediaPanel, SectionHeader, CATEGORY_PHOTO } from '@/components/brand';
import { useMarketplaceListings } from '@/hooks/use-api';
import { colors, font, fontSize, radius, spacing, shadow } from '@/lib/theme';

type Cat = 'all' | 'hotels' | 'transport' | 'visa' | 'packages';

// Map the API listing `type` (hotel_room, transport_service, …) to a UI category
function listingCat(type?: string): Exclude<Cat, 'all'> {
  const v = (type ?? '').toLowerCase();
  if (v.includes('hotel') || v.includes('room')) return 'hotels';
  if (v.includes('transport') || v.includes('coach') || v.includes('vehicle')) return 'transport';
  if (v.includes('visa')) return 'visa';
  return 'packages'; // catering / guide / other / package
}
const CAT_TONE: Record<Exclude<Cat, 'all'>, 'green' | 'emerald' | 'navy' | 'gold'> = {
  hotels: 'green', transport: 'emerald', visa: 'navy', packages: 'gold',
};
function catIcon(cat: Exclude<Cat, 'all'>, color: string, size = 28) {
  if (cat === 'hotels') return <Bed color={color} size={size} />;
  if (cat === 'transport') return <Bus color={color} size={size} />;
  if (cat === 'visa') return <FileCheck2 color={color} size={size} />;
  return <Package color={color} size={size} />;
}
const fmtSar = (cents?: number | null) =>
  cents != null ? `SAR ${Math.round(Number(cents) / 100).toLocaleString()}` : 'Contact';

export default function MarketScreen() {
  const router = useRouter();
  const [cat, setCat] = useState<Cat>('all');
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // SAME endpoint the web marketplace uses → identical listings on both platforms
  const listings = useMarketplaceListings({ page: 1, limit: 50 });
  const items: any[] = listings.data?.items ?? [];

  const services = useMemo(() => {
    const mapped = items.map((l: any) => {
      const c = listingCat(l.type ?? l.category);
      const priceCents = l.pricePerNightCents ?? l.priceCents ?? l.priceFromCents;
      const unit = l.pricePerNightCents != null ? '/night' : (c === 'transport' ? '/trip' : '');
      return {
        id: l.id,
        title: l.title ?? l.name ?? 'Listing',
        sub: `${l.attributes?.city ?? l.city ?? 'Saudi Arabia'}${l.starRating ? ` · ${l.starRating}★` : ''}`,
        price: fmtSar(priceCents), unit,
        rating: l.rating ?? l.ratingAvg,
        reviews: l.reviewCount ?? 0,
        cat: c, tone: CAT_TONE[c],
        verified: !!l.verified,
        image: l.imageUrl ?? l.coverUrl ?? (Array.isArray(l.images) ? l.images[0] : undefined),
        raw: l,
      };
    });
    const byCat = cat === 'all' ? mapped : mapped.filter((s) => s.cat === cat);
    const ql = q.trim().toLowerCase();
    return ql ? byCat.filter((s) => s.title.toLowerCase().includes(ql)) : byCat;
  }, [items, cat, q]);

  const openService = (svc: any) => {
    router.push({
      pathname: '/booking-confirm',
      params: { id: svc.id, title: svc.title, sub: svc.sub, price: svc.price, unit: svc.unit, cat: svc.cat, tone: svc.tone },
    } as any);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.gray50 }}>
      <GreenHeader title="Marketplace" right={<Home color={colors.white} size={20} />} />

      <FlatList
        data={services}
        keyExtractor={(s) => s.id}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
        contentContainerStyle={{ paddingBottom: 120, gap: spacing.md }}
        ListHeaderComponent={
          <View style={{ gap: spacing.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, marginBottom: spacing.xs }}>
            <View style={s.search}>
              <Search color={colors.gray400} size={18} />
              <TextInput value={q} onChangeText={setQ} placeholder="Search services…"
                placeholderTextColor={colors.gray400} style={s.searchInput} autoCapitalize="none" />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <CategoryTile label="Hotels"    tone="green"   active={cat === 'hotels'}    onPress={() => setCat(cat === 'hotels' ? 'all' : 'hotels')}       icon={catIcon('hotels', colors.brand500, 26)} />
              <CategoryTile label="Transport" tone="emerald" active={cat === 'transport'} onPress={() => setCat(cat === 'transport' ? 'all' : 'transport')} icon={catIcon('transport', colors.emerald, 26)} />
              <CategoryTile label="Visa"      tone="navy"    active={cat === 'visa'}      onPress={() => setCat(cat === 'visa' ? 'all' : 'visa')}           icon={catIcon('visa', colors.navy, 26)} />
              <CategoryTile label="Packages"  tone="gold"    active={cat === 'packages'}  onPress={() => setCat(cat === 'packages' ? 'all' : 'packages')}   icon={catIcon('packages', colors.gold600, 26)} />
            </View>
            <SectionHeader title={cat === 'all' ? 'Featured Services' : cat[0].toUpperCase() + cat.slice(1)} action={`${services.length}`} />
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={s.card} onPress={() => openService(item)}>
            <MediaPanel
              tone={item.tone} height={104}
              image={item.image ?? CATEGORY_PHOTO[item.cat]}
              icon={catIcon(item.cat, colors.white, 30)}
              style={{ borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}
            />
            <View style={{ padding: spacing.md, gap: 4 }}>
              <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={s.cardSub} numberOfLines={1}>{item.sub}</Text>
              <View style={s.cardFoot}>
                <Text style={s.price}>{item.price}<Text style={s.unit}>{item.unit}</Text></Text>
                {item.rating != null ? (
                  <View style={s.rating}>
                    <Star color={colors.gold500} fill={colors.gold500} size={11} />
                    <Text style={s.ratingText}>{Number(item.rating).toFixed(1)}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Pressable>
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => {
            setRefreshing(true); await listings.refetch(); setRefreshing(false);
          }} />
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', padding: spacing['3xl'] }}>
            <ShoppingBag color={colors.gray300} size={40} />
            <Text style={{ marginTop: 12, color: colors.gray500, fontFamily: font.body }}>
              {listings.isLoading ? 'Loading services…' : 'No services found'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  search: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, borderRadius: radius.lg, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.gray100, ...shadow.card,
  },
  searchInput: { flex: 1, paddingVertical: 13, fontSize: fontSize.sm, color: colors.gray900, fontFamily: font.body },
  card: {
    flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.gray100, ...shadow.card,
  },
  cardTitle: { fontSize: fontSize.sm, fontFamily: font.headingSemi, color: colors.gray900 },
  cardSub: { fontSize: 11, color: colors.gray500, fontFamily: font.body },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  price: { fontSize: fontSize.sm, color: colors.brand500, fontFamily: font.heading },
  unit: { fontSize: 10, color: colors.gray400, fontFamily: font.body },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingText: { fontSize: 11, color: colors.gray600, fontFamily: font.bodyMedium },
});
