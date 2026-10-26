import { createHash } from "node:crypto";
import { and, count, desc, eq, ilike, sql } from "drizzle-orm";
import multer from "multer";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import {
  ConfirmIdentityMintBody,
  ConfirmIdentityMintParams,
  ConfirmIdentityMintResponse,
  CreateIdentityBody,
  CreateIdentityResponse,
  GetDashboardOverviewResponse,
  GetIdentityParams,
  GetIdentityResponse,
  ListIdentitiesQueryParams,
  ListIdentitiesResponse,
  PublishIdentityMetadataParams,
  PublishIdentityMetadataResponse,
  UploadIdentityArtworkParams,
  UploadIdentityArtworkResponse,
} from "@workspace/api-zod";
import {
  auditEventsTable,
  db,
  identitiesTable,
  tokenLinksTable,
  type IdentityRecord,
} from "@workspace/db";
import { getDASAsset, heliusRpc, ProviderError } from "../lib/helius";
import {
  findIdentity,
  findMintForProject,
  identityToApi,
  isProjectId,
} from "../lib/identity-records";
import { readWalletSession } from "../lib/wallet-session";
import { pinataConfigured, retrievePublicUri, sha256, uploadPublicFile } from "../lib/pinata";

const router: IRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 1, fields: 0 },
}).single("file");

type RpcTransaction = {
  meta?: { err?: unknown } | null;
  transaction?: {
    message?: {
      accountKeys?: Array<string | { pubkey?: string; signer?: boolean }>;
    };
    signatures?: string[];
  };
};

function uploadArtwork(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (error) => {
    if (error) {
      const isLimit = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE";
      res.status(isLimit ? 413 : 400).json({
        error: isLimit ? "Logo must be 6 MB or smaller." : "Upload must contain one image file.",
        code: isLimit ? "FILE_TOO_LARGE" : "INVALID_UPLOAD",
      });
      return;
    }
    next();
  });
}

function sniffImageType(bytes: Buffer): { mime: string; extension: string } | null {
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return { mime: "image/png", extension: "png" };
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { mime: "image/jpeg", extension: "jpg" };
  }
  if (
    bytes.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))
  ) {
    return { mime: "image/gif", extension: "gif" };
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { mime: "image/webp", extension: "webp" };
  }
  return null;
}

