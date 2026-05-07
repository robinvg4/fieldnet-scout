const http = require("http");
const dns = require("dns").promises;
const net = require("net");
const { execFile } = require("child_process");
const { Client } = require("ssh2");
const crypto = require("crypto");

const PORT = Number(process.env.FIELDNET_TOOLS_PORT || 47892);
const HOST = process.env.FIELDNET_TOOLS_HOST || "0.0.0.0";
const VERSION = "0.3.0";
const SSH_SESSIONS = new Map();

function send(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
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

function parseSshTarget(input) {
  const value = String(input || "").trim() || "192.168.10.1:22";
  const [hostPart, portText] = value.split(":");
  return {
    host: hostPart,
    port: Number(portText || 22),
  };
}

async function startSshSession({ target, username, password }) {
  const { host, port } = parseSshTarget(target);
  const user = String(username || "").trim();
  const pass = String(password || "");

  if (!host || !user || !pass) {
    return {
      ok: false,
      command: "ssh",
      output: "Host, username, and password are required. Credentials are kept in memory only and are not written to disk.",
    };
  }

  const reachable = await tcpCheck(host, port, 1800);
  if (!reachable.ok) {
    return {
      ok: false,
      command: `ssh -p ${port} ${user}@${host}`,
      output: `SSH port check failed before connection. ${reachable.output}`,
    };
  }

  return new Promise((resolve) => {
    const sessionId = crypto.randomUUID();
    const conn = new Client();
    const buffer = [];
    let running = true;
    let shell = null;
    let settled = false;

    function append(data) {
      buffer.push(String(data));
      if (buffer.join("").length > 30000) {
        const trimmed = buffer.join("").slice(-30000);
        buffer.length = 0;
        buffer.push(trimmed);
      }
    }

    function fail(message) {
      if (settled) return;
      settled = true;
      try {
        conn.end();
      } catch {}
      resolve({
        ok: false,
        command: `ssh -p ${port} ${user}@${host}`,
        output: message,
      });
    }

    const timeout = setTimeout(() => fail("SSH connection timed out."), 12000);

    conn
      .on("ready", () => {
        conn.shell({ term: "xterm-color", cols: 100, rows: 32 }, (error, stream) => {
          clearTimeout(timeout);
          if (error) {
            fail(error.message);
            return;
          }

          shell = stream;
          stream.on("data", (data) => append(data.toString("utf8")));
          stream.stderr?.on("data", (data) => append(data.toString("utf8")));
          stream.on("close", () => {
            running = false;
            append("\n[SSH session closed]\n");
          });

          SSH_SESSIONS.set(sessionId, {
            conn,
            shell,
            buffer,
            running,
            createdAt: Date.now(),
            command: `ssh -p ${port} ${user}@${host}`,
            host,
            port,
            username: user,
          });

          settled = true;
          resolve({
            ok: true,
            sessionId,
            command: `ssh -p ${port} ${user}@${host}`,
            output: `Connected to ${user}@${host}:${port}.`,
          });
        });
      })
      .on("error", (error) => {
        clearTimeout(timeout);
        fail(error.message);
      })
      .on("close", () => {
        const session = SSH_SESSIONS.get(sessionId);
        if (session) session.running = false;
      })
      .connect({
        host,
        port,
        username: user,
        password: pass,
        readyTimeout: 10000,
        tryKeyboard: false,
        algorithms: {
          serverHostKey: ["ssh-ed25519", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp521", "rsa-sha2-512", "rsa-sha2-256", "ssh-rsa"],
        },
      });
  });
}

function sendSshInput({ sessionId, input }) {
  const session = SSH_SESSIONS.get(sessionId);
  if (!session || !session.shell) return { ok: false };

  session.shell.write(String(input || ""));
  return { ok: true };
}

function readSshOutput({ sessionId }) {
  const session = SSH_SESSIONS.get(sessionId);
  if (!session) {
    return {
      ok: false,
      sessionId,
      output: "SSH session not found.",
      running: false,
      exitCode: null,
    };
  }

  const output = session.buffer.join("");
  session.buffer.length = 0;

  return {
    ok: true,
    sessionId,
    output,
    running: Boolean(session.running),
    exitCode: null,
  };
}

function stopSshSession({ sessionId }) {
  const session = SSH_SESSIONS.get(sessionId);
  if (!session) return { ok: false };

  try {
    session.shell?.end("exit\n");
    session.conn?.end();
  } catch {}

  SSH_SESSIONS.delete(sessionId);
  return { ok: true };
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

  if (tool === "ssh") {
    return {
      ok: true,
      command: "In-app SSH terminal",
      output: "Use the SSH section to connect. It opens an interactive terminal inside the app through the tools agent.",
    };
  }

  return { ok: false, command: "Unknown tool", output: `Unsupported tool: ${tool}` };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 200, { ok: true });

  if (req.url === "/health") {
    return send(res, 200, {
      ok: true,
      name: "fieldnet-tools-agent",
      version: VERSION,
      tools: ["ping", "traceroute", "dns", "reverseDns", "portCheck", "subnet", "publicIp", "ssh"],
      ssh: "interactive",
    });
  }

  if (req.url === "/tools/run" && req.method === "POST") {
    try {
      const payload = await readBody(req);
      const result = await runTool(payload.tool, payload.value);
      send(res, 200, { tool: payload.tool, ...result });
    } catch (error) {
      send(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.url === "/ssh/start" && req.method === "POST") {
    try {
      send(res, 200, await startSshSession(await readBody(req)));
    } catch (error) {
      send(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.url === "/ssh/input" && req.method === "POST") {
    try {
      send(res, 200, sendSshInput(await readBody(req)));
    } catch (error) {
      send(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.url === "/ssh/output" && req.method === "POST") {
    try {
      send(res, 200, readSshOutput(await readBody(req)));
    } catch (error) {
      send(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.url === "/ssh/stop" && req.method === "POST") {
    try {
      send(res, 200, stopSshSession(await readBody(req)));
    } catch (error) {
      send(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  send(res, 404, { error: "Not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`FieldNet tools agent v${VERSION} listening on http://${HOST}:${PORT}`);
  console.log("Endpoints: /health, POST /tools/run, POST /ssh/start, POST /ssh/input, POST /ssh/output, POST /ssh/stop");
});
