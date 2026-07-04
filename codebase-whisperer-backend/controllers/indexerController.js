import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import Repository from "../models/Repository.js";
import fs from "fs";
import path from "path";

export const triggerMockIndex = async (req, res) => {
    const { userId, githubRepoId, name, fullName, cloneUrl } = req.body;

    try {
        let repo = await Repository.findOne({ githubRepoId });

        if (!repo) {
            repo = new Repository({
                userId,
                githubRepoId,
                name,
                fullName,
                cloneUrl,
                indexingStatus: "processing"
            });
        } else {
            repo.indexingStatus = "processing";
            repo.isIndexed = false;
        }
        await repo.save();

        const filePath = path.join(process.cwd(), "sample.js");
        if (!fs.existsSync(filePath)) {
            repo.indexingStatus = "failed";
            await repo.save();
            return res.status(404).json({ error: "Source code file missing on server" });
        }

        const sourceCode = fs.readFileSync(filePath, "utf8");

        const splitter = RecursiveCharacterTextSplitter.fromLanguage("js", {
            chunkSize: 220,
            chunkOverlap: 20,
        });
        const chunks = await splitter.createDocuments([sourceCode]);

        repo.indexingStatus = "completed";
        repo.isIndexed = true;
        await repo.save();

        return res.status(200).json({
            message: "Repository successfully indexed inside database",
            repositoryId: repo._id,
            totalChunksGenerated: chunks.length,
            status: repo.indexingStatus
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};