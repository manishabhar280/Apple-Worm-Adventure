import "dotenv/config";
import app from "./app.js";
import {
  closeDatabase,
  connectDatabase,
} from "./config/database.js";
import { getServerConfig } from "./config/environment.js";

const { port } = getServerConfig();
const databaseConnected = await connectDatabase();
if (process.env.NODE_ENV === "production" && !databaseConnected) {
  throw new Error("Production startup requires a successful MongoDB connection.");
}

const server = app.listen(port, () => {
  console.info(`API server listening on port ${port}`);
});

async function shutdown(signal) {
  console.info(`${signal} received; shutting down.`);
  server.close(async (error) => {
    if (error) {
      console.error("HTTP server shutdown failed:", error);
      process.exitCode = 1;
    }
    try {
      await closeDatabase();
    } catch (databaseError) {
      console.error("MongoDB shutdown failed:", databaseError);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
