import express from "express";
import { triggerMockIndex } from "../controllers/indexerController.js";

const router = express.Router();

router.post("/index", triggerMockIndex);

export default router;