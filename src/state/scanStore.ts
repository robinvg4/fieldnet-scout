import { Device, RiskFinding, Scan, Service } from "../models/types";

export type CurrentScanState = {
  scan: Scan | null;
  devices: Device[];
  services: Service[];
  risks: RiskFinding[];
  warning?: string;
};

let currentScanState: CurrentScanState = {
  scan: null,
  devices: [],
  services: [],
  risks: [],
};

const listeners = new Set<(state: CurrentScanState) => void>();

export function getCurrentScanState(): CurrentScanState {
  return currentScanState;
}

export function setCurrentScanState(nextState: CurrentScanState): void {
  currentScanState = nextState;
  listeners.forEach((listener) => listener(currentScanState));
}

export function clearCurrentScanState(): void {
  setCurrentScanState({
    scan: null,
    devices: [],
    services: [],
    risks: [],
  });
}

export function subscribeToScanState(
  listener: (state: CurrentScanState) => void,
): () => void {
  listeners.add(listener);
  listener(currentScanState);

  return () => {
    listeners.delete(listener);
  };
}
