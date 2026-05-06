import TcpSocket from "react-native-tcp-socket";

export type TcpPortProbeResult = {
  ip: string;
  port: number;
  open: boolean;
  latencyMs: number;
  error?: string;
};

export const COMMON_TCP_PORTS = [
  21, // FTP
  22, // SSH
  23, // Telnet
  25, // SMTP
  53, // DNS TCP
  80, // HTTP
  110, // POP3
  139, // NetBIOS
  143, // IMAP
  443, // HTTPS
  445, // SMB
  515, // LPD
  548, // AFP
  587, // SMTP submission
  631, // IPP
  993, // IMAPS
  995, // POP3S
  1433, // MSSQL
  3306, // MySQL
  3389, // RDP
  5900, // VNC
  8000, // HTTP alt
  8080, // HTTP alt
  8443, // HTTPS alt
  9100, // JetDirect printing
];

export async function probeTcpPort(
  ip: string,
  port: number,
  timeoutMs = 900,
): Promise<TcpPortProbeResult> {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    let settled = false;
    const socket = TcpSocket.createConnection({ host: ip, port, timeout: timeoutMs });

    const finish = (open: boolean, error?: string) => {
      if (settled) return;
      settled = true;

      try {
        socket.destroy();
      } catch {
        // Ignore socket cleanup failures.
      }

      resolve({
        ip,
        port,
        open,
        error,
        latencyMs: Date.now() - startedAt,
      });
    };

    const timer = setTimeout(() => finish(false, "timeout"), timeoutMs);

    socket.on("connect", () => {
      clearTimeout(timer);
      finish(true);
    });

    socket.on("timeout", () => {
      clearTimeout(timer);
      finish(false, "timeout");
    });

    socket.on("error", (error: Error) => {
      clearTimeout(timer);
      finish(false, error.message);
    });
  });
}

export async function scanTcpPorts(
  ip: string,
  ports = COMMON_TCP_PORTS,
  timeoutMs = 900,
): Promise<TcpPortProbeResult[]> {
  const results = await Promise.all(ports.map((port) => probeTcpPort(ip, port, timeoutMs)));
  return results.filter((result) => result.open);
}
