import { getDatabaseStatus } from "../config/database.js";

export function getHealthReport() {
  const database = getDatabaseStatus();
  return {
    status: database.connected ? "ok" : "degraded",
    backend: { status: "ok" },
    database,
    timestamp: new Date().toISOString(),
  };
}

export function getLivenessReport() {
  return {
    status: "ok",
    backend: { status: "ok" },
    timestamp: new Date().toISOString(),
  };
}
