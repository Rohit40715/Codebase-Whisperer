import React, { useState, useEffect, useRef } from "react";
import axios from "axios";

function App() {
    const [token, setToken] = useState(localStorage.getItem("token") || "");
    const [userId, setUserId] = useState(localStorage.getItem("userId") || "60c72b2f9b1d8b2bad8e9b11");
    const [indexingStatus, setIndexingStatus] = useState("");
    const [activeRepoId, setActiveRepoId] = useState(localStorage.getItem("activeRepoId") || "");
    
    const [repoForm, setRepoForm] = useState({
        owner: "Rohit40715",
        repoName: "sfm_sparse_project",
        directoryPath: "",
        githubRepoId: "5566778899",
        name: "sfm-sparse",
        fullName: "Rohit40715/sfm_sparse_project",
        cloneUrl: "https://github.com/Rohit40715/sfm_sparse_project.git"
    });

    const [workspaceFiles, setWorkspaceFiles] = useState(JSON.parse(localStorage.getItem("workspaceFiles")) || []);
    const [selectedFile, setSelectedFile] = useState(null);
    const [fileContent, setFileContent] = useState("");
    const [isFileLoading, setIsFileLoading] = useState(false);

    const [chatMessage, setChatMessage] = useState("");
    const [chatHistory, setChatHistory] = useState([]);
    const [isChatLoading, setIsChatLoading] = useState(false);

    const [leftWidth, setLeftWidth] = useState(280);
    const [rightWidth, setRightWidth] = useState(360);
    const [expandedFolders, setExpandedFolders] = useState({});

    const isResizingLeft = useRef(false);
    const isResizingRight = useRef(false);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get("code");
        if (code) {
            window.history.replaceState({}, document.title, window.location.pathname);
            exchangeCodeForToken(code);
        }
    }, []);

    useEffect(() => {
        if (userId && token) {
            fetchUserHistory();
        }
    }, [userId, token]);

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (isResizingLeft.current) {
                const newWidth = Math.max(200, Math.min(500, e.clientX));
                setLeftWidth(newWidth);
            } else if (isResizingRight.current) {
                const newWidth = Math.max(250, Math.min(600, window.innerWidth - e.clientX));
                setRightWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            isResizingLeft.current = false;
            isResizingRight.current = false;
            document.body.style.cursor = "default";
            document.body.style.userSelect = "auto";
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, []);

    const fetchUserHistory = async () => {
        try {
            const response = await axios.get(`http://localhost:5000/api/user/${userId}/repositories`);
            if (response.data && response.data.length > 0) {
                setIndexingStatus("Loaded existing workspace history from cloud storage.");
            }
        } catch (error) {
            console.error(error.message);
        }
    };

    const startLeftResize = (e) => {
        e.preventDefault();
        isResizingLeft.current = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    };

    const startRightResize = (e) => {
        e.preventDefault();
        isResizingRight.current = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    };

    const handleGitHubLoginRedirect = () => {
        const clientId = "Ov23liBSk7UfrNqHuESs";
        const redirectUri = "http://localhost:3000/auth/callback";
        window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=repo`;
    };

    const exchangeCodeForToken = async (code) => {
        try {
            setIndexingStatus("Verifying token...");
            const response = await axios.post("http://localhost:5000/api/auth/github", { code });
            setToken(response.data.token);
            setUserId(response.data.user.id);
            localStorage.setItem("token", response.data.token);
            localStorage.setItem("userId", response.data.user.id);
            setIndexingStatus("Logged in successfully!");
        } catch (error) {
            setIndexingStatus("Auth failed: " + (error.response?.data?.error || error.message));
        }
    };

    const handleInputChange = (e) => {
        setRepoForm({ ...repoForm, [e.target.name]: e.target.value });
    };

    const triggerRepositoryIndexing = async () => {
        setWorkspaceFiles([]); 
        setSelectedFile(null);
        setFileContent("");
        setIndexingStatus("Cloning and indexing repository tree structures...");
        try {
            const response = await axios.post("http://localhost:5000/api/index", {
                userId,
                ...repoForm
            });
            const filesFound = response.data.files || [];
            setActiveRepoId(response.data.repositoryId);
            setWorkspaceFiles(filesFound);
            
            localStorage.setItem("activeRepoId", response.data.repositoryId);
            localStorage.setItem("workspaceFiles", JSON.stringify(filesFound));
            
            setIndexingStatus(`Completed! Successfully vectorized ${response.data.totalChunksGenerated} elements.`);
        } catch (error) {
            setIndexingStatus("Index failed: " + (error.response?.data?.error || error.message));
        }
    };

    const selectViewableFile = async (file) => {
        setSelectedFile(file);
        setIsFileLoading(true);
        setFileContent("");
        try {
            const githubApiUrl = `https://api.github.com/repos/${repoForm.owner}/${repoForm.repoName}/contents/${file.path}`;
            const response = await axios.get(githubApiUrl);
            const base64Str = response.data.content.replace(/\s/g, "");
            const rawCode = decodeURIComponent(escape(window.atob(base64Str)));
            setFileContent(rawCode);
        } catch (error) {
            setFileContent("// Failed to fetch file contents from source control:\n// " + error.message);
        } finally {
            setIsFileLoading(false);
        }
    };

    const sendChatMessage = async (e) => {
        e.preventDefault();
        if (!chatMessage.trim() || !activeRepoId) return;

        const userMsg = { role: "user", content: chatMessage };
        setChatHistory(prev => [...prev, userMsg]);
        setChatMessage("");
        setIsChatLoading(true);

        try {
            const response = await axios.post("http://localhost:5000/api/chat", {
                userId,
                repositoryId: activeRepoId,
                message: chatMessage
            });
            setChatHistory(prev => [...prev, { role: "assistant", content: response.data.reply }]);
        } catch (error) {
            setChatHistory(prev => [...prev, { role: "assistant", content: "Error: " + (error.response?.data?.error || error.message) }]);
        } finally {
            setIsChatLoading(false);
        }
    };

    const handleLogOutOnly = () => {
        localStorage.clear();
        setToken("");
        setActiveRepoId("");
        setWorkspaceFiles([]);
        setSelectedFile(null);
        setFileContent("");
        setChatHistory([]);
        setExpandedFolders({});
        setIndexingStatus("Logged out safely. Cloud data remains untouched.");
    };

    const handleFullDatabasePurge = async () => {
        setIndexingStatus("Wiping cloud vector spaces and database profiles...");
        try {
            await axios.post("http://localhost:5000/api/purge", { userId });
            localStorage.clear();
            setToken("");
            setActiveRepoId("");
            setWorkspaceFiles([]);
            setSelectedFile(null);
            setFileContent("");
            setChatHistory([]);
            setExpandedFolders({});
            setIndexingStatus("Full factory reset complete. Databases deleted.");
        } catch (error) {
            setIndexingStatus("Purge failed: " + (error.response?.data?.error || error.message));
        }
    };

    const toggleFolder = (folderPath) => {
        setExpandedFolders(prev => ({
            ...prev,
            [folderPath]: !prev[folderPath]
        }));
    };

    const buildFileTree = (files) => {
        const root = {};
        files.forEach(file => {
            const parts = file.path.split("/");
            let current = root;
            let currentPath = "";
            
            parts.forEach((part, index) => {
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                const isLast = index === parts.length - 1;
                
                if (!current[part]) {
                    current[part] = {
                        name: part,
                        path: currentPath,
                        isFile: isLast,
                        fileData: isLast ? file : null,
                        children: {}
                    };
                }
                current = current[part].children;
            });
        });
        return root;
    };

    const renderFileTree = (treeNodes, depth = 0) => {
        return Object.values(treeNodes).map((node, index) => {
            const paddingLeft = `${depth * 14 + 6}px`;
            
            if (node.isFile) {
                const isSelected = selectedFile?.path === node.fileData.path;
                return (
                    <div 
                        key={index} 
                        onClick={() => selectViewableFile(node.fileData)} 
                        style={{ 
                            padding: "6px 8px 6px " + paddingLeft, 
                            cursor: "pointer", 
                            fontSize: "13px", 
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            backgroundColor: isSelected ? "#37373d" : "transparent", 
                            color: isSelected ? "#fff" : "#cccccc",
                            borderRadius: "3px"
                        }}
                    >
                        <span style={{ color: "#51a1ff" }}>📄</span> {node.name}
                    </div>
                );
            } else {
                const isExpanded = !!expandedFolders[node.path];
                return (
                    <div key={index}>
                        <div 
                            onClick={() => toggleFolder(node.path)} 
                            style={{ 
                                padding: "6px 8px 6px " + paddingLeft, 
                                cursor: "pointer", 
                                fontSize: "13px", 
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                color: "#e2e2e2",
                                fontWeight: "bold",
                                userSelect: "none"
                            }}
                        >
                            <span style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block", transition: "transform 0.1s", fontSize: "10px" }}>▶</span>
                            <span style={{ color: "#e8a838" }}>📁</span> {node.name}
                        </div>
                        {isExpanded && renderFileTree(node.children, depth + 1)}
                    </div>
                );
            }
        });
    };

    const fileTreeData = buildFileTree(workspaceFiles);

    return (
        <div style={{ display: "flex", height: "100vh", width: "100vw", fontFamily: "monospace", overflow: "hidden", backgroundColor: "#1e1e1e", color: "#d4d4d4" }}>
            
            <div style={{ width: `${leftWidth}px`, backgroundColor: "#252526", borderRight: "1px solid #3c3c3c", display: "flex", flexDirection: "column", padding: "15px", boxSizing: "border-box", overflow: "hidden" }}>
                <h3 style={{ margin: "0 0 15px 0", color: "#fff", borderBottom: "1px solid #3c3c3c", paddingBottom: "10px" }}>📁 SOURCE CONTROL</h3>
                
                {!token ? (
                    <button onClick={handleGitHubLoginRedirect} style={{ width: "100%", padding: "8px", backgroundColor: "#0e639c", color: "#fff", border: "none", cursor: "pointer", fontWeight: "bold", marginBottom: "15px" }}>
                        Connect GitHub Profile
                    </button>
                ) : (
                    <div style={{ color: "#89d4a0", fontSize: "11px", marginBottom: "15px" }}>✓ Account Session Link Established</div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "15px" }}>
                    <input type="text" name="owner" placeholder="Owner" value={repoForm.owner} onChange={handleInputChange} style={{ background: "#3c3c3c", border: "1px solid #6b6b6b", color: "#fff", padding: "5px" }} />
                    <input type="text" name="repoName" placeholder="Repo Name" value={repoForm.repoName} onChange={handleInputChange} style={{ background: "#3c3c3c", border: "1px solid #6b6b6b", color: "#fff", padding: "5px" }} />
                    <input type="text" name="directoryPath" placeholder="Path (Leave blank for root)" value={repoForm.directoryPath} onChange={handleInputChange} style={{ background: "#3c3c3c", border: "1px solid #6b6b6b", color: "#fff", padding: "5px" }} />
                    <button onClick={triggerRepositoryIndexing} style={{ padding: "8px", backgroundColor: "#32733d", color: "#fff", border: "none", cursor: "pointer", fontWeight: "bold" }}>
                        Clone & Index Space
                    </button>
                </div>

                {indexingStatus && <div style={{ fontSize: "11px", color: "#cca700", marginBottom: "15px", wordBreak: "break-all" }}>{indexingStatus}</div>}

                <h4 style={{ margin: "10px 0 5px 0", color: "#fff" }}>WORKSPACE EXPLORER</h4>
                <div style={{ flex: 1, overflowY: "auto", border: "1px solid #3c3c3c", padding: "5px", backgroundColor: "#1e1e1e", borderRadius: "3px" }}>
                    {workspaceFiles.length === 0 ? (
                        <div style={{ color: "#666", fontSize: "11px", padding: "5px" }}>No code files indexed yet.</div>
                    ) : (
                        renderFileTree(fileTreeData)
                    )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginTop: "15px" }}>
                    <button onClick={handleLogOutOnly} style={{ padding: "6px", backgroundColor: "#5a5a5a", color: "#fff", border: "none", cursor: "pointer", fontSize: "11px", fontWeight: "bold" }}>
                        Log Out Safely
                    </button>
                    <button onClick={handleFullDatabasePurge} style={{ padding: "6px", backgroundColor: "#a63a3a", color: "#fff", border: "none", cursor: "pointer", fontSize: "11px", fontWeight: "bold" }}>
                        Danger: Purge Database
                    </button>
                </div>
            </div>

            <div 
                onMouseDown={startLeftResize} 
                style={{ width: "4px", cursor: "col-resize", backgroundColor: "#2d2d2d", zIndex: 10 }}
            />

            <div style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: "#1e1e1e", overflow: "hidden" }}>
                <div style={{ height: "35px", backgroundColor: "#2d2d2d", display: "flex", alignItems: "center", paddingLeft: "20px", borderBottom: "1px solid #3c3c3c", fontSize: "12px", color: "#fff" }}>
                    {selectedFile ? `📝 Working Text Canvas Context: /${selectedFile.path}` : "⚠ No File Selected in Workspace Explorer"}
                </div>
                <div style={{ flex: 1, padding: "20px", overflow: "auto", boxSizing: "border-box" }}>
                    {isFileLoading ? (
                        <div style={{ color: "#cca700" }}>Fetching raw syntax maps from remote endpoint server infrastructure...</div>
                    ) : (
                        <pre style={{ margin: 0, fontFamily: "monospace", fontSize: "13px", lineHeight: "1.6rem", whiteSpace: "pre-wrap", color: "#9cdcfe" }}>
                            {fileContent || `// Click on a workspace file folder item in the left sidebar directory tree to review code layers.\n// Your right side Copilot terminal window queries context patterns instantly.`}
                        </pre>
                    )}
                </div>
            </div>

            <div 
                onMouseDown={startRightResize} 
                style={{ width: "4px", cursor: "col-resize", backgroundColor: "#2d2d2d", zIndex: 10 }}
            />

            <div style={{ width: `${rightWidth}px`, backgroundColor: "#252526", borderLeft: "1px solid #3c3c3c", display: "flex", flexDirection: "column", boxSizing: "border-box", overflow: "hidden" }}>
                <div style={{ padding: "15px", borderBottom: "1px solid #3c3c3c", backgroundColor: "#2d2d2d" }}>
                    <h3 style={{ margin: 0, color: "#fff" }}>🤖 COPILOT ASSISTANT</h3>
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: "15px", display: "flex", flexDirection: "column", gap: "15px", backgroundColor: "#1e1e1e" }}>
                    {chatHistory.length === 0 ? (
                        <div style={{ color: "#777", fontSize: "12px", textAlign: "center", marginTop: "50px" }}>
                            Ask a structural technical question regarding the vectorized layout variables.
                        </div>
                    ) : (
                        chatHistory.map((msg, idx) => (
                            <div key={idx} style={{ alignSelf: msg.role === "user" ? "flex-end" : "flex-start", maxWidth: "95%", width: "95%" }}>
                                <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "3px" }}>
                                    {msg.role === "user" ? "👤 YOU" : "🤖 COPILOT"}
                                </div>
                                <div style={{ backgroundColor: msg.role === "user" ? "#0e639c" : "#2d2d2d", color: "#fff", padding: "10px", borderRadius: "2px", fontSize: "12px", whiteSpace: "pre-wrap", border: msg.role === "user" ? "none" : "1px solid #3c3c3c" }}>
                                    {msg.content}
                                </div>
                            </div>
                        ))
                    )}
                    {isChatLoading && <div style={{ color: "#cca700", fontSize: "12px" }}>Copilot is parsing repository indices...</div>}
                </div>

                <form onSubmit={sendChatMessage} style={{ margin: 0, borderTop: "1px solid #3c3c3c", padding: "10px", backgroundColor: "#2d2d2d", display: "flex", gap: "5px" }}>
                    <input 
                        type="text" 
                        value={chatMessage} 
                        onChange={(e) => setChatMessage(e.target.value)} 
                        placeholder={activeRepoId ? "Ask Copilot about code..." : "Index a workspace folder first..."}
                        disabled={!activeRepoId || isChatLoading}
                        style={{ flex: 1, backgroundColor: "#3c3c3c", border: "1px solid #6b6b6b", color: "#fff", padding: "8px", fontSize: "12px" }} 
                    />
                    <button type="submit" disabled={!activeRepoId || isChatLoading} style={{ backgroundColor: "#0e639c", color: "#fff", border: "none", padding: "8px 12px", cursor: "pointer", fontWeight: "bold", fontSize: "12px" }}>
                        Ask
                    </button>
                </form>
            </div>

        </div>
    );
}

export default App;