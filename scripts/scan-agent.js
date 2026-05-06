const http = require("http");
const os = require("os");
const net = require("net");
const dns = require("dns").promises;
const { execFile } = require("child_process");

const PORT = Number(process.env.FIELDNET_AGENT_PORT || 47891);
const HOST = process.env.FIELDNET_AGENT_HOST || "0.0.0.0";

const COMMON_PORTS = [
  21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 515, 548, 554, 587,
  631, 993, 995, 1433, 1900, 3306, 3389, 5000, 5357, 5432, 5900, 8000, 8080,
  8443, 8888, 9100,
];

const OUI_HINTS = [
  { prefix: "00:1A:2B", vendor: "Cisco" },
  { prefix: "00:25:90", vendor: "Supermicro" },
  { prefix: "00:50:56", vendor: "VMware" },
  { prefix: "00:0C:29", vendor: "VMware" },
  { prefix: "00:05:69", vendor: "VMware" },
  { prefix: "3C:52:82", vendor: "Ubiquiti" },
  { prefix: "44:D9:E7", vendor: "Ubiquiti" },
  { prefix: "78:8A:20", vendor: "Ubiquiti" },
  { prefix: "F0:9F:C2", vendor: "Ubiquiti" },
  { prefix: "B4:FB:E4", vendor: "Ubiquiti" },
  { prefix: "DC:9F:DB", vendor: "Ubiquiti" },
  { prefix: "A4:2B:B0", vendor: "TP-Link" },
  { prefix: "50:C7:BF", vendor: "TP-Link" },
  { prefix: "D8:47:32", vendor: "TP-Link" },
  { prefix: "C0:56:27", vendor: "Belkin / Linksys" },
  { prefix: "F8:E9:03", vendor: "D-Link" },
  { prefix: "B8:27:EB", vendor: "Raspberry Pi" },
  { prefix: "DC:A6:32", vendor: "Raspberry Pi" },
  { prefix: "E4:5F:01", vendor: "Raspberry Pi" },
  { prefix: "00:80:92", vendor: "Silex / Printer Adapter" },
  { prefix: "00:17:C8", vendor: "Kyocera" },
  { prefix: "00:1E:8F", vendor: "Canon" },
  { prefix: "30:05:5C", vendor: "Brother" },
  { prefix: "00:21:B7", vendor: "Lexmark" },
  { prefix: "B4:B5:2F", vendor: "Hewlett Packard" },
  { prefix: "3C:D9:2B", vendor: "Hewlett Packard" },
  { prefix: "00:1F:29", vendor: "Hewlett Packard" },
  { prefix: "00:11:32", vendor: "Synology" },
  { prefix: "00:08:9B", vendor: "QNAP" },
  { prefix: "24:5E:BE", vendor: "QNAP" },
  { prefix: "F4:4D:30", vendor: "Elitegroup / Mini PC" },
  { prefix: "D8:BB:C1", vendor: "Apple" },
  { prefix: "F0:18:98", vendor: "Apple" },
  { prefix: "A4:C3:F0", vendor: "Apple" },
  { prefix: "28:CF:E9", vendor: "Apple" },
  { prefix: "AC:DE:48", vendor: "Private / Randomized MAC" },
];

function getLocalIPv4Interfaces() {
  const interfaces = os.networkInterfaces();
  const results = [];

  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        results.push({
          name,
          address: entry.address,
          netmask: entry.netmask,
          mac: entry.mac,
          cidr: entry.cidr,
        });
      }
    }
  }

  return results.sort((a, b) => {
    const score = (item) => /wi-?fi|wireless/i.test(item.name) ? 0 : /ethernet/i.test(item.name) ? 1 : 2;
    return score(a) - score(b);
  });
}

function getSubnetHosts(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return [];
  const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
  return Array.from({ length: 254 }, (_, index) => `${prefix}.${index + 1}`);
}

function ipToNumber(ip) {
  return ip.split(".").map(Number).reduce((acc, part) => acc * 256 + part, 0);
}

function normalizeMac(mac) {
  if (!mac) return null;
  return mac.replace(/-/g, ":").toUpperCase();
}

function lookupVendor(mac) {
  const normalized = normalizeMac(mac);
  if (!normalized) return "Unknown";
  const hit = OUI_HINTS.find((item) => normalized.startsWith(item.prefix));
  return hit ? hit.vendor : "Unknown";
}

