import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    githubId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    email: { type: String },
    avatarUrl: { type: String },
    githubAccessToken: { type: String }, // New field to securely store the session token
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
export default User;