import { and, eq } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import {
  GetPublicTokenRiskParams,
  GetPublicTokenRiskResponse,
  GetPublicTokenVerificationParams,
  GetPublicTokenVerificationResponse,
  GetTokenRiskParams,
  GetTokenRiskResponse,
  GetTokenVerificationParams,
  GetTokenVerificationResponse,
  LinkIdentityTokenBody,
  LinkIdentityTokenParams,
  LinkIdentityTokenResponse,
} from "@workspace/api-zod";
import {
  auditEventsTable,
  db,
  identitiesTable,
  riskAssessmentsTable,
  tokenLinksTable,
} from "@workspace/db";
import { findIdentity, findIdentityByMint } from "../lib/identity-records";
import { getDASAsset, inspectTokenMint, ProviderError } from "../lib/helius";
import { retrievePublicUri, sha256 } from "../lib/pinata";
import { isProjectId } from "../lib/identity-records";
import { readWalletSession } from "../lib/wallet-session";

const router: IRouter = Router();
const METHODOLOGY =
  "This release reports directly observed mint-account authority and parsed Token-2022 extensions only. It does not aggregate holder control, liquidity lock/withdrawal rights, related wallets, or trading behavior, so it deliberately withholds a 0–100 score until those signals are supported.";

type RiskFinding = {
  id: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  explanation: string;
  evidence: string;
  source: string;
  confidence: number;
  detectedAt: Date;
};

async function verifyRegisteredNft(identity: Awaited<ReturnType<typeof findIdentity>>) {
  if (!identity?.identityNftAddress || !identity.metadataUri) {
    return { verified: false, source: null as string | null };
  }
  try {
    const asset = await getDASAsset(identity.identityNftAddress);
    const ownership = asset.ownership as { owner?: unknown } | undefined;
    const content = asset.content as { json_uri?: unknown } | undefined;
    return {
      verified:
        asset.interface === "MplCoreAsset" &&
        ownership?.owner === identity.creatorWallet &&
        content?.json_uri === identity.metadataUri,
      source: "Helius DAS getAsset (mainnet-beta)",
    };
  } catch {
    return {
      verified: false,
      source: "Helius DAS getAsset was unavailable during this check",
    };
  }
}

async function verifyMetadataHash(
  identity: Awaited<ReturnType<typeof findIdentity>>,
): Promise<boolean> {
  if (!identity?.metadataUri || !identity.metadataHash) return false;
  try {
    const bytes = await retrievePublicUri(identity.metadataUri);
    return sha256(bytes) === identity.metadataHash;
  } catch {
    return false;
  }
}

async function makeTokenVerification(mint: string) {
  const facts = await inspectTokenMint(mint);
  const [link] = await db
    .select()
    .from(tokenLinksTable)
    .where(eq(tokenLinksTable.tokenMint, facts.mint))
    .limit(1);
  const identity = await findIdentityByMint(facts.mint);

  const nftEvidence = await verifyRegisteredNft(identity);
  const metadataIntegrityVerified = await verifyMetadataHash(identity);
  const creatorRelationshipVerified = Boolean(
    identity && facts.mintAuthority && facts.mintAuthority === identity.creatorWallet,
  );
  const relationshipEvidence = creatorRelationshipVerified
    ? "The registered creator wallet currently controls the mint authority. This is evidence of current wallet control, not proof of a real-world identity or historical deployment."
    : link?.relationshipEvidence ?? null;
  const riskAssessmentAvailable = false;
  const sources = [
    "Helius Solana mainnet-beta JSON-RPC getAccountInfo (finalized)",
  ];
  if (link) sources.push("MemeID PostgreSQL token-link index");
  if (nftEvidence.source) sources.push(nftEvidence.source);
  if (identity?.metadataUri) sources.push("Pinata public IPFS gateway content hash check");

  return {
    mint: facts.mint,
    exists: facts.exists,
    tokenProgram: facts.tokenProgram,
    supply: facts.supply,
    decimals: facts.decimals,
    mintAuthority: facts.mintAuthority,
    freezeAuthority: facts.freezeAuthority,
    extensions: facts.extensions,
    identity: identity
      ? {
          projectId: identity.projectId,
          name: identity.name,
          symbol: identity.symbol,
          description: identity.description,
          creatorWallet: identity.creatorWallet,
          website: identity.website,
          xProfile: identity.xProfile,
          telegram: identity.telegram,
          discord: identity.discord,
          launchpad: identity.launchpad,
          launchpadAttribution: identity.launchpadAttribution,
          status: identity.status,
          artworkUri: identity.artworkUri,
          artworkHash: identity.artworkHash,
          metadataUri: identity.metadataUri,
          metadataHash: identity.metadataHash,
          identityNftAddress: identity.identityNftAddress,
          mintTransactionSignature: identity.mintTransactionSignature,
          linkedTokenMint: facts.mint,
          createdAt: identity.createdAt,
          updatedAt: identity.updatedAt,
        }
      : null,
    statuses: {
      identityRegistered: Boolean(identity),
      nftVerified: nftEvidence.verified,
      tokenAddressVerified: facts.exists,
      creatorRelationshipVerified,
      metadataIntegrityVerified,
      launchpadOriginVerified: identity?.launchpadAttribution === "verified",
      riskAssessmentAvailable,
    },
    relationshipEvidence,
    sources,
    lastUpdatedAt: new Date(),
  };
}

