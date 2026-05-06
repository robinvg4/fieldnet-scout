import { Device, RiskFinding, Scan, Service } from "../models/types";
import { getCurrentNetworkInfo } from "./networkInfo";
import { probeCommonHttpPorts } from "./httpProbe";
import { getLikelySubnet, getUsableHostsFor24 } from "../utils/ip";

export type RealScanProgressStage =
  | "idle"
  | "reading_network"
  | "building_range"
  | "probing_hosts"
  | "building_results"
  | "completed"
  | "failed";

export type RealScanResult = {
  scan: Scan;
  devices: Device[];
  services: Service[];
  risks: RiskFinding[];
  warning?: string;
};

type RealScanOptions = {
  maxHosts?: number;
  timeoutMs?: number;
  concurrency?: number;
};

export async function runRealScan(
  onProgress: (stage: RealScanProgressStage, progress: number, message: string) => void,
  options: RealScanOptions = {},
): Promise<RealScanResult> {
  const maxHosts = options.maxHosts ?? 64;
  const timeoutMs = options.timeoutMs ?? 1000;
  const concurrency = options.concurrency ?? 12;

  onProgress("reading_network", 5, "Reading phone network information");
  const networkInfo = await getCurrentNetworkInfo();
  const subnet = getLikelySubnet(networkInfo.ipAddress);

  if (!networkInfo.ipAddress || !subnet) {
    throw new Error("No IPv4 address detected. Connect to Wi-Fi and try again.");
  }

  onProgress("building_range", 12, `Building scan range for ${subnet}`);
  const allHosts = getUsableHostsFor24(networkInfo.ipAddress);
  const phoneOctet = Number(networkInfo.ipAddress.split(".")[3]);
  const prioritizedHosts = prioritizeHosts(allHosts, phoneOctet).slice(0, maxHosts);

  const scanId = `scan-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const devices: Device[] = [];
  const services: Service[] = [];
  const risks: RiskFinding[] = [];

  let completed = 0;

  await runWithConcurrency(prioritizedHosts, concurrency, async (ip) => {
    const reachableServices = await probeCommonHttpPorts(ip, timeoutMs);

    if (reachableServices.length > 0) {
      const deviceId = `device-${ip.replaceAll(".", "-")}`;
      const hasRiskyHttp = reachableServices.some(
        (result) => result.port === 80 || result.port === 8080 || result.port === 8000,
      );

      devices.push({
        id: deviceId,
        scanId,
        name: inferDeviceName(ip, reachableServices.map((item) => item.port)),
        ip,
        vendor: "Unknown",
        type: "unknown",
        latencyMs: Math.min(...reachableServices.map((item) => item.latencyMs ?? 0)),
        status: hasRiskyHttp ? "risk" : "online",
        isKnown: false,
        notes: "Detected by real HTTP service probe.",
      });

      reachableServices.forEach((result) => {
        const serviceId = `service-${ip.replaceAll(".", "-")}-${result.port}`;
        services.push({
          id: serviceId,
          deviceId,
          port: result.port,
          protocol: "tcp",
          name: getServiceName(result.port),
          description: `HTTP probe reached ${result.url}${result.status ? ` with status ${result.status}` : ""}`,
          riskLevel: getServiceRisk(result.port),
        });

        if (result.port === 80 || result.port === 8080 || result.port === 8000) {
          risks.push({
            id: `risk-${serviceId}`,
            scanId,
            deviceId,
            severity: "medium",
            title: "Unencrypted HTTP service detected",
            evidence: `TCP ${result.port} reachable on ${ip}`,
            recommendation:
              "Verify whether this is a management interface. Prefer HTTPS or restrict access to a management VLAN.",
            status: "open",
          });
        }
      });
    }

    completed += 1;
    const progress = 12 + Math.round((completed / prioritizedHosts.length) * 78);
    onProgress("probing_hosts", progress, `Probed ${completed}/${prioritizedHosts.length} hosts`);
  });

  onProgress("building_results", 95, "Building scan results");

  const scan: Scan = {
    id: scanId,
    siteId: "real-site",
    networkName: networkInfo.type ?? "Current Network",
    subnet,
    gatewayIp: inferGatewayIp(networkInfo.ipAddress),
    startedAt,
    completedAt: new Date().toISOString(),
    deviceCount: devices.length,
    riskCount: risks.length,
  };

  onProgress("completed", 100, `Scan completed: ${devices.length} responsive hosts`);

  return {
    scan,
    devices: devices.sort((a, b) => ipToNumber(a.ip) - ipToNumber(b.ip)),
    services,
    risks,
    warning:
      "This real scan currently detects hosts with reachable HTTP/HTTPS services. Full ICMP, ARP, MAC/vendor, UDP, and raw TCP scans require a custom Android native module.",
  };
}

function prioritizeHosts(hosts: string[], phoneOctet: number): string[] {
  const gatewayLikely = hosts.filter((host) => host.endsWith(".1"));
  const nearby = hosts
    .filter((host) => {
      const octet = Number(host.split(".")[3]);
      return Math.abs(octet - phoneOctet) <= 32 && octet !== phoneOctet;
    })
    .sort((a, b) => Math.abs(Number(a.split(".")[3]) - phoneOctet) - Math.abs(Number(b.split(".")[3]) - phoneOctet));
  const rest = hosts.filter((host) => !gatewayLikely.includes(host) && !nearby.includes(host));

  return [...gatewayLikely, ...nearby, ...rest];
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      await worker(items[currentIndex]);
    }
  });

  await Promise.all(workers);
}

function inferGatewayIp(ipAddress: string): string {
  const parts = ipAddress.split(".");
  return `${parts[0]}.${parts[1]}.${parts[2]}.1`;
}

function inferDeviceName(ip: string, ports: number[]): string {
  if (ip.endsWith(".1")) return "Likely Gateway";
  if (ports.includes(80) || ports.includes(443)) return "Web-managed device";
  return "Discovered host";
}

function getServiceName(port: number): string {
  switch (port) {
    case 80:
      return "HTTP";
    case 443:
      return "HTTPS";
    case 8080:
      return "HTTP Alternate";
    case 8000:
      return "HTTP Alternate";
    case 8443:
      return "HTTPS Alternate";
    default:
      return `TCP ${port}`;
  }
}

function getServiceRisk(port: number): "none" | "low" | "medium" | "high" {
  if (port === 80 || port === 8080 || port === 8000) return "medium";
  return "low";
}

function ipToNumber(ip: string): number {
  return ip
    .split(".")
    .map(Number)
    .reduce((acc, part) => acc * 256 + part, 0);
}
