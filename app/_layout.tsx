import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        {/* (auth) */}
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />

        {/* tabs */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

        {/* dynamic lut detail */}
        <Stack.Screen name="lut/[id]" options={{ headerShown: false }} />

        {/* how to import */}
        <Stack.Screen name="how-to-import" options={{ headerShown: false }} />

        {/* paywall */}
        <Stack.Screen name="paywall" options={{ headerShown: false }} />

        {/* modal (si lo usás) */}
        <Stack.Screen name="modal" options={{ presentation: "modal" }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