function makeRiskFindings(
  mint: string,
  facts: Awaited<ReturnType<typeof inspectTokenMint>>,
): RiskFinding[] {
  const detectedAt = new Date();
  const source = `Helius mainnet-beta getAccountInfo at finalized slot ${facts.slot ?? "not returned"}`;
  const findings: RiskFinding[] = [];

  if (facts.mintAuthority) {
    findings.push({
      id: `${mint}:mint-authority`,
      severity: "high",
      title: "Mint authority remains enabled",
      explanation:
        "The current mint authority can authorize additional token supply. This is an observed authority setting, not a prediction of future behavior.",
      evidence: `Current mint authority: ${facts.mintAuthority}`,
      source,
      confidence: 1,
      detectedAt,
    });
  }
  if (facts.freezeAuthority) {
    findings.push({
      id: `${mint}:freeze-authority`,
      severity: "high",
      title: "Freeze authority remains enabled",
      explanation:
        "The current freeze authority can freeze token accounts under the token program's rules.",
      evidence: `Current freeze authority: ${facts.freezeAuthority}`,
      source,
      confidence: 1,
      detectedAt,
    });
  }

  const notableExtensions = new Set([
    "transferHook",
    "permanentDelegate",
    "defaultAccountState",
    "nonTransferable",
    "transferFeeConfig",
    "confidentialTransferMint",
  ]);
  for (const extension of facts.extensions) {
    findings.push({
      id: `${mint}:extension:${extension}`,
      severity: notableExtensions.has(extension) ? "medium" : "info",
      title: `Token-2022 extension detected: ${extension}`,
      explanation: notableExtensions.has(extension)
        ? "This extension can change transfer, fee, account, or authority behavior. Review the specific extension configuration before interacting."
        : "A Token-2022 extension is present. Its configuration should be reviewed before interacting.",
      evidence: `Parsed extension: ${extension}`,
      source,
      confidence: 1,
      detectedAt,
    });
  }
  return findings;
}

async function makeRiskReport(mint: string) {
  const facts = await inspectTokenMint(mint);
  const findings = makeRiskFindings(facts.mint, facts);
  const report = {
    mint: facts.mint,
    score: null,
    scoreMeaning: "higher_means_more_observed_risk" as const,
    availability: "insufficient_data" as const,
    methodology: METHODOLOGY,
    findings,
    sources: [
      "Helius Solana mainnet-beta JSON-RPC getAccountInfo (finalized)",
    ],
    lastUpdatedAt: new Date(),
    warning:
      "Insufficient data for an aggregate risk score. A missing finding does not mean a token is safe. MemeID does not guarantee rug-pull detection or protect against losses.",
  };

  await db
    .insert(riskAssessmentsTable)
    .values({
      tokenMint: facts.mint,
      score: null,
      availability: report.availability,
      methodology: report.methodology,
      findings,
      sources: report.sources,
      warning: report.warning,
      updatedAt: report.lastUpdatedAt,
    })
    .onConflictDoUpdate({
      target: riskAssessmentsTable.tokenMint,
      set: {
        score: null,
        availability: report.availability,
        methodology: report.methodology,
        findings,
        sources: report.sources,
        warning: report.warning,
        updatedAt: report.lastUpdatedAt,
      },
    });
  return report;
}

function sendProviderError(res: Response, error: unknown): void {
  if (error instanceof ProviderError) {
    res.status(503).json({ error: error.message, code: error.code });
    return;
  }
  res.status(503).json({ error: "Mainnet data could not be retrieved.", code: "MAINNET_UNAVAILABLE" });
}

router.get("/tokens/:mint/verification", async (req, res): Promise<void> => {
  const params = GetTokenVerificationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message, code: "INVALID_MINT" });
    return;
  }
  try {
    res.json(GetTokenVerificationResponse.parse(await makeTokenVerification(params.data.mint)));
  } catch (error) {
    req.log.warn({ err: error }, "Token verification read failed");
    sendProviderError(res, error);
  }
});

router.get("/tokens/:mint/risk", async (req, res): Promise<void> => {
  const params = GetTokenRiskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message, code: "INVALID_MINT" });
    return;
  }
  try {
    res.json(GetTokenRiskResponse.parse(await makeRiskReport(params.data.mint)));
  } catch (error) {
    req.log.warn({ err: error }, "Risk analysis read failed");
    sendProviderError(res, error);
  }
});

