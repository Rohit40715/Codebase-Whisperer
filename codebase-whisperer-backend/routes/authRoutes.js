import express from "express";
import { handleGitHubCallback } from "../controllers/authController.js";

const router = express.Router();

router.post("/auth/github", handleGitHubCallback);

export default router;