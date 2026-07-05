import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import indexerRoutes from "./routes/indexerRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/codebase-whisperer")
    .then(() => console.log("MongoDB Connection Operational"))
    .catch((err) => console.error("Database connection failure:", err));

app.use("/api", indexerRoutes);
app.use("/api", chatRoutes);

app.get("/health", (req, res) => {
    res.status(200).json({ status: "active" });
});

app.listen(PORT, () => {
    console.log(`Server executing successfully on port ${PORT}`);
});