const INSTALL_KEY = Symbol.for("gamesol.rpcFetchGuard");

type GuardState = {
  originalFetch: typeof globalThis.fetch;
  active: number;
  queue: Array<() => void>;
};

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

async function responseIsRateLimited(response: Response): Promise<boolean> {
  if (response.status === 429) return true;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) return false;
  try {
    const body = await response.clone().json() as
      | { error?: { code?: number; message?: string } }
      | Array<{ error?: { code?: number; message?: string } }>;
    const entries = Array.isArray(body) ? body : [body];
    return entries.some(entry =>
      entry?.error?.code === 429
      || /rate limit|too many requests/i.test(entry?.error?.message ?? ""),
    );
  } catch {
    return false;
  }
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(10_000, seconds * 1_000);
  return Math.min(8_000, 700 * (2 ** attempt));
}

export function installSolanaRpcFetchGuard(rpcEndpoint: string, sharedPublicRpc: boolean): void {
  const root = globalThis as typeof globalThis & { [INSTALL_KEY]?: GuardState };
  if (root[INSTALL_KEY] || typeof root.fetch !== "function") return;

  const state: GuardState = {
    originalFetch: root.fetch.bind(root),
    active: 0,
    queue: [],
  };
  root[INSTALL_KEY] = state;
  const maxConcurrent = sharedPublicRpc ? 2 : 8;
  const maxAttempts = sharedPublicRpc ? 5 : 3;
  const normalizedEndpoint = new URL(rpcEndpoint, globalThis.location?.origin).toString();

  const schedule = <T,>(operation: () => Promise<T>): Promise<T> => new Promise<T>((resolve, reject) => {
    const run = () => {
      state.active += 1;
      void operation().then(resolve, reject).finally(() => {
        state.active -= 1;
        state.queue.shift()?.();
      });
    };
    if (state.active < maxConcurrent) run();
    else state.queue.push(run);
  });

  root.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(requestUrl(input), globalThis.location?.origin).toString();
    if (url !== normalizedEndpoint || (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase() !== "POST") {
      return state.originalFetch(input, init);
    }

    let lastResponse: Response | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await schedule(() => state.originalFetch(input instanceof Request ? input.clone() : input, init));
      lastResponse = response;
      if (!(await responseIsRateLimited(response))) return response;
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => globalThis.setTimeout(resolve, retryDelayMs(response, attempt)));
      }
    }
    return lastResponse!;
  }) as typeof globalThis.fetch;
}
