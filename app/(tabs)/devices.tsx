import {
  AlertTriangle,
  Camera,
  Database,
  Laptop,
  Network,
  Printer,
  Router,
  Server,
  ShieldCheck,
  Wifi,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Device, DeviceType, RiskFinding, Service } from "../../src/models/types";
import {
  CurrentScanState,
  getCurrentScanState,
  subscribeToScanState,
} from "../../src/state/scanStore";

export default function DevicesScreen() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "risk" | "servers" | "printers" | "unknown">("all");
  const [scanState, setScanState] = useState<CurrentScanState>(getCurrentScanState());
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  useEffect(() => subscribeToScanState(setScanState), []);

  const summary = useMemo(() => {
    const risky = scanState.devices.filter((device) => device.status === "risk").length;
    const servers = scanState.devices.filter((device) => device.type === "server").length;
    const printers = scanState.devices.filter((device) => device.type === "printer").length;
    return { total: scanState.devices.length, risky, servers, printers };
  }, [scanState.devices]);

  const filteredDevices = useMemo(() => {
    return scanState.devices.filter((device) => {
      const text = `${device.name} ${device.ip} ${device.mac ?? ""} ${device.hostname ?? ""} ${device.vendor} ${device.type} ${device.notes ?? ""}`.toLowerCase();
      const matchesQuery = text.includes(query.toLowerCase());
      const matchesFilter =
        filter === "all" ||
        (filter === "risk" && device.status === "risk") ||
        (filter === "servers" && device.type === "server") ||
        (filter === "printers" && device.type === "printer") ||
        (filter === "unknown" && device.type === "unknown");
      return matchesQuery && matchesFilter;
    });
  }, [query, filter, scanState.devices]);

  const selectedDevice =
    filteredDevices.find((device) => device.id === selectedDeviceId) ?? filteredDevices[0] ?? null;

  const services = selectedDevice
    ? scanState.services
        .filter((service) => service.deviceId === selectedDevice.id)
        .sort((a, b) => a.port - b.port)
    : [];

  const risks = selectedDevice
    ? scanState.risks.filter((risk) => risk.deviceId === selectedDevice.id)
    : [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.summaryGrid}>
        <SummaryCard label="Devices" value={String(summary.total)} />
        <SummaryCard label="Risks" value={String(summary.risky)} tone={summary.risky > 0 ? "risk" : "normal"} />
        <SummaryCard label="Servers" value={String(summary.servers)} />
        <SummaryCard label="Printers" value={String(summary.printers)} />
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search IP, hostname, MAC, service, role"
        placeholderTextColor="#64748b"
        style={styles.search}
      />

      <View style={styles.filterRow}>
        <FilterPill label="All" active={filter === "all"} onPress={() => setFilter("all")} />
        <FilterPill label="Risk" active={filter === "risk"} onPress={() => setFilter("risk")} />
        <FilterPill label="Servers" active={filter === "servers"} onPress={() => setFilter("servers")} />
        <FilterPill label="Printers" active={filter === "printers"} onPress={() => setFilter("printers")} />
        <FilterPill label="Unknown" active={filter === "unknown"} onPress={() => setFilter("unknown")} />
      </View>

      {scanState.warning && <Text style={styles.warning}>{scanState.warning}</Text>}

      {filteredDevices.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No matching scan results</Text>
          <Text style={styles.emptyText}>
            Run an agent scan or adjust the search/filter. Devices appear here when TCP services are detected.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.list}>
            {filteredDevices.map((device) => {
              const deviceServices = scanState.services.filter((service) => service.deviceId === device.id);
              return (
                <DeviceRow
                  key={device.id}
                  device={device}
                  services={deviceServices}
                  selected={selectedDevice?.id === device.id}
                  onPress={() => setSelectedDeviceId(device.id)}
                />
              );
            })}
          </View>

          {selectedDevice && (
            <DeviceDetail device={selectedDevice} services={services} risks={risks} />
          )}
        </>
      )}
    </ScrollView>
  );
}

