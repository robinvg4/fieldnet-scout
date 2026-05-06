const http = require("http");
const os = require("os");
const net = require("net");

const PORT = Number(process.env.FIELDNET_AGENT_PORT || 47891);
const HOST = process.env.FIELDNET_AGENT_HOST || "0.0.0.0";

const COMMON_PORTS = [
  21, 22, 23, 25, 53, 80, 110, 139, 143, 443, 445, 515, 548, 587, 631,
  993, 995, 1433, 3306, 3389, 5900, 8000, 8080, 8443, 9100,
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

  return results;
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

function prioritizeHosts(hosts, sourceIp) {
  const sourceOctet = Number(sourceIp.split(".")[3]);
  const gateway = hosts.filter((host) => host.endsWith(".1"));
  const nearby = hosts
    .filter((host) => {
      const octet = Number(host.split(".")[3]);
      return Math.abs(octet - sourceOctet) <= 64 && octet !== sourceOctet;
    })
    .sort((a, b) => Math.abs(Number(a.split(".")[3]) - sourceOctet) - Math.abs(Number(b.split(".")[3]) - sourceOctet));
  const rest = hosts.filter((host) => !gateway.includes(host) && !nearby.includes(host));
  return [...gateway, ...nearby, ...rest];
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
    139: "NetBIOS",
    143: "IMAP",
    443: "HTTPS",
    445: "SMB",
    515: "LPD Print",
    548: "AFP",
    587: "SMTP Submission",
    631: "IPP",
    993: "IMAPS",
    995: "POP3S",
    1433: "MSSQL",
    3306: "MySQL",
    3389: "RDP",
    5900: "VNC",
    8000: "HTTP Alternate",
    8080: "HTTP Alternate",
    8443: "HTTPS Alternate",
    9100: "JetDirect Print",
  };
  return map[port] || `TCP ${port}`;
}

function getRisk(port) {
  if ([21, 23].includes(port)) return "high";
  if ([80, 110, 139, 445, 1433, 3306, 3389, 5900, 8000, 8080].includes(port)) return "medium";
  return "low";
}

function inferDeviceType(ip, ports) {
  if (ip.endsWith(".1")) return "router";
  if (ports.some((port) => [515, 631, 9100].includes(port))) return "printer";
  if (ports.some((port) => [139, 445, 1433, 3306].includes(port))) return "server";
  return "unknown";
}

function inferDeviceName(ip, ports) {
  if (ip.endsWith(".1")) return "Likely Gateway";
  if (ports.some((port) => [515, 631, 9100].includes(port))) return "Network Printer";
  if (ports.some((port) => [139, 445].includes(port))) return "File Sharing Host";
  if (ports.includes(3389)) return "Remote Desktop Host";
  if (ports.some((port) => [22, 23, 80, 443, 8080, 8443].includes(port))) return "Managed Network Device";
  return "Discovered Host";
}

function buildRiskFinding(scanId, deviceId, ip, port) {
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

  if ([139, 445].includes(port)) {
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

async function scan({ interfaceAddress, maxHosts = 128, timeoutMs = 700, concurrency = 32, ports = COMMON_PORTS }) {
  const interfaces = getLocalIPv4Interfaces();
  const selectedInterface = interfaceAddress
    ? interfaces.find((item) => item.address === interfaceAddress)
    : interfaces[0];

  if (!selectedInterface) {
    throw new Error("No active non-loopback IPv4 interface found.");
  }

  const subnet = selectedInterface.address.split(".").slice(0, 3).join(".") + ".0/24";
  const hosts = prioritizeHosts(getSubnetHosts(selectedInterface.address), selectedInterface.address).slice(0, maxHosts);
  const scanId = `scan-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const devices = [];
  const services = [];
  const risks = [];
  let completed = 0;

  await runWithConcurrency(hosts, concurrency, async (ip) => {
    const portResults = await Promise.all(ports.map((port) => probeTcpPort(ip, port, timeoutMs)));
    const openPorts = portResults.filter((result) => result.open);

    if (openPorts.length > 0) {
      const deviceId = `device-${ip.replaceAll(".", "-")}`;
      const portNumbers = openPorts.map((result) => result.port);

      devices.push({
        id: deviceId,
        scanId,
        name: inferDeviceName(ip, portNumbers),
        ip,
        vendor: "Unknown",
        type: inferDeviceType(ip, portNumbers),
        latencyMs: Math.min(...openPorts.map((result) => result.latencyMs)),
        status: openPorts.some((result) => [21, 23, 80, 139, 445, 3389, 5900, 8000, 8080].includes(result.port)) ? "risk" : "online",
        isKnown: false,
        notes: `Detected by desktop scanner agent. Open ports: ${portNumbers.join(", ")}.`,
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
    warning: "Results are produced by the local desktop scanner agent using real TCP connect probes.",
    agent: {
      version: "0.1.0",
      interface: selectedInterface,
      scannedHosts: hosts.length,
      scannedPorts: ports,
      completedHosts: completed,
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
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.url === "/health") {
    sendJson(res, 200, {
      ok: true,
      name: "fieldnet-scout-agent",
      version: "0.1.0",
      interfaces: getLocalIPv4Interfaces(),
    });
    return;
  }

  if (req.url === "/scan" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const options = body ? JSON.parse(body) : {};
        const result = await scan(options);
        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, HOST, () => {
  const interfaces = getLocalIPv4Interfaces();
  console.log(`FieldNet Scout scanner agent listening on http://${HOST}:${PORT}`);
  console.log("Detected interfaces:");
  interfaces.forEach((item) => console.log(`- ${item.name}: ${item.address} (${item.cidr || item.netmask})`));
  console.log("Endpoints:");
  console.log(`- GET  http://127.0.0.1:${PORT}/health`);
  console.log(`- POST http://127.0.0.1:${PORT}/scan`);
});