router.post("/identities/:projectId/link-token", async (req, res): Promise<void> => {
  const params = LinkIdentityTokenParams.safeParse(req.params);
  const input = LinkIdentityTokenBody.safeParse(req.body);
  if (!params.success || !isProjectId(params.data.projectId) || !input.success) {
    res.status(400).json({ error: "Invalid project ID or token mint address.", code: "INVALID_INPUT" });
    return;
  }
  const session = await readWalletSession(req);
  if (!session) {
    res.status(401).json({ error: "Connect and sign in with a wallet first.", code: "UNAUTHENTICATED" });
    return;
  }

  try {
    const identity = await findIdentity(params.data.projectId);
    if (!identity) {
      res.status(404).json({ error: "Identity record not found.", code: "NOT_FOUND" });
      return;
    }
    if (identity.creatorWallet !== session.walletAddress) {
      res.status(403).json({ error: "Only the registered creator wallet can link a token.", code: "FORBIDDEN" });
      return;
    }
    if (!identity.identityNftAddress) {
      res.status(409).json({ error: "Verify the identity NFT on mainnet before linking a token.", code: "NFT_REQUIRED" });
      return;
    }
    const facts = await inspectTokenMint(input.data.mintAddress);
    if (!facts.exists || !facts.tokenProgram || facts.supply === null || facts.decimals === null) {
      res.status(400).json({ error: "The address is not a verified SPL or Token-2022 mint on mainnet.", code: "NOT_A_TOKEN_MINT" });
      return;
    }

    const [existingMint] = await db
      .select({ projectId: tokenLinksTable.projectId })
      .from(tokenLinksTable)
      .where(eq(tokenLinksTable.tokenMint, facts.mint))
      .limit(1);
    if (existingMint && existingMint.projectId !== identity.projectId) {
      res.status(409).json({ error: "This token mint is already linked to a different identity.", code: "MINT_ALREADY_LINKED" });
      return;
    }
    const [existingProjectLink] = await db
      .select({ tokenMint: tokenLinksTable.tokenMint })
      .from(tokenLinksTable)
      .where(eq(tokenLinksTable.projectId, identity.projectId))
      .limit(1);
    if (existingProjectLink && existingProjectLink.tokenMint !== facts.mint) {
      res.status(409).json({ error: "This identity already has a different linked token mint.", code: "IDENTITY_ALREADY_LINKED" });
      return;
    }

    const creatorRelationshipVerified =
      facts.mintAuthority !== null && facts.mintAuthority === identity.creatorWallet;
    const relationshipEvidence = creatorRelationshipVerified
      ? `The registered wallet currently controls the mint authority (${facts.mintAuthority}). This does not prove a real-world identity or historical deployment.`
      : "The signed-in creator requested this link, but current mint authority does not independently establish a relationship to the identity creator wallet.";
    await db
      .insert(tokenLinksTable)
      .values({
        tokenMint: facts.mint,
        projectId: identity.projectId,
        tokenProgram: facts.tokenProgram,
        supply: facts.supply,
        decimals: facts.decimals,
        mintAuthority: facts.mintAuthority,
        freezeAuthority: facts.freezeAuthority,
        extensions: facts.extensions,
        creatorRelationshipVerified,
        relationshipEvidence,
        verifiedAt: new Date(),
        lastUpdatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: tokenLinksTable.tokenMint,
        set: {
          projectId: identity.projectId,
          tokenProgram: facts.tokenProgram,
          supply: facts.supply,
          decimals: facts.decimals,
          mintAuthority: facts.mintAuthority,
          freezeAuthority: facts.freezeAuthority,
          extensions: facts.extensions,
          creatorRelationshipVerified,
          relationshipEvidence,
          verifiedAt: new Date(),
          lastUpdatedAt: new Date(),
        },
      });
    await db
      .update(identitiesTable)
      .set({ status: "token_linked", updatedAt: new Date() })
      .where(
        and(
          eq(identitiesTable.projectId, identity.projectId),
          eq(identitiesTable.creatorWallet, session.walletAddress),
        ),
      );
    await db.insert(auditEventsTable).values({
      walletAddress: session.walletAddress,
      action: "token_mint_linked",
      projectId: identity.projectId,
      details: {
        tokenMint: facts.mint,
        creatorRelationshipVerified,
        tokenProgram: facts.tokenProgram,
      },
    });
    res.json(
      LinkIdentityTokenResponse.parse(await makeTokenVerification(facts.mint)),
    );
  } catch (error) {
    req.log.warn({ err: error }, "Token link request failed");
    sendProviderError(res, error);
  }
});

router.get("/v1/token/:mint/verification", async (req, res): Promise<void> => {
  const params = GetPublicTokenVerificationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message, code: "INVALID_MINT" });
    return;
  }
  try {
    res.json(
      GetPublicTokenVerificationResponse.parse(
        await makeTokenVerification(params.data.mint),
      ),
    );
  } catch (error) {
    req.log.warn({ err: error }, "Public token verification read failed");
    sendProviderError(res, error);
  }
});

router.get("/v1/token/:mint/risk", async (req, res): Promise<void> => {
  const params = GetPublicTokenRiskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message, code: "INVALID_MINT" });
    return;
  }
  try {
    res.json(GetPublicTokenRiskResponse.parse(await makeRiskReport(params.data.mint)));
  } catch (error) {
    req.log.warn({ err: error }, "Public risk read failed");
    sendProviderError(res, error);
  }
});

export default router;
