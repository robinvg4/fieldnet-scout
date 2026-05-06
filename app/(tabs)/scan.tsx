import { Link } from "expo-router";
import { Activity, AlertTriangle, CheckCircle2 } from "lucide-react-native";
import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  RealScanProgressStage,
  runRealScan,
} from "../../src/services/realScanEngine";
import { setCurrentScanState } from "../../src/state/scanStore";

function getStageLabel(stage: RealScanProgressStage): string {
  switch (stage) {
    case "reading_network":
      return "Reading network";
    case "building_range":
      return "Building scan range";
    case "probing_hosts":
      return "Probing hosts";
    case "building_results":
      return "Building results";
    case "completed":
      return "Scan completed";
    case "failed":
      return "Scan failed";
    default:
      return "Ready";
  }
}

export default function ScanScreen() {
  const [stage, setStage] = useState<RealScanProgressStage>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("Ready to scan the current /24 network.");
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
      const result = await runRealScan((nextStage, nextProgress, nextMessage) => {
        setStage(nextStage);
        setProgress(nextProgress);
        setMessage(nextMessage);
      });

      setCurrentScanState(result);
      setDeviceCount(result.devices.length);
      setRiskCount(result.risks.length);
      setMessage(result.warning ?? "Real scan completed.");
    } catch (scanError) {
      setStage("failed");
      setProgress(0);
      setError(scanError instanceof Error ? scanError.message : "Unknown scan failure");
      setMessage("The scan could not complete.");
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Real scan target</Text>
        <Text style={styles.title}>Current /24 Network</Text>
        <Text style={styles.subtitle}>
          Detects reachable HTTP/HTTPS services on nearby LAN hosts.
        </Text>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>

        <Text style={styles.stage}>{getStageLabel(stage)}</Text>
        <Text style={styles.percent}>{progress}%</Text>
        <Text style={styles.message}>{message}</Text>

        {error && (
          <View style={styles.errorBox}>
            <AlertTriangle color="#fca5a5" size={18} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.primaryButton, isScanning && styles.disabledButton]}
          onPress={startScan}
          disabled={isScanning}
        >
          <Activity color="#fff" size={20} />
          <Text style={styles.primaryButtonText}>
            {isScanning ? "Scanning..." : "Run Real Scan"}
          </Text>
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
              <Text style={styles.secondaryButtonText}>View Real Devices</Text>
            </TouchableOpacity>
          </Link>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#020617" },
  content: { padding: 16 },
  card: {
    backgroundColor: "#0f172a",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  eyebrow: {
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 2,
    fontSize: 12,
    marginBottom: 6,
  },
  title: { color: "#f8fafc", fontSize: 28, fontWeight: "800" },
  subtitle: { color: "#94a3b8", marginTop: 6, lineHeight: 20 },
  progressTrack: {
    height: 12,
    backgroundColor: "#020617",
    borderRadius: 999,
    marginTop: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#2563eb",
    borderRadius: 999,
  },
  stage: {
    color: "#f8fafc",
    fontWeight: "700",
    fontSize: 18,
    marginTop: 20,
  },
  percent: {
    color: "#94a3b8",
    marginTop: 4,
  },
  message: {
    color: "#cbd5e1",
    marginTop: 12,
    lineHeight: 20,
  },
  errorBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#7f1d1d",
    backgroundColor: "#450a0a",
    flexDirection: "row",
    gap: 10,
  },
  errorText: {
    color: "#fecaca",
    flex: 1,
    lineHeight: 18,
  },
  resultBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#164e63",
    backgroundColor: "#083344",
  },
  resultText: {
    color: "#cffafe",
    fontWeight: "700",
    marginBottom: 4,
  },
  primaryButton: {
    marginTop: 22,
    height: 54,
    backgroundColor: "#2563eb",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
  secondaryButton: {
    marginTop: 12,
    height: 54,
    backgroundColor: "#020617",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  secondaryButtonText: {
    color: "#f8fafc",
    fontWeight: "800",
    fontSize: 16,
  },
});
