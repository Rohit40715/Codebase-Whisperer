import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import Repository from "../models/Repository.js";
import { supabaseClient } from "../config/supabase.js";
import axios from "axios";

export const triggerMockIndex = async (req, res) => {
    const { userId, githubRepoId, name, fullName, cloneUrl, owner, repoName, filePath } = req.body;

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
                userId: userId,
                repositoryId: repo._id.toString(),
                githubRepoId: githubRepoId,
                filePath: filePath
            };
            return chunk;
        });

        const embeddingModel = new HuggingFaceInferenceEmbeddings({
            apiKey: process.env.HF_TOKEN,
            model: "BAAI/bge-small-en-v1.5",
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

        repo.indexingStatus = "completed";
        repo.isIndexed = true;
        await repo.save();

        return res.status(200).json({
            message: "Live GitHub repository file successfully vectorized using production embeddings",
            repositoryId: repo._id,
            totalChunksGenerated: chunks.length,
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