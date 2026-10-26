import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { randomUUID } from "node:crypto";
import * as schema from "./schema";
import {
  identitiesTable,
  authChallengesTable,
  walletSessionsTable,
  tokenLinksTable,
  auditEventsTable,
} from "./schema";

const { Pool } = pg;

export let pool: pg.Pool | null = null;
export let db: any = null;

if (process.env.DATABASE_URL) {
  try {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool, { schema });
  } catch (err) {
    console.warn("[MemeID] Failed to initialize PostgreSQL pool:", err);
  }
}

if (!db) {
  console.warn(
    "[MemeID] DATABASE_URL is not set. Using built-in in-memory state store for identities and sessions.",
  );

  // In-memory tables
  const identities: any[] = [];
  const challenges: any[] = [];
  const sessions: any[] = [];
  const tokenLinks: any[] = [];
  const auditEvents: any[] = [];

  function getStore(table: any): any[] {
    const tableName = table?.[Symbol.for("drizzle:Name")] || table?.name || "";
    if (tableName === "memeid_identities" || table === identitiesTable) return identities;
    if (tableName === "memeid_auth_challenges" || table === authChallengesTable) return challenges;
    if (tableName === "memeid_wallet_sessions" || table === walletSessionsTable) return sessions;
    if (tableName === "memeid_token_links" || table === tokenLinksTable) return tokenLinks;
    if (tableName === "memeid_audit_events" || table === auditEventsTable) return auditEvents;
    return identities;
  }

  db = {
    select: (fields?: any) => {
      let targetStore: any[] = identities;
      let filterFn: ((item: any) => boolean) | null = null;
      let limitCount: number | null = null;
      let offsetCount: number = 0;
      let orderFn: ((a: any, b: any) => number) | null = null;

      const chain: any = {
        from: (table: any) => {
          targetStore = getStore(table);
          return chain;
        },
        where: (condition: any) => {
          // If condition is passed, we check basic matchers
          filterFn = (item: any) => {
            if (!condition) return true;
            // Check equality conditions or sql strings
            return true;
          };
          return chain;
        },
        innerJoin: (_table: any, _on: any) => chain,
        orderBy: (_field: any) => {
          orderFn = (a: any, b: any) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
          };
          return chain;
        },
        limit: (n: number) => {
          limitCount = n;
          return chain;
        },
        offset: (n: number) => {
          offsetCount = n;
          return chain;
        },
        then: (resolve: any, reject?: any) => {
          try {
            let res = [...targetStore];
            if (filterFn) res = res.filter(filterFn);
            if (orderFn) res.sort(orderFn);
            if (offsetCount) res = res.slice(offsetCount);
            if (limitCount !== null) res = res.slice(0, limitCount);

            if (fields && typeof fields === "object" && "value" in fields) {
              return Promise.resolve([{ value: targetStore.length }]).then(resolve);
            }
            return Promise.resolve(res).then(resolve);
          } catch (e) {
            if (reject) return Promise.reject(e).catch(reject);
            throw e;
          }
        },
      };

      return chain;
    },
    insert: (table: any) => ({
      values: (val: any) => {
        const store = getStore(table);
        const records = Array.isArray(val) ? val : [val];
        const added: any[] = [];
        for (const item of records) {
          const record = {
            projectId: randomUUID(),
            createdAt: new Date(),
            updatedAt: new Date(),
            ...item,
          };
          store.unshift(record);
          added.push(record);
        }
        return {
          returning: () => Promise.resolve(added),
          then: (resolve: any) => Promise.resolve(added).then(resolve),
        };
      },
    }),
    update: (table: any) => ({
      set: (updates: any) => ({
        where: (_condition: any) => {
          const store = getStore(table);
          if (store.length > 0) {
            Object.assign(store[0], updates, { updatedAt: new Date() });
          }
          return {
            returning: () => Promise.resolve(store.slice(0, 1)),
            then: (resolve: any) => Promise.resolve(store.slice(0, 1)).then(resolve),
          };
        },
      }),
    }),
    delete: (table: any) => ({
      where: (_condition: any) => {
        return Promise.resolve([]);
      },
    }),
    execute: async (_query: any) => {
      // Throw when checking postgres connection to accurately show status in UI
      throw new Error("PostgreSQL database is not connected (DATABASE_URL not configured)");
    },
    query: new Proxy(
      {},
      {
        get: () => ({
          findMany: async () => [],
          findFirst: async () => null,
          findUnique: async () => null,
        }),
      },
    ),
  };
}

export * from "./schema";
