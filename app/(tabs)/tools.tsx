import {
  ChevronRight,
  ClipboardList,
  Globe,
  KeyRound,
  Network,
  Play,
  Search,
  Send,
  Square,
  Wrench,
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
import {
  AgentToolId,
  readSshOutput,
  runAgentTool,
  sendSshInput,
  startSshSession,
  stopSshSession,
} from "../../src/services/agentToolsClient";

type ToolId = AgentToolId;

type Tool = {
  id: ToolId;
  name: string;
  description: string;
  icon: typeof Network;
  placeholder: string;
  defaultValue: string;
};

const tools: Tool[] = [
  { id: "ping", name: "Ping", description: "Run a real reachability test from the scanner host", icon: Network, placeholder: "192.168.10.1", defaultValue: "192.168.10.1" },
  { id: "traceroute", name: "Traceroute", description: "Run a real path trace from the scanner host", icon: Network, placeholder: "8.8.8.8", defaultValue: "8.8.8.8" },
  { id: "dns", name: "DNS Lookup", description: "Resolve hostname to IP", icon: Search, placeholder: "example.com", defaultValue: "example.com" },
  { id: "reverseDns", name: "Reverse DNS", description: "Resolve IP to hostname", icon: Search, placeholder: "192.168.10.1", defaultValue: "192.168.10.1" },
  { id: "portCheck", name: "Port Check", description: "Test a live TCP connection", icon: Wrench, placeholder: "192.168.10.1:443", defaultValue: "192.168.10.1:443" },
  { id: "ssh", name: "SSH Terminal", description: "Interactive SSH inside the app through the tools agent", icon: KeyRound, placeholder: "192.168.10.1:22", defaultValue: "192.168.10.1:22" },
  { id: "subnet", name: "Subnet Calculator", description: "Calculate a common /24 range", icon: Network, placeholder: "192.168.10.42", defaultValue: "192.168.10.42" },
  { id: "publicIp", name: "Public IP", description: "Check public egress IP from scanner host", icon: Globe, placeholder: "", defaultValue: "" },
];

export default function ToolsScreen() {
  const [selectedToolId, setSelectedToolId] = useState<ToolId>("ping");
  const selectedTool = tools.find((tool) => tool.id === selectedToolId) ?? tools[0];
  const [value, setValue] = useState(selectedTool.defaultValue);
  const [isRunning, setIsRunning] = useState(false);
  const [liveCommand, setLiveCommand] = useState<string | null>(null);
  const [liveOutput, setLiveOutput] = useState<string | null>(null);
  const [liveOk, setLiveOk] = useState<boolean | null>(null);

  const [sshUsername, setSshUsername] = useState("admin");
  const [sshPassword, setSshPassword] = useState("");
  const [sshSessionId, setSshSessionId] = useState<string | null>(null);
  const [sshTerminal, setSshTerminal] = useState("");
  const [sshCommand, setSshCommand] = useState("");
  const [sshRunning, setSshRunning] = useState(false);

  function selectTool(tool: Tool) {
    setSelectedToolId(tool.id);
    setValue(tool.defaultValue);
    setLiveCommand(null);
    setLiveOutput(null);
    setLiveOk(null);
  }

  useEffect(() => {
    if (!sshSessionId) return;

    const timer = setInterval(async () => {
      try {
        const result = await readSshOutput(sshSessionId);
        if (result.output) setSshTerminal((current) => `${current}${result.output}`);
        setSshRunning(result.running);
      } catch (error) {
        setSshTerminal((current) => `${current}\n[SSH read error: ${error instanceof Error ? error.message : "unknown"}]\n`);
        setSshRunning(false);
      }
    }, 900);

    return () => clearInterval(timer);
  }, [sshSessionId]);

  async function runTool() {
    if (selectedTool.id === "ssh") {
      await connectSsh();
      return;
    }

    setIsRunning(true);
    setLiveCommand(null);
    setLiveOutput("Running diagnostic from scanner host...");
    setLiveOk(null);

    try {
      const result = await runAgentTool(selectedTool.id, value);
      setLiveCommand(result.command);
      setLiveOutput(result.output || "No output returned.");
      setLiveOk(result.ok);
    } catch (error) {
      setLiveCommand("Agent request failed");
      setLiveOutput(error instanceof Error ? error.message : "Unknown tool failure");
      setLiveOk(false);
    } finally {
      setIsRunning(false);
    }
  }

  async function connectSsh() {
    setIsRunning(true);
    setSshTerminal("Connecting...\n");
    setSshSessionId(null);
    setSshRunning(false);

    try {
      const result = await startSshSession(value, sshUsername, sshPassword);
      setLiveCommand(result.command);
      setLiveOutput(result.output);
      setLiveOk(result.ok);
      setSshTerminal(`${result.output}\n`);
      if (result.ok && result.sessionId) {
        setSshSessionId(result.sessionId);
        setSshRunning(true);
      }
    } catch (error) {
      setLiveCommand("SSH connection failed");
      setLiveOutput(error instanceof Error ? error.message : "Unknown SSH failure");
      setLiveOk(false);
      setSshTerminal(`SSH connection failed: ${error instanceof Error ? error.message : "unknown"}\n`);
    } finally {
      setIsRunning(false);
    }
  }

  async function submitSshCommand() {
    if (!sshSessionId || sshCommand.trim().length === 0) return;

    const command = sshCommand.endsWith("\n") ? sshCommand : `${sshCommand}\n`;
    setSshTerminal((current) => `${current}> ${sshCommand}\n`);
    setSshCommand("");
    await sendSshInput(sshSessionId, command);
  }

  async function disconnectSsh() {
    if (!sshSessionId) return;
    await stopSshSession(sshSessionId);
    setSshTerminal((current) => `${current}\n[Disconnected]\n`);
    setSshSessionId(null);
    setSshRunning(false);
  }

  const output = useMemo(() => buildToolOutput(selectedTool.id, value), [selectedTool.id, value]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>Engineer utilities</Text>
        <Text style={styles.heroTitle}>Live Field Tools</Text>
        <Text style={styles.heroSubtitle}>
          Runs diagnostics from your Windows scanner host through the tools agent. SSH now renders as an interactive terminal inside the app.
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

        {selectedTool.id === "ssh" && (
          <>
            <View style={styles.sshGrid}>
              <TextInput
                value={sshUsername}
                onChangeText={setSshUsername}
                placeholder="username"
                placeholderTextColor="#64748b"
                autoCapitalize="none"
                style={[styles.input, styles.sshHalfInput]}
              />
              <TextInput
                value={sshPassword}
                onChangeText={setSshPassword}
                placeholder="password"
                placeholderTextColor="#64748b"
                secureTextEntry
                style={[styles.input, styles.sshHalfInput]}
              />
            </View>
            <Text style={styles.sshNotice}>
              Password is sent to the local tools agent for this connection only. It is not saved by the app or written to disk by the agent.
            </Text>
          </>
        )}

        <TouchableOpacity style={[styles.runButton, isRunning && styles.disabledButton]} onPress={runTool} disabled={isRunning}>
          <Play color="#fff" size={18} />
          <Text style={styles.runButtonText}>{isRunning ? "Running..." : selectedTool.id === "ssh" ? "Connect SSH" : "Run Live Tool"}</Text>
        </TouchableOpacity>

        {selectedTool.id === "ssh" && (
          <View style={styles.terminalCard}>
            <View style={styles.terminalHeader}>
              <Text style={styles.terminalTitle}>SSH Terminal</Text>
              <Text style={styles.terminalStatus}>{sshRunning ? "Connected" : "Disconnected"}</Text>
            </View>
            <Text selectable style={styles.terminalOutput}>{sshTerminal || "Connect to start a session."}</Text>
            <View style={styles.commandRow}>
              <TextInput
                value={sshCommand}
                onChangeText={setSshCommand}
                placeholder="command"
                placeholderTextColor="#64748b"
                autoCapitalize="none"
                style={styles.commandInput}
                editable={Boolean(sshSessionId)}
                onSubmitEditing={submitSshCommand}
              />
              <TouchableOpacity style={styles.smallButton} onPress={submitSshCommand} disabled={!sshSessionId}>
                <Send color="#fff" size={16} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.stopButton} onPress={disconnectSsh} disabled={!sshSessionId}>
                <Square color="#fff" size={16} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {selectedTool.id !== "ssh" && (
          <>
            <Text style={styles.label}>Live result</Text>
            <View style={[styles.resultBox, liveOk === false && styles.resultBoxError, liveOk === true && styles.resultBoxOk]}>
              <Text style={styles.resultCommand}>{liveCommand || "No live run yet."}</Text>
              <Text selectable style={styles.resultOutput}>{liveOutput || "Tap Run Live Tool to execute through the tools agent."}</Text>
            </View>
          </>
        )}

        <Text style={styles.label}>Fallback PowerShell command</Text>
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
      return { command: `Test-Connection ${value || "192.168.10.1"} -Count 4`, explanation: "Confirms reachability, packet loss, and approximate latency from the Windows scanner host." };
    case "traceroute":
      return { command: `tracert ${value || "8.8.8.8"}`, explanation: "Inspects the Layer 3 path from the scanner host to a destination." };
    case "dns":
      return { command: `Resolve-DnsName ${value || "example.com"}`, explanation: "Validates DNS resolution and DNS server behavior." };
    case "reverseDns":
      return { command: `Resolve-DnsName ${value || "192.168.10.1"} -Type PTR`, explanation: "Checks whether an IP address has a reverse DNS record." };
    case "portCheck": {
      const [host, port] = (value || "192.168.10.1:443").split(":");
      return { command: `Test-NetConnection ${host || "192.168.10.1"} -Port ${port || "443"}`, explanation: "Verifies whether a specific TCP service is reachable from the scanner host." };
    }
    case "ssh": {
      const [host, port] = (value || "192.168.10.1:22").split(":");
      return { command: `ssh -p ${port || "22"} ${sshTargetPreview(host)}`, explanation: "Connects through the local tools agent and displays the SSH session in the app." };
    }
    case "subnet":
      return { command: "No shell command required", explanation: "Calculates the common /24 range used by the current scanner workflow.", extra: calculate24(value || "192.168.10.42") };
    case "publicIp":
      return { command: "Invoke-RestMethod https://api.ipify.org", explanation: "Confirms the public egress IP address from the scanner host." };
    default:
      return { command: "", explanation: "" };
  }
}

function sshTargetPreview(host: string): string {
  return host || "192.168.10.1";
}

function calculate24(ip: string): string {
  const parts = ip.split(".");
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(Number(part)))) return "Enter a valid IPv4 address.";

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
  sshGrid: { flexDirection: "row", gap: 10 },
  sshHalfInput: { flex: 1 },
  sshNotice: { color: "#fde68a", backgroundColor: "#451a03", borderColor: "#78350f", borderWidth: 1, borderRadius: 16, padding: 12, lineHeight: 18, marginBottom: 12 },
  runButton: { height: 50, backgroundColor: "#2563eb", borderRadius: 18, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  disabledButton: { opacity: 0.6 },
  runButtonText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  label: { color: "#67e8f9", fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.5, fontSize: 11, marginTop: 12, marginBottom: 6 },
  command: { color: "#bae6fd", backgroundColor: "#020617", borderColor: "#1e293b", borderWidth: 1, borderRadius: 16, padding: 12, lineHeight: 20 },
  resultBox: { backgroundColor: "#020617", borderColor: "#1e293b", borderWidth: 1, borderRadius: 16, padding: 12 },
  resultBoxOk: { borderColor: "#166534", backgroundColor: "#052e16" },
  resultBoxError: { borderColor: "#7f1d1d", backgroundColor: "#450a0a" },
  resultCommand: { color: "#f8fafc", fontWeight: "900", marginBottom: 8 },
  resultOutput: { color: "#cbd5e1", lineHeight: 19 },
  terminalCard: { marginTop: 14, backgroundColor: "#020617", borderColor: "#1e293b", borderWidth: 1, borderRadius: 18, padding: 12 },
  terminalHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  terminalTitle: { color: "#f8fafc", fontWeight: "900" },
  terminalStatus: { color: "#67e8f9", fontWeight: "900" },
  terminalOutput: { minHeight: 220, color: "#bbf7d0", fontFamily: "monospace", lineHeight: 18 },
  commandRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  commandInput: { flex: 1, backgroundColor: "#030712", borderColor: "#1e293b", borderWidth: 1, borderRadius: 14, color: "#f8fafc", paddingHorizontal: 12 },
  smallButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#2563eb", alignItems: "center", justifyContent: "center" },
  stopButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#991b1b", alignItems: "center", justifyContent: "center" },
  body: { color: "#cbd5e1", lineHeight: 20 },
});
