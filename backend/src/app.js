import cors from "cors";
import express from "express";
import healthRoutes from "./routes/healthRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { verifyRequestOrigin } from "./middleware/verifyRequestOrigin.js";
import { createAuthRouter } from "./routes/authRoutes.js";
import { createPlayerRouter } from "./routes/playerRoutes.js";
import { createWalletRouter } from "./routes/walletRoutes.js";
import { createRewardRouter } from "./routes/rewardRoutes.js";
import { createAchievementRouter } from "./routes/achievementRoutes.js";
import { createAdminRouter } from "./routes/adminRoutes.js";

const app = express();

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      const allowedOrigin =
        process.env.FRONTEND_ORIGIN || "http://localhost:5173";
      callback(null, !origin || origin === allowedOrigin);
    },
  }),
);
app.use(verifyRequestOrigin);
app.use(express.json({ limit: "100kb" }));

app.use("/api/health", healthRoutes);
app.use("/api/auth", createAuthRouter());
app.use("/api/player", createPlayerRouter());
app.use("/api/wallet", createWalletRouter());
app.use("/api/rewards", createRewardRouter());
app.use("/api/achievements", createAchievementRouter());
app.use("/api/admin", createAdminRouter());

app.use(notFound);
app.use(errorHandler);

export default app;