function prioritizeHosts(hosts, sourceIp) {
  const sourceOctet = Number(sourceIp.split(".")[3]);
  const fixedPriority = new Set([1, 2, 3, 10, 11, 12, 15, 20, 24, 30, 50, 100, 200, 250, 254]);
  const priority = hosts.filter((host) => fixedPriority.has(Number(host.split(".")[3])));
  const nearby = hosts
    .filter((host) => {
      const octet = Number(host.split(".")[3]);
      return Math.abs(octet - sourceOctet) <= 64 && octet !== sourceOctet && !fixedPriority.has(octet);
    })
    .sort((a, b) => Math.abs(Number(a.split(".")[3]) - sourceOctet) - Math.abs(Number(b.split(".")[3]) - sourceOctet));
  const rest = hosts.filter((host) => !priority.includes(host) && !nearby.includes(host));
  return [...priority, ...nearby, ...rest];
}

function execFileText(command, args, timeoutMs = 2500) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout) => {
      if (error) return resolve("");
      resolve(stdout || "");
    });
  });
}

async function getArpTable() {
  const output = await execFileText(process.platform === "win32" ? "arp.exe" : "arp", ["-a"], 3000);
  const table = new Map();
  const regex = /(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F:-]{11,17})\s+(dynamic|static)?/g;
  let match;

  while ((match = regex.exec(output)) !== null) {
    table.set(match[1], normalizeMac(match[2]));
  }

  return table;
}

async function getNetbiosName(ip) {
  if (process.platform !== "win32") return null;
  const output = await execFileText("nbtstat.exe", ["-A", ip], 2000);
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([^\s<]+)\s+<00>\s+UNIQUE/i);
    if (match && !/WORKGROUP|MSBROWSE/i.test(match[1])) return match[1].trim();
  }
  return null;
}

async function getReverseDnsName(ip) {
  try {
    const names = await Promise.race([
      dns.reverse(ip),
      new Promise((resolve) => setTimeout(() => resolve([]), 1500)),
    ]);
    return Array.isArray(names) && names.length > 0 ? names[0] : null;
  } catch {
    return null;
  }
}

function probeTcpPort(ip, port, timeoutMs) {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    let settled = false;
    const socket = new net.Socket();

    function finish(open, error) {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ip, port, open, latencyMs: Date.now() - startedAt, error });
    }

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false, "timeout"));
    socket.once("error", (error) => finish(false, error.code || error.message));
    socket.connect(port, ip);
  });
}

async function runWithConcurrency(items, concurrency, worker) {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      await worker(items[current], current);
    }
  });
  await Promise.all(workers);
}

function getServiceName(port) {
  const map = {
    21: "FTP",
    22: "SSH",
    23: "Telnet",
    25: "SMTP",
    53: "DNS",
    80: "HTTP",
    110: "POP3",
    135: "MS RPC",
    139: "NetBIOS",
    143: "IMAP",
    443: "HTTPS",
    445: "SMB",
    515: "LPD Print",
    548: "AFP",
    554: "RTSP Camera/Media",
    587: "SMTP Submission",
    631: "IPP",
    993: "IMAPS",
    995: "POP3S",
    1433: "MSSQL",
    1900: "SSDP/UPnP TCP",
    3306: "MySQL",
    3389: "RDP",
    5000: "UPnP/Synology/API",
    5357: "WSDAPI",
    5432: "PostgreSQL",
    5900: "VNC",
    8000: "HTTP Alternate",
    8080: "HTTP Alternate",
    8443: "HTTPS Alternate",
    8888: "HTTP Dev/Admin",
    9100: "JetDirect Print",
  };
  return map[port] || `TCP ${port}`;
}

function getRisk(port) {
  if ([21, 23].includes(port)) return "high";
  if ([80, 110, 135, 139, 445, 1433, 3306, 3389, 5432, 5900, 8000, 8080, 8888].includes(port)) return "medium";
  return "low";
}

function getRoleConfidence(ip, ports, hostname, vendor) {
  let confidence = 45;
  if (hostname) confidence += 20;
  if (vendor && vendor !== "Unknown") confidence += 15;
  if (ip.endsWith(".1")) confidence += 25;
  if (ports.length >= 3) confidence += 10;
  return Math.min(confidence, 98);
}

