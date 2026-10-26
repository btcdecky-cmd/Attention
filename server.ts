import express from "express";
import path from "path";
import apiApp from "./artifacts/api-server/src/app";
import { createServer as createViteServer } from "vite";

const app = express();
const port = Number(process.env.PORT) || 3000;

// Mount the API application handling /api routes
app.use(apiApp);

async function startServer() {
  if (process.env.NODE_ENV === "production") {
    const distPath = path.resolve(process.cwd(), "artifacts/memeid/dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      configFile: path.resolve(process.cwd(), "artifacts/memeid/vite.config.ts"),
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`[MemeID] Server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error("[MemeID] Failed to start server:", err);
  process.exit(1);
});
