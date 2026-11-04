import { Router } from "express";
import { getHealth, getLiveness } from "../controllers/healthController.js";

const router = Router();

router.get("/", getHealth);
router.get("/live", getLiveness);
router.get("/ready", getHealth);

export default router;
