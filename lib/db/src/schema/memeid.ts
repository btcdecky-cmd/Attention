import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const identitiesTable = pgTable(
  "memeid_identities",
  {
    projectId: uuid("project_id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    symbol: text("symbol").notNull(),
    description: text("description").notNull(),
    creatorWallet: text("creator_wallet").notNull(),
    website: text("website"),
    xProfile: text("x_profile"),
    telegram: text("telegram"),
    discord: text("discord"),
    launchpad: text("launchpad").notNull().default("none"),
    launchpadAttribution: text("launchpad_attribution")
      .notNull()
      .default("not_checked"),
    status: text("status").notNull().default("draft"),
    artworkUri: text("artwork_uri"),
    artworkHash: text("artwork_hash"),
    metadataUri: text("metadata_uri"),
    metadataHash: text("metadata_hash"),
    identityNftAddress: text("identity_nft_address"),
    mintTransactionSignature: text("mint_transaction_signature"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("memeid_identities_creator_idx").on(table.creatorWallet),
    index("memeid_identities_created_idx").on(table.createdAt),
    uniqueIndex("memeid_identities_nft_unique").on(table.identityNftAddress),
  ],
);

export const authChallengesTable = pgTable(
  "memeid_auth_challenges",
  {
    nonce: text("nonce").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    domain: text("domain").notNull(),
    message: text("message").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("memeid_auth_challenges_wallet_idx").on(table.walletAddress),
    index("memeid_auth_challenges_expiry_idx").on(table.expiresAt),
  ],
);

export const walletSessionsTable = pgTable(
  "memeid_wallet_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("memeid_wallet_sessions_wallet_idx").on(table.walletAddress),
    index("memeid_wallet_sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const tokenLinksTable = pgTable(
  "memeid_token_links",
  {
    tokenMint: text("token_mint").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => identitiesTable.projectId, { onDelete: "cascade" }),
    tokenProgram: text("token_program").notNull(),
    supply: text("supply").notNull(),
    decimals: integer("decimals").notNull(),
    mintAuthority: text("mint_authority"),
    freezeAuthority: text("freeze_authority"),
    extensions: jsonb("extensions").$type<string[]>().notNull().default([]),
    creatorRelationshipVerified: boolean("creator_relationship_verified")
      .notNull()
      .default(false),
    relationshipEvidence: text("relationship_evidence"),
    verifiedAt: timestamp("verified_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("memeid_token_links_project_unique").on(table.projectId),
    index("memeid_token_links_verified_idx").on(table.verifiedAt),
  ],
);

export const riskAssessmentsTable = pgTable(
  "memeid_risk_assessments",
  {
    tokenMint: text("token_mint").primaryKey(),
    score: integer("score"),
    availability: text("availability").notNull(),
    methodology: text("methodology").notNull(),
    findings: jsonb("findings").$type<unknown[]>().notNull().default([]),
    sources: jsonb("sources").$type<string[]>().notNull().default([]),
    warning: text("warning").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("memeid_risk_updated_idx").on(table.updatedAt)],
);

export const auditEventsTable = pgTable(
  "memeid_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletAddress: text("wallet_address"),
    action: text("action").notNull(),
    projectId: uuid("project_id").references(() => identitiesTable.projectId, {
      onDelete: "set null",
    }),
    transactionSignature: text("transaction_signature"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("memeid_audit_wallet_idx").on(table.walletAddress),
    index("memeid_audit_project_idx").on(table.projectId),
    index("memeid_audit_time_idx").on(table.occurredAt),
  ],
);

export type IdentityRecord = typeof identitiesTable.$inferSelect;
export type TokenLinkRecord = typeof tokenLinksTable.$inferSelect;
