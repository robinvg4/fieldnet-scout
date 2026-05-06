import {
  AlertTriangle,
  Laptop,
  Network,
  Printer,
  Router,
  Server,
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
import { Device, DeviceType, Service } from "../../src/models/types";
import {
  CurrentScanState,
  getCurrentScanState,
  subscribeToScanState,
} from "../../src/state/scanStore";

export default function DevicesScreen() {
  const [query, setQuery] = useState("");
  const [scanState, setScanState] = useState<CurrentScanState>(getCurrentScanState());
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  useEffect(() => subscribeToScanState(setScanState), []);

  const filteredDevices = useMemo(() => {
    return scanState.devices.filter((device) => {
      const text = `${device.name} ${device.ip} ${device.vendor} ${device.type}`.toLowerCase();
      return text.includes(query.toLowerCase());
    });
  }, [query, scanState.devices]);

  const selectedDevice =
    filteredDevices.find((device) => device.id === selectedDeviceId) ?? filteredDevices[0] ?? null;

  const services = selectedDevice
    ? scanState.services.filter((service) => service.deviceId === selectedDevice.id)
    : [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search real scan results"
        placeholderTextColor="#64748b"
        style={styles.search}
      />

      {scanState.warning && <Text style={styles.warning}>{scanState.warning}</Text>}

      {filteredDevices.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No real scan results yet</Text>
          <Text style={styles.emptyText}>
            Go to Run Scan and start a real scan. Devices will appear here when reachable HTTP/HTTPS services are detected.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.list}>
            {filteredDevices.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
                selected={selectedDevice?.id === device.id}
                onPress={() => setSelectedDeviceId(device.id)}
              />
            ))}
          </View>

          {selectedDevice && <DeviceDetail device={selectedDevice} services={services} />}
        </>
      )}
    </ScrollView>
  );
}

function DeviceDetail({ device, services }: { device: Device; services: Service[] }) {
  return (
    <View style={styles.detailCard}>
      <Text style={styles.eyebrow}>Device detail</Text>
      <Text style={styles.title}>{device.name}</Text>
      <Text style={styles.subtitle}>{device.ip}</Text>

      <View style={styles.infoGrid}>
        <Info label="Vendor" value={device.vendor || "Unknown"} />
        <Info label="Type" value={device.type} />
        <Info label="Status" value={device.status} />
        <Info label="Latency" value={`${device.latencyMs ?? "-"} ms`} />
      </View>

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

      <Text style={styles.sectionTitle}>Notes</Text>
      <Text style={styles.notes}>{device.notes || "No notes."}</Text>
    </View>
  );
}

function DeviceRow({
  device,
  selected,
  onPress,
}: {
  device: Device;
  selected: boolean;
  onPress: () => void;
}) {
  const Icon = getDeviceIcon(device.type);
  const risky = device.status === "risk" || device.status === "unknown";

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
          {device.ip} · {device.vendor || "Unknown"} · {device.type}
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

function getDeviceIcon(type: DeviceType) {
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
    default:
      return Laptop;
  }
}

function getRiskStyle(level: string) {
  if (level === "high") return { color: "#fca5a5", borderColor: "#7f1d1d" };
  if (level === "medium") return { color: "#fcd34d", borderColor: "#78350f" };
  return { color: "#cbd5e1", borderColor: "#334155" };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#020617" },
  content: { padding: 16, gap: 14 },
  search: {
    backgroundColor: "#0f172a",
    borderColor: "#1e293b",
    borderWidth: 1,
    borderRadius: 18,
    color: "#f8fafc",
    padding: 14,
  },
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
  detailCard: {
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
  title: { color: "#f8fafc", fontSize: 24, fontWeight: "800" },
  subtitle: { color: "#94a3b8", marginTop: 4 },
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
    fontWeight: "800",
    marginTop: 20,
    marginBottom: 10,
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
  notes: { color: "#cbd5e1", lineHeight: 20 },
});
