import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import Repository from "../models/Repository.js";
import User from "../models/User.js";
import { supabaseClient } from "../config/supabase.js";
import axios from "axios";

const fetchAndIndexFile = async ({ owner, repoName, filePath, userId, repoId, githubRepoId, embeddingModel, githubAccessToken }) => {
    // FIX 1: Safely encode the URL to protect against spaces or symbols in names
    const githubApiUrl = encodeURI(`https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}`);
    
    const headers = { 'User-Agent': 'Codebase-Whisperer-App' };
    if (githubAccessToken) {
        headers['Authorization'] = `Bearer ${githubAccessToken}`;
    }

    const githubResponse = await axios.get(githubApiUrl, { headers });

    if (!githubResponse.data || !githubResponse.data.content) {
        console.log(`⚠️ [CRAWLER] File ${filePath} contains no readable content. Skipping.`);
        return 0;
    }

    const base64Content = githubResponse.data.content;
    const sourceCode = Buffer.from(base64Content, 'base64').toString('utf-8');

    const ext = filePath.split('.').pop().toLowerCase();
    let lang = "js";
    
    if (ext === "py") lang = "python";
    if (["cpp", "cc", "h", "hpp"].includes(ext)) lang = "cpp";
    if (ext === "go") lang = "go";
    if (ext === "java") lang = "java";

    const supportedExts = ["js", "jsx", "ts", "tsx", "py", "cpp", "cc", "h", "hpp", "java", "go"];
    const splitter = supportedExts.includes(ext)
        ? RecursiveCharacterTextSplitter.fromLanguage(lang, { chunkSize: 220, chunkOverlap: 20 })
        : new RecursiveCharacterTextSplitter({ chunkSize: 220, chunkOverlap: 20 });

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

    if (mappedChunks.length > 0) {
        await SupabaseVectorStore.fromDocuments(
            mappedChunks,
            embeddingModel,
            {
                client: supabaseClient,
                tableName: "documents",
                queryName: "match_documents"
            }
        );
    }
    return chunks.length;
};

