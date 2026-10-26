import { Router, type IRouter, type Request, type Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Procedural SVG logo generator for instant preview and fallback
function generateProceduralMemeLogo(name: string, symbol: string, prompt: string): string {
  const seed = (name + symbol + prompt).split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const hues = [167, 188, 38, 280, 320, 210, 45, 140];
  const primaryHue = hues[seed % hues.length];
  const secondaryHue = hues[(seed + 3) % hues.length];
  const initials = (symbol || name || "ID").slice(0, 3).toUpperCase();
  const theme = prompt.toLowerCase();

  let iconGraphic = "";
  if (theme.includes("pepe") || theme.includes("frog")) {
    iconGraphic = `
      <ellipse cx="64" cy="68" rx="36" ry="28" fill="#4ade80" />
      <circle cx="50" cy="52" r="14" fill="#ffffff" stroke="#15803d" stroke-width="4" />
      <circle cx="78" cy="52" r="14" fill="#ffffff" stroke="#15803d" stroke-width="4" />
      <circle cx="52" cy="52" r="6" fill="#14532d" />
      <circle cx="80" cy="52" r="6" fill="#14532d" />
      <path d="M 44 80 Q 64 94 84 80" stroke="#b91c1c" stroke-width="6" fill="none" stroke-linecap="round" />
    `;
  } else if (theme.includes("doge") || theme.includes("shiba") || theme.includes("dog")) {
    iconGraphic = `
      <polygon points="34,26 48,50 26,50" fill="#eab308" />
      <polygon points="94,26 72,50 102,50" fill="#eab308" />
      <circle cx="64" cy="66" r="34" fill="#facc15" />
      <circle cx="50" cy="62" r="5" fill="#1e293b" />
      <circle cx="78" cy="62" r="5" fill="#1e293b" />
      <ellipse cx="64" cy="74" rx="8" ry="6" fill="#1e293b" />
    `;
  } else if (theme.includes("cat") || theme.includes("kitten")) {
    iconGraphic = `
      <polygon points="36,28 48,52 26,52" fill="#f43f5e" />
      <polygon points="92,28 72,52 102,52" fill="#f43f5e" />
      <circle cx="64" cy="66" r="32" fill="#fb7185" />
      <ellipse cx="50" cy="64" rx="4" ry="7" fill="#1e1b4b" />
      <ellipse cx="78" cy="64" rx="4" ry="7" fill="#1e1b4b" />
      <polygon points="64,74 58,70 70,70" fill="#fda4af" />
    `;
  } else if (theme.includes("bull") || theme.includes("moon")) {
    iconGraphic = `
      <path d="M 32 30 Q 30 52 50 56" stroke="#f97316" stroke-width="8" fill="none" stroke-linecap="round" />
      <path d="M 96 30 Q 98 52 78 56" stroke="#f97316" stroke-width="8" fill="none" stroke-linecap="round" />
      <circle cx="64" cy="68" r="30" fill="#ea580c" />
      <circle cx="52" cy="64" r="5" fill="#ffffff" />
      <circle cx="76" cy="64" r="5" fill="#ffffff" />
      <ellipse cx="64" cy="76" rx="10" ry="6" fill="#c2410c" />
    `;
  } else {
    iconGraphic = `
      <circle cx="64" cy="64" r="36" fill="url(#coreGlow)" />
      <text x="64" y="74" font-family="system-ui, sans-serif" font-weight="900" font-size="28" fill="#ffffff" text-anchor="middle" letter-spacing="-1">${initials}</text>
    `;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="512" height="512">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="hsl(${primaryHue}, 80%, 14%)" />
        <stop offset="50%" stop-color="hsl(${primaryHue}, 70%, 8%)" />
        <stop offset="100%" stop-color="hsl(${secondaryHue}, 85%, 6%)" />
      </linearGradient>
      <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="hsl(${primaryHue}, 90%, 55%)" />
        <stop offset="50%" stop-color="#38dcb5" />
        <stop offset="100%" stop-color="hsl(${secondaryHue}, 90%, 55%)" />
      </linearGradient>
      <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="hsl(${primaryHue}, 90%, 50%)" stop-opacity="0.8" />
        <stop offset="100%" stop-color="hsl(${secondaryHue}, 80%, 20%)" stop-opacity="0.2" />
      </radialGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    <rect width="128" height="128" rx="64" fill="url(#bgGrad)" />
    <circle cx="64" cy="64" r="60" fill="none" stroke="url(#ringGrad)" stroke-width="4" filter="url(#glow)" />
    <circle cx="64" cy="64" r="54" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1" stroke-dasharray="4,4" />
    ${iconGraphic}
    <rect x="34" y="100" width="60" height="18" rx="9" fill="rgba(0,0,0,0.6)" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
    <text x="64" y="113" font-family="'Courier New', monospace" font-weight="bold" font-size="10" fill="#38dcb5" text-anchor="middle" letter-spacing="1">$${symbol || "MEME"}</text>
  </svg>`;
}

router.post("/ai/generate-logo", async (req: Request, res: Response): Promise<void> => {
  try {
    const { prompt, name = "Meme Coin", symbol = "MEME" } = req.body ?? {};
    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: "A prompt describing the logo is required." });
      return;
    }

    // If GEMINI_API_KEY is configured, use the official @google/genai SDK
    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build",
            },
          },
        });

        const imagePrompt = `Crypto token logo icon, Solana meme coin emblem, vector illustration, vibrant high resolution, round badge, ${prompt}. Clean background, high contrast, token sticker style.`;
        const response = await ai.models.generateContent({
          model: "gemini-3.1-flash-lite-image",
          contents: imagePrompt,
          config: {
            imageConfig: {
              aspectRatio: "1:1",
            },
          },
        });

        for (const part of response.candidates?.[0]?.content?.parts ?? []) {
          if (part.inlineData) {
            const mimeType = part.inlineData.mimeType || "image/png";
            const base64Data = part.inlineData.data;
            const dataUrl = `data:${mimeType};base64,${base64Data}`;
            res.json({
              success: true,
              dataUrl,
              mimeType,
              source: "gemini-3.1-flash-lite-image",
            });
            return;
          }
        }
      } catch (geminiError) {
        logger.warn({ err: geminiError }, "Gemini image generation call failed, falling back to SVG emblem");
      }
    }

    // Procedural SVG fallback
    const svg = generateProceduralMemeLogo(name, symbol, prompt);
    const base64 = Buffer.from(svg).toString("base64");
    const dataUrl = `data:image/svg+xml;base64,${base64}`;

    res.json({
      success: true,
      dataUrl,
      mimeType: "image/svg+xml",
      source: "memeid-vector-generator",
    });
  } catch (err) {
    logger.error({ err }, "Error generating logo");
    res.status(500).json({ error: "Failed to generate logo." });
  }
});

export default router;
