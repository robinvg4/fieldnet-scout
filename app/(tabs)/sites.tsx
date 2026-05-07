import { Archive, ExternalLink, FileDown, History, RefreshCw, Server, ShieldAlert } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { Scan } from "../../src/models/types";
import {
  fetchLatestScan,
  fetchScanHistory,
  getAgentExportUrls,
} from "../../src/services/agentReportClient";
import { setCurrentScanState } from "../../src/state/scanStore";
import {
  CurrentScanState,
  getCurrentScanState,
  subscribeToScanState,
} from "../../src/state/scanStore";

export default function SitesScreen() {
  const [scanState, setScanState] = useState<CurrentScanState>(getCurrentScanState());
  const [history, setHistory] = useState<Scan[]>([]);
  const [status, setStatus] = useState("Reports are ready when the scanner agent is running.");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => subscribeToScanState(setScanState), []);

  const loadReports = useCallback(async () => {
    setIsLoading(true);
    setStatus("Loading report history from scanner agent...");

    try {
      const [historyResults, latest] = await Promise.all([
        fetchScanHistory(),
        fetchLatestScan(),
      ]);

      setHistory(historyResults);
      if (latest) setCurrentScanState(latest);
      setStatus(`Loaded ${historyResults.length} saved scan${historyResults.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load report history.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const urls = getAgentExportUrls();
  const serviceCount = scanState.services.length;
  const highRisks = scanState.risks.filter((risk) => risk.severity === "high" || risk.severity === "critical").length;
  const mediumRisks = scanState.risks.filter((risk) => risk.severity === "medium").length;
  const scanStarted = scanState.scan?.startedAt ? new Date(scanState.scan.startedAt).toLocaleString() : "No scan yet";

  const reportPreview = useMemo(() => {
    if (!scanState.scan) return "Run an agent scan to generate a site summary.";
    return `${scanState.devices.length} devices, ${serviceCount} services, ${scanState.risks.length} findings on ${scanState.scan.subnet}.`;
  }, [scanState, serviceCount]);

  async function openUrl(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      setStatus(`Could not open ${url}`);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.topRow}>
          <View style={styles.iconBox}>
            <Archive color="#86efac" size={24} />
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={loadReports} disabled={isLoading}>
            <RefreshCw color="#bae6fd" size={18} />
            <Text style={styles.refreshText}>{isLoading ? "Loading" : "Refresh"}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.eyebrow}>Reports</Text>
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

      <Text style={styles.statusText}>{status}</Text>

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
          <FileDown color="#c4b5fd" size={22} />
          <Text style={styles.sectionTitle}>Export current scan</Text>
        </View>
        <Text style={styles.body}>Export endpoints are served by the local scanner agent. Open them in the emulator/browser or download them from Windows.</Text>
        <View style={styles.exportGrid}>
          <ExportButton label="Open JSON" url={urls.json} onPress={openUrl} />
          <ExportButton label="Open CSV" url={urls.csv} onPress={openUrl} />
        </View>
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <History color="#93c5fd" size={22} />
          <Text style={styles.sectionTitle}>Scan history</Text>
        </View>
        {history.length === 0 ? (
          <Text style={styles.body}>No saved scans yet. Run a production scan first.</Text>
        ) : (
          history.slice(0, 10).map((scan) => (
            <View key={scan.id} style={styles.historyRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyTitle}>{scan.subnet}</Text>
                <Text style={styles.historyMeta}>{new Date(scan.completedAt || scan.startedAt).toLocaleString()}</Text>
              </View>
              <View style={styles.historyStats}>
                <Text style={styles.historyStat}>{scan.deviceCount} dev</Text>
                <Text style={styles.historyRisk}>{scan.riskCount} risks</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Server color="#93c5fd" size={22} />
          <Text style={styles.sectionTitle}>Windows export command</Text>
        </View>
        <Text style={styles.code}>Invoke-WebRequest http://127.0.0.1:47891/latest.csv -OutFile fieldnet-scan.csv</Text>
      </View>
    </ScrollView>
  );
}

function ExportButton({ label, url, onPress }: { label: string; url: string; onPress: (url: string) => void }) {
  return (
    <TouchableOpacity style={styles.exportButton} onPress={() => onPress(url)}>
      <ExternalLink color="#bae6fd" size={18} />
      <Text style={styles.exportButtonText}>{label}</Text>
    </TouchableOpacity>
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
  screen: { flex: 1, backgroundColor: "#030712" },
  content: { padding: 16, gap: 12 },
  card: {
    backgroundColor: "#06152a",
    borderRadius: 30,
    padding: 18,
    borderWidth: 1,
    borderColor: "#164e63",
  },
  sectionCard: {
    backgroundColor: "#0f172a",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  refreshButton: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    borderColor: "#164e63",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#082f49",
  },
  refreshText: { color: "#bae6fd", fontWeight: "900", fontSize: 12 },
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
  eyebrow: { color: "#67e8f9", textTransform: "uppercase", letterSpacing: 2, fontSize: 11, marginBottom: 6, fontWeight: "900" },
  title: { color: "#f8fafc", fontSize: 28, fontWeight: "900" },
  subtitle: { color: "#7dd3fc", marginTop: 4, fontWeight: "800" },
  body: { color: "#cbd5e1", marginTop: 10, lineHeight: 20 },
  statusText: { color: "#bae6fd", backgroundColor: "#082f49", borderColor: "#164e63", borderWidth: 1, borderRadius: 16, padding: 12, lineHeight: 18 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
  metric: { width: "48%", backgroundColor: "#020617", borderRadius: 16, padding: 12, borderWidth: 1, borderColor: "#1e293b" },
  metricRisk: { borderColor: "#92400e", backgroundColor: "#451a03" },
  metricLabel: { color: "#64748b", fontSize: 12 },
  metricValue: { color: "#f8fafc", fontWeight: "900", marginTop: 4 },
  exportGrid: { flexDirection: "row", gap: 10, marginTop: 14 },
  exportButton: { flex: 1, height: 48, backgroundColor: "#082f49", borderColor: "#164e63", borderWidth: 1, borderRadius: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  exportButtonText: { color: "#e0f2fe", fontWeight: "900" },
  historyRow: { backgroundColor: "#020617", borderColor: "#1e293b", borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 8, flexDirection: "row", gap: 10, alignItems: "center" },
  historyTitle: { color: "#f8fafc", fontWeight: "900" },
  historyMeta: { color: "#94a3b8", marginTop: 3, fontSize: 12 },
  historyStats: { alignItems: "flex-end" },
  historyStat: { color: "#bae6fd", fontWeight: "900", fontSize: 12 },
  historyRisk: { color: "#fcd34d", fontWeight: "900", fontSize: 12, marginTop: 3 },
  code: { color: "#bae6fd", backgroundColor: "#020617", borderColor: "#1e293b", borderWidth: 1, borderRadius: 16, padding: 12, lineHeight: 20, fontSize: 12 },
});
