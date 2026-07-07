import express from "express";
import { 
    triggerMockIndex, 
    purgeCloudData, 
    getUserRepositories, 
    getSingleRepositoryDetails, 
    deleteSingleRepository 
} from "../controllers/indexerController.js";
import { getChatHistory } from "../controllers/chatController.js";

const router = express.Router();

router.post("/index", triggerMockIndex);
router.post("/purge", purgeCloudData);
router.get("/user/:userId/repositories", getUserRepositories);
router.get("/repository/:repositoryId", getSingleRepositoryDetails);
router.delete("/user/:userId/repository/:repositoryId", deleteSingleRepository);
router.get("/chat/:userId/:repositoryId", getChatHistory);

export default router;