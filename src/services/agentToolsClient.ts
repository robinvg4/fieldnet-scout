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

export type SshSessionStartResult = {
  ok: boolean;
  sessionId?: string;
  command: string;
  output: string;
};

export type SshSessionOutputResult = {
  ok: boolean;
  sessionId: string;
  output: string;
  running: boolean;
  exitCode?: number | null;
};

const DEFAULT_AGENT_PORT = 47892;

function getAgentBaseUrl(): string {
  if (Platform.OS === "android") return `http://10.0.2.2:${DEFAULT_AGENT_PORT}`;
  return `http://127.0.0.1:${DEFAULT_AGENT_PORT}`;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${getAgentBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Agent request failed: HTTP ${response.status} ${text}`);
  }

  return response.json() as Promise<T>;
}

export async function runAgentTool(tool: AgentToolId, value: string): Promise<AgentToolResult> {
  return postJson<AgentToolResult>("/tools/run", { tool, value });
}

export async function startSshSession(target: string, username: string, password: string): Promise<SshSessionStartResult> {
  return postJson<SshSessionStartResult>("/ssh/start", { target, username, password });
}

export async function sendSshInput(sessionId: string, input: string): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>("/ssh/input", { sessionId, input });
}

export async function readSshOutput(sessionId: string): Promise<SshSessionOutputResult> {
  return postJson<SshSessionOutputResult>("/ssh/output", { sessionId });
}

export async function stopSshSession(sessionId: string): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>("/ssh/stop", { sessionId });
}
