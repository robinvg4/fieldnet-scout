import { Tabs } from "expo-router";
import { Activity, Archive, Network, ShieldAlert, Wrench } from "lucide-react-native";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#020617" },
        headerTintColor: "#f8fafc",
        headerTitleStyle: { fontWeight: "700" },
        tabBarStyle: {
          backgroundColor: "#020617",
          borderTopColor: "#1e293b",
        },
        tabBarActiveTintColor: "#38bdf8",
        tabBarInactiveTintColor: "#64748b",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Scan",
          tabBarIcon: ({ color }) => <Activity color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: "Run Scan",
          tabBarIcon: ({ color }) => <Activity color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="devices"
        options={{
          title: "Devices",
          tabBarIcon: ({ color }) => <Network color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="risks"
        options={{
          title: "Risks",
          tabBarIcon: ({ color }) => <ShieldAlert color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="tools"
        options={{
          title: "Tools",
          tabBarIcon: ({ color }) => <Wrench color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="sites"
        options={{
          title: "Sites",
          tabBarIcon: ({ color }) => <Archive color={color} size={22} />,
        }}
      />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
