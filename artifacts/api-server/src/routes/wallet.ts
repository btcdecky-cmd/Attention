import { randomBytes, createHash } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";
import { Router, type IRouter } from "express";
import {
  CreateWalletChallengeBody,
  CreateWalletChallengeResponse,
  GetWalletSessionResponse,
  VerifyWalletSignatureBody,
  VerifyWalletSignatureResponse,
} from "@workspace/api-zod";
import {
  authChallengesTable,
  db,
  walletSessionsTable,
} from "@workspace/db";
import { readWalletSession, requestDomain, SESSION_COOKIE } from "../lib/wallet-session";
import { strictAuthRateLimit } from "../lib/security";

const router: IRouter = Router();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const CHALLENGE_TTL_MS = 5 * 60 * 1_000;

router.get("/auth/session", async (req, res): Promise<void> => {
  const session = await readWalletSession(req);
  res.json(
    GetWalletSessionResponse.parse(
      session
        ? {
            authenticated: true,
            walletAddress: session.walletAddress,
            expiresAt: session.expiresAt,
          }
        : { authenticated: false, walletAddress: null, expiresAt: null },
    ),
  );
});

router.post("/auth/nonce", strictAuthRateLimit, async (req, res): Promise<void> => {
  const input = CreateWalletChallengeBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.message, code: "INVALID_INPUT" });
    return;
  }

  let walletAddress: string;
  try {
    walletAddress = new PublicKey(input.data.walletAddress).toBase58();
  } catch {
    res.status(400).json({ error: "Wallet address is not valid base58.", code: "INVALID_WALLET" });
    return;
  }

  const domain = requestDomain(req);
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);
  const nonce = randomBytes(32).toString("hex");
  const message = [
    `${domain} wants you to sign in with your Solana account:`,
    walletAddress,
    "",
    "Sign in to MemeID. This message does not authorize a blockchain transaction.",
    "",
    `URI: https://${domain}/`,
    "Version: 1",
    "Chain ID: solana:mainnet",
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expiration Time: ${expiresAt.toISOString()}`,
  ].join("\n");

  await db
    .delete(authChallengesTable)
    .where(lt(authChallengesTable.expiresAt, issuedAt));
  await db.insert(authChallengesTable).values({
    nonce,
    walletAddress,
    domain,
    message,
    expiresAt,
  });

  res.json(
    CreateWalletChallengeResponse.parse({
      walletAddress,
      nonce,
      domain,
      issuedAt,
      expiresAt,
      message,
    }),
  );
});

router.post("/auth/verify", strictAuthRateLimit, async (req, res): Promise<void> => {
  const input = VerifyWalletSignatureBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.message, code: "INVALID_INPUT" });
    return;
  }

  let publicKey: PublicKey;
  try {
    publicKey = new PublicKey(input.data.walletAddress);
  } catch {
    res.status(400).json({ error: "Wallet address is not valid base58.", code: "INVALID_WALLET" });
    return;
  }

  const [challenge] = await db
    .select()
    .from(authChallengesTable)
    .where(
      and(
        eq(authChallengesTable.nonce, input.data.nonce),
        eq(authChallengesTable.walletAddress, publicKey.toBase58()),
        isNull(authChallengesTable.usedAt),
        gt(authChallengesTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!challenge || challenge.message !== input.data.message) {
    res.status(401).json({
      error: "Challenge is missing, expired, already used, or was changed.",
      code: "INVALID_CHALLENGE",
    });
    return;
  }

  let signature: Buffer;
  try {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.data.signature)) {
      throw new Error("Invalid base64");
    }
    signature = Buffer.from(input.data.signature, "base64");
    if (
      signature.byteLength !== 64 ||
      signature.toString("base64").replace(/=+$/, "") !==
        input.data.signature.replace(/=+$/, "")
    ) {
      throw new Error("Invalid signature length");
    }
  } catch {
    res.status(401).json({ error: "Wallet signature is not valid.", code: "INVALID_SIGNATURE" });
    return;
  }

  const valid = nacl.sign.detached.verify(
    Buffer.from(challenge.message, "utf8"),
    new Uint8Array(signature),
    publicKey.toBytes(),
  );
  if (!valid) {
    res.status(401).json({ error: "Wallet signature did not verify.", code: "INVALID_SIGNATURE" });
    return;
  }

  const [consumed] = await db
    .update(authChallengesTable)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authChallengesTable.nonce, challenge.nonce),
        isNull(authChallengesTable.usedAt),
        gt(authChallengesTable.expiresAt, new Date()),
      ),
    )
    .returning({ nonce: authChallengesTable.nonce });

  if (!consumed) {
    res.status(401).json({ error: "Challenge was already consumed.", code: "REPLAYED_CHALLENGE" });
    return;
  }

  const sessionToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(sessionToken).digest("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(walletSessionsTable).values({
    tokenHash,
    walletAddress: publicKey.toBase58(),
    expiresAt,
  });

  res.cookie(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
  res.json(
    VerifyWalletSignatureResponse.parse({
      authenticated: true,
      walletAddress: publicKey.toBase58(),
      expiresAt,
    }),
  );
});

router.post("/auth/logout", strictAuthRateLimit, async (req, res): Promise<void> => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string") {
    res.status(401).json({ error: "No active wallet session.", code: "UNAUTHENTICATED" });
    return;
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  await db
    .update(walletSessionsTable)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(walletSessionsTable.tokenHash, tokenHash),
        isNull(walletSessionsTable.revokedAt),
      ),
    );

  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
  res.status(204).end();
});

export default router;
