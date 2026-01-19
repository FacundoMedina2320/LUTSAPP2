import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { getPreviewUrls } from "../../lib/lutPreviews";
import LutCard from "../../components/LutCard";

type LutRow = {
  id: string;
  name: string;
  category: { name: string } | null;
  is_premium: boolean;
  preview_before_path: string | null;
  preview_after_path: string | null;
  downloads_count: number | null;
  beforeUrl?: string | null;
  afterUrl?: string | null;
};

type SuggestionRow = {
  id: string;
  name: string;
  category: { name: string } | null;
  is_premium: boolean;
};

const CATEGORIES = [
  "All",
  "Cinematic",
  "Teal & Orange",
  "Moody",
  "Film / Vintage",
  "Clean / Natural",
  "Portrait / Skin tones",
  "Landscape",
  "Night",
  "Warm",
  "Cool",
  "B&W",
  "HDR / Punchy",
  "Wedding",
  "Travel",
];

export default function Home() {
  const [loading, setLoading] = useState<boolean>(false);
  const versionLabel = "v2.0";

  const [sort, setSort] = useState<"downloads">("downloads");
  const [category, setCategory] = useState<string>("All");

  const [query, setQuery] = useState<string>("");
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [showSug, setShowSug] = useState<boolean>(false);

  const [luts, setLuts] = useState<LutRow[]>([]);

  const orderBy = useMemo(() => {
    return { col: "downloads_count" as const, asc: false };
  }, []);

  const onOpenLut = (id: string) => router.push(`/lut/${id}`);

  // Load Home list
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);

        let q = supabase
          .from("luts")
          .select(
            "id,name,is_premium,preview_before_path,preview_after_path,downloads_count,category:category_id ( name )"
          )
          .order(orderBy.col, { ascending: orderBy.asc })
          .limit(30);

        if (category !== "All") q = q.eq("category.name", category);

        const { data, error } = await q;

        if (error) throw error;

        if (!cancelled) {
          const rows = (data as LutRow[]) || [];
          const mapped = await Promise.all(
            rows.map(async (item) => {
              const preview = await getPreviewUrls(
                item.preview_before_path,
                item.preview_after_path
              );
              return { ...item, ...preview };
            })
          );
          setLuts(mapped as LutRow[]);
        }
      } catch (e: any) {
        console.log("Home load error:", e?.message ?? e);
      } finally {
        setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [category, orderBy]);

  // Suggestions while typing (debounced)
  useEffect(() => {
    let timer: any = null;
    let cancelled = false;

    const run = async () => {
      const text = query.trim();
      if (text.length < 2) {
        setSuggestions([]);
        return;
      }

      try {
        let q = supabase
          .from("luts")
          .select("id,name,is_premium,category:category_id ( name )")
          .ilike("name", `%${text}%`)
          .order("downloads_count", { ascending: false })
          .limit(6);

        if (category !== "All") q = q.eq("category.name", category);

        const { data, error } = await q;
        if (error) throw error;

        if (!cancelled) setSuggestions((data as SuggestionRow[]) || []);
      } catch (e: any) {
        console.log("Suggestion error:", e?.message ?? e);
      }
    };

    timer = setTimeout(run, 250);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [query, category]);

  const header = (
    <View style={styles.headerWrap}>
      <Text style={styles.h1}>LUTs</Text>

      {/* Search */}
      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={(v) => {
            setQuery(v);
            setShowSug(true);
          }}
          placeholder="Search LUTs by name…"
          placeholderTextColor="#999"
          style={styles.search}
          autoCapitalize="none"
        />

        {/* Suggestions */}
        {showSug && suggestions.length > 0 && (
          <View style={styles.sugBox}>
            {suggestions.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => {
                  setShowSug(false);
                  setQuery("");
                  onOpenLut(s.id);
                }}
                style={styles.sugRow}
              >
                <Text style={styles.sugName} numberOfLines={1}>
                  {s.name}
                </Text>
                <Text style={styles.sugMeta}>
                  {s.category?.name ?? "Uncategorized"}
                  {s.is_premium ? " • Premium" : ""}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Sort */}
      <View style={styles.sortRow}>
        <Pressable
          style={[styles.sortPill, sort === "downloads" && styles.sortPillActive]}
          onPress={() => setSort("downloads")}
        >
          <Text style={[styles.sortText, sort === "downloads" && styles.sortTextActive]}>
            Most downloaded
          </Text>
        </Pressable>
      </View>

      {/* Categories */}
      <FlatList
        data={CATEGORIES}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(x) => x}
        contentContainerStyle={{ gap: 8, paddingVertical: 10 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setCategory(item)}
            style={[styles.catPill, category === item && styles.catPillActive]}
          >
            <Text style={[styles.catText, category === item && styles.catTextActive]}>{item}</Text>
          </Pressable>
        )}
      />

      <Text style={styles.sectionTitle}>Most downloaded</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={luts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => (
          <LutCard
            lut={{
              id: item.id,
              name: item.name,
              premium: item.is_premium,
              beforeUri: item.beforeUrl ?? null,
              afterUri: item.afterUrl ?? null,
              category: item.category?.name,
            }}
            onPress={() => onOpenLut(item.id)}
          />
        )}
        refreshing={loading}
        onRefresh={() => {
          // refresh simple
          setSort("downloads");
        }}
      />
      <Text style={styles.versionLabel}>{versionLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

  headerWrap: { padding: 16, paddingTop: 10 },
  h1: { fontSize: 28, fontWeight: "800", color: "#111", marginBottom: 10 },

  searchWrap: { position: "relative" },
  search: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: "#111",
    backgroundColor: "#fff",
  },

  sugBox: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 52,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    borderRadius: 16,
    overflow: "hidden",
    zIndex: 20,
  },
  sugRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  sugName: { fontWeight: "700", color: "#111" },
  sugMeta: { marginTop: 2, fontSize: 12, color: "#666" },

  sortRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  sortPill: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    backgroundColor: "#fff",
  },
  sortPillActive: { backgroundColor: "#111", borderColor: "#111" },
  sortText: { fontWeight: "800", color: "#111", fontSize: 12 },
  sortTextActive: { color: "#fff" },

  catPill: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    backgroundColor: "#fff",
  },
  catPillActive: { backgroundColor: "#111", borderColor: "#111" },
  catText: { fontWeight: "800", color: "#111", fontSize: 12 },
  catTextActive: { color: "#fff" },

  sectionTitle: { marginTop: 4, fontSize: 14, fontWeight: "800", color: "#111" },
  versionLabel: {
    position: "absolute",
    right: 12,
    bottom: 8,
    fontSize: 10,
    color: "#999",
    fontWeight: "600",
  },
});