function SummaryCard({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "risk" }) {
  return (
    <View style={[styles.summaryCard, tone === "risk" && styles.summaryCardRisk]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.filterPill, active && styles.filterPillActive]}>
      <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function DeviceDetail({
  device,
  services,
  risks,
}: {
  device: Device;
  services: Service[];
  risks: RiskFinding[];
}) {
  const ports = services.map((service) => service.port).join(", ") || "None";

  return (
    <View style={styles.detailCard}>
      <View style={styles.detailHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Device detail</Text>
          <Text style={styles.title}>{device.name}</Text>
          <Text style={styles.subtitle}>{device.ip}</Text>
        </View>
        <ConfidenceBadge confidence={device.fingerprint?.confidence} />
      </View>

      <View style={styles.identityBox}>
        <Text style={styles.identityTitle}>Identity assessment</Text>
        <Text style={styles.identityText}>{device.fingerprint?.role || "Role could not be determined from available signals."}</Text>
        <Text style={styles.identityMeta}>Source: {device.fingerprint?.source || "tcp-scan"}</Text>
      </View>

      <View style={styles.infoGrid}>
        <Info label="Hostname" value={device.hostname || "Unknown"} />
        <Info label="MAC" value={device.mac || "Unknown"} />
        <Info label="Vendor" value={device.vendor || "Unknown"} />
        <Info label="Type" value={formatType(device.type)} />
        <Info label="Status" value={device.status} />
        <Info label="Latency" value={`${device.latencyMs ?? "-"} ms`} />
      </View>

      <Text style={styles.sectionTitle}>Open ports</Text>
      <Text style={styles.portList}>{ports}</Text>

      <Text style={styles.sectionTitle}>Detected services</Text>

      {services.length === 0 ? (
        <Text style={styles.notes}>No services attached to this result.</Text>
      ) : (
        services.map((service) => (
          <View key={service.id} style={styles.serviceRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.serviceName}>{service.name}</Text>
              <Text style={styles.serviceMeta}>
                {service.protocol.toUpperCase()} {service.port} · {service.description}
              </Text>
            </View>
            <Text style={[styles.riskBadge, getRiskStyle(service.riskLevel)]}>
              {service.riskLevel}
            </Text>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Risk findings</Text>
      {risks.length === 0 ? (
        <View style={styles.cleanBox}>
          <ShieldCheck color="#86efac" size={18} />
          <Text style={styles.cleanText}>No risk rules triggered for this host.</Text>
        </View>
      ) : (
        risks.map((risk) => (
          <View key={risk.id} style={styles.riskFindingCard}>
            <View style={styles.riskFindingHeader}>
              <AlertTriangle color={risk.severity === "high" ? "#fca5a5" : "#fcd34d"} size={18} />
              <Text style={styles.riskFindingTitle}>{risk.title}</Text>
              <Text style={[styles.severityBadge, getSeverityStyle(risk.severity)]}>{risk.severity}</Text>
            </View>
            <Text style={styles.riskFindingLabel}>Evidence</Text>
            <Text style={styles.riskFindingText}>{risk.evidence}</Text>
            <Text style={styles.riskFindingLabel}>Recommendation</Text>
            <Text style={styles.riskFindingText}>{risk.recommendation}</Text>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Engineer notes</Text>
      <Text style={styles.notes}>{device.notes || "No notes."}</Text>
    </View>
  );
}

function ConfidenceBadge({ confidence }: { confidence?: number }) {
  const value = confidence ?? 0;
  const label = confidence ? `${confidence}%` : "N/A";
  return (
    <View style={styles.confidenceBadge}>
      <Text style={styles.confidenceLabel}>Confidence</Text>
      <Text style={styles.confidenceValue}>{label}</Text>
    </View>
  );
}

function DeviceRow({
  device,
  services,
  selected,
  onPress,
}: {
  device: Device;
  services: Service[];
  selected: boolean;
  onPress: () => void;
}) {
  const Icon = getDeviceIcon(device.type, services.map((service) => service.port));
  const risky = device.status === "risk" || device.status === "unknown";
  const portSummary = services.map((service) => service.port).join(", ");

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.deviceRow, selected && styles.selectedDeviceRow]}
    >
      <View style={styles.iconBox}>
        <Icon color="#cbd5e1" size={22} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.deviceName}>{device.name}</Text>
        <Text style={styles.deviceMeta}>
          {device.ip} · {device.hostname || device.mac || device.vendor || "Unknown"}
        </Text>
        <Text style={styles.deviceSubMeta}>
          {formatType(device.type)} · ports {portSummary || "none"}
        </Text>
      </View>

      {risky && <AlertTriangle color="#fbbf24" size={18} />}
    </TouchableOpacity>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoBox}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function formatType(type: DeviceType): string {
  return type.replace(/_/g, " ");
}

function getDeviceIcon(type: DeviceType, ports: number[] = []) {
  if (ports.some((port) => [1433, 3306, 5432].includes(port))) return Database;
  switch (type) {
    case "router":
      return Router;
    case "switch":
      return Network;
    case "access_point":
      return Wifi;
    case "printer":
      return Printer;
    case "server":
      return Server;
    case "camera":
      return Camera;
    default:
      return Laptop;
  }
}

function getRiskStyle(level: string) {
  if (level === "high") return { color: "#fca5a5", borderColor: "#7f1d1d" };
  if (level === "medium") return { color: "#fcd34d", borderColor: "#78350f" };
  return { color: "#cbd5e1", borderColor: "#334155" };
}

function getSeverityStyle(level: string) {
  if (level === "high") return { color: "#fca5a5", borderColor: "#7f1d1d" };
  if (level === "critical") return { color: "#fecaca", borderColor: "#991b1b" };
  if (level === "medium") return { color: "#fcd34d", borderColor: "#78350f" };
  return { color: "#cbd5e1", borderColor: "#334155" };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#020617" },
  content: { padding: 16, gap: 14 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  summaryCard: {
    width: "48%",
    backgroundColor: "#0f172a",
    borderColor: "#1e293b",
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
  },
  summaryCardRisk: { borderColor: "#92400e", backgroundColor: "#451a03" },
  summaryLabel: { color: "#94a3b8", fontSize: 12 },
  summaryValue: { color: "#f8fafc", fontWeight: "900", fontSize: 22, marginTop: 4 },
  search: {
    backgroundColor: "#0f172a",
    borderColor: "#1e293b",
    borderWidth: 1,
    borderRadius: 18,
    color: "#f8fafc",
    padding: 14,
  },
  filterRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  filterPill: {
    borderColor: "#1e293b",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#0f172a",
  },
  filterPillActive: { borderColor: "#38bdf8", backgroundColor: "#0c4a6e" },
  filterPillText: { color: "#94a3b8", fontWeight: "700", fontSize: 12 },
  filterPillTextActive: { color: "#e0f2fe" },
  warning: {
    color: "#fcd34d",
    backgroundColor: "#451a03",
    borderColor: "#78350f",
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    lineHeight: 18,
  },
  emptyCard: {
    backgroundColor: "#0f172a",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  emptyTitle: { color: "#f8fafc", fontWeight: "800", fontSize: 18 },
  emptyText: { color: "#94a3b8", marginTop: 8, lineHeight: 20 },
  list: { gap: 10 },
  deviceRow: {
    backgroundColor: "#0f172a",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1e293b",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  selectedDeviceRow: {
    borderColor: "#2563eb",
    backgroundColor: "#172554",
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: "#020617",
    alignItems: "center",
    justifyContent: "center",
  },
  deviceName: { color: "#f8fafc", fontWeight: "800", fontSize: 15 },
  deviceMeta: { color: "#94a3b8", marginTop: 3, fontSize: 12 },
  deviceSubMeta: { color: "#64748b", marginTop: 3, fontSize: 11 },
  detailCard: {
    backgroundColor: "#0f172a",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  detailHeaderRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  eyebrow: {
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 2,
    fontSize: 12,
    marginBottom: 6,
  },
  title: { color: "#f8fafc", fontSize: 24, fontWeight: "900" },
  subtitle: { color: "#94a3b8", marginTop: 4 },
  confidenceBadge: {
    backgroundColor: "#020617",
    borderColor: "#1e293b",
    borderWidth: 1,
    borderRadius: 16,
    padding: 10,
    minWidth: 82,
    alignItems: "center",
  },
  confidenceLabel: { color: "#64748b", fontSize: 10, textTransform: "uppercase" },
  confidenceValue: { color: "#f8fafc", fontWeight: "900", marginTop: 4 },
  identityBox: {
    marginTop: 16,
    backgroundColor: "#020617",
    borderColor: "#1e293b",
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
  },
  identityTitle: { color: "#f8fafc", fontWeight: "800" },
  identityText: { color: "#cbd5e1", marginTop: 6, lineHeight: 19 },
  identityMeta: { color: "#64748b", marginTop: 8, fontSize: 12 },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },
  infoBox: {
    width: "48%",
    backgroundColor: "#020617",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  infoLabel: { color: "#64748b", fontSize: 12 },
  infoValue: { color: "#f8fafc", fontWeight: "700", marginTop: 4 },
  sectionTitle: {
    color: "#f8fafc",
    fontWeight: "900",
    marginTop: 20,
    marginBottom: 10,
  },
  portList: {
    color: "#bae6fd",
    backgroundColor: "#082f49",
    borderColor: "#164e63",
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    fontWeight: "800",
  },
  serviceRow: {
    borderColor: "#1e293b",
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  serviceName: { color: "#f8fafc", fontWeight: "800" },
  serviceMeta: { color: "#94a3b8", marginTop: 3, fontSize: 12 },
  riskBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
    fontSize: 11,
    textTransform: "uppercase",
  },
  cleanBox: {
    borderColor: "#14532d",
    backgroundColor: "#052e16",
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  cleanText: { color: "#bbf7d0", flex: 1 },
  riskFindingCard: {
    backgroundColor: "#1c1917",
    borderColor: "#78350f",
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  riskFindingHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  riskFindingTitle: { color: "#f8fafc", fontWeight: "900", flex: 1 },
  severityBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    textTransform: "uppercase",
    fontSize: 10,
  },
  riskFindingLabel: { color: "#fbbf24", fontSize: 11, textTransform: "uppercase", marginTop: 10, marginBottom: 4 },
  riskFindingText: { color: "#fde68a", lineHeight: 18 },
  notes: { color: "#cbd5e1", lineHeight: 20 },
});
