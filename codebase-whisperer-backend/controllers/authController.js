import axios from "axios";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const handleGitHubCallback = async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: "Authorization code is required" });
    }

    try {
        const tokenResponse = await axios.post(
            "https://github.com/login/oauth/access_token",
            {
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code
            },
            {
                headers: { Accept: "application/json" }
            }
        );

        const accessToken = tokenResponse.data.access_token;

        if (!accessToken) {
            return res.status(400).json({ error: "Failed to obtain access token from GitHub" });
        }

        const userResponse = await axios.get("https://api.github.com/user", {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const { id: githubId, login: username, email, avatar_url: avatarUrl } = userResponse.data;

        let user = await User.findOne({ githubId });

        if (!user) {
            user = new User({
                githubId,
                username,
                email,
                avatarUrl,
                githubAccessToken: accessToken // Save access token for authenticated crawling
            });
        } else {
            user.githubAccessToken = accessToken; // Sync/update token if it changed
        }
        await user.save();

        const token = jwt.sign(
            { userId: user._id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        return res.status(200).json({
            message: "Authentication successful",
            token,
            user: {
                id: user._id,
                username: user.username,
                avatarUrl: user.avatarUrl
            }
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};