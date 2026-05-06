import { Link } from "expo-router";
import { Activity, CheckCircle2 } from "lucide-react-native";
import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  getStageLabel,
  runMockScan,
  ScanProgressStage,
} from "../src/services/scanEngine";

export default function ScanScreen() {
  const [stage, setStage] = useState<ScanProgressStage>("idle");
  const [progress, setProgress] = useState(0);
  const [isScanning, setIsScanning] = useState(false);

  async function startScan() {
    setIsScanning(true);
    await runMockScan((nextStage, nextProgress) => {
      setStage(nextStage);
      setProgress(nextProgress);
    });
    setIsScanning(false);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Scan target</Text>
        <Text style={styles.title}>192.168.10.0/24</Text>
        <Text style={styles.subtitle}>
          Standard scan · common services · risk rules enabled
        </Text>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>

        <Text style={styles.stage}>{getStageLabel(stage)}</Text>
        <Text style={styles.percent}>{progress}%</Text>

        <TouchableOpacity
          style={[styles.primaryButton, isScanning && styles.disabledButton]}
          onPress={startScan}
          disabled={isScanning}
        >
          <Activity color="#fff" size={20} />
          <Text style={styles.primaryButtonText}>
            {isScanning ? "Scanning..." : "Run Mock Scan"}
          </Text>
        </TouchableOpacity>

        {stage === "completed" && (
          <Link href="/(tabs)/devices" asChild>
            <TouchableOpacity style={styles.secondaryButton}>
              <CheckCircle2 color="#86efac" size={20} />
              <Text style={styles.secondaryButtonText}>View Devices</Text>
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
  subtitle: { color: "#94a3b8", marginTop: 6 },
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
