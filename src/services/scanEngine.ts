import {
  mockDevices,
  mockRisks,
  mockScan,
  mockServices,
} from "../data/mockData";

export type ScanProgressStage =
  | "idle"
  | "discovering_hosts"
  | "resolving_names"
  | "scanning_services"
  | "checking_risks"
  | "completed";

export type MockScanResult = {
  scan: typeof mockScan;
  devices: typeof mockDevices;
  services: typeof mockServices;
  risks: typeof mockRisks;
};

export async function runMockScan(
  onProgress: (stage: ScanProgressStage, progress: number) => void,
): Promise<MockScanResult> {
  const steps: Array<[ScanProgressStage, number, number]> = [
    ["discovering_hosts", 20, 600],
    ["resolving_names", 45, 600],
    ["scanning_services", 75, 800],
    ["checking_risks", 90, 500],
    ["completed", 100, 300],
  ];

  for (const [stage, progress, delay] of steps) {
    onProgress(stage, progress);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  return {
    scan: mockScan,
    devices: mockDevices,
    services: mockServices,
    risks: mockRisks,
  };
}

export function getStageLabel(stage: ScanProgressStage): string {
  switch (stage) {
    case "discovering_hosts":
      return "Discovering hosts";
    case "resolving_names":
      return "Resolving hostnames";
    case "scanning_services":
      return "Scanning common services";
    case "checking_risks":
      return "Checking risk rules";
    case "completed":
      return "Scan completed";
    default:
      return "Ready";
  }
}
