import mongoose from "mongoose";

const chatSessionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    repositoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Repository", required: true },
    messages: [
        {
            role: { type: String, required: true },
            content: { type: String, required: true },
            timestamp: { type: Date, default: Date.now }
        }
    ],
    updatedAt: { type: Date, default: Date.now }
});

const ChatSession = mongoose.model("ChatSession", chatSessionSchema);
export default ChatSession;