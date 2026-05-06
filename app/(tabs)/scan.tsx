import { Link } from "expo-router";
import { Activity, AlertTriangle, CheckCircle2, Database, Radar, Server } from "lucide-react-native";
import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { runAgentScan } from "../../src/services/agentScanClient";
import { RealScanProgressStage } from "../../src/services/realScanEngine";
import { setCurrentScanState } from "../../src/state/scanStore";

function getStageLabel(stage: RealScanProgressStage): string {
  switch (stage) {
    case "reading_network": return "Connecting to agent";
    case "building_range": return "Starting full discovery";
    case "probing_hosts": return "Processing inventory";
    case "building_results": return "Building results";
    case "completed": return "Scan completed";
    case "failed": return "Scan failed";
    default: return "Ready";
  }
}

export default function ScanScreen() {
  const [stage, setStage] = useState<RealScanProgressStage>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("Ready to run a full vendor-aware agent scan.");
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceCount, setDeviceCount] = useState(0);
  const [riskCount, setRiskCount] = useState(0);

  async function startScan() {
    setIsScanning(true);
    setError(null);
    setDeviceCount(0);
    setRiskCount(0);
    setProgress(0);
    setStage("reading_network");

    try {
      const result = await runAgentScan((nextStage, nextProgress, nextMessage) => {
        setStage(nextStage);
        setProgress(nextProgress);
        setMessage(nextMessage);
      });

      setCurrentScanState(result);
      setDeviceCount(result.devices.length);
      setRiskCount(result.risks.length);
      setMessage(result.warning ?? "Agent scan completed.");
    } catch (scanError) {
      setStage("failed");
      setProgress(0);
      setError(scanError instanceof Error ? scanError.message : "Unknown scan failure");
      setMessage("The scanner agent could not complete the scan.");
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <View style={styles.iconHalo}>
          <Radar color="#67e8f9" size={34} />
        </View>
        <Text style={styles.eyebrow}>Vendor-aware discovery</Text>
        <Text style={styles.title}>Full Subnet Agent Scan</Text>
        <Text style={styles.subtitle}>
          ARP-only inventory, TCP services, MAC vendor identity, NetBIOS, HTTP titles, shares, SSDP/mDNS, history, and CSV/JSON export.
        </Text>

        <View style={styles.capabilityGrid}>
          <Capability icon={<Server color="#93c5fd" size={18} />} label="254 hosts" />
          <Capability icon={<Database color="#c4b5fd" size={18} />} label="CSV/JSON" />
          <Capability icon={<CheckCircle2 color="#86efac" size={18} />} label="Vendor hints" />
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.stage}>{getStageLabel(stage)}</Text>
          <Text style={styles.percent}>{progress}%</Text>
        </View>
        <Text style={styles.message}>{message}</Text>

        {error && (
          <View style={styles.errorBox}>
            <AlertTriangle color="#fca5a5" size={18} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity style={[styles.primaryButton, isScanning && styles.disabledButton]} onPress={startScan} disabled={isScanning}>
          <Activity color="#fff" size={20} />
          <Text style={styles.primaryButtonText}>{isScanning ? "Scanning..." : "Run Production Scan"}</Text>
        </TouchableOpacity>

        {stage === "completed" && (
          <View style={styles.resultBox}>
            <Text style={styles.resultText}>Devices found: {deviceCount}</Text>
            <Text style={styles.resultText}>Risks found: {riskCount}</Text>
          </View>
        )}

        {stage === "completed" && (
          <Link href="/(tabs)/devices" asChild>
            <TouchableOpacity style={styles.secondaryButton}>
              <CheckCircle2 color="#86efac" size={20} />
              <Text style={styles.secondaryButtonText}>Inspect Inventory</Text>
            </TouchableOpacity>
          </Link>
        )}
      </View>

      <View style={styles.noteCard}>
        <Text style={styles.noteTitle}>Agent requirement</Text>
        <Text style={styles.noteText}>Keep npm run agent running on your Windows machine. The emulator calls the agent through 10.0.2.2:47891.</Text>
      </View>
    </ScrollView>
  );
}

function Capability({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View style={styles.capabilityPill}>{icon}<Text style={styles.capabilityText}>{label}</Text></View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#030712" },
  content: { padding: 16, gap: 14 },
  heroCard: { backgroundColor: "#06152a", borderRadius: 30, padding: 20, borderWidth: 1, borderColor: "#164e63" },
  iconHalo: { width: 68, height: 68, borderRadius: 26, backgroundColor: "#083344", borderWidth: 1, borderColor: "#155e75", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  eyebrow: { color: "#67e8f9", textTransform: "uppercase", letterSpacing: 2, fontSize: 11, marginBottom: 7, fontWeight: "900" },
  title: { color: "#f8fafc", fontSize: 31, fontWeight: "900", lineHeight: 36 },
  subtitle: { color: "#cbd5e1", marginTop: 10, lineHeight: 21 },
  capabilityGrid: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 16 },
  capabilityPill: { flexDirection: "row", gap: 7, alignItems: "center", backgroundColor: "#020617", borderColor: "#1e293b", borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 },
  capabilityText: { color: "#cbd5e1", fontWeight: "800", fontSize: 12 },
  progressTrack: { height: 13, backgroundColor: "#020617", borderRadius: 999, marginTop: 24, overflow: "hidden", borderWidth: 1, borderColor: "#1e293b" },
  progressFill: { height: "100%", backgroundColor: "#22d3ee", borderRadius: 999 },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 18 },
  stage: { color: "#f8fafc", fontWeight: "900", fontSize: 18 },
  percent: { color: "#67e8f9", fontWeight: "900" },
  message: { color: "#cbd5e1", marginTop: 10, lineHeight: 20 },
  errorBox: { marginTop: 14, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: "#7f1d1d", backgroundColor: "#450a0a", flexDirection: "row", gap: 10 },
  errorText: { color: "#fecaca", flex: 1, lineHeight: 18 },
  resultBox: { marginTop: 14, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: "#166534", backgroundColor: "#052e16" },
  resultText: { color: "#bbf7d0", fontWeight: "900", marginBottom: 4 },
  primaryButton: { marginTop: 22, height: 56, backgroundColor: "#2563eb", borderRadius: 20, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 },
  disabledButton: { opacity: 0.6 },
  primaryButtonText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  secondaryButton: { marginTop: 12, height: 54, backgroundColor: "#020617", borderRadius: 18, borderWidth: 1, borderColor: "#1e293b", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 },
  secondaryButtonText: { color: "#f8fafc", fontWeight: "900", fontSize: 16 },
  noteCard: { backgroundColor: "#0f172a", borderRadius: 22, borderWidth: 1, borderColor: "#1e293b", padding: 16 },
  noteTitle: { color: "#f8fafc", fontWeight: "900", fontSize: 16 },
  noteText: { color: "#94a3b8", marginTop: 6, lineHeight: 20 },
});
