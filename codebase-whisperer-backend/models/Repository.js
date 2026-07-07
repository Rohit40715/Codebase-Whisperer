import mongoose from "mongoose";

const repositorySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    githubRepoId: { type: String, required: true },
    name: { type: String, required: true },
    fullName: { type: String, required: true },
    cloneUrl: { type: String, required: true },
    owner: { type: String, default: "Unknown" },
    repoName: { type: String, default: "Unknown" },
    directoryPath: { type: String, default: "" },
    indexingStatus: { type: String, default: "pending" },
    isIndexed: { type: Boolean, default: false },
    files: { type: Array, default: [] },
    createdAt: { type: Date, default: Date.now }
});

const Repository = mongoose.model("Repository", repositorySchema);
export default Repository;