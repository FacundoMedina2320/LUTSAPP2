import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

import BeforeAfterSlider from "../../components/BeforeAfterSlider";
import { supabase } from "../../lib/supabase";

type LutRow = {
  id: string;
  name: string;
  category: { name: string } | null;
  is_premium: boolean;
  before_url: string | null;
  after_url: string | null;
  cube_path: string | null;
  downloads_count: number | null;
};

export default function LutDetail() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const lutId = Array.isArray(id) ? id[0] : id;

  const [lut, setLut] = useState<LutRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [show, setShow] = useState(false);
  const [localUri, setLocalUri] = useState<string | null>(null);

  useEffect(() => {
    if (!lutId) {
      setLoading(false);
      Alert.alert("Error", "Missing LUT identifier.");
      return;
    }

    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("luts")
          .select(
            "id,name,is_premium,before_url,after_url,cube_path,downloads_count,category:category_id ( name )"
          )
          .eq("id", lutId)
          .single();

        if (error) throw error;
        setLut(data as LutRow);
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? "Failed to load LUT");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [lutId]);

  const handleDownload = async () => {
    try {
      if (!lut?.id) {
        Alert.alert("Error", "Missing LUT file");
        return;
      }

      setBusy(true);

      const { data, error } = await supabase.functions.invoke("download-lut", {
        body: { lut_id: lut.id },
      });

      if (error) {
        throw error;
      }

      const signedUrl = data?.url as string | undefined;
      if (!signedUrl) {
        throw new Error("Signed URL missing");
      }

      const safeName = lut.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
      const baseDirectory = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (!baseDirectory) {
        Alert.alert("Error", "File storage is unavailable on this device.");
        return;
      }

      const filename = `${safeName || "lut"}.cube`;
      const dest = `${baseDirectory}${filename}`;

      const result = await FileSystem.downloadAsync(signedUrl, dest);
      if (result.status !== 200) {
        throw new Error("Download failed");
      }
      setLocalUri(result.uri);

      setShow(true);
    } catch (e: any) {
      Alert.alert("Download error", e?.message ?? "Download failed");
    } finally {
      setBusy(false);
    }
  };

  const openInFiles = async () => {
    if (!localUri) return;

    const available = await Sharing.isAvailableAsync();
    if (!available) {
      Alert.alert("Not supported", "Sharing not available on this device");
      return;
    }

    await Sharing.shareAsync(localUri);
  };

  if (loading || !lut) {
    return (
      <View style={styles.container}>
        <Text>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>Back</Text>
        </Pressable>
        <Text style={styles.title}>{lut.name}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Slider */}
      <BeforeAfterSlider
        beforeUri={lut.before_url}
        afterUri={lut.after_url}
        height={420}
        radius={24}
      />

      {/* Labels */}
      <View style={styles.labelsRow}>
        <Text style={styles.pill}>Before</Text>
        <Text style={styles.pill}>After</Text>
      </View>

      {/* Download */}
      <Pressable
        style={[styles.btn, busy && { opacity: 0.6 }]}
        onPress={handleDownload}
        disabled={busy}
      >
        <Text style={styles.btnText}>
          {busy ? "Downloading…" : "Download LUT"}
        </Text>
      </Pressable>

      <Text style={styles.helper}>
        This LUT will be downloaded as a .cube file for Blackmagic Camera.
      </Text>

      {/* Modal */}
      <Modal visible={show} transparent animationType="fade">
        <Pressable style={styles.modalBg} onPress={() => setShow(false)}>
          <Pressable style={styles.modal} onPress={() => {}}>
            <Text style={styles.modalTitle}>LUT downloaded successfully</Text>

            <Pressable style={styles.modalBtn} onPress={openInFiles}>
              <Text style={styles.modalBtnText}>Open in Files</Text>
            </Pressable>

            <Pressable
              style={styles.modalBtnSecondary}
              onPress={() => {
                setShow(false);
                router.push("/how-to-import");
              }}
            >
              <Text style={styles.modalBtnTextSecondary}>
                How to import in Blackmagic Camera
              </Text>
            </Pressable>

            <Pressable onPress={() => setShow(false)} style={styles.closeBtn}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  back: { fontWeight: "600", color: "#111" },
  title: { fontSize: 18, fontWeight: "600", color: "#111" },

  labelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    marginBottom: 14,
  },
  pill: {
    fontSize: 12,
    color: "#111",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },

  btn: {
    backgroundColor: "#111",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 16 },

  helper: { fontSize: 12, color: "#666", marginTop: 10 },

  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 20,
  },
  modal: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: "600", marginBottom: 12 },

  modalBtn: {
    backgroundColor: "#111",
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 8,
    alignItems: "center",
  },
  modalBtnText: { color: "#fff", fontWeight: "600" },

  modalBtnSecondary: {
    backgroundColor: "#f5f5f5",
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 10,
    alignItems: "center",
  },
  modalBtnTextSecondary: { color: "#111", fontWeight: "600" },

  closeBtn: { alignItems: "center", marginTop: 12 },
  close: { fontWeight: "600" },
});
