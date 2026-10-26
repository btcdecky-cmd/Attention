import type { NextFunction, Request, Response } from "express";

const windows = new Map<string, { count: number; resetsAt: number }>();
const WINDOW_MS = 60_000;

function trustedHosts(req?: Request): Set<string> {
  const hostHeader = req?.get("host");
  const hosts = [
    ...(process.env.REPLIT_DOMAINS?.split(",") ?? []),
    process.env.REPLIT_DEV_DOMAIN ?? "",
    ...(process.env.APP_ORIGIN ? [process.env.APP_ORIGIN] : []),
    ...(hostHeader ? [hostHeader] : []),
    "localhost:3000",
    "127.0.0.1:3000",
    "localhost:5173",
    "localhost:5000",
    "127.0.0.1:5173",
    "127.0.0.1:5000",
  ];
  return new Set(
    hosts
      .map((host) => host.trim())
      .filter(Boolean)
      .map((host) => {
        try {
          return new URL(host.includes("://") ? host : `https://${host}`).host;
        } catch {
          return host;
        }
      })
      .filter(Boolean),
  );
}

export function requireSameOrigin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const rawOrigin = req.get("origin");
  if (!rawOrigin) {
    next();
    return;
  }

  try {
    const origin = new URL(rawOrigin);
    const host = req.get("host");
    if (host && origin.host === host) {
      next();
      return;
    }
    if (
      !["http:", "https:"].includes(origin.protocol) ||
      !trustedHosts(req).has(origin.host)
    ) {
      res.status(403).json({ error: "Request origin is not allowed." });
      return;
    }
  } catch {
    res.status(403).json({ error: "Request origin is invalid." });
    return;
  }
  next();
}

export function rateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
  limit = 120,
): void {
  const key = `${req.ip ?? req.socket.remoteAddress ?? "unknown"}:${req.path.startsWith("/auth/") ? "auth" : "api"}`;
  const now = Date.now();
  let bucket = windows.get(key);
  if (!bucket || bucket.resetsAt <= now) {
    bucket = { count: 0, resetsAt: now + WINDOW_MS };
    windows.set(key, bucket);
  }
  bucket.count += 1;

  if (windows.size > 5_000) {
    for (const [storedKey, storedBucket] of windows) {
      if (storedBucket.resetsAt <= now) windows.delete(storedKey);
    }
  }

  if (bucket.count > limit) {
    res.setHeader(
      "Retry-After",
      Math.max(1, Math.ceil((bucket.resetsAt - now) / 1_000)),
    );
    res.status(429).json({
      error: "Too many requests. Please wait before trying again.",
      code: "RATE_LIMITED",
    });
    return;
  }
  next();
}

export function strictAuthRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  rateLimit(req, res, next, 12);
}
