import { Image, Pressable, StyleSheet, Text, View } from "react-native";

type LutCardLut = {
  id: string;
  name: string;
  premium: boolean;
  beforeUri?: string | null;
  afterUri?: string | null;
  category?: string;
};

type Props = {
  lut?: LutCardLut;
  onPress?: () => void;
};

export default function LutCard({ lut, onPress }: Props) {
  if (!lut) return null; // ✅ evita el error afterUri

  const img = lut.afterUri || lut.beforeUri || "";
  const hasImage = Boolean(img);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      {hasImage ? (
        <Image source={{ uri: img }} style={styles.image} />
      ) : (
        <View style={styles.imagePlaceholder} />
      )}

      <View style={styles.info}>
        <View style={styles.row}>
          <Text style={styles.name} numberOfLines={1}>
            {lut.name}
          </Text>
          {lut.premium && <Text style={styles.lock}>🔒</Text>}
        </View>

        {!!lut.category && <Text style={styles.category}>{lut.category}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 24, borderRadius: 24, overflow: "hidden", backgroundColor: "#f5f5f5" },
  image: { width: "100%", height: 280, backgroundColor: "#eee" },
  imagePlaceholder: {
    width: "100%",
    height: 280,
    backgroundColor: "#eee",
  },
  info: { padding: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 16, fontWeight: "600", color: "#111", flex: 1, marginRight: 6 },
  lock: { fontSize: 16 },
  category: { marginTop: 4, fontSize: 12, color: "#666" },
});
