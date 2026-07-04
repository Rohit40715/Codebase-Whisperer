import mongoose from "mongoose";

const repositorySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    githubRepoId: { type: String, required: true },
    name: { type: String, required: true },
    fullName: { type: String, required: true },
    cloneUrl: { type: String, required: true },
    webhookId: { type: String },
    isIndexed: { type: Boolean, default: false },
    indexingStatus: { type: String, enum: ["idle", "processing", "completed", "failed"], default: "idle" }
}, { timestamps: true });

repositorySchema.index({ userId: 1, githubRepoId: 1 }, { unique: true });

export default mongoose.model("Repository", repositorySchema);