const crawlDirectory = async ({ owner, repoName, dirPath, userId, repoId, githubRepoId, embeddingModel, discoveredFiles = [], githubAccessToken }) => {
    const githubApiUrl = encodeURI(`https://api.github.com/repos/${owner}/${repoName}/contents/${dirPath}`);
    
    const headers = { 'User-Agent': 'Codebase-Whisperer-App' };
    if (githubAccessToken) {
        headers['Authorization'] = `Bearer ${githubAccessToken}`;
    }

    const githubResponse = await axios.get(githubApiUrl, { headers });

    let totalChunks = 0;
    const items = Array.isArray(githubResponse.data) ? githubResponse.data : [githubResponse.data];
    const excludedDirs = [".git", "node_modules", "venv", ".venv", "__pycache__", "build", "dist", "env", ".env"];

    for (const item of items) {
        if (item.type === "file" && /\.(js|jsx|ts|tsx|py|cpp|cc|h|hpp|java|go)$/i.test(item.name)) {
            
            // FIX 2: Isolate file processing inside an internal try/catch block (Fault Tolerance)
            try {
                console.log(`⚡ [CRAWLER] Ingesting file: ${item.path}`);
                const chunksCount = await fetchAndIndexFile({
                    owner,
                    repoName,
                    filePath: item.path,
                    userId,
                    repoId,
                    githubRepoId,
                    embeddingModel,
                    githubAccessToken
                });
                totalChunks += chunksCount;
                discoveredFiles.push({ name: item.name, path: item.path });
            } catch (fileError) {
                // If a single file throws a 404 or fails, log it and keep moving forward!
                console.error(`⚠️ [CRAWLER WARNING] Skipping problematic file path [${item.path}]:`, fileError.message);
                continue; 
            }

        } else if (item.type === "dir") {
            if (excludedDirs.includes(item.name.toLowerCase())) {
                console.log(`⏩ [CRAWLER] Skipping excluded system directory: ${item.path}`);
                continue; 
            }

            // FIX 3: Protect folder navigation chains with try/catch isolation as well
            try {
                const result = await crawlDirectory({
                    owner,
                    repoName,
                    dirPath: item.path,
                    userId,
                    repoId,
                    githubRepoId,
                    embeddingModel,
                    discoveredFiles,
                    githubAccessToken
                });
                totalChunks += result.totalChunks;
            } catch (dirError) {
                console.error(`⚠️ [CRAWLER WARNING] Skipping problematic subdirectory [${item.path}]:`, dirError.message);
                continue;
            }
        }
    }
    return { totalChunks, discoveredFiles };
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

        const user = await User.findById(userId);
        let githubAccessToken = user?.githubAccessToken;

        if (githubAccessToken) {
            console.log("🚀 [CRAWLER] Active token extracted directly from database user context profile.");
        } else if (process.env.GITHUB_DEV_OVERRIDE_TOKEN) {
            githubAccessToken = process.env.GITHUB_DEV_OVERRIDE_TOKEN;
            console.log("⚠️ [CRAWLER] Database profile token missing. Activating GITHUB_DEV_OVERRIDE_TOKEN fallback string.");
        }

        await supabaseClient
            .from("documents")
            .delete()
            .eq("metadata->>repositoryId", repo._id.toString());

        const embeddingModel = new HuggingFaceInferenceEmbeddings({
            apiKey: process.env.HF_TOKEN,
            model: "BAAI/bge-small-en-v1.5",
        });

        const filesAcc = [];
        const result = await crawlDirectory({
            owner,
            repoName,
            dirPath: directoryPath,
            userId,
            repoId: repo._id.toString(),
            githubRepoId,
            embeddingModel,
            discoveredFiles: filesAcc,
            githubAccessToken
        });

        repo.indexingStatus = "completed";
        repo.isIndexed = true;
        await repo.save();

        return res.status(200).json({
            message: "GitHub directory crawled and indexed successfully",
            repositoryId: repo._id,
            totalChunksGenerated: result.totalChunks,
            files: result.discoveredFiles,
            status: repo.indexingStatus
        });

    } catch (error) {
        console.error("❌ [CRITICAL INDEXER ERROR]:", error.response?.data || error.message);
        let repo = await Repository.findOne({ githubRepoId });
        if (repo) {
            repo.indexingStatus = "failed";
            await repo.save();
        }
        return res.status(500).json({ error: error.message });
    }
};

// Append this function to the bottom of controllers/indexerController.js
export const purgeCloudData = async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: "User ID parameter is required for a system wipe." });
    }

    try {
        console.log(`🧹 [PURGE] Initiating complete cloud data wipe for User ID: ${userId}`);

        // 1. Purge Vectors from Supabase matching this specific user's metadata tag
        const supabaseResult = await supabaseClient
            .from("documents")
            .delete()
            .eq("metadata->>userId", userId.toString());

        if (supabaseResult.error) {
            throw new Error(`Supabase Wipe Failed: ${supabaseResult.error.message}`);
        }

        // 2. Import MongoDB models inside the function or verify they are imported at the top
        // (Ensure ChatSession is imported if you want to wipe conversational logs too)
        const ChatSession = (await import("../models/ChatSession.js")).default; 

        // 3. Delete tracked Repository metadata and chat histories from MongoDB Atlas
        await Repository.deleteMany({ userId });
        await ChatSession.deleteMany({ userId });

        console.log(`✨ [PURGE] Cloud wipe successfully finalized for User ID: ${userId}`);

        return res.status(200).json({
            message: "Cloud database tables and vector instances successfully purged."
        });

    } catch (error) {
        console.error("❌ [PURGE CRITICAL ERROR]:", error.message);
        return res.status(500).json({ error: error.message });
    }
};

export const getUserRepositories = async (req, res) => {
    const { userId } = req.params;
    try {
        const repos = await Repository.find({ userId });
        return res.status(200).json(repos);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};