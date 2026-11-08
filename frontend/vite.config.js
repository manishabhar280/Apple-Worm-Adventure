import { defineConfig, loadEnv } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendDirectory = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ command, mode }) => {
  const environment = loadEnv(mode, frontendDirectory, "VITE_");
  if (command === "build") {
    let apiUrl;
    try {
      apiUrl = new URL(environment.VITE_API_BASE_URL);
    } catch {
      throw new Error("Set VITE_API_BASE_URL to the deployed HTTPS backend origin before building.");
    }
    if (
      apiUrl.protocol !== "https:" ||
      apiUrl.hostname === "localhost" ||
      apiUrl.hostname === "127.0.0.1" ||
      apiUrl.hostname.endsWith(".example") ||
      apiUrl.hostname.endsWith(".example.com") ||
      apiUrl.hostname.endsWith(".invalid") ||
      apiUrl.hostname.endsWith(".test") ||
      apiUrl.pathname !== "/" ||
      apiUrl.search ||
      apiUrl.hash
    ) {
      throw new Error("VITE_API_BASE_URL must be the HTTPS origin of the deployed backend.");
    }
  }

  return {
    server: {
      proxy: {
        "/api": {
          target: "https://apple-worm-adventure-api.onrender.com",
          changeOrigin: true,
          headers: {
            Origin: "https://apple-worm-adventure-frontend.onrender.com",
          },
        },
      },
      fs: {
        allow: [resolve(frontendDirectory, "..")],
      },
    },
  };
});
