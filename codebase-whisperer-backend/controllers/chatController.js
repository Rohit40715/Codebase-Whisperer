import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import { ChatGroq } from "@langchain/groq";
import { supabaseClient } from "../config/supabase.js";
import ChatSession from "../models/ChatSession.js";

export const handleChat = async (req, res) => {
    const { userId, repositoryId, message } = req.body;

    try {
        let session = await ChatSession.findOne({ userId, repositoryId });
        if (!session) {
            session = new ChatSession({
                userId,
                repositoryId,
                messages: []
            });
        }

        session.messages.push({ role: "user", content: message });
        await session.save();

        const embeddingModel = new HuggingFaceInferenceEmbeddings({
            apiKey: process.env.HF_TOKEN,
            model: "BAAI/bge-small-en-v1.5",
        });

        const vectorStore = new SupabaseVectorStore(embeddingModel, {
            client: supabaseClient,
            tableName: "documents",
            queryName: "match_documents"
        });

        const searchResults = await vectorStore.similaritySearch(message, 2, {
            repositoryId: repositoryId
        });

        const retrievedContext = searchResults.map(doc => doc.pageContent).join("\n\n");

        const llm = new ChatGroq({
            apiKey: process.env.GROQ_API_KEY,
            model: "llama-3.1-8b-instant",
            temperature: 0.2
        });

        const structuredPrompt = `
        You are Codebase Whisperer, an expert software engineering assistant.
        Analyze the following retrieved source code context from the repository to answer the developer's question accurately.
        If the context does not contain relevant information, explain that honestly.

        --- CODEBASE CONTEXT ---
        ${retrievedContext}

        --- DEVELOPER QUESTION ---
        ${message}

        Provide a concise engineering analysis and explanation:
        `;

        const llmResponse = await llm.invoke(structuredPrompt);
        const intelligenceReply = llmResponse.content;

        session.messages.push({ role: "assistant", content: intelligenceReply });
        await session.save();

        return res.status(200).json({
            sessionId: session._id,
            chunksRetrieved: searchResults.length,
            reply: intelligenceReply
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};