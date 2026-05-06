import { AlertTriangle } from "lucide-react-native";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { mockDevices, mockRisks } from "../src/data/mockData";

export default function RisksScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {mockRisks.map((risk) => {
        const device = mockDevices.find((item) => item.id === risk.deviceId);

        return (
          <View key={risk.id} style={styles.card}>
            <View style={styles.header}>
              <AlertTriangle
                color={risk.severity === "high" ? "#fca5a5" : "#fcd34d"}
                size={22}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{risk.title}</Text>
                <Text style={styles.subtitle}>
                  {device?.name || "Unknown device"} · {device?.ip || "No IP"}
                </Text>
              </View>
              <Text style={[styles.severity, getSeverityStyle(risk.severity)]}>
                {risk.severity}
              </Text>
            </View>

            <Text style={styles.label}>Evidence</Text>
            <Text style={styles.body}>{risk.evidence}</Text>

            <Text style={styles.label}>Recommended action</Text>
            <Text style={styles.body}>{risk.recommendation}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

function getSeverityStyle(severity: string) {
  if (severity === "high") return { color: "#fca5a5", borderColor: "#7f1d1d" };
  if (severity === "medium")
    return { color: "#fcd34d", borderColor: "#78350f" };
  return { color: "#cbd5e1", borderColor: "#334155" };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#020617" },
  content: { padding: 16, gap: 12 },
  card: {
    backgroundColor: "#0f172a",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  header: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 14,
  },
  title: {
    color: "#f8fafc",
    fontWeight: "800",
    fontSize: 16,
  },
  subtitle: {
    color: "#94a3b8",
    marginTop: 3,
  },
  severity: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 11,
    textTransform: "uppercase",
  },
  label: {
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontSize: 11,
    marginTop: 10,
    marginBottom: 4,
  },
  body: {
    color: "#cbd5e1",
    lineHeight: 20,
  },
});
