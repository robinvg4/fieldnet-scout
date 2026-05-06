import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#020617" },
          headerTintColor: "#f8fafc",
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: "#020617" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "FieldNet Scout" }} />
        <Stack.Screen name="scan" options={{ title: "Scan" }} />
        <Stack.Screen name="devices" options={{ title: "Devices" }} />
        <Stack.Screen name="risks" options={{ title: "Risks" }} />
        <Stack.Screen name="tools" options={{ title: "Tools" }} />
        <Stack.Screen name="sites" options={{ title: "Sites" }} />
      </Stack>
    </>
  );
}
