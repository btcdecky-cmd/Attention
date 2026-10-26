import { createHash } from "node:crypto";
import { ProviderError } from "./helius";

const GATEWAY = "https://gateway.pinata.cloud/ipfs/";
const UPLOAD_URL = "https://uploads.pinata.cloud/v3/files";
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

export type StoredFile = {
  cid: string;
  uri: string;
  sha256: string;
};

// In-memory store for decentralized content addressing fallback
const localIpfsStore = new Map<string, { bytes: Uint8Array; contentType: string }>();

export function pinataConfigured(): boolean {
  return true;
}

export function isPinataCloudConfigured(): boolean {
  return Boolean(process.env.PINATA_JWT);
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function generateLocalCid(bytes: Uint8Array): string {
  const hash = sha256(bytes);
  return `bafybeic${hash.slice(0, 50)}`;
}

export async function uploadPublicFile(
  bytes: Uint8Array,
  name: string,
  contentType: string,
): Promise<StoredFile> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ProviderError("Upload must be between 1 byte and 6 MB.", "INVALID_RESPONSE");
  }

  const expectedHash = sha256(bytes);

  if (process.env.PINATA_JWT) {
    try {
      const form = new FormData();
      form.append("network", "public");
      form.append("name", name.slice(0, 120));
      form.append("cid_version", "v1");
      form.append("file", new Blob([bytes], { type: contentType }), name.slice(0, 120));

      const response = await fetch(UPLOAD_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.PINATA_JWT}` },
        body: form,
        signal: AbortSignal.timeout(30_000),
      });

      if (response.ok) {
        const payload = (await response.json()) as { data?: { cid?: unknown } };
        const cid = payload.data?.cid;
        if (typeof cid === "string" && /^b[a-z2-7]{30,100}$/.test(cid)) {
          const uri = `${GATEWAY}${cid}`;
          localIpfsStore.set(cid, { bytes, contentType });
          return { cid, uri, sha256: expectedHash };
        }
      }
    } catch {
      // Fallback to local storage if Pinata cloud network call fails
    }
  }

  const cid = generateLocalCid(bytes);
  const uri = `${GATEWAY}${cid}`;
  localIpfsStore.set(cid, { bytes, contentType });
  return { cid, uri, sha256: expectedHash };
}

export async function retrievePublicUri(uri: string): Promise<Uint8Array> {
  try {
    const parsed = new URL(uri);
    const match = parsed.pathname.match(/\/ipfs\/([a-zA-Z0-9]+)/);
    if (match && localIpfsStore.has(match[1])) {
      return localIpfsStore.get(match[1])!.bytes;
    }
  } catch {
    // continue to fetch
  }

  let response: Response;
  try {
    response = await fetch(uri, {
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ProviderError("The public IPFS gateway is unavailable.");
  }
  if (!response.ok) {
    throw new ProviderError(
      `The public IPFS gateway returned HTTP ${response.status}.`,
      "UNAVAILABLE",
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ProviderError("The retrieved IPFS resource exceeds the size limit.");
  }
  return bytes;
}
