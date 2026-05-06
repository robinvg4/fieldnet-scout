export type HttpProbeResult = {
  ip: string;
  port: number;
  url: string;
  reachable: boolean;
  status?: number;
  latencyMs?: number;
  error?: string;
};

const HTTP_PORTS = [80, 443, 8080, 8000, 8443];

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function probeHttpPort(
  ip: string,
  port: number,
  timeoutMs = 1200,
): Promise<HttpProbeResult> {
  const scheme = port === 443 || port === 8443 ? "https" : "http";
  const url = `${scheme}://${ip}:${port}`;
  const startedAt = Date.now();

  try {
    const response = await withTimeout(
      fetch(url, {
        method: "GET",
      }),
      timeoutMs,
    );

    return {
      ip,
      port,
      url,
      reachable: true,
      status: response.status,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ip,
      port,
      url,
      reachable: false,
      error: error instanceof Error ? error.message : "unknown error",
      latencyMs: Date.now() - startedAt,
    };
  }
}

export async function probeCommonHttpPorts(
  ip: string,
  timeoutMs = 1200,
): Promise<HttpProbeResult[]> {
  const results = await Promise.all(
    HTTP_PORTS.map((port) => probeHttpPort(ip, port, timeoutMs)),
  );

  return results.filter((result) => result.reachable);
}
