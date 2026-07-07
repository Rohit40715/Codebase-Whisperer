import { ChatGroq } from "@langchain/groq";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import { supabaseClient } from "../config/supabase.js";
import ChatSession from "../models/ChatSession.js";

export const handleChat = async (req, res) => {
    const { userId, repositoryId, message } = req.body;
    
    if (!userId || !repositoryId || !message) {
        return res.status(400).json({ error: "Missing parameter fields required to verify target canvas conversation vectors" });
    }

    try {
        const embeddings = new HuggingFaceInferenceEmbeddings({
            apiKey: process.env.HF_TOKEN,
            model: "BAAI/bge-small-en-v1.5"
        });

        const vectorStore = new SupabaseVectorStore(embeddings, {
            client: supabaseClient,
            tableName: "documents",
            queryName: "match_documents",
            filter: { repositoryId: repositoryId.toString() }
        });

        const documentationChunks = await vectorStore.similaritySearch(message, 4);
        const contextPayload = documentationChunks.map(chunk => chunk.pageContent).join("\n\n");

        const structuralPrompt = `Use this context to answer:\n${contextPayload || "No direct matching code found."}\n\nQuestion: ${message}`;
        const modelEngine = new ChatGroq({ apiKey: process.env.GROQ_API_KEY, model: "llama-3.3-70b-versatile" });
        
        const generationOutput = await modelEngine.invoke([
            { role: "user", content: structuralPrompt }
        ]);
        
        const systemReply = generationOutput.content;

        let session = await ChatSession.findOne({ userId, repositoryId });
        if (!session) {
            session = new ChatSession({ userId, repositoryId, messages: [] });
        }
        session.messages.push({ role: "user", content: message });
        session.messages.push({ role: "assistant", content: systemReply });
        session.updatedAt = Date.now();
        await session.save();

        return res.status(200).json({ reply: systemReply });
    } catch (error) {
        console.error("❌ [CHAT ROUTE CRITICAL ERROR]:", error.stack || error.message);
        return res.status(500).json({ error: error.message });
    }
};

export const handleChatMessage = handleChat;

export const getChatHistory = async (req, res) => {
    const { userId, repositoryId } = req.params;
    try {
        const session = await ChatSession.findOne({ userId, repositoryId });
        if (!session) return res.status(200).json({ messages: [] });
        return res.status(200).json(session);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};