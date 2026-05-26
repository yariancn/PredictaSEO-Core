import { vitePlugin as remix } from "@remix-run/dev";
import { installGlobals } from "@remix-run/node";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

installGlobals({ nativeFetch: true });

if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost").hostname;

let hmrConfig;
if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = false;
}

const devPort = Number(process.env.PORT || process.env.FRONTEND_PORT || 3000);
const appOrigin = process.env.SHOPIFY_APP_URL || undefined;

export default defineConfig({
  server: {
    allowedHosts: true,
    cors: {
      preflightContinue: true,
    },
    port: devPort,
    strictPort: false,
    origin: appOrigin,
    hmr: hmrConfig,
    fs: {
      allow: ["app", "node_modules"],
    },
  },
  plugins: [
    {
      name: "predictacore-port-check",
      configureServer(server) {
        server.httpServer?.once("listening", () => {
          const addr = server.httpServer?.address();
          const port = typeof addr === "object" && addr ? addr.port : devPort;
          console.log(
            `[PredictaCore] Vite puerto ${port} | PORT=${process.env.PORT ?? "—"} | origin=${appOrigin ?? "localhost"}`,
          );
          if (appOrigin?.includes("trycloudflare.com")) {
            console.log(
              `[PredictaCore] Túnel activo: ${appOrigin}`,
            );
            console.log(
              `[PredictaCore] ⚠ Si ves error de host en Safari → cierra pestañas del admin y pulsa "p" en esta terminal`,
            );
          }
          if (port !== devPort) {
            console.error(
              `[PredictaCore] ⚠ Puerto real (${port}) ≠ PORT env (${devPort}). Mata procesos viejos: npm run dev:clean`,
            );
          }
        });
      },
    },
    remix({
      ignoredRouteFiles: ["**/.*"],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_singleFetch: false,
      },
    }),
    tsconfigPaths(),
  ],
  build: {
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react", "@shopify/polaris"],
  },
});
