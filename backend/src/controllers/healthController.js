import { getHealthReport, getLivenessReport } from "../services/healthService.js";

export function getHealth(_request, response) {
  const health = getHealthReport();
  response.status(health.database.connected ? 200 : 503).json(health);
}

export function getLiveness(_request, response) {
  response.status(200).json(getLivenessReport());
}
