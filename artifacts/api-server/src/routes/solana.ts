import { sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetMemeidStatusResponse,
  ProxySolanaRpcBody,
  ProxySolanaRpcResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import { getMainnetHealth, heliusConfigured, heliusRpc, ProviderError } from "../lib/helius";
import { pinataConfigured } from "../lib/pinata";
import { rateLimit } from "../lib/security";

const router: IRouter = Router();

const RPC_METHODS = new Set([
  "getAccountInfo",
  "getBalance",
  "getBlockHeight",
  "getEpochInfo",
  "getFeeForMessage",
  "getHealth",
  "getLatestBlockhash",
  "getMinimumBalanceForRentExemption",
  "getMultipleAccounts",
  "getSignatureStatuses",
  "getSlot",
  "getTokenLargestAccounts",
  "getTokenSupply",
  "getTransaction",
  "getVersion",
  "getAsset",
  "getAssetProof",
  "getAssetsByOwner",
  "getAssetsByGroup",
  "getTokenAccounts",
  "getTokenAccountsByOwner",
  "simulateTransaction",
  "sendTransaction",
]);

router.get("/memeid/status", async (req, res): Promise<void> => {
  const rpcConfigured = heliusConfigured();
  let rpcHealthy = false;
  let databaseAvailable = false;
  const dependencies: string[] = [];

  if (rpcConfigured) {
    try {
      rpcHealthy = await getMainnetHealth();
    } catch (error) {
      req.log.warn({ err: error }, "Mainnet RPC health check failed");
      dependencies.push(
        error instanceof ProviderError && error.code === "NOT_CONFIGURED"
          ? "HELIUS_API_KEY is not configured"
          : "Helius mainnet RPC is not responding",
      );
    }
  } else {
    dependencies.push("HELIUS_API_KEY is not configured");
  }

  if (!pinataConfigured()) dependencies.push("PINATA_JWT is not configured");
  try {
    await db.execute(sql`select 1`);
    databaseAvailable = true;
  } catch (error) {
    req.log.error({ err: error }, "Database readiness check failed");
    dependencies.push("PostgreSQL is not available");
  }

  res.json(
    GetMemeidStatusResponse.parse({
      cluster: "mainnet-beta",
      rpcConfigured,
      rpcHealthy,
      storageConfigured: pinataConfigured(),
      databaseAvailable,
      checkedAt: new Date(),
      dependencies,
    }),
  );
});

router.post("/solana/rpc", rateLimit, async (req, res): Promise<void> => {
  const input = ProxySolanaRpcBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.message, code: "INVALID_RPC_REQUEST" });
    return;
  }
  const method = input.data.method;
  if (!RPC_METHODS.has(method)) {
    res.status(400).json({ error: "This Solana RPC method is not enabled.", code: "RPC_METHOD_NOT_ALLOWED" });
    return;
  }

  const params = input.data.params ?? [];
  if (JSON.stringify(params).length > 12_000) {
    res.status(413).json({ error: "RPC request parameters are too large.", code: "RPC_REQUEST_TOO_LARGE" });
    return;
  }
  if (method === "sendTransaction") {
    const encoded = params[0];
    if (
      typeof encoded !== "string" ||
      encoded.length < 100 ||
      encoded.length > 8_192
    ) {
      res.status(400).json({ error: "Signed transaction payload is invalid.", code: "INVALID_TRANSACTION" });
      return;
    }
  }

  try {
    const result = await heliusRpc<unknown>(method, params, {
      cache: false,
      retry: method !== "sendTransaction",
    });
    res.json(
      ProxySolanaRpcResponse.parse({
        jsonrpc: "2.0",
        id: input.data.id,
        result,
      }),
    );
  } catch (error) {
    req.log.warn({ err: error, method }, "Mainnet RPC request failed");
    const providerError =
      error instanceof ProviderError ? error : new ProviderError("Mainnet RPC is unavailable.");
    res.status(503).json({
      jsonrpc: "2.0",
      id: input.data.id,
      error: {
        code: providerError.code,
        message: providerError.message,
      },
    });
  }
});

export default router;
