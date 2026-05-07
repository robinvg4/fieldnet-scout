const http = require("http");
const dns = require("dns").promises;
const net = require("net");
const { execFile } = require("child_process");

const PORT = Number(process.env.FIELDNET_TOOLS_PORT || 47892);
const HOST = process.env.FIELDNET_TOOLS_HOST || "0.0.0.0";
const VERSION = "0.1.0";

function send(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload, null, 2));
}

function execText(command, args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        command: `${command} ${args.join(" ")}`,
        output: stdout || stderr || (error ? error.message : ""),
      });
    });
  });
}

function tcpCheck(host, port, timeoutMs = 1800) {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    let settled = false;
    const socket = new net.Socket();

    function finish(open, error) {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        ok: open,
        command: `TCP connect ${host}:${port}`,
        output: open ? `Open in ${Date.now() - startedAt} ms` : `Closed or filtered: ${error || "timeout"}`,
      });
    }

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false, "timeout"));
    socket.once("error", (error) => finish(false, error.code || error.message));
    socket.connect(port, host);
  });
}

function calculate24(ip) {
  const parts = String(ip || "").split(".");
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(Number(part)))) {
    return "Enter a valid IPv4 address.";
  }

  const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
  return [`Network: ${prefix}.0/24`, `Usable range: ${prefix}.1 - ${prefix}.254`, `Broadcast: ${prefix}.255`, "Mask: 255.255.255.0"].join("\n");
}

async function runTool(tool, value) {
  const input = String(value || "").trim();

  if (tool === "ping") {
    const host = input || "192.168.10.1";
    if (process.platform === "win32") return execText("ping.exe", ["-n", "4", host], 9000);
    return execText("ping", ["-c", "4", host], 9000);
  }

  if (tool === "traceroute") {
    const host = input || "8.8.8.8";
    if (process.platform === "win32") return execText("tracert.exe", ["-d", host], 16000);
    return execText("traceroute", [host], 16000);
  }

  if (tool === "dns") {
    const host = input || "example.com";
    try {
      const result = await dns.lookup(host, { all: true });
      return { ok: true, command: `DNS lookup ${host}`, output: JSON.stringify(result, null, 2) };
    } catch (error) {
      return { ok: false, command: `DNS lookup ${host}`, output: error.message };
    }
  }

  if (tool === "reverseDns") {
    const ip = input || "192.168.10.1";
    try {
      const result = await dns.reverse(ip);
      return { ok: true, command: `Reverse DNS ${ip}`, output: result.join("\n") || "No PTR records returned." };
    } catch (error) {
      return { ok: false, command: `Reverse DNS ${ip}`, output: error.message };
    }
  }

  if (tool === "portCheck") {
    const [host, portText] = (input || "192.168.10.1:443").split(":");
    const port = Number(portText || 443);
    return tcpCheck(host || "192.168.10.1", port);
  }

  if (tool === "subnet") {
    const ip = input || "192.168.10.42";
    return { ok: true, command: "Subnet /24 calculation", output: calculate24(ip) };
  }

  if (tool === "publicIp") {
    try {
      const response = await fetch("https://api.ipify.org");
      return { ok: true, command: "GET https://api.ipify.org", output: await response.text() };
    } catch (error) {
      return { ok: false, command: "GET https://api.ipify.org", output: error.message };
    }
  }

  return { ok: false, command: "Unknown tool", output: `Unsupported tool: ${tool}` };
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 200, { ok: true });

  if (req.url === "/health") {
    return send(res, 200, {
      ok: true,
      name: "fieldnet-tools-agent",
      version: VERSION,
      tools: ["ping", "traceroute", "dns", "reverseDns", "portCheck", "subnet", "publicIp"],
    });
  }

  if (req.url === "/tools/run" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const result = await runTool(payload.tool, payload.value);
        send(res, 200, { tool: payload.tool, ...result });
      } catch (error) {
        send(res, 500, { error: error instanceof Error ? error.message : String(error) });
      }
    });
    return;
  }

  send(res, 404, { error: "Not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`FieldNet tools agent v${VERSION} listening on http://${HOST}:${PORT}`);
  console.log("Endpoints: /health, POST /tools/run");
});
