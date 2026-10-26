import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_CONFIGURED" | "UNAVAILABLE" | "INVALID_RESPONSE" = "UNAVAILABLE",
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export type TokenFacts = {
  mint: string;
  exists: boolean;
  tokenProgram: string | null;
  supply: string | null;
  decimals: number | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  extensions: string[];
  slot: number | null;
};

type RpcEnvelope<T> = {
  result?: T;
  error?: { code: number; message: string };
};

type RpcAccountInfo = {
  context?: { slot?: number };
  value?: {
    owner?: string;
    data?: {
      parsed?: {
        info?: {
          decimals?: number;
          freezeAuthority?: string | null;
          mintAuthority?: string | null;
          supply?: string;
          extensions?: Array<{ extension?: string }>;
        };
      };
    };
  } | null;
};

type CacheValue = { expiresAt: number; value: unknown };
const responseCache = new Map<string, CacheValue>();
const inflight = new Map<string, Promise<unknown>>();
const READ_CACHE_MS = 12_000;
const MAX_CACHE_SIZE = 500;

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export function heliusConfigured(): boolean {
  return Boolean(process.env.HELIUS_API_KEY);
}

function cacheKey(method: string, params: unknown[]): string {
  return `${method}:${JSON.stringify(params)}`;
}

async function requestHelius<T>(
  method: string,
  params: unknown[],
  allowRetry: boolean,
): Promise<T> {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    throw new ProviderError(
      "Helius is not configured. Add HELIUS_API_KEY to enable mainnet reads.",
      "NOT_CONFIGURED",
    );
  }

  const url = new URL("https://mainnet.helius-rpc.com/");
  url.searchParams.set("api-key", apiKey);
  const attempts = allowRetry ? 3 : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "memeid",
          method,
          params,
        }),
        signal: AbortSignal.timeout(8_000),
      });

      if (RETRYABLE.has(response.status) && attempt + 1 < attempts) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter)
          ? Math.min(Math.max(retryAfter * 1_000, 150), 1_500)
          : 200 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        throw new ProviderError(
          `Mainnet provider returned HTTP ${response.status}.`,
          "UNAVAILABLE",
        );
      }

      const payload = (await response.json()) as RpcEnvelope<T>;
      if (payload.error) {
        throw new ProviderError(
          `Mainnet provider rejected ${method}: ${payload.error.message}`,
          "UNAVAILABLE",
        );
      }
      if (!("result" in payload)) {
        throw new ProviderError(
          `Mainnet provider returned an invalid ${method} response.`,
          "INVALID_RESPONSE",
        );
      }
      return payload.result as T;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (attempt + 1 >= attempts) {
        throw new ProviderError(
          "Mainnet provider did not respond. Try again shortly.",
          "UNAVAILABLE",
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
    }
  }

  throw new ProviderError("Mainnet provider did not respond.", "UNAVAILABLE");
}

export async function heliusRpc<T>(
  method: string,
  params: unknown[] = [],
  options: { cache?: boolean; retry?: boolean } = {},
): Promise<T> {
  const key = cacheKey(method, params);
  const cached = responseCache.get(key);
  if (options.cache !== false && cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const request = requestHelius<T>(method, params, options.retry !== false);
  inflight.set(key, request);
  try {
    const value = await request;
    if (options.cache !== false) {
      if (responseCache.size >= MAX_CACHE_SIZE) {
        const firstKey = responseCache.keys().next().value;
        if (firstKey) responseCache.delete(firstKey);
      }
      responseCache.set(key, {
        value,
        expiresAt: Date.now() + READ_CACHE_MS,
      });
    }
    return value;
  } finally {
    inflight.delete(key);
  }
}

export async function getMainnetHealth(): Promise<boolean> {
  if (!heliusConfigured()) return false;
  const health = await heliusRpc<string>("getHealth", [], { cache: false });
  return health === "ok";
}

export async function inspectTokenMint(mintAddress: string): Promise<TokenFacts> {
  let mint: PublicKey;
  try {
    mint = new PublicKey(mintAddress);
  } catch {
    throw new ProviderError("Token mint address is not valid base58.", "INVALID_RESPONSE");
  }

  const response = await heliusRpc<RpcAccountInfo>(
    "getAccountInfo",
    [mint.toBase58(), { commitment: "finalized", encoding: "jsonParsed" }],
  );
  const account = response.value;
  if (!account) {
    return {
      mint: mint.toBase58(),
      exists: false,
      tokenProgram: null,
      supply: null,
      decimals: null,
      mintAuthority: null,
      freezeAuthority: null,
      extensions: [],
      slot: response.context?.slot ?? null,
    };
  }

  const owner = account.owner ?? null;
  const isKnownTokenProgram =
    owner === TOKEN_PROGRAM_ID.toBase58() ||
    owner === TOKEN_2022_PROGRAM_ID.toBase58();
  const parsed = account.data?.parsed?.info;
  const extensions = Array.isArray(parsed?.extensions)
    ? parsed.extensions
        .map((item) => item.extension)
        .filter((extension): extension is string => typeof extension === "string")
    : [];

  return {
    mint: mint.toBase58(),
    exists: isKnownTokenProgram,
    tokenProgram: owner,
    supply: typeof parsed?.supply === "string" ? parsed.supply : null,
    decimals: Number.isInteger(parsed?.decimals) ? parsed.decimals! : null,
    mintAuthority:
      typeof parsed?.mintAuthority === "string" ? parsed.mintAuthority : null,
    freezeAuthority:
      typeof parsed?.freezeAuthority === "string" ? parsed.freezeAuthority : null,
    extensions,
    slot: response.context?.slot ?? null,
  };
}

export async function getDASAsset(assetAddress: string): Promise<Record<string, unknown>> {
  const asset = new PublicKey(assetAddress).toBase58();
  return heliusRpc<Record<string, unknown>>("getAsset", [{ id: asset }]);
}
