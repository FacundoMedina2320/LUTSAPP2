import { useEffect, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import LutCard from "../../components/LutCard";

type LutRow = {
  id: string;
  name: string;
  category: { name: string } | null;
  is_premium: boolean;
  before_url: string | null;
  after_url: string | null;
  downloads_count: number | null;
};

type LibraryRow = {
  created_at: string;
  lut_id: string;
};

export default function Library() {
  const [loading, setLoading] = useState<boolean>(false);
  const [items, setItems] = useState<LutRow[]>([]);

  const load = async () => {
    try {
      setLoading(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;

      if (!userId) {
        Alert.alert("Login required", "Please log in to see your library.");
        router.push("/(auth)/login");
        return;
      }

      const { data: libraryRows, error } = await supabase
        .from("user_library")
        .select("created_at,lut_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (libraryRows as LibraryRow[]) || [];
      const lutIds = rows.map((row) => row.lut_id);

      if (lutIds.length === 0) {
        setItems([]);
        return;
      }

      const { data: lutRows, error: lutError } = await supabase
        .from("luts")
        .select(
          "id,name,is_premium,before_url,after_url,downloads_count,category:category_id ( name )"
        )
        .in("id", lutIds);

      if (lutError) throw lutError;

      const lutMap = new Map((lutRows as LutRow[]).map((lut) => [lut.id, lut]));

      const mapped = rows
        .map((row) => lutMap.get(row.lut_id))
        .filter((lut): lut is LutRow => !!lut);

      setItems(mapped);
    } catch (e: any) {
      Alert.alert("Library error", e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>My Library</Text>

      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <LutCard
            lut={{
              id: item.id,
              name: item.name,
              premium: item.is_premium,
              beforeUri: item.before_url,
              afterUri: item.after_url,
              category: item.category?.name,
            }}
            onPress={() => router.push(`/lut/${item.id}`)}
          />
        )}
        refreshing={loading}
        onRefresh={load}
        ListEmptyComponent={
          <Text style={styles.empty}>No downloads yet. Download a LUT to see it here.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  h1: { fontSize: 28, fontWeight: "800", color: "#111", padding: 16, paddingBottom: 0 },
  empty: { padding: 16, color: "#666" },
});
