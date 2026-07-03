import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import fs from "fs";

class CustomDeterministicEmbeddings {
    async embedDocuments(texts) {
        return texts.map(text => this._calculateVector(text));
    }

    async embedQuery(text) {
        return this._calculateVector(text);
    }

    _calculateVector(text) {
        const lowerText = text.toLowerCase();
        const vector = Array(8).fill(0);
        
        if (lowerText.includes("logout") || lowerText.includes("clear"))        vector[0] = 1.0;
        if (lowerText.includes("login") || lowerText.includes("authenticate")) vector[1] = 1.0;
        if (lowerText.includes("auth") || lowerText.includes("controller"))    vector[2] = 1.0;
        if (lowerText.includes("user") || lowerText.includes("session"))       vector[3] = 1.0;
        if (lowerText.includes("error") || lowerText.includes("fail"))         vector[4] = 1.0;
        
        return vector;
    }
}

async function runRAGPrototype() {
    const sourceCode = fs.readFileSync("sample.js", "utf8");

    const splitter = RecursiveCharacterTextSplitter.fromLanguage("js", {
        chunkSize: 220,
        chunkOverlap: 20,
    });
    const chunks = await splitter.createDocuments([sourceCode]);
    console.log(`✅ Successfully generated ${chunks.length} code chunks.\n`);

    console.log("💿 Initializing Vector Database and indexing code vectors...");
    const embeddingModel = new CustomDeterministicEmbeddings();
    const vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddingModel);
    console.log("🏁 Indexing complete!\n");

    const userQuery = "How do I handle user logout?";
    console.log(`🔍 Simulating User Query: "${userQuery}"`);
    console.log("Searching vector space for closest code snippets...");

    const searchResults = await vectorStore.similaritySearch(userQuery, 2);

    console.log("\n--- RETRIEVED CONTEXT FOR THE LLM ---");
    searchResults.forEach((result, index) => {
        console.log(`\nMatch #${index + 1}:`);
        console.log(result.pageContent);
        console.log("------------------------------------");
    });
}

runRAGPrototype().catch(err => console.error("RAG Error:", err));
