import { Platform } from "react-native";
import { RealScanProgressStage, RealScanResult } from "./realScanEngine";

const DEFAULT_AGENT_PORT = 47891;

function getDefaultAgentBaseUrl(): string {
  if (Platform.OS === "android") {
    return `http://10.0.2.2:${DEFAULT_AGENT_PORT}`;
  }

  return `http://127.0.0.1:${DEFAULT_AGENT_PORT}`;
}

export async function runAgentScan(
  onProgress: (stage: RealScanProgressStage, progress: number, message: string) => void,
): Promise<RealScanResult> {
  const baseUrl = getDefaultAgentBaseUrl();

  onProgress("reading_network", 5, `Connecting to scanner agent at ${baseUrl}`);

  const healthResponse = await fetch(`${baseUrl}/health`);
  if (!healthResponse.ok) {
    throw new Error(`Scanner agent health check failed with HTTP ${healthResponse.status}`);
  }

  onProgress("building_range", 15, "Scanner agent online. Starting full subnet discovery.");

  const scanResponse = await fetch(`${baseUrl}/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      maxHosts: 254,
      timeoutMs: 650,
      concurrency: 48,
      includeArpOnly: true,
      discovery: "full-subnet",
    }),
  });

  if (!scanResponse.ok) {
    const text = await scanResponse.text();
    throw new Error(`Scanner agent failed with HTTP ${scanResponse.status}: ${text}`);
  }

  onProgress("probing_hosts", 85, "Desktop scanner agent returned enriched inventory.");

  const result = (await scanResponse.json()) as RealScanResult;

  onProgress(
    "completed",
    100,
    `Agent scan completed: ${result.devices.length} devices, ${result.risks.length} risks`,
  );

  return result;
}
