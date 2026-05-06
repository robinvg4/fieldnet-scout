import { Archive, FileDown, History } from "lucide-react-native";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  mockDevices,
  mockRisks,
  mockScan,
  mockSite,
} from "../src/data/mockData";

export default function SitesScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.iconBox}>
          <Archive color="#86efac" size={24} />
        </View>

        <Text style={styles.eyebrow}>Current site</Text>
        <Text style={styles.title}>{mockSite.siteName}</Text>
        <Text style={styles.subtitle}>{mockSite.clientName}</Text>
        <Text style={styles.body}>{mockSite.notes}</Text>

        <View style={styles.grid}>
          <Metric label="Last scan" value="6 May 2026" />
          <Metric label="Devices" value={String(mockDevices.length)} />
          <Metric label="Risks" value={String(mockRisks.length)} />
          <Metric label="Subnet" value={mockScan.subnet} />
        </View>
      </View>

      <TouchableOpacity style={styles.actionRow}>
        <History color="#93c5fd" size={22} />
        <View style={{ flex: 1 }}>
          <Text style={styles.actionTitle}>Scan History</Text>
          <Text style={styles.actionSubtitle}>
            Compare previous site visits
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.actionRow}>
        <FileDown color="#c4b5fd" size={22} />
        <View style={{ flex: 1 }}>
          <Text style={styles.actionTitle}>Export Report</Text>
          <Text style={styles.actionSubtitle}>PDF, CSV, or JSON export</Text>
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#020617" },
  content: { padding: 16, gap: 12 },
  card: {
    backgroundColor: "#0f172a",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: "#052e16",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  eyebrow: {
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 2,
    fontSize: 12,
    marginBottom: 6,
  },
  title: { color: "#f8fafc", fontSize: 26, fontWeight: "800" },
  subtitle: { color: "#94a3b8", marginTop: 4 },
  body: { color: "#cbd5e1", marginTop: 14, lineHeight: 20 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18,
  },
  metric: {
    width: "48%",
    backgroundColor: "#020617",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  metricLabel: { color: "#64748b", fontSize: 12 },
  metricValue: { color: "#f8fafc", fontWeight: "700", marginTop: 4 },
  actionRow: {
    backgroundColor: "#0f172a",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1e293b",
    padding: 16,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  actionTitle: { color: "#f8fafc", fontWeight: "800", fontSize: 16 },
  actionSubtitle: { color: "#94a3b8", marginTop: 3 },
});
