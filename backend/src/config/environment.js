export function getServerConfig(environment = process.env) {
  const port = Number(environment.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  const jwtSecret = environment.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters.");
  }
  if (jwtSecret.startsWith("replace_with_")) {
    throw new Error("Replace the JWT_SECRET placeholder before starting the API.");
  }

  const isProduction = environment.NODE_ENV === "production";
  const frontendOrigin = environment.FRONTEND_ORIGIN ||
    (isProduction ? "" : "http://localhost:5173");
  if (isProduction && !frontendOrigin) {
    throw new Error("FRONTEND_ORIGIN must be configured in production.");
  }
  if (frontendOrigin) {
    let parsedOrigin;
    try {
      parsedOrigin = new URL(frontendOrigin);
    } catch {
      throw new Error("FRONTEND_ORIGIN must be a valid origin URL.");
    }
    if (
      !["http:", "https:"].includes(parsedOrigin.protocol) ||
      parsedOrigin.origin !== frontendOrigin ||
      (isProduction && parsedOrigin.protocol !== "https:")
    ) {
      throw new Error("FRONTEND_ORIGIN must be an origin URL and use HTTPS in production.");
    }
    if (
      isProduction &&
      (parsedOrigin.hostname === "localhost" ||
        parsedOrigin.hostname === "127.0.0.1" ||
        parsedOrigin.hostname.endsWith(".example") ||
        parsedOrigin.hostname.endsWith(".example.com") ||
        parsedOrigin.hostname.endsWith(".invalid") ||
        parsedOrigin.hostname.endsWith(".test"))
    ) {
      throw new Error("Replace the FRONTEND_ORIGIN example host with the deployed frontend host.");
    }
  }

  const mongodbUri = environment.MONGODB_URI || "";
  if (
    isProduction &&
    (!/^mongodb(?:\+srv)?:\/\//.test(mongodbUri) || /[<>]|<username>|<password>|<cluster-host>/i.test(mongodbUri))
  ) {
    throw new Error("A real MONGODB_URI must be configured in production.");
  }
  if (isProduction && environment.REWARDED_AD_PROVIDER !== "unconfigured") {
    throw new Error("Set REWARDED_AD_PROVIDER=unconfigured in production; no real ad provider is integrated.");
  }

  return {
    port,
    frontendOrigin,
    jwtSecret,
  };
}
