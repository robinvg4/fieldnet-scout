import {
  ChevronRight,
  Globe,
  Network,
  Search,
  Wrench,
} from "lucide-react-native";
import { ScrollView, StyleSheet, Text, View } from "react-native";

const tools = [
  {
    name: "Ping",
    description: "Check latency and reachability",
    icon: Network,
  },
  {
    name: "Traceroute",
    description: "Trace path to destination",
    icon: Network,
  },
  { name: "DNS Lookup", description: "Resolve hostname to IP", icon: Search },
  { name: "Reverse DNS", description: "Resolve IP to hostname", icon: Search },
  { name: "Port Check", description: "Test a single TCP port", icon: Wrench },
  {
    name: "Subnet Calculator",
    description: "Calculate ranges and masks",
    icon: Network,
  },
  { name: "Public IP", description: "View external address", icon: Globe },
];

export default function ToolsScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {tools.map((tool) => {
        const Icon = tool.icon;

        return (
          <View key={tool.name} style={styles.row}>
            <View style={styles.iconBox}>
              <Icon color="#cbd5e1" size={22} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{tool.name}</Text>
              <Text style={styles.subtitle}>{tool.description}</Text>
            </View>

            <ChevronRight color="#475569" size={20} />
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#020617" },
  content: { padding: 16, gap: 10 },
  row: {
    backgroundColor: "#0f172a",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1e293b",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: "#020617",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: "#f8fafc", fontWeight: "800", fontSize: 16 },
  subtitle: { color: "#94a3b8", marginTop: 3 },
});
