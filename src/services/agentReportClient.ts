import { Platform } from "react-native";
import type { Scan } from "../models/types";
import type { RealScanResult } from "./realScanEngine";

const DEFAULT_AGENT_PORT = 47891;

function getAgentBaseUrl(): string {
  if (Platform.OS === "android") {
    return `http://10.0.2.2:${DEFAULT_AGENT_PORT}`;
  }

  return `http://127.0.0.1:${DEFAULT_AGENT_PORT}`;
}

async function getJson<T>(path: string): Promise<T> {
  const baseUrl = getAgentBaseUrl();
  const response = await fetch(`${baseUrl}${path}`);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Agent request failed: HTTP ${response.status} ${text}`);
  }

  return response.json() as Promise<T>;
}

export function getAgentExportUrls() {
  const baseUrl = getAgentBaseUrl();
  return {
    json: `${baseUrl}/latest.json`,
    csv: `${baseUrl}/latest.csv`,
    history: `${baseUrl}/history`,
  };
}

export async function fetchScanHistory(): Promise<Scan[]> {
  return getJson<Scan[]>("/history");
}

export async function fetchLatestScan(): Promise<RealScanResult | null> {
  const latest = await getJson<RealScanResult | { error: string }>("/latest.json");

  if ("error" in latest) return null;

  return latest;
}
