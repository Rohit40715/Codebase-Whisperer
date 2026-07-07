import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import Repository from "../models/Repository.js";
import User from "../models/User.js";
import ChatSession from "../models/ChatSession.js";
import { supabaseClient } from "../config/supabase.js";
import axios from "axios";

const fetchAndIndexFile = async ({ owner, repoName, filePath, userId, repoId, githubRepoId, embeddingModel, githubAccessToken }) => {
    const githubApiUrl = encodeURI(`https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}`);
    const headers = { 'User-Agent': 'Codebase-Whisperer-App' };
    if (githubAccessToken) {
        headers['Authorization'] = `Bearer ${githubAccessToken}`;
    }

    const githubResponse = await axios.get(githubApiUrl, { headers });
    if (!githubResponse.data || !githubResponse.data.content) return 0;

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
        chunk.metadata = { userId, repositoryId: repoId, githubRepoId, filePath };
        return chunk;
    });

    if (mappedChunks.length > 0) {
        await SupabaseVectorStore.fromDocuments(mappedChunks, embeddingModel, {
            client: supabaseClient,
            tableName: "documents",
            queryName: "match_documents"
        });
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
            try {
                const chunksCount = await fetchAndIndexFile({
                    owner, repoName, filePath: item.path, userId, repoId, githubRepoId, embeddingModel, githubAccessToken
                });
                totalChunks += chunksCount;
                discoveredFiles.push({ name: item.name, path: item.path });
            } catch (error) {
                continue;
            }
        } else if (item.type === "dir") {
            if (excludedDirs.includes(item.name.toLowerCase())) continue;
            try {
                const result = await crawlDirectory({
                    owner, repoName, dirPath: item.path, userId, repoId, githubRepoId, embeddingModel, discoveredFiles, githubAccessToken
                });
                totalChunks += result.totalChunks;
            } catch (error) {
                continue;
            }
        }
    }
    return { totalChunks, discoveredFiles };
};

export const triggerMockIndex = async (req, res) => {
    const { userId, githubRepoId, name, fullName, cloneUrl, owner, repoName, directoryPath = "" } = req.body;
    
    let resolvedOwner = owner;
    let resolvedRepoName = repoName;

    if ((!resolvedOwner || !resolvedRepoName) && fullName) {
        const parts = fullName.split("/");
        if (parts.length === 2) {
            resolvedOwner = parts[0];
            resolvedRepoName = parts[1];
        }
    }

    if (!resolvedOwner || !resolvedRepoName) {
        return res.status(400).json({ error: "Missing required owner and repoName field configurations" });
    }

    try {
        let repo = await Repository.findOne({ userId, githubRepoId });
        if (!repo) {
            repo = new Repository({ 
                userId, 
                githubRepoId, 
                name: name || resolvedRepoName, 
                fullName: fullName || `${resolvedOwner}/${resolvedRepoName}`, 
                cloneUrl: cloneUrl || `https://github.com/${resolvedOwner}/${resolvedRepoName}.git`, 
                owner: resolvedOwner, 
                repoName: resolvedRepoName, 
                directoryPath, 
                indexingStatus: "processing" 
            });
        } else {
            repo.indexingStatus = "processing";
            repo.isIndexed = false;
            repo.owner = resolvedOwner;
            repo.repoName = resolvedRepoName;
        }
        await repo.save();

        const user = await User.findById(userId);
        let githubAccessToken = user?.githubAccessToken;
        if (!githubAccessToken && process.env.GITHUB_DEV_OVERRIDE_TOKEN) {
            githubAccessToken = process.env.GITHUB_DEV_OVERRIDE_TOKEN;
        }

        await supabaseClient.from("documents").delete().eq("metadata->>repositoryId", repo._id.toString());

        const embeddingModel = new HuggingFaceInferenceEmbeddings({
            apiKey: process.env.HF_TOKEN,
            model: "BAAI/bge-small-en-v1.5",
        });

        const filesAcc = [];
        const result = await crawlDirectory({
            owner: resolvedOwner, 
            repoName: resolvedRepoName, 
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
        repo.files = result.discoveredFiles;
        await repo.save();

        return res.status(200).json({
            message: "Indexed successfully",
            repositoryId: repo._id,
            totalChunksGenerated: result.totalChunks,
            files: repo.files,
            status: repo.indexingStatus
        });
    } catch (error) {
        let repo = await Repository.findOne({ userId, githubRepoId });
        if (repo) {
            repo.indexingStatus = "failed";
            await repo.save();
        }
        return res.status(500).json({ error: error.message });
    }
};

export const getUserRepositories = async (req, res) => {
    const { userId } = req.params;
    try {
        const repos = await Repository.find({ userId }).sort({ createdAt: -1 });
        return res.status(200).json(repos);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

export const getSingleRepositoryDetails = async (req, res) => {
    const { repositoryId } = req.params;
    try {
        const repo = await Repository.findById(repositoryId);
        if (!repo) return res.status(404).json({ error: "Repository not found" });
        return res.status(200).json(repo);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

export const deleteSingleRepository = async (req, res) => {
    const { userId, repositoryId } = req.params;
    try {
        await supabaseClient.from("documents").delete().eq("metadata->>repositoryId", repositoryId.toString());
        await Repository.deleteOne({ _id: repositoryId, userId });
        await ChatSession.deleteOne({ repositoryId, userId });
        return res.status(200).json({ message: "Repository deleted completely" });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

export const purgeCloudData = async (req, res) => {
    const { userId } = req.body;
    try {
        await supabaseClient.from("documents").delete().eq("metadata->>userId", userId.toString());
        await Repository.deleteMany({ userId });
        await ChatSession.deleteMany({ userId });
        return res.status(200).json({ message: "All user databases wiped successfully" });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};