function inferDeviceProfile(ip, ports, hostname, mac) {
  const lowerHost = (hostname || "").toLowerCase();
  const vendor = lookupVendor(mac);

  const has = (...wanted) => wanted.some((port) => ports.includes(port));
  const all = (...wanted) => wanted.every((port) => ports.includes(port));

  let type = "unknown";
  let name = "Discovered Host";
  let role = "Generic TCP host";

  if (ip.endsWith(".1")) {
    type = "router";
    name = "Likely Gateway / Router";
    role = "Default gateway candidate";
  } else if (has(515, 631, 9100) || /printer|print|canon|brother|hp|epson|xerox|kyocera/.test(`${lowerHost} ${vendor.toLowerCase()}`)) {
    type = "printer";
    name = "Network Printer";
    role = "Print device";
  } else if (has(554) || /cam|camera|nvr|dvr|hikvision|axis|onvif/.test(lowerHost)) {
    type = "camera";
    name = "Camera / Media Device";
    role = "Video, NVR, or RTSP media endpoint";
  } else if (all(139, 445) || has(548) || /nas|synology|qnap|storage|file/.test(`${lowerHost} ${vendor.toLowerCase()}`)) {
    type = "server";
    name = "File Sharing Host / NAS";
    role = "SMB/AFP file sharing endpoint";
  } else if (has(1433, 3306, 5432)) {
    type = "server";
    name = "Database Server";
    role = "Database endpoint";
  } else if (has(3389)) {
    type = "workstation";
    name = "Windows RDP Host";
    role = "Windows workstation or server with remote desktop";
  } else if (has(22) && has(80, 443, 8080, 8443)) {
    type = "unknown";
    name = "Managed Network Device";
    role = "Likely router, switch, AP, appliance, or Linux admin host";
  } else if (has(80, 443, 8080, 8443, 8888)) {
    type = "unknown";
    name = "Web Managed Device";
    role = "Device with web management or web service";
  } else if (has(22)) {
    type = "server";
    name = "SSH Host";
    role = "Linux, network appliance, or managed endpoint";
  }

  if (hostname) name = `${name} (${hostname})`;

  return {
    name,
    type,
    role,
    vendor,
    confidence: getRoleConfidence(ip, ports, hostname, vendor),
  };
}

function buildRiskFinding(scanId, deviceId, ip, port) {
  const base = {
    id: `risk-${deviceId}-${port}`,
    scanId,
    deviceId,
    evidence: `TCP ${port} reachable on ${ip}`,
    status: "open",
  };

  if (port === 23) return { ...base, severity: "high", title: "Telnet detected", recommendation: "Disable Telnet and use SSH for management access." };
  if (port === 21) return { ...base, severity: "high", title: "FTP detected", recommendation: "Replace FTP with SFTP, SCP, HTTPS, or another encrypted transfer method." };
  if ([80, 8000, 8080, 8888].includes(port)) return { ...base, severity: "medium", title: "Unencrypted HTTP service detected", recommendation: "Verify whether this is a management interface. Prefer HTTPS or restrict access to a management VLAN." };
  if ([139, 445].includes(port)) return { ...base, severity: "medium", title: "File sharing service detected", recommendation: "Confirm SMB/NetBIOS exposure is expected and restricted to trusted networks." };
  if ([3389, 5900].includes(port)) return { ...base, severity: "medium", title: "Remote access service detected", recommendation: "Confirm remote access is required and restricted to admin networks or VPN users." };
  if ([1433, 3306, 5432].includes(port)) return { ...base, severity: "medium", title: "Database service detected", recommendation: "Confirm database access is restricted to application servers or admin networks." };
  return null;
}

async function enrichHost(ip, ports, arpTable) {
  const mac = arpTable.get(ip) || null;
  const [reverseDns, netbios] = await Promise.all([getReverseDnsName(ip), getNetbiosName(ip)]);
  const hostname = netbios || reverseDns || null;
  const profile = inferDeviceProfile(ip, ports, hostname, mac);

  return {
    mac,
    hostname,
    profile,
  };
}