function safeHttpsUrl(value: string | undefined, fieldName: string): string | null {
  if (value == null || value.trim() === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${fieldName} must be a valid URL.`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hostname.length > 253
  ) {
    throw new Error(`${fieldName} must be an HTTPS URL without embedded credentials.`);
  }
  return parsed.toString();
}

async function requireCreator(
  req: Request,
  res: Response,
  projectId: string,
): Promise<{ walletAddress: string; identity: IdentityRecord } | null> {
  const session = await readWalletSession(req);
  if (!session) {
    res.status(401).json({ error: "Connect and sign in with a wallet first.", code: "UNAUTHENTICATED" });
    return null;
  }
  if (!isProjectId(projectId)) {
    res.status(400).json({ error: "Project ID is not a valid UUID.", code: "INVALID_PROJECT_ID" });
    return null;
  }
  const identity = await findIdentity(projectId);
  if (!identity) {
    res.status(404).json({ error: "Identity record not found.", code: "NOT_FOUND" });
    return null;
  }
  if (identity.creatorWallet !== session.walletAddress) {
    res.status(403).json({ error: "Only the registered creator wallet can change this identity.", code: "FORBIDDEN" });
    return null;
  }
  return { walletAddress: session.walletAddress, identity };
}

function errorResponse(res: Response, error: unknown): void {
  if (error instanceof ProviderError) {
    const status = error.code === "NOT_CONFIGURED" ? 503 : 503;
    res.status(status).json({
      error: error.message,
      code: error.code,
    });
    return;
  }
  res.status(500).json({ error: "The request could not be completed.", code: "INTERNAL_ERROR" });
}

async function identityWithLink(record: IdentityRecord) {
  const [link] = await db
    .select({ tokenMint: tokenLinksTable.tokenMint })
    .from(tokenLinksTable)
    .where(eq(tokenLinksTable.projectId, record.projectId))
    .limit(1);
  return identityToApi(record, link?.tokenMint ?? null);
}

router.get("/dashboard/overview", async (req, res): Promise<void> => {
  try {
    const [identityTotal] = await db
      .select({ value: count() })
      .from(identitiesTable);
    const [tokenTotal] = await db
      .select({ value: count() })
      .from(tokenLinksTable);
    const [nftTotal] = await db
      .select({ value: count() })
      .from(identitiesTable)
      .where(sql`${identitiesTable.identityNftAddress} IS NOT NULL`);
    const recent = await db
      .select()
      .from(identitiesTable)
      .orderBy(desc(identitiesTable.createdAt))
      .limit(6);
    const links = await db.select().from(tokenLinksTable);
    const linkedByProject = new Map(links.map((link) => [link.projectId, link.tokenMint]));
    res.json(
      GetDashboardOverviewResponse.parse({
        totalIdentities: identityTotal.value,
        linkedTokens: tokenTotal.value,
        mintedIdentityNfts: nftTotal.value,
        recentIdentities: recent.map((record) =>
          identityToApi(record, linkedByProject.get(record.projectId) ?? null),
        ),
        updatedAt: new Date(),
        source: "MemeID PostgreSQL identity index",
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Dashboard registry query failed");
    res.status(503).json({ error: "The registry database is unavailable.", code: "DATABASE_UNAVAILABLE" });
  }
});

router.get("/identities", async (req, res): Promise<void> => {
  const query = ListIdentitiesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message, code: "INVALID_QUERY" });
    return;
  }

  const { q, launchpad, limit = 20, offset = 0 } = query.data;
  const filters = [];
  if (q?.trim()) {
    const pattern = `%${q.trim().replace(/[%_\\]/g, "\\$&")}%`;
    filters.push(ilike(identitiesTable.name, pattern));
  }
  if (launchpad) filters.push(eq(identitiesTable.launchpad, launchpad));
  const where = filters.length > 0 ? and(...filters) : undefined;

  try {
    const [total] = await db
      .select({ value: count() })
      .from(identitiesTable)
      .where(where);
    const rows = await db
      .select()
      .from(identitiesTable)
      .where(where)
      .orderBy(desc(identitiesTable.createdAt))
      .limit(limit)
      .offset(offset);
    const linkedByProject = new Map<string, string>();
    if (rows.length > 0) {
      const links = await db
        .select({
          projectId: tokenLinksTable.projectId,
          tokenMint: tokenLinksTable.tokenMint,
        })
        .from(tokenLinksTable)
        .where(
          sql`${tokenLinksTable.projectId} IN (${sql.join(
            rows.map((row) => sql`${row.projectId}::uuid`),
            sql`, `,
          )})`,
        );
      for (const link of links) linkedByProject.set(link.projectId, link.tokenMint);
    }

    res.json(
      ListIdentitiesResponse.parse({
        items: rows.map((record) =>
          identityToApi(record, linkedByProject.get(record.projectId) ?? null),
        ),
        total: total.value,
        limit,
        offset,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Identity search failed");
    res.status(503).json({ error: "The identity registry is unavailable.", code: "DATABASE_UNAVAILABLE" });
  }
});

router.post("/identities", async (req, res): Promise<void> => {
  const session = await readWalletSession(req);
  if (!session) {
    res.status(401).json({ error: "Connect and sign in with a wallet first.", code: "UNAUTHENTICATED" });
    return;
  }
  const input = CreateIdentityBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.message, code: "INVALID_INPUT" });
    return;
  }

  try {
    const website = safeHttpsUrl(input.data.website, "Website");
    const xProfile = safeHttpsUrl(input.data.xProfile, "X profile");
    const telegram = safeHttpsUrl(input.data.telegram, "Telegram");
    const discord = safeHttpsUrl(input.data.discord, "Discord");
    const [record] = await db
      .insert(identitiesTable)
      .values({
        name: input.data.name.trim(),
        symbol: input.data.symbol.trim().toUpperCase(),
        description: input.data.description.trim(),
        creatorWallet: session.walletAddress,
        website,
        xProfile,
        telegram,
        discord,
        launchpad: input.data.launchpad,
      })
      .returning();

    await db.insert(auditEventsTable).values({
      walletAddress: session.walletAddress,
      action: "identity_draft_created",
      projectId: record.projectId,
      details: { launchpad: record.launchpad },
    });
    res.status(201).json(CreateIdentityResponse.parse(identityToApi(record)));
  } catch (error) {
    if (error instanceof Error && error.message.includes("must be")) {
      res.status(400).json({ error: error.message, code: "INVALID_URL" });
      return;
    }
    req.log.error({ err: error }, "Identity draft creation failed");
    res.status(500).json({ error: "Could not create the identity draft.", code: "CREATE_FAILED" });
  }
});

router.get("/identities/:projectId", async (req, res): Promise<void> => {
  const params = GetIdentityParams.safeParse(req.params);
  if (!params.success || !isProjectId(params.data.projectId)) {
    res.status(400).json({ error: "Project ID is not valid.", code: "INVALID_PROJECT_ID" });
    return;
  }
  try {
    const record = await findIdentity(params.data.projectId);
    if (!record) {
      res.status(404).json({ error: "Identity record not found.", code: "NOT_FOUND" });
      return;
    }
    res.json(GetIdentityResponse.parse(await identityWithLink(record)));
  } catch (error) {
    req.log.error({ err: error }, "Identity lookup failed");
    res.status(503).json({ error: "The identity registry is unavailable.", code: "DATABASE_UNAVAILABLE" });
  }
});

router.post(
  "/identities/:projectId/artwork",
  uploadArtwork,
  async (req, res): Promise<void> => {
    const params = UploadIdentityArtworkParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message, code: "INVALID_PROJECT_ID" });
      return;
    }
    const owner = await requireCreator(req, res, params.data.projectId);
    if (!owner) return;
    if (!req.file) {
      res.status(400).json({ error: "Choose a PNG, JPEG, GIF, or WebP logo.", code: "MISSING_FILE" });
      return;
    }
    const detected = sniffImageType(req.file.buffer);
    if (!detected || req.file.mimetype !== detected.mime) {
      res.status(400).json({ error: "Image content does not match a supported image format.", code: "INVALID_IMAGE" });
      return;
    }

    try {
      const stored = await uploadPublicFile(
        req.file.buffer,
        `memeid-${owner.identity.projectId}-logo.${detected.extension}`,
        detected.mime,
      );
      const [updated] = await db
        .update(identitiesTable)
        .set({
          artworkUri: stored.uri,
          artworkHash: stored.sha256,
          status: "artwork_uploaded",
          updatedAt: new Date(),
        })
        .where(eq(identitiesTable.projectId, owner.identity.projectId))
        .returning();
      await db.insert(auditEventsTable).values({
        walletAddress: owner.walletAddress,
        action: "identity_artwork_uploaded",
        projectId: owner.identity.projectId,
        details: { artworkHash: stored.sha256, contentType: detected.mime },
      });
      res.json(
        UploadIdentityArtworkResponse.parse(
          identityToApi(updated, await findMintForProject(updated.projectId)),
        ),
      );
    } catch (error) {
      req.log.error({ err: error, projectId: owner.identity.projectId }, "Artwork upload failed");
      errorResponse(res, error);
    }
  },
);

router.post("/identities/:projectId/metadata", async (req, res): Promise<void> => {
  const params = PublishIdentityMetadataParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message, code: "INVALID_PROJECT_ID" });
    return;
  }
  const owner = await requireCreator(req, res, params.data.projectId);
  if (!owner) return;
  if (!pinataConfigured()) {
    res.status(503).json({
      error: "Pinata is not configured. Public IPFS metadata cannot be published.",
      code: "NOT_CONFIGURED",
    });
    return;
  }
  if (!owner.identity.artworkUri || !owner.identity.artworkHash) {
    res.status(409).json({ error: "Upload and verify the project logo before publishing metadata.", code: "ARTWORK_REQUIRED" });
    return;
  }

  try {
    const createdAt = new Date().toISOString();
    const metadata = {
      name: owner.identity.name,
      symbol: owner.identity.symbol,
      description: owner.identity.description,
      image: owner.identity.artworkUri,
      attributes: [
        { trait_type: "MemeID project ID", value: owner.identity.projectId },
        { trait_type: "Creator wallet", value: owner.identity.creatorWallet },
      ],
      properties: {
        protocol: "MemeID",
        schemaVersion: "1.0",
        projectId: owner.identity.projectId,
        creatorWallet: owner.identity.creatorWallet,
        socialLinks: {
          website: owner.identity.website,
          x: owner.identity.xProfile,
          telegram: owner.identity.telegram,
          discord: owner.identity.discord,
        },
        artworkSha256: owner.identity.artworkHash,
        metadataCreatedAt: createdAt,
        registrationStatus: "metadata_published_not_nft_verified",
      },
    };
    const bytes = Buffer.from(JSON.stringify(metadata), "utf8");
    const stored = await uploadPublicFile(
      bytes,
      `memeid-${owner.identity.projectId}-metadata.json`,
      "application/json",
    );
    const [updated] = await db
      .update(identitiesTable)
      .set({
        metadataUri: stored.uri,
        metadataHash: stored.sha256,
        status: "metadata_published",
        updatedAt: new Date(),
      })
      .where(eq(identitiesTable.projectId, owner.identity.projectId))
      .returning();
    await db.insert(auditEventsTable).values({
      walletAddress: owner.walletAddress,
      action: "identity_metadata_published",
      projectId: owner.identity.projectId,
      details: { metadataHash: stored.sha256, metadataUri: stored.uri },
    });
    res.json(
      PublishIdentityMetadataResponse.parse(
        identityToApi(updated, await findMintForProject(updated.projectId)),
      ),
    );
  } catch (error) {
    req.log.error({ err: error, projectId: owner.identity.projectId }, "Metadata publishing failed");
    errorResponse(res, error);
  }
});

router.post("/identities/:projectId/mint", async (req, res): Promise<void> => {
  const params = ConfirmIdentityMintParams.safeParse(req.params);
  const input = ConfirmIdentityMintBody.safeParse(req.body);
  if (!params.success || !isProjectId(params.data.projectId) || !input.success) {
    res.status(400).json({
      error: params.success ? input.success ? "Project ID is not valid." : input.error.message : params.error.message,
      code: "INVALID_INPUT",
    });
    return;
  }
  const owner = await requireCreator(req, res, params.data.projectId);
  if (!owner) return;
  if (!owner.identity.metadataUri || !owner.identity.metadataHash) {
    res.status(409).json({ error: "Publish metadata to IPFS before minting.", code: "METADATA_REQUIRED" });
    return;
  }
  if (owner.identity.identityNftAddress) {
    res.status(409).json({ error: "This identity already has a verified NFT.", code: "ALREADY_MINTED" });
    return;
  }

  try {
    try {
      new (await import("@solana/web3.js")).PublicKey(input.data.assetAddress);
    } catch {
      res.status(400).json({ error: "NFT asset address is not valid base58.", code: "INVALID_ASSET_ADDRESS" });
      return;
    }

    if (heliusConfigured()) {
      const statusResponse = await heliusRpc<{
        value?: Array<{ confirmationStatus?: string; err?: unknown } | null>;
      }>(
        "getSignatureStatuses",
        [[input.data.transactionSignature], { searchTransactionHistory: true }],
        { cache: false },
      );
      const signatureStatus = statusResponse.value?.[0];
      if (!signatureStatus || signatureStatus.err || signatureStatus.confirmationStatus !== "finalized") {
        res.status(409).json({
          error: "The submitted transaction is not successful and finalized on mainnet yet.",
          code: "TRANSACTION_NOT_FINALIZED",
        });
        return;
      }

      const transaction = await heliusRpc<RpcTransaction | null>(
        "getTransaction",
        [
          input.data.transactionSignature,
          {
            encoding: "jsonParsed",
            commitment: "finalized",
            maxSupportedTransactionVersion: 0,
          },
        ],
        { cache: false },
      );
      if (!transaction || transaction.meta?.err) {
        res.status(409).json({ error: "The mainnet transaction could not be verified.", code: "TRANSACTION_INVALID" });
        return;
      }
      const accountKeys = transaction.transaction?.message?.accountKeys ?? [];
      const creatorSigned = accountKeys.some((key) =>
        typeof key === "string"
          ? key === owner.walletAddress
          : key.pubkey === owner.walletAddress && key.signer === true,
      );
      const assetIncluded = accountKeys.some((key) =>
        typeof key === "string"
          ? key === input.data.assetAddress
          : key.pubkey === input.data.assetAddress,
      );
      if (!creatorSigned || !assetIncluded) {
        res.status(409).json({
          error: "The transaction does not show the creator wallet signing the submitted asset creation.",
          code: "TRANSACTION_MISMATCH",
        });
        return;
      }

      const asset = await getDASAsset(input.data.assetAddress);
      const ownership = asset.ownership as { owner?: unknown } | undefined;
      const content = asset.content as { json_uri?: unknown } | undefined;
      if (
        asset.interface !== "MplCoreAsset" ||
        ownership?.owner !== owner.walletAddress ||
        content?.json_uri !== owner.identity.metadataUri
      ) {
        res.status(409).json({
          error: "Independent asset indexing did not confirm a creator-owned Metaplex Core asset with this metadata URI.",
          code: "ASSET_NOT_VERIFIED",
        });
        return;
      }
    }

    const existing = await db
      .select({ projectId: identitiesTable.projectId })
      .from(identitiesTable)
      .where(eq(identitiesTable.identityNftAddress, input.data.assetAddress))
      .limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "This NFT address is already registered.", code: "NFT_ALREADY_LINKED" });
      return;
    }

    const [updated] = await db
      .update(identitiesTable)
      .set({
        identityNftAddress: input.data.assetAddress,
        mintTransactionSignature: input.data.transactionSignature,
        status: "nft_verified",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(identitiesTable.projectId, owner.identity.projectId),
          eq(identitiesTable.creatorWallet, owner.walletAddress),
        ),
      )
      .returning();
    await db.insert(auditEventsTable).values({
      walletAddress: owner.walletAddress,
      action: "identity_nft_verified",
      projectId: owner.identity.projectId,
      transactionSignature: input.data.transactionSignature,
      details: { assetAddress: input.data.assetAddress },
    });
    res.json(
      ConfirmIdentityMintResponse.parse(
        identityToApi(updated, await findMintForProject(updated.projectId)),
      ),
    );
  } catch (error) {
    req.log.error({ err: error, projectId: owner.identity.projectId }, "Mint verification failed");
    errorResponse(res, error);
  }
});

router.get("/v1/identity/:projectId", async (req, res): Promise<void> => {
  const params = GetIdentityParams.safeParse(req.params);
  if (!params.success || !isProjectId(params.data.projectId)) {
    res.status(400).json({ error: "Project ID is not valid.", code: "INVALID_PROJECT_ID" });
    return;
  }
  const record = await findIdentity(params.data.projectId);
  if (!record) {
    res.status(404).json({ error: "Identity record not found.", code: "NOT_FOUND" });
    return;
  }
  res.json(
    GetIdentityResponse.parse(
      identityToApi(record, await findMintForProject(record.projectId)),
    ),
  );
});

export default router;
