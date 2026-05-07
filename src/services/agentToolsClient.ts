import { Platform } from "react-native";

export type AgentToolId =
  | "ping"
  | "traceroute"
  | "dns"
  | "reverseDns"
  | "portCheck"
  | "subnet"
  | "publicIp"
  | "ssh";

export type AgentToolResult = {
  tool: AgentToolId;
  ok: boolean;
  command: string;
  output: string;
};

const DEFAULT_AGENT_PORT = 47892;

function getAgentBaseUrl(): string {
  if (Platform.OS === "android") return `http://10.0.2.2:${DEFAULT_AGENT_PORT}`;
  return `http://127.0.0.1:${DEFAULT_AGENT_PORT}`;
}

export async function runAgentTool(tool: AgentToolId, value: string): Promise<AgentToolResult> {
  const response = await fetch(`${getAgentBaseUrl()}/tools/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, value }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Tool failed: HTTP ${response.status} ${text}`);
  }

  return response.json() as Promise<AgentToolResult>;
}
