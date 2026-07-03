// index.js
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import fs from "fs";

async function runCodeSplitter() {
    // 1. Read the raw text from our sample JavaScript file
    const sourceCode = fs.readFileSync("sample.js", "utf8");

    // 2. Initialize the text splitter configured specifically for JavaScript syntax rules
    const splitter = RecursiveCharacterTextSplitter.fromLanguage("js", {
        chunkSize: 220,       // Target character length per chunk
        chunkOverlap: 20,     // Retains context continuity between boundaries
    });

    console.log("Analyzing code syntax boundaries and splitting...\n");
    
    // 3. Execute the splitting mechanism
    const chunks = await splitter.createDocuments([sourceCode]);

    // 4. Output the resulting chunks to your console
    chunks.forEach((chunk, index) => {
        console.log(`--- CHUNK ${index + 1} ---`);
        console.log(chunk.pageContent);
        console.log("-------------------------\n");
    });
}

runCodeSplitter().catch(err => console.error("Error running splitter:", err));