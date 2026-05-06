const http = require("http");
const os = require("os");
const net = require("net");
const dns = require("dns").promises;
const dgram = require("dgram");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const AGENT_VERSION = "0.3.0";
const PORT = Number(process.env.FIELDNET_AGENT_PORT || 47891);
const HOST = process.env.FIELDNET_AGENT_HOST || "0.0.0.0";
const DATA_DIR = path.join(process.cwd(), ".fieldnet");
const HISTORY_DIR = path.join(DATA_DIR, "history");

const COMMON_PORTS = [
  21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 515, 548, 554, 587,
  631, 993, 995, 1433, 1900, 3306, 3389, 5000, 5357, 5432, 5900, 8000, 8080,
  8443, 8888, 9100,
];

const HTTP_PORTS = new Set([80, 443, 5000, 8000, 8080, 8443, 8888]);

const OUI_HINTS = [
  ["00:11:32", "Synology"], ["00:08:9B", "QNAP"], ["24:5E:BE", "QNAP"],
  ["3C:52:82", "Ubiquiti"], ["44:D9:E7", "Ubiquiti"], ["78:8A:20", "Ubiquiti"], ["F0:9F:C2", "Ubiquiti"], ["B4:FB:E4", "Ubiquiti"], ["DC:9F:DB", "Ubiquiti"], ["E0:63:DA", "Ubiquiti"],
  ["80:5E:C0", "Yealink"], ["00:15:65", "Yealink"],
  ["B4:B5:2F", "HP"], ["3C:D9:2B", "HP"], ["00:1F:29", "HP"], ["18:60:24", "HP"],
  ["30:05:5C", "Brother"], ["00:80:92", "Silex / Printer Adapter"], ["00:17:C8", "Kyocera"], ["00:1E:8F", "Canon"], ["00:21:B7", "Lexmark"],
  ["00:50:56", "VMware"], ["00:0C:29", "VMware"], ["00:05:69", "VMware"],
  ["B8:27:EB", "Raspberry Pi"], ["DC:A6:32", "Raspberry Pi"], ["E4:5F:01", "Raspberry Pi"],
  ["A4:2B:B0", "TP-Link"], ["50:C7:BF", "TP-Link"], ["D8:47:32", "TP-Link"],
  ["D8:BB:C1", "Apple"], ["F0:18:98", "Apple"], ["A4:C3:F0", "Apple"], ["28:CF:E9", "Apple"],
  ["AC:DE:48", "Private / Randomized MAC"], ["B0:25:AA", "Private"],
];

function ensureDirs() {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

function getLocalIPv4Interfaces() {
  const interfaces = os.networkInterfaces();
  const results = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        results.push({ name, address: entry.address, netmask: entry.netmask, mac: entry.mac, cidr: entry.cidr });
      }
    }
  }
  return results.sort((a, b) => scoreInterface(a.name) - scoreInterface(b.name));
}

function scoreInterface(name) {
  if (/ethernet/i.test(name)) return 0;
  if (/wi-?fi|wireless/i.test(name)) return 1;
  return 2;
}

function getSubnetHosts(ip) {
  const parts = ip.split(".");
  const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
  return Array.from({ length: 254 }, (_, index) => `${prefix}.${index + 1}`);
}

function ipToNumber(ip) { return ip.split(".").map(Number).reduce((acc, part) => acc * 256 + part, 0); }
function normalizeMac(mac) { return mac ? mac.replace(/-/g, ":").toUpperCase() : null; }
function lookupVendor(mac) {
  const normalized = normalizeMac(mac);
  if (!normalized) return "Unknown";
  const hit = OUI_HINTS.find(([prefix]) => normalized.startsWith(prefix));
  return hit ? hit[1] : "Unknown";
}

function execFileText(command, args, timeoutMs = 3500) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout) => resolve(error ? "" : stdout || ""));
  });
}

async function warmArp(hosts, timeoutMs) {
  if (process.platform !== "win32") return;
  const sample = hosts.slice(0, 254);
  await runWithConcurrency(sample, 64, async (ip) => {
    await execFileText("ping.exe", ["-n", "1", "-w", String(timeoutMs), ip], timeoutMs + 500);
  });
}

async function getArpTable() {
  const output = await execFileText(process.platform === "win32" ? "arp.exe" : "arp", ["-a"], 5000);
  const table = new Map();
  const regex = /(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F:-]{11,17})\s+(dynamic|static)?/g;
  let match;
  while ((match = regex.exec(output)) !== null) table.set(match[1], normalizeMac(match[2]));
  return table;
}

async function getNetbios(ip) {
  if (process.platform !== "win32") return { name: null, user: null, os: null };
  const output = await execFileText("nbtstat.exe", ["-A", ip], 2500);
  const lines = output.split(/\r?\n/);
  let name = null;
  let user = null;
  for (const line of lines) {
    const hostMatch = line.match(/^\s*([^\s<]+)\s+<00>\s+UNIQUE/i);
    const userMatch = line.match(/^\s*([^\s<]+)\s+<03>\s+UNIQUE/i);
    if (hostMatch && !/WORKGROUP|MSBROWSE/i.test(hostMatch[1])) name = hostMatch[1].trim();
    if (userMatch && !name?.includes(userMatch[1])) user = userMatch[1].trim();
  }
  return { name, user, os: output ? "Windows/NetBIOS-capable host" : null };
}

async function getReverseDnsName(ip) {
  try {
    const names = await Promise.race([dns.reverse(ip), new Promise((resolve) => setTimeout(() => resolve([]), 1500))]);
    return Array.isArray(names) && names.length > 0 ? names[0] : null;
  } catch { return null; }
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

async function httpGrab(ip, port, timeoutMs = 1800) {
  if (!HTTP_PORTS.has(port)) return null;
  const scheme = port === 443 || port === 8443 ? "https" : "http";
  const url = `${scheme}://${ip}:${port}/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const server = response.headers.get("server") || null;
    const poweredBy = response.headers.get("x-powered-by") || null;
    const html = await response.text().catch(() => "");
    const title = html.match(/<title[^>]*>([^<]{1,160})<\/title>/i)?.[1]?.trim() || null;
    return { url, status: response.status, title, server, poweredBy };
  } catch (error) {
    return { url, error: error.name || error.message };
  } finally {
    clearTimeout(timer);
  }
}

async function enumerateShares(hostnameOrIp) {
  if (process.platform !== "win32") return [];
  const output = await execFileText("net.exe", ["view", `\\\\${hostnameOrIp}`], 5000);
  if (!output || /System error|Access is denied|The network path was not found/i.test(output)) return [];
  return output
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([^\s$][^\s]*)\s+(Disk|Print)/i))
    .filter(Boolean)
    .map((match) => ({ name: match[1], type: match[2] }));
}

async function discoverSsdp(timeoutMs = 1400) {
  const message = Buffer.from([
    "M-SEARCH * HTTP/1.1",
    "HOST: 239.255.255.250:1900",
    "MAN: \"ssdp:discover\"",
    "MX: 1",
    "ST: ssdp:all",
    "", ""
  ].join("\r\n"));
  return udpDiscovery("239.255.255.250", 1900, message, timeoutMs, parseSsdpResponse);
}

async function discoverMdns(timeoutMs = 1400) {
  // Minimal mDNS packet for _services._dns-sd._udp.local PTR. Kept intentionally basic.
  const query = Buffer.from("000000000001000000000000095f7365727669636573075f646e732d7364045f756470056c6f63616c00000c0001", "hex");
  return udpDiscovery("224.0.0.251", 5353, query, timeoutMs, (msg, rinfo) => ({ ip: rinfo.address, protocol: "mDNS", rawBytes: msg.length }));
}

async function udpDiscovery(multicastAddress, port, message, timeoutMs, parser) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    const results = [];
    const timer = setTimeout(() => { socket.close(); resolve(results); }, timeoutMs);
    socket.on("message", (msg, rinfo) => {
      const parsed = parser(msg, rinfo);
      if (parsed) results.push(parsed);
    });
    socket.on("error", () => { clearTimeout(timer); socket.close(); resolve(results); });
    socket.bind(() => {
      try { socket.setMulticastTTL(2); } catch {}
      socket.send(message, 0, message.length, port, multicastAddress);
    });
  });
}

function parseSsdpResponse(msg, rinfo) {
  const text = msg.toString("utf8");
  const headers = {};
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx > 0) headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  return { ip: rinfo.address, protocol: "SSDP", server: headers.server, st: headers.st, usn: headers.usn, location: headers.location };
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
  return ({ 21:"FTP",22:"SSH",23:"Telnet",25:"SMTP",53:"DNS",80:"HTTP",110:"POP3",135:"MS RPC",139:"NetBIOS",143:"IMAP",443:"HTTPS",445:"SMB",515:"LPD Print",548:"AFP",554:"RTSP Camera/Media",587:"SMTP Submission",631:"IPP",993:"IMAPS",995:"POP3S",1433:"MSSQL",1900:"SSDP/UPnP TCP",3306:"MySQL",3389:"RDP",5000:"UPnP/Synology/API",5357:"WSDAPI",5432:"PostgreSQL",5900:"VNC",8000:"HTTP Alternate",8080:"HTTP Alternate",8443:"HTTPS Alternate",8888:"HTTP Dev/Admin",9100:"JetDirect Print" })[port] || `TCP ${port}`;
}

function getRisk(port) {
  if ([21, 23].includes(port)) return "high";
  if ([80, 110, 135, 139, 445, 1433, 3306, 3389, 5432, 5900, 8000, 8080, 8888].includes(port)) return "medium";
  return "low";
}

function inferProfile(ip, ports, hostname, mac, httpInfo, shares, discovery) {
  const vendor = lookupVendor(mac);
  const lower = `${hostname || ""} ${vendor} ${httpInfo.map((h) => h?.title || "").join(" ")} ${discovery.map((d) => d.server || d.st || "").join(" ")}`.toLowerCase();
  const has = (...wanted) => wanted.some((port) => ports.includes(port));
  const all = (...wanted) => wanted.every((port) => ports.includes(port));
  let type = "unknown", name = "Discovered Host", role = ports.length ? "Generic TCP host" : "ARP-only active host";
  if (ip.endsWith(".1")) { type = "router"; name = "Likely Gateway / Router"; role = "Default gateway candidate"; }
  else if (has(515,631,9100) || /printer|print|canon|brother|hp|epson|xerox|kyocera/.test(lower)) { type = "printer"; name = "Network Printer"; role = "Print endpoint"; }
  else if (has(554) || /camera|nvr|dvr|hikvision|axis|onvif|rtsp/.test(lower)) { type = "camera"; name = "Camera / Media Device"; role = "Video/NVR/RTSP endpoint"; }
  else if (all(139,445) || has(548) || shares.length || /nas|synology|qnap|storage|file/.test(lower)) { type = "server"; name = "File Sharing Host / NAS"; role = "SMB/AFP/share endpoint"; }
  else if (has(1433,3306,5432)) { type = "server"; name = "Database Server"; role = "Database endpoint"; }
  else if (has(3389)) { type = "workstation"; name = "Windows RDP Host"; role = "Windows workstation/server with RDP"; }
  else if (has(22) && has(80,443,8080,8443)) { type = "unknown"; name = "Managed Network Device"; role = "Network appliance or Linux admin host"; }
  else if (has(80,443,8080,8443,8888,5000)) { type = "unknown"; name = "Web Managed Device"; role = "Web management or web service"; }
  else if (has(22)) { type = "server"; name = "SSH Host"; role = "Linux/network appliance endpoint"; }
  if (hostname) name = `${name} (${hostname})`;
  let confidence = 35 + (hostname ? 20 : 0) + (vendor !== "Unknown" ? 15 : 0) + (mac ? 10 : 0) + (ports.length >= 3 ? 10 : 0) + (shares.length ? 15 : 0) + (httpInfo.some(Boolean) ? 8 : 0);
  return { name, type, role, vendor, confidence: Math.min(confidence, 98) };
}

function buildRiskFinding(scanId, deviceId, ip, port) {
  const base = { id: `risk-${deviceId}-${port}`, scanId, deviceId, evidence: `TCP ${port} reachable on ${ip}`, status: "open" };
  if (port === 23) return { ...base, severity: "high", title: "Telnet detected", recommendation: "Disable Telnet and use SSH for management access." };
  if (port === 21) return { ...base, severity: "high", title: "FTP detected", recommendation: "Replace FTP with SFTP, SCP, HTTPS, or another encrypted transfer method." };
  if ([80,8000,8080,8888].includes(port)) return { ...base, severity: "medium", title: "Unencrypted HTTP service detected", recommendation: "Prefer HTTPS or restrict access to a management VLAN." };
  if ([139,445].includes(port)) return { ...base, severity: "medium", title: "File sharing service detected", recommendation: "Confirm SMB/NetBIOS exposure is expected and restricted." };
  if ([3389,5900].includes(port)) return { ...base, severity: "medium", title: "Remote access service detected", recommendation: "Restrict remote access to admin networks or VPN users." };
  if ([1433,3306,5432].includes(port)) return { ...base, severity: "medium", title: "Database service detected", recommendation: "Restrict database access to app servers/admin networks." };
  return null;
}

function buildCsv(result) {
  const rows = [["Name","IP","Hostname","MAC","Vendor","Type","Status","LatencyMs","OpenPorts","Services","Risks","Notes"]];
  for (const d of result.devices) {
    const services = result.services.filter((s) => s.deviceId === d.id);
    const risks = result.risks.filter((r) => r.deviceId === d.id);
    rows.push([d.name,d.ip,d.hostname || "",d.mac || "",d.vendor || "",d.type,d.status,String(d.latencyMs || ""),services.map((s)=>s.port).join(" "),services.map((s)=>s.name).join("; "),risks.map((r)=>r.title).join("; "),d.notes || ""]);
  }
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}

function saveHistory(result) {
  ensureDirs();
  const file = path.join(HISTORY_DIR, `${result.scan.id}.json`);
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, "latest.json"), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(HISTORY_DIR, `${result.scan.id}.csv`), buildCsv(result));
}

async function scan(options = {}) {
  const { interfaceAddress, maxHosts = 254, timeoutMs = 650, concurrency = 48, ports = COMMON_PORTS, includeArpOnly = true, includeUdpDiscovery = true, includeShares = true, includeHttp = true } = options;
  const interfaces = getLocalIPv4Interfaces();
  const selectedInterface = interfaceAddress ? interfaces.find((item) => item.address === interfaceAddress) : interfaces[0];
  if (!selectedInterface) throw new Error("No active non-loopback IPv4 interface found.");
  const subnet = selectedInterface.address.split(".").slice(0, 3).join(".") + ".0/24";
  const hosts = getSubnetHosts(selectedInterface.address).slice(0, maxHosts);
  const scanId = `scan-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const devices = [], services = [], risks = [];

  await warmArp(hosts, Math.min(timeoutMs, 450));
  let arpTable = await getArpTable();
  const udpDiscoveries = includeUdpDiscovery ? [...await discoverSsdp(), ...await discoverMdns()] : [];
  const udpByIp = new Map();
  for (const d of udpDiscoveries) udpByIp.set(d.ip, [...(udpByIp.get(d.ip) || []), d]);

  const tcpResultsByIp = new Map();
  await runWithConcurrency(hosts, concurrency, async (ip) => {
    const openPorts = (await Promise.all(ports.map((port) => probeTcpPort(ip, port, timeoutMs)))).filter((r) => r.open).sort((a,b)=>a.port-b.port);
    if (openPorts.length) tcpResultsByIp.set(ip, openPorts);
  });

  arpTable = await getArpTable();
  const candidateIps = new Set([...tcpResultsByIp.keys(), ...udpByIp.keys()]);
  if (includeArpOnly) for (const ip of arpTable.keys()) if (ip.startsWith(subnet.slice(0, subnet.lastIndexOf(".")))) candidateIps.add(ip);

  await runWithConcurrency([...candidateIps].sort((a,b)=>ipToNumber(a)-ipToNumber(b)), 24, async (ip) => {
    const open = tcpResultsByIp.get(ip) || [];
    const portNumbers = open.map((r) => r.port);
    const mac = arpTable.get(ip) || null;
    const [reverseDns, netbios] = await Promise.all([getReverseDnsName(ip), getNetbios(ip)]);
    const hostname = netbios.name || reverseDns || null;
    const httpInfo = includeHttp ? (await Promise.all(open.filter((r)=>HTTP_PORTS.has(r.port)).map((r)=>httpGrab(ip, r.port)))).filter(Boolean) : [];
    const shares = includeShares && (portNumbers.includes(139) || portNumbers.includes(445)) ? await enumerateShares(hostname || ip) : [];
    const discovery = udpByIp.get(ip) || [];
    const profile = inferProfile(ip, portNumbers, hostname, mac, httpInfo, shares, discovery);
    const deviceId = `device-${ip.replaceAll(".", "-")}`;
    const extra = [];
    if (netbios.user) extra.push(`User: ${netbios.user}`);
    if (netbios.os) extra.push(`OS hint: ${netbios.os}`);
    if (shares.length) extra.push(`Shares: ${shares.map((s)=>s.name).join(", ")}`);
    if (httpInfo.length) extra.push(`HTTP: ${httpInfo.map((h)=>`${h.url}${h.title ? ` (${h.title})` : ""}${h.server ? ` [${h.server}]` : ""}`).join("; ")}`);
    if (discovery.length) extra.push(`Discovery: ${discovery.map((d)=>d.protocol).join(", ")}`);
    devices.push({ id: deviceId, scanId, name: profile.name, ip, mac: mac || undefined, hostname: hostname || undefined, vendor: profile.vendor, type: profile.type, latencyMs: open.length ? Math.min(...open.map((r)=>r.latencyMs)) : undefined, status: open.some((r)=>[21,23,80,135,139,445,3389,5900,8000,8080,8888].includes(r.port)) ? "risk" : "online", isKnown: false, notes: `Role: ${profile.role}. Confidence: ${profile.confidence}%. Open ports: ${portNumbers.join(", ") || "none"}. ${extra.join(" ")}`.trim(), fingerprint: { role: profile.role, confidence: profile.confidence, openPorts: portNumbers, source: "tcp+arp+dns+netbios+shares+http+ssdp+mdns" }, shares, http: httpInfo, discovery, os: netbios.os || undefined, user: netbios.user || undefined });
    for (const r of open) {
      const serviceId = `service-${ip.replaceAll(".", "-")}-${r.port}`;
      const http = httpInfo.find((h)=>h.url.includes(`:${r.port}/`));
      services.push({ id: serviceId, deviceId, port: r.port, protocol: "tcp", name: getServiceName(r.port), description: `TCP connect succeeded in ${r.latencyMs} ms${http?.title ? ` · title: ${http.title}` : ""}${http?.server ? ` · server: ${http.server}` : ""}`, riskLevel: getRisk(r.port) });
      const risk = buildRiskFinding(scanId, deviceId, ip, r.port);
      if (risk) risks.push(risk);
    }
  });

  devices.sort((a,b)=>ipToNumber(a.ip)-ipToNumber(b.ip));
  const result = { scan: { id: scanId, siteId: "desktop-agent", networkName: selectedInterface.name, subnet, gatewayIp: selectedInterface.address.split(".").slice(0,3).join(".") + ".1", startedAt, completedAt: new Date().toISOString(), deviceCount: devices.length, riskCount: risks.length }, devices, services, risks, warning: "Advanced desktop agent: TCP + ARP-only inventory, DNS, NetBIOS, Windows share hints, HTTP titles/banners, SSDP/mDNS discovery, history, CSV/JSON export.", agent: { version: AGENT_VERSION, interface: selectedInterface, scannedHosts: hosts.length, scannedPorts: ports, capabilities: ["tcp", "arp-only", "reverse-dns", "netbios", "shares", "http-title-banner", "ssdp", "mdns", "history", "csv", "json"] } };
  saveHistory(result);
  return result;
}

function send(res, statusCode, payload, contentType = "application/json") {
  const body = contentType === "application/json" ? JSON.stringify(payload, null, 2) : payload;
  res.writeHead(statusCode, { "Content-Type": contentType, "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
  res.end(body);
}

function readLatest() {
  const file = path.join(DATA_DIR, "latest.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

const server = http.createServer(async (req, res) => {
  ensureDirs();
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") return send(res, 200, { ok: true });
  if (url.pathname === "/health") return send(res, 200, { ok: true, name: "fieldnet-scout-agent", version: AGENT_VERSION, interfaces: getLocalIPv4Interfaces(), capabilities: ["tcp-connect-scan", "arp-only-devices", "reverse-dns", "netbios", "windows-shares", "http-title-banner", "ssdp", "mdns", "persistent-history", "csv-export", "json-export"] });
  if (url.pathname === "/scan" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => { try { send(res, 200, await scan(body ? JSON.parse(body) : {})); } catch (e) { send(res, 500, { error: e.message || String(e) }); } });
    return;
  }
  if (url.pathname === "/history") {
    const files = fs.readdirSync(HISTORY_DIR).filter((f)=>f.endsWith(".json")).sort().reverse();
    return send(res, 200, files.map((file)=>JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, file), "utf8")).scan));
  }
  if (url.pathname === "/latest.json") return send(res, 200, readLatest() || { error: "No scan history yet" });
  if (url.pathname === "/latest.csv") {
    const latest = readLatest();
    return send(res, latest ? 200 : 404, latest ? buildCsv(latest) : "No scan history yet", "text/csv");
  }
  send(res, 404, { error: "Not found" });
});

server.listen(PORT, HOST, () => {
  ensureDirs();
  console.log(`FieldNet Scout advanced scanner agent v${AGENT_VERSION} listening on http://${HOST}:${PORT}`);
  getLocalIPv4Interfaces().forEach((item) => console.log(`- ${item.name}: ${item.address} (${item.cidr || item.netmask})`));
  console.log("Endpoints: /health, POST /scan, /history, /latest.json, /latest.csv");
});
