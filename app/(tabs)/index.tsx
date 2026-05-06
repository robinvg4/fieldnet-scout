import { Link } from "expo-router";
import type { Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  Archive,
  ArrowRight,
  Network,
  ShieldAlert,
  ShieldCheck,
  Wrench,
} from "lucide-react-native";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  CurrentNetworkInfo,
  getCurrentNetworkInfo,
} from "../../src/services/networkInfo";
import {
  CurrentScanState,
  getCurrentScanState,
  subscribeToScanState,
} from "../../src/state/scanStore";

export default function HomeScreen() {
  const [networkInfo, setNetworkInfo] = useState<CurrentNetworkInfo | null>(null);
  const [scanState, setScanState] = useState<CurrentScanState>(getCurrentScanState());

  useEffect(() => subscribeToScanState(setScanState), []);

  useEffect(() => {
    getCurrentNetworkInfo()
      .then(setNetworkInfo)
      .catch(() => {
        setNetworkInfo({ ipAddress: null, isConnected: null, type: null });
      });
  }, []);

  const posture = useMemo(() => {
    const high = scanState.risks.filter((risk) => risk.severity === "high" || risk.severity === "critical").length;
    const medium = scanState.risks.filter((risk) => risk.severity === "medium").length;
    if (!scanState.scan) return { label: "No scan loaded", tone: "idle" as const, detail: "Start with an agent scan." };
    if (high > 0) return { label: "Needs attention", tone: "risk" as const, detail: `${high} high-priority finding${high === 1 ? "" : "s"}` };
    if (medium > 0) return { label: "Review recommended", tone: "warn" as const, detail: `${medium} medium finding${medium === 1 ? "" : "s"}` };
    return { label: "No major findings", tone: "clean" as const, detail: "No high or medium risk rules triggered." };
  }, [scanState]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.eyebrow}>FieldNet Scout</Text>
            <Text style={styles.title}>Network Command Center</Text>
          </View>
          <View style={[styles.postureBadge, styles[`posture_${posture.tone}`]]}>
            {posture.tone === "clean" ? <ShieldCheck color="#bbf7d0" size={18} /> : <ShieldAlert color="#fde68a" size={18} />}
            <Text style={styles.postureText}>{posture.label}</Text>
          </View>
        </View>

        <Text style={styles.subtitle}>{posture.detail}</Text>
        <Text style={styles.networkLine}>
          {scanState.scan?.subnet || networkInfo?.ipAddress || "Agent scan not loaded"}
        </Text>

        <View style={styles.metricGrid}>
          <Metric label="Devices" value={String(scanState.devices.length)} />
          <Metric label="Services" value={String(scanState.services.length)} />
          <Metric label="Risks" value={String(scanState.risks.length)} tone={scanState.risks.length > 0 ? "risk" : "normal"} />
          <Metric label="Connection" value={networkInfo?.isConnected === false ? "Offline" : "Online"} />
        </View>

        <Link href="/(tabs)/scan" asChild>
          <TouchableOpacity style={styles.primaryButton}>
            <Activity color="#fff" size={20} />
            <Text style={styles.primaryButtonText}>Run Agent Scan</Text>
            <ArrowRight color="#dbeafe" size={18} />
          </TouchableOpacity>
        </Link>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Workflow</Text>
        <Text style={styles.sectionSubtitle}>Scan, inspect, remediate, export.</Text>
      </View>

      <View style={styles.navGrid}>
        <NavCard href="/(tabs)/devices" icon={<Network color="#93c5fd" />} title="Devices" subtitle="Inventory, identity, ports" />
        <NavCard href="/(tabs)/risks" icon={<ShieldAlert color="#fca5a5" />} title="Risks" subtitle="Evidence and remediation" />
        <NavCard href="/(tabs)/tools" icon={<Wrench color="#c4b5fd" />} title="Tools" subtitle="Engineer utilities" />
        <NavCard href="/(tabs)/sites" icon={<Archive color="#86efac" />} title="Reports" subtitle="History and exports" />
      </View>

      {scanState.scan && (
        <View style={styles.lastScanCard}>
          <Text style={styles.eyebrow}>Last scan</Text>
          <Text style={styles.lastScanTitle}>{scanState.scan.networkName}</Text>
          <Text style={styles.lastScanMeta}>{scanState.scan.subnet} · {new Date(scanState.scan.completedAt || scanState.scan.startedAt).toLocaleString()}</Text>
        </View>
      )}
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

function NavCard({ href, icon, title, subtitle }: { href: Href; icon: ReactNode; title: string; subtitle: string }) {
  return (
    <Link href={href} asChild>
      <TouchableOpacity style={styles.navCard}>
        <View style={styles.navIcon}>{icon}</View>
        <Text style={styles.navTitle}>{title}</Text>
        <Text style={styles.navSubtitle}>{subtitle}</Text>
      </TouchableOpacity>
    </Link>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#030712" },
  content: { padding: 16, gap: 16 },
  hero: {
    backgroundColor: "#06152a",
    borderRadius: 30,
    padding: 20,
    borderWidth: 1,
    borderColor: "#164e63",
  },
  heroTopRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "flex-start" },
  eyebrow: { color: "#67e8f9", textTransform: "uppercase", letterSpacing: 2, fontSize: 11, marginBottom: 7, fontWeight: "900" },
  title: { color: "#f8fafc", fontSize: 31, fontWeight: "900", lineHeight: 36 },
  subtitle: { color: "#cbd5e1", marginTop: 14, lineHeight: 21 },
  networkLine: { color: "#7dd3fc", marginTop: 10, fontWeight: "800" },
  postureBadge: { flexDirection: "row", gap: 7, alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, borderWidth: 1, maxWidth: 155 },
  posture_idle: { backgroundColor: "#111827", borderColor: "#334155" },
  posture_clean: { backgroundColor: "#052e16", borderColor: "#166534" },
  posture_warn: { backgroundColor: "#451a03", borderColor: "#92400e" },
  posture_risk: { backgroundColor: "#450a0a", borderColor: "#991b1b" },
  postureText: { color: "#f8fafc", fontSize: 11, fontWeight: "900", flexShrink: 1 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 18 },
  metric: { width: "48%", backgroundColor: "#020617", borderRadius: 18, padding: 13, borderWidth: 1, borderColor: "#1e293b" },
  metricRisk: { borderColor: "#92400e", backgroundColor: "#451a03" },
  metricLabel: { color: "#94a3b8", fontSize: 12 },
  metricValue: { color: "#f8fafc", fontWeight: "900", marginTop: 5, fontSize: 20 },
  primaryButton: { marginTop: 20, height: 56, backgroundColor: "#2563eb", borderRadius: 20, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 },
  primaryButtonText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  sectionHeader: { marginTop: 4 },
  sectionTitle: { color: "#f8fafc", fontWeight: "900", fontSize: 20 },
  sectionSubtitle: { color: "#64748b", marginTop: 3 },
  navGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  navCard: { width: "48%", backgroundColor: "#0f172a", borderRadius: 24, padding: 16, borderWidth: 1, borderColor: "#1e293b", minHeight: 134 },
  navIcon: { width: 42, height: 42, borderRadius: 16, backgroundColor: "#020617", alignItems: "center", justifyContent: "center" },
  navTitle: { color: "#f8fafc", fontWeight: "900", fontSize: 17, marginTop: 14 },
  navSubtitle: { color: "#94a3b8", marginTop: 5, fontSize: 12, lineHeight: 17 },
  lastScanCard: { backgroundColor: "#0f172a", borderRadius: 22, padding: 16, borderWidth: 1, borderColor: "#1e293b" },
  lastScanTitle: { color: "#f8fafc", fontWeight: "900", fontSize: 18 },
  lastScanMeta: { color: "#94a3b8", marginTop: 6, lineHeight: 19 },
});
