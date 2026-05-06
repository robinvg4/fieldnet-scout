import { Device, RiskFinding, Scan, Service } from "../models/types";
import { getCurrentNetworkInfo } from "./networkInfo";
import { COMMON_TCP_PORTS, scanTcpPorts } from "./tcpPortScanner";
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
  const maxHosts = options.maxHosts ?? 96;
  const timeoutMs = options.timeoutMs ?? 750;
  const concurrency = options.concurrency ?? 16;

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
    const openPorts = await scanTcpPorts(ip, COMMON_TCP_PORTS, timeoutMs);

    if (openPorts.length > 0) {
      const deviceId = `device-${ip.replaceAll(".", "-")}`;
      const ports = openPorts.map((result) => result.port);
      const highestRisk = Math.max(...ports.map(getNumericRisk));

      devices.push({
        id: deviceId,
        scanId,
        name: inferDeviceName(ip, ports),
        ip,
        vendor: "Unknown",
        type: inferDeviceType(ip, ports),
        latencyMs: Math.min(...openPorts.map((item) => item.latencyMs)),
        status: highestRisk >= 2 ? "risk" : "online",
        isKnown: false,
        notes: `Detected by native TCP probe. Open ports: ${ports.join(", ")}.`,
      });

      openPorts.forEach((result) => {
        const serviceId = `service-${ip.replaceAll(".", "-")}-${result.port}`;
        const riskLevel = getServiceRisk(result.port);

        services.push({
          id: serviceId,
          deviceId,
          port: result.port,
          protocol: "tcp",
          name: getServiceName(result.port),
          description: `TCP connect succeeded in ${result.latencyMs} ms`,
          riskLevel,
        });

        const finding = buildRiskFinding(scanId, deviceId, ip, result.port);
        if (finding) risks.push(finding);
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
      "Native TCP scan enabled. ICMP ping, ARP table, MAC/vendor lookup, UDP services, and SNMP inventory are the next native Android layer.",
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
  if (ports.includes(631) || ports.includes(9100) || ports.includes(515)) return "Network Printer";
  if (ports.includes(445) || ports.includes(139)) return "File Sharing Host";
  if (ports.includes(3389)) return "Remote Desktop Host";
  if (ports.includes(22) || ports.includes(23) || ports.includes(80) || ports.includes(443) || ports.includes(8080)) return "Managed Network Device";
  return "Discovered Host";
}

function inferDeviceType(ip: string, ports: number[]): Device["type"] {
  if (ip.endsWith(".1")) return "router";
  if (ports.includes(631) || ports.includes(9100) || ports.includes(515)) return "printer";
  if (ports.includes(445) || ports.includes(139)) return "server";
  return "unknown";
}

function getServiceName(port: number): string {
  switch (port) {
    case 21:
      return "FTP";
    case 22:
      return "SSH";
    case 23:
      return "Telnet";
    case 25:
      return "SMTP";
    case 53:
      return "DNS";
    case 80:
      return "HTTP";
    case 110:
      return "POP3";
    case 139:
      return "NetBIOS";
    case 143:
      return "IMAP";
    case 443:
      return "HTTPS";
    case 445:
      return "SMB";
    case 515:
      return "LPD Print";
    case 548:
      return "AFP";
    case 587:
      return "SMTP Submission";
    case 631:
      return "IPP";
    case 993:
      return "IMAPS";
    case 995:
      return "POP3S";
    case 1433:
      return "MSSQL";
    case 3306:
      return "MySQL";
    case 3389:
      return "RDP";
    case 5900:
      return "VNC";
    case 8000:
      return "HTTP Alternate";
    case 8080:
      return "HTTP Alternate";
    case 8443:
      return "HTTPS Alternate";
    case 9100:
      return "JetDirect Print";
    default:
      return `TCP ${port}`;
  }
}

function getServiceRisk(port: number): "none" | "low" | "medium" | "high" {
  if (port === 23 || port === 21) return "high";
  if ([80, 110, 139, 445, 1433, 3306, 3389, 5900, 8000, 8080].includes(port)) return "medium";
  return "low";
}

function getNumericRisk(port: number): number {
  const risk = getServiceRisk(port);
  if (risk === "high") return 3;
  if (risk === "medium") return 2;
  if (risk === "low") return 1;
  return 0;
}

function buildRiskFinding(scanId: string, deviceId: string, ip: string, port: number): RiskFinding | null {
  if (port === 23) {
    return {
      id: `risk-${deviceId}-${port}`,
      scanId,
      deviceId,
      severity: "high",
      title: "Telnet detected",
      evidence: `TCP ${port} reachable on ${ip}`,
      recommendation: "Disable Telnet and use SSH for management access.",
      status: "open",
    };
  }

  if (port === 21) {
    return {
      id: `risk-${deviceId}-${port}`,
      scanId,
      deviceId,
      severity: "high",
      title: "FTP detected",
      evidence: `TCP ${port} reachable on ${ip}`,
      recommendation: "Replace FTP with SFTP, SCP, HTTPS, or another encrypted transfer method.",
      status: "open",
    };
  }

  if ([80, 8000, 8080].includes(port)) {
    return {
      id: `risk-${deviceId}-${port}`,
      scanId,
      deviceId,
      severity: "medium",
      title: "Unencrypted HTTP service detected",
      evidence: `TCP ${port} reachable on ${ip}`,
      recommendation: "Verify whether this is a management interface. Prefer HTTPS or restrict access to a management VLAN.",
      status: "open",
    };
  }

  if ([445, 139].includes(port)) {
    return {
      id: `risk-${deviceId}-${port}`,
      scanId,
      deviceId,
      severity: "medium",
      title: "File sharing service detected",
      evidence: `TCP ${port} reachable on ${ip}`,
      recommendation: "Confirm SMB/NetBIOS exposure is expected and restricted to trusted networks.",
      status: "open",
    };
  }

  if ([3389, 5900].includes(port)) {
    return {
      id: `risk-${deviceId}-${port}`,
      scanId,
      deviceId,
      severity: "medium",
      title: "Remote access service detected",
      evidence: `TCP ${port} reachable on ${ip}`,
      recommendation: "Confirm remote access is required and restricted to admin networks or VPN users.",
      status: "open",
    };
  }

  return null;
}

function ipToNumber(ip: string): number {
  return ip
    .split(".")
    .map(Number)
    .reduce((acc, part) => acc * 256 + part, 0);
}
