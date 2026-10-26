import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Request } from "express";
import { db, walletSessionsTable } from "@workspace/db";

export const SESSION_COOKIE = "memeid_session";

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function readWalletSession(
  req: Request,
): Promise<{ walletAddress: string; expiresAt: Date } | null> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || token.length < 32 || token.length > 256) {
    return null;
  }

  const [session] = await db
    .select({
      walletAddress: walletSessionsTable.walletAddress,
      expiresAt: walletSessionsTable.expiresAt,
    })
    .from(walletSessionsTable)
    .where(
      and(
        eq(walletSessionsTable.tokenHash, hashSessionToken(token)),
        isNull(walletSessionsTable.revokedAt),
        gt(walletSessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return session ?? null;
}

export function requestDomain(req: Request): string {
  const origin = req.get("origin");
  if (origin) {
    try {
      return new URL(origin).host;
    } catch {
      throw new Error("Sign-in origin is invalid.");
    }
  }

  const configuredOrigin = process.env.APP_ORIGIN;
  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).host;
    } catch {
      throw new Error("APP_ORIGIN must be a valid HTTPS origin.");
    }
  }

  const domains = [
    ...(process.env.REPLIT_DOMAINS?.split(",") ?? []),
    process.env.REPLIT_DEV_DOMAIN ?? "",
  ]
    .map((domain) => domain.trim())
    .filter(Boolean);
  if (domains.length > 0) return domains[0];

  const host = req.get("host");
  if (!host || !/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)) {
    throw new Error("Cannot determine the sign-in domain.");
  }
  return host;
}
