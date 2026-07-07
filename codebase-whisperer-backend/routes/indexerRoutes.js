import express from "express";
import { triggerMockIndex, purgeCloudData, getUserRepositories } from "../controllers/indexerController.js";

const router = express.Router();

router.post("/index", triggerMockIndex);
router.post("/purge", purgeCloudData);
router.get("/user/:userId/repositories", getUserRepositories);

export default router;