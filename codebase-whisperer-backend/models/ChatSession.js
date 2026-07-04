import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true }
}, { timestamps: true });

const chatSessionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    repositoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Repository", required: true },
    title: { type: String, default: "Codebase Discussion" },
    messages: [messageSchema]
}, { timestamps: true });

export default mongoose.model("ChatSession", chatSessionSchema);