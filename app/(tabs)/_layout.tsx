import { Tabs } from "expo-router";
import { Activity, Archive, Network, ShieldAlert, Wrench } from "lucide-react-native";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#030712" },
        headerTintColor: "#f8fafc",
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: "900", fontSize: 20 },
        tabBarStyle: {
          backgroundColor: "#030712",
          borderTopColor: "#1e293b",
          height: 76,
          paddingTop: 8,
          paddingBottom: 12,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "800",
        },
        tabBarActiveTintColor: "#22d3ee",
        tabBarInactiveTintColor: "#64748b",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Command",
          tabBarIcon: ({ color }) => <Activity color={color} size={23} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: "Run Scan",
          tabBarIcon: ({ color }) => <Activity color={color} size={23} />,
        }}
      />
      <Tabs.Screen
        name="devices"
        options={{
          title: "Devices",
          tabBarIcon: ({ color }) => <Network color={color} size={23} />,
        }}
      />
      <Tabs.Screen
        name="risks"
        options={{
          title: "Risks",
          tabBarIcon: ({ color }) => <ShieldAlert color={color} size={23} />,
        }}
      />
      <Tabs.Screen
        name="tools"
        options={{
          title: "Tools",
          tabBarIcon: ({ color }) => <Wrench color={color} size={23} />,
        }}
      />
      <Tabs.Screen
        name="sites"
        options={{
          title: "Reports",
          tabBarIcon: ({ color }) => <Archive color={color} size={23} />,
        }}
      />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
