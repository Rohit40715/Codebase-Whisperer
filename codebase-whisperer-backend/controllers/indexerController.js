import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import Repository from "../models/Repository.js";
import { supabaseClient } from "../config/supabase.js";
import axios from "axios";

const fetchAndIndexFile = async ({ owner, repoName, filePath, userId, repoId, githubRepoId, embeddingModel }) => {
    const githubApiUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}`;
    const githubResponse = await axios.get(githubApiUrl, {
        headers: { 'User-Agent': 'Codebase-Whisperer-App' }
    });

    const base64Content = githubResponse.data.content;
    const sourceCode = Buffer.from(base64Content, 'base64').toString('utf-8');

    const splitter = RecursiveCharacterTextSplitter.fromLanguage("js", {
        chunkSize: 220,
        chunkOverlap: 20,
    });
    const chunks = await splitter.createDocuments([sourceCode]);

    const mappedChunks = chunks.map(chunk => {
        chunk.metadata = {
            userId,
            repositoryId: repoId,
            githubRepoId,
            filePath
        };
        return chunk;
    });

    await SupabaseVectorStore.fromDocuments(
        mappedChunks,
        embeddingModel,
        {
            client: supabaseClient,
            tableName: "documents",
            queryName: "match_documents"
        }
    );
    return chunks.length;
};

const crawlDirectory = async ({ owner, repoName, dirPath, userId, repoId, githubRepoId, embeddingModel }) => {
    const githubApiUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/${dirPath}`;
    const githubResponse = await axios.get(githubApiUrl, {
        headers: { 'User-Agent': 'Codebase-Whisperer-App' }
    });

    let totalChunks = 0;
    const items = Array.isArray(githubResponse.data) ? githubResponse.data : [githubResponse.data];

    for (const item of items) {
        if (item.type === "file" && item.name.endsWith(".js")) {
            const chunksCount = await fetchAndIndexFile({
                owner,
                repoName,
                filePath: item.path,
                userId,
                repoId,
                githubRepoId,
                embeddingModel
            });
            totalChunks += chunksCount;
        } else if (item.type === "dir") {
            const chunksCount = await crawlDirectory({
                owner,
                repoName,
                dirPath: item.path,
                userId,
                repoId,
                githubRepoId,
                embeddingModel
            });
            totalChunks += chunksCount;
        }
    }
    return totalChunks;
};

export const triggerMockIndex = async (req, res) => {
    const { userId, githubRepoId, name, fullName, cloneUrl, owner, repoName, directoryPath = "" } = req.body;

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

        const embeddingModel = new HuggingFaceInferenceEmbeddings({
            apiKey: process.env.HF_TOKEN,
            model: "BAAI/bge-small-en-v1.5",
        });

        const totalChunksGenerated = await crawlDirectory({
            owner,
            repoName,
            dirPath: directoryPath,
            userId,
            repoId: repo._id.toString(),
            githubRepoId,
            embeddingModel
        });

        repo.indexingStatus = "completed";
        repo.isIndexed = true;
        await repo.save();

        return res.status(200).json({
            message: "GitHub directory crawled and indexed successfully",
            repositoryId: repo._id,
            totalChunksGenerated,
            status: repo.indexingStatus
        });

    } catch (error) {
        let repo = await Repository.findOne({ githubRepoId });
        if (repo) {
            repo.indexingStatus = "failed";
            await repo.save();
        }
        return res.status(500).json({ error: error.message });
    }
};