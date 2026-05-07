import {
  ChevronRight,
  ClipboardList,
  Globe,
  Network,
  Search,
  Wrench,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type ToolId =
  | "ping"
  | "traceroute"
  | "dns"
  | "reverseDns"
  | "portCheck"
  | "subnet"
  | "publicIp";

type Tool = {
  id: ToolId;
  name: string;
  description: string;
  icon: typeof Network;
  placeholder: string;
  defaultValue: string;
};

const tools: Tool[] = [
  { id: "ping", name: "Ping", description: "Generate a reachability test", icon: Network, placeholder: "192.168.10.1", defaultValue: "192.168.10.1" },
  { id: "traceroute", name: "Traceroute", description: "Generate a path trace", icon: Network, placeholder: "8.8.8.8", defaultValue: "8.8.8.8" },
  { id: "dns", name: "DNS Lookup", description: "Resolve hostname to IP", icon: Search, placeholder: "example.com", defaultValue: "example.com" },
  { id: "reverseDns", name: "Reverse DNS", description: "Resolve IP to hostname", icon: Search, placeholder: "192.168.10.1", defaultValue: "192.168.10.1" },
  { id: "portCheck", name: "Port Check", description: "Generate a TCP port test", icon: Wrench, placeholder: "192.168.10.1:443", defaultValue: "192.168.10.1:443" },
  { id: "subnet", name: "Subnet Calculator", description: "Calculate a common /24 range", icon: Network, placeholder: "192.168.10.42", defaultValue: "192.168.10.42" },
  { id: "publicIp", name: "Public IP", description: "Show external-IP check commands", icon: Globe, placeholder: "", defaultValue: "" },
];

export default function ToolsScreen() {
  const [selectedToolId, setSelectedToolId] = useState<ToolId>("ping");
  const selectedTool = tools.find((tool) => tool.id === selectedToolId) ?? tools[0];
  const [value, setValue] = useState(selectedTool.defaultValue);

  function selectTool(tool: Tool) {
    setSelectedToolId(tool.id);
    setValue(tool.defaultValue);
  }

  const output = useMemo(() => buildToolOutput(selectedTool.id, value), [selectedTool.id, value]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>Engineer utilities</Text>
        <Text style={styles.heroTitle}>Field Tools</Text>
        <Text style={styles.heroSubtitle}>
          These tools generate exact Windows commands for on-site diagnostics. Native execution from the app will be added through agent endpoints next.
        </Text>
      </View>

      {tools.map((tool) => {
        const Icon = tool.icon;
        const active = selectedTool.id === tool.id;

        return (
          <TouchableOpacity key={tool.id} style={[styles.row, active && styles.rowActive]} onPress={() => selectTool(tool)}>
            <View style={styles.iconBox}>
              <Icon color={active ? "#67e8f9" : "#cbd5e1"} size={22} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{tool.name}</Text>
              <Text style={styles.subtitle}>{tool.description}</Text>
            </View>

            <ChevronRight color={active ? "#67e8f9" : "#475569"} size={20} />
          </TouchableOpacity>
        );
      })}

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <ClipboardList color="#bae6fd" size={22} />
          <Text style={styles.panelTitle}>{selectedTool.name}</Text>
        </View>

        {selectedTool.placeholder.length > 0 && (
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={selectedTool.placeholder}
            placeholderTextColor="#64748b"
            autoCapitalize="none"
            style={styles.input}
          />
        )}

        <Text style={styles.label}>PowerShell command</Text>
        <Text selectable style={styles.command}>{output.command}</Text>

        <Text style={styles.label}>Expected use</Text>
        <Text style={styles.body}>{output.explanation}</Text>

        {output.extra && (
          <>
            <Text style={styles.label}>Calculated output</Text>
            <Text style={styles.command}>{output.extra}</Text>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function buildToolOutput(toolId: ToolId, rawValue: string): { command: string; explanation: string; extra?: string } {
  const value = rawValue.trim();

  switch (toolId) {
    case "ping":
      return {
        command: `Test-Connection ${value || "192.168.10.1"} -Count 4`,
        explanation: "Use this to confirm basic reachability, packet loss, and approximate latency from the Windows scanner host.",
      };
    case "traceroute":
      return {
        command: `tracert ${value || "8.8.8.8"}`,
        explanation: "Use this to inspect the Layer 3 path from the scanner host to a destination.",
      };
    case "dns":
      return {
        command: `Resolve-DnsName ${value || "example.com"}`,
        explanation: "Use this to validate local DNS resolution and DNS server behavior.",
      };
    case "reverseDns":
      return {
        command: `Resolve-DnsName ${value || "192.168.10.1"} -Type PTR`,
        explanation: "Use this to check whether an IP address has a reverse DNS record.",
      };
    case "portCheck": {
      const [host, port] = (value || "192.168.10.1:443").split(":");
      return {
        command: `Test-NetConnection ${host || "192.168.10.1"} -Port ${port || "443"}`,
        explanation: "Use this to verify whether a specific TCP service is reachable from the scanner host.",
      };
    }
    case "subnet":
      return {
        command: "No shell command required",
        explanation: "This calculates the common /24 range used by the current scanner workflow.",
        extra: calculate24(value || "192.168.10.42"),
      };
    case "publicIp":
      return {
        command: "Invoke-RestMethod https://api.ipify.org",
        explanation: "Use this from the scanner host to confirm the public egress IP address.",
      };
    default:
      return { command: "", explanation: "" };
  }
}

function calculate24(ip: string): string {
  const parts = ip.split(".");
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(Number(part)))) {
    return "Enter a valid IPv4 address.";
  }

  const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
  return [`Network: ${prefix}.0/24`, `Usable range: ${prefix}.1 - ${prefix}.254`, `Broadcast: ${prefix}.255`, "Mask: 255.255.255.0"].join("\n");
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#030712" },
  content: { padding: 16, gap: 10 },
  heroCard: { backgroundColor: "#06152a", borderColor: "#164e63", borderWidth: 1, borderRadius: 26, padding: 18, marginBottom: 4 },
  eyebrow: { color: "#67e8f9", textTransform: "uppercase", letterSpacing: 2, fontSize: 11, marginBottom: 6, fontWeight: "900" },
  heroTitle: { color: "#f8fafc", fontWeight: "900", fontSize: 28 },
  heroSubtitle: { color: "#cbd5e1", marginTop: 8, lineHeight: 20 },
  row: { backgroundColor: "#0f172a", borderRadius: 20, borderWidth: 1, borderColor: "#1e293b", padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  rowActive: { borderColor: "#0891b2", backgroundColor: "#082f49" },
  iconBox: { width: 42, height: 42, borderRadius: 16, backgroundColor: "#020617", alignItems: "center", justifyContent: "center" },
  title: { color: "#f8fafc", fontWeight: "900", fontSize: 16 },
  subtitle: { color: "#94a3b8", marginTop: 3 },
  panel: { backgroundColor: "#0f172a", borderRadius: 24, borderWidth: 1, borderColor: "#1e293b", padding: 16, marginTop: 6 },
  panelHeader: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 12 },
  panelTitle: { color: "#f8fafc", fontWeight: "900", fontSize: 18 },
  input: { backgroundColor: "#020617", borderColor: "#1e293b", borderWidth: 1, borderRadius: 16, color: "#f8fafc", padding: 13, marginBottom: 12 },
  label: { color: "#67e8f9", fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.5, fontSize: 11, marginTop: 12, marginBottom: 6 },
  command: { color: "#bae6fd", backgroundColor: "#020617", borderColor: "#1e293b", borderWidth: 1, borderRadius: 16, padding: 12, lineHeight: 20 },
  body: { color: "#cbd5e1", lineHeight: 20 },
});
