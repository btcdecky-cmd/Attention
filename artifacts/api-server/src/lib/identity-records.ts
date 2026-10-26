import { eq } from "drizzle-orm";
import { db, identitiesTable, tokenLinksTable, type IdentityRecord } from "@workspace/db";

export async function findIdentity(
  projectId: string,
): Promise<IdentityRecord | null> {
  const [record] = await db
    .select()
    .from(identitiesTable)
    .where(eq(identitiesTable.projectId, projectId))
    .limit(1);
  return record ?? null;
}

export async function findIdentityByMint(
  mint: string,
): Promise<IdentityRecord | null> {
  const [record] = await db
    .select({ identity: identitiesTable })
    .from(tokenLinksTable)
    .innerJoin(
      identitiesTable,
      eq(tokenLinksTable.projectId, identitiesTable.projectId),
    )
    .where(eq(tokenLinksTable.tokenMint, mint))
    .limit(1);
  return record?.identity ?? null;
}

export async function findMintForProject(projectId: string): Promise<string | null> {
  const [link] = await db
    .select({ tokenMint: tokenLinksTable.tokenMint })
    .from(tokenLinksTable)
    .where(eq(tokenLinksTable.projectId, projectId))
    .limit(1);
  return link?.tokenMint ?? null;
}

export function identityToApi(
  record: IdentityRecord,
  linkedTokenMint: string | null = null,
) {
  return {
    projectId: record.projectId,
    name: record.name,
    symbol: record.symbol,
    description: record.description,
    creatorWallet: record.creatorWallet,
    website: record.website,
    xProfile: record.xProfile,
    telegram: record.telegram,
    discord: record.discord,
    launchpad: record.launchpad,
    launchpadAttribution: record.launchpadAttribution,
    status: record.status,
    artworkUri: record.artworkUri,
    artworkHash: record.artworkHash,
    metadataUri: record.metadataUri,
    metadataHash: record.metadataHash,
    identityNftAddress: record.identityNftAddress,
    mintTransactionSignature: record.mintTransactionSignature,
    linkedTokenMint,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function isProjectId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
