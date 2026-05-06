import { Archive, FileDown, History, Server, ShieldAlert } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  CurrentScanState,
  getCurrentScanState,
  subscribeToScanState,
} from "../../src/state/scanStore";

export default function SitesScreen() {
  const [scanState, setScanState] = useState<CurrentScanState>(getCurrentScanState());

  useEffect(() => subscribeToScanState(setScanState), []);

  const serviceCount = scanState.services.length;
  const highRisks = scanState.risks.filter((risk) => risk.severity === "high" || risk.severity === "critical").length;
  const mediumRisks = scanState.risks.filter((risk) => risk.severity === "medium").length;
  const scanStarted = scanState.scan?.startedAt ? new Date(scanState.scan.startedAt).toLocaleString() : "No scan yet";

  const reportPreview = useMemo(() => {
    if (!scanState.scan) return "Run an agent scan to generate a site summary.";
    return `${scanState.devices.length} devices, ${serviceCount} services, ${scanState.risks.length} findings on ${scanState.scan.subnet}.`;
  }, [scanState, serviceCount]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.iconBox}>
          <Archive color="#86efac" size={24} />
        </View>

        <Text style={styles.eyebrow}>Current scan context</Text>
        <Text style={styles.title}>{scanState.scan?.networkName || "Desktop Agent"}</Text>
        <Text style={styles.subtitle}>{scanState.scan?.subnet || "No active scan loaded"}</Text>
        <Text style={styles.body}>{reportPreview}</Text>

        <View style={styles.grid}>
          <Metric label="Last scan" value={scanStarted} />
          <Metric label="Devices" value={String(scanState.devices.length)} />
          <Metric label="Services" value={String(serviceCount)} />
          <Metric label="Risks" value={String(scanState.risks.length)} tone={scanState.risks.length > 0 ? "risk" : "normal"} />
        </View>
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <ShieldAlert color="#fbbf24" size={22} />
          <Text style={styles.sectionTitle}>Risk summary</Text>
        </View>
        <View style={styles.grid}>
          <Metric label="High/Critical" value={String(highRisks)} tone={highRisks > 0 ? "risk" : "normal"} />
          <Metric label="Medium" value={String(mediumRisks)} tone={mediumRisks > 0 ? "risk" : "normal"} />
        </View>
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Server color="#93c5fd" size={22} />
          <Text style={styles.sectionTitle}>Engineer handoff</Text>
        </View>
        <Text style={styles.body}>
          This view is now driven by real agent scan results. Use Devices for asset drill-down and Risks for remediation details.
        </Text>
      </View>

      <TouchableOpacity style={styles.actionRow}>
        <History color="#93c5fd" size={22} />
        <View style={{ flex: 1 }}>
          <Text style={styles.actionTitle}>Scan History</Text>
          <Text style={styles.actionSubtitle}>Next: persist scans locally and compare visits</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.actionRow}>
        <FileDown color="#c4b5fd" size={22} />
        <View style={{ flex: 1 }}>
          <Text style={styles.actionTitle}>Export Report</Text>
          <Text style={styles.actionSubtitle}>Next: generate PDF/CSV/JSON from current scan</Text>
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Metric({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "risk" }) {
  return (
    <View style={[styles.metric, tone === "risk" && styles.metricRisk]}>
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
  sectionCard: {
    backgroundColor: "#0f172a",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  sectionHeader: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 10 },
  sectionTitle: { color: "#f8fafc", fontWeight: "900", fontSize: 16 },
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
  title: { color: "#f8fafc", fontSize: 26, fontWeight: "900" },
  subtitle: { color: "#94a3b8", marginTop: 4 },
  body: { color: "#cbd5e1", marginTop: 10, lineHeight: 20 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  metric: {
    width: "48%",
    backgroundColor: "#020617",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  metricRisk: { borderColor: "#92400e", backgroundColor: "#451a03" },
  metricLabel: { color: "#64748b", fontSize: 12 },
  metricValue: { color: "#f8fafc", fontWeight: "800", marginTop: 4 },
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