async function scan({ interfaceAddress, maxHosts = 128, timeoutMs = 700, concurrency = 32, ports = COMMON_PORTS }) {
  const interfaces = getLocalIPv4Interfaces();
  const selectedInterface = interfaceAddress
    ? interfaces.find((item) => item.address === interfaceAddress)
    : interfaces[0];

  if (!selectedInterface) throw new Error("No active non-loopback IPv4 interface found.");

  const subnet = selectedInterface.address.split(".").slice(0, 3).join(".") + ".0/24";
  const hosts = prioritizeHosts(getSubnetHosts(selectedInterface.address), selectedInterface.address).slice(0, maxHosts);
  const scanId = `scan-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const devices = [];
  const services = [];
  const risks = [];
  let completed = 0;

  const arpTableBefore = await getArpTable();

  await runWithConcurrency(hosts, concurrency, async (ip) => {
    const portResults = await Promise.all(ports.map((port) => probeTcpPort(ip, port, timeoutMs)));
    const openPorts = portResults.filter((result) => result.open);

    if (openPorts.length > 0) {
      const portNumbers = openPorts.map((result) => result.port).sort((a, b) => a - b);
      const arpTable = arpTableBefore.size > 0 ? arpTableBefore : await getArpTable();
      const enriched = await enrichHost(ip, portNumbers, arpTable);
      const deviceId = `device-${ip.replaceAll(".", "-")}`;

      devices.push({
        id: deviceId,
        scanId,
        name: enriched.profile.name,
        ip,
        mac: enriched.mac || undefined,
        hostname: enriched.hostname || undefined,
        vendor: enriched.profile.vendor,
        type: enriched.profile.type,
        latencyMs: Math.min(...openPorts.map((result) => result.latencyMs)),
        status: openPorts.some((result) => [21, 23, 80, 135, 139, 445, 3389, 5900, 8000, 8080, 8888].includes(result.port)) ? "risk" : "online",
        isKnown: false,
        notes: `Role: ${enriched.profile.role}. Confidence: ${enriched.profile.confidence}%. Open ports: ${portNumbers.join(", ")}.`,
        fingerprint: {
          role: enriched.profile.role,
          confidence: enriched.profile.confidence,
          openPorts: portNumbers,
          source: "tcp+dns+arp+netbios",
        },
      });

      for (const result of openPorts) {
        const serviceId = `service-${ip.replaceAll(".", "-")}-${result.port}`;
        services.push({
          id: serviceId,
          deviceId,
          port: result.port,
          protocol: "tcp",
          name: getServiceName(result.port),
          description: `TCP connect succeeded in ${result.latencyMs} ms`,
          riskLevel: getRisk(result.port),
        });

        const risk = buildRiskFinding(scanId, deviceId, ip, result.port);
        if (risk) risks.push(risk);
      }
    }

    completed += 1;
  });

  devices.sort((a, b) => ipToNumber(a.ip) - ipToNumber(b.ip));

  return {
    scan: {
      id: scanId,
      siteId: "desktop-agent",
      networkName: selectedInterface.name,
      subnet,
      gatewayIp: selectedInterface.address.split(".").slice(0, 3).join(".") + ".1",
      startedAt,
      completedAt: new Date().toISOString(),
      deviceCount: devices.length,
      riskCount: risks.length,
    },
    devices,
    services,
    risks,
    warning: "Desktop agent scan: TCP probes enriched with DNS, ARP/MAC where available, NetBIOS names, device fingerprints, and risk rules.",
    agent: {
      version: "0.2.0",
      interface: selectedInterface,
      scannedHosts: hosts.length,
      scannedPorts: ports,
      completedHosts: completed,
      enrichment: ["tcp", "reverse-dns", "arp", "netbios", "fingerprint-rules"],
    },
  };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });

  if (req.url === "/health") {
    return sendJson(res, 200, {
      ok: true,
      name: "fieldnet-scout-agent",
      version: "0.2.0",
      interfaces: getLocalIPv4Interfaces(),
      capabilities: ["tcp-connect-scan", "reverse-dns", "arp-mac", "netbios", "risk-rules", "device-fingerprints"],
    });
  }

  if (req.url === "/scan" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      try {
        const options = body ? JSON.parse(body) : {};
        const result = await scan(options);
        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      }
    });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, HOST, () => {
  const interfaces = getLocalIPv4Interfaces();
  console.log(`FieldNet Scout scanner agent v0.2.0 listening on http://${HOST}:${PORT}`);
  console.log("Detected interfaces:");
  interfaces.forEach((item) => console.log(`- ${item.name}: ${item.address} (${item.cidr || item.netmask})`));
  console.log("Capabilities: TCP scan, DNS, ARP/MAC, NetBIOS, device fingerprints, risk rules");
  console.log(`Health: http://127.0.0.1:${PORT}/health`);
  console.log(`Scan:   POST http://127.0.0.1:${PORT}/scan`);
});
