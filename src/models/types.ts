export type DeviceType =
  | "router"
  | "switch"
  | "access_point"
  | "server"
  | "workstation"
  | "printer"
  | "camera"
  | "voip_phone"
  | "iot"
  | "mobile"
  | "unknown";

export type DeviceStatus =
  | "online"
  | "offline"
  | "new"
  | "changed"
  | "unknown"
  | "risk";

export type RiskSeverity = "low" | "medium" | "high" | "critical";

export type Site = {
  id: string;
  clientName: string;
  siteName: string;
  address?: string;
  notes?: string;
  createdAt: string;
};

export type Scan = {
  id: string;
  siteId: string;
  networkName: string;
  subnet: string;
  gatewayIp: string;
  startedAt: string;
  completedAt?: string;
  deviceCount: number;
  riskCount: number;
};

export type Device = {
  id: string;
  scanId: string;
  name: string;
  ip: string;
  mac?: string;
  hostname?: string;
  vendor?: string;
  type: DeviceType;
  latencyMs?: number;
  status: DeviceStatus;
  isKnown: boolean;
  locationLabel?: string;
  notes?: string;
};

export type Service = {
  id: string;
  deviceId: string;
  port: number;
  protocol: "tcp" | "udp";
  name: string;
  description?: string;
  riskLevel: "none" | "low" | "medium" | "high";
};

export type RiskFinding = {
  id: string;
  scanId: string;
  deviceId: string;
  severity: RiskSeverity;
  title: string;
  evidence: string;
  recommendation: string;
  status: "open" | "acknowledged" | "resolved" | "false_positive";
};
