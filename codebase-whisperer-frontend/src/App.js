import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";

function App() {
    const [token, setToken] = useState(localStorage.getItem("token") || "");
    const [userId, setUserId] = useState(localStorage.getItem("userId") || "");
    const [indexingStatus, setIndexingStatus] = useState("");
    const [activeRepoId, setActiveRepoId] = useState(localStorage.getItem("activeRepoId") || "");
    
    const [repoForm, setRepoForm] = useState({
        owner: "",
        repoName: "",
        directoryPath: "",
        githubRepoId: "",
        name: "",
        fullName: "",
        cloneUrl: ""
    });

    const [userRepoList, setUserRepoList] = useState([]);
    const [workspaceFiles, setWorkspaceFiles] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [fileContent, setFileContent] = useState("");
    const [isFileLoading, setIsFileLoading] = useState(false);

    const [chatMessage, setChatMessage] = useState("");
    const [chatHistory, setChatHistory] = useState([]);
    const [isChatLoading, setIsChatLoading] = useState(false);

    const [leftWidth, setLeftWidth] = useState(290);
    const [rightWidth, setRightWidth] = useState(360);
    const [expandedFolders, setExpandedFolders] = useState({});

    const isResizingLeft = useRef(false);
    const isResizingRight = useRef(false);

    const loadUserRepositoriesList = useCallback(async () => {
        try {
            const response = await axios.get(`http://localhost:5000/api/user/${userId}/repositories`);
            setUserRepoList(response.data || []);
        } catch (error) {
            console.error(error.message);
        }
    }, [userId]);

    const loadSelectedRepositoryWorkspace = useCallback(async (repoId) => {
        setIsFileLoading(true);
        setSelectedFile(null);
        setFileContent("");
        setChatHistory([]);
        try {
            const repoRes = await axios.get(`http://localhost:5000/api/repository/${repoId}`);
            setWorkspaceFiles(repoRes.data.files || []);
            setRepoForm({
                owner: repoRes.data.owner || "",
                repoName: repoRes.data.repoName || "",
                directoryPath: repoRes.data.directoryPath || "",
                githubRepoId: repoRes.data.githubRepoId || "",
                name: repoRes.data.name || "",
                fullName: repoRes.data.fullName || "",
                cloneUrl: repoRes.data.cloneUrl || ""
            });

            const chatRes = await axios.get(`http://localhost:5000/api/chat/${userId}/${repoId}`);
            setChatHistory(chatRes.data.messages || []);
            setIndexingStatus(`Active context: ${repoRes.data.fullName}`);
        } catch (error) {
            setIndexingStatus("Context selection error: " + error.message);
        } finally {
            setIsFileLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get("code");
        if (code) {
            window.history.replaceState({}, document.title, window.location.pathname);
            exchangeCodeForToken(code);
        }
    }, []);

    useEffect(() => {
        if (userId) {
            loadUserRepositoriesList();
        }
    }, [userId, loadUserRepositoriesList]);

    useEffect(() => {
        if (activeRepoId) {
            loadSelectedRepositoryWorkspace(activeRepoId);
        }
    }, [activeRepoId, loadSelectedRepositoryWorkspace]);

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (isResizingLeft.current) {
                const newWidth = Math.max(220, Math.min(500, e.clientX));
                setLeftWidth(newWidth);
            } else if (isResizingRight.current) {
                const newWidth = Math.max(250, Math.min(600, window.innerWidth - e.clientX));
                setRightWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            isResizingLeft.current = false;
            isResizingRight.current = false;
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, []);

    const startLeftResize = (e) => {
        e.preventDefault();
        isResizingLeft.current = true;
    };

    const startRightResize = (e) => {
        e.preventDefault();
        isResizingRight.current = true;
    };

    const deleteRepositoryContext = async (e, repoId) => {
        e.stopPropagation();
        try {
            await axios.delete(`http://localhost:5000/api/user/${userId}/repository/${repoId}`);
            if (activeRepoId === repoId) {
                setActiveRepoId("");
                setWorkspaceFiles([]);
                setChatHistory([]);
                setSelectedFile(null);
                setFileContent("");
            }
            loadUserRepositoriesList();
            setIndexingStatus("Deleted context.");
        } catch (error) {
            setIndexingStatus("Delete failed: " + error.message);
        }
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
            setIndexingStatus("Auth failed: " + error.message);
        }
    };

    const handleInputChange = (e) => {
        setRepoForm({ ...repoForm, [e.target.name]: e.target.value });
    };

    const triggerRepositoryIndexing = async () => {
        if (!userId) {
            setIndexingStatus("Please log in first using the access button.");
            return;
        }
        if (!repoForm.owner.trim() || !repoForm.repoName.trim()) {
            setIndexingStatus("Please fill in both the Owner and Repo Name fields.");
            return;
        }

        setWorkspaceFiles([]); 
        setSelectedFile(null);
        setFileContent("");
        setChatHistory([]);
        setIndexingStatus("Indexing repository tree...");

        const computedPayload = {
            ...repoForm,
            userId,
            githubRepoId: `${repoForm.owner.trim()}-${repoForm.repoName.trim()}`,
            name: repoForm.repoName.trim(),
            fullName: `${repoForm.owner.trim()}/${repoForm.repoName.trim()}`,
            cloneUrl: `https://github.com/${repoForm.owner.trim()}/${repoForm.repoName.trim()}.git`
        };

        try {
            const response = await axios.post("http://localhost:5000/api/index", computedPayload);
            setActiveRepoId(response.data.repositoryId);
            setWorkspaceFiles(response.data.files || []);
            localStorage.setItem("activeRepoId", response.data.repositoryId);
            setIndexingStatus(`Completed! Vectorized ${response.data.totalChunksGenerated} elements.`);
            loadUserRepositoriesList();
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
            setFileContent("Failed to fetch file contents: " + error.message);
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
            setChatHistory(prev => [...prev, { role: "assistant", content: "Error: " + error.message }]);
        } finally {
            setIsChatLoading(false);
        }
    };

    const handleLogOutOnly = () => {
        localStorage.clear();
        setToken("");
        setUserId("");
        setActiveRepoId("");
        setUserRepoList([]);
        setWorkspaceFiles([]);
        setSelectedFile(null);
        setFileContent("");
        setChatHistory([]);
        setExpandedFolders({});
        setIndexingStatus("Logged out safely.");
    };

    const handleFullDatabasePurge = async () => {
        if (!userId) return;
        setIndexingStatus("Wiping cloud database...");
        try {
            await axios.post("http://localhost:5000/api/purge", { userId });
            handleLogOutOnly();
            setIndexingStatus("Wiped successfully.");
        } catch (error) {
            setIndexingStatus("Purge failed: " + error.message);
        }
    };

    const toggleFolder = (folderPath) => {
        setExpandedFolders(prev => ({ ...prev, [folderPath]: !prev[folderPath] }));
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
                    current[part] = { name: part, path: currentPath, isFile: isLast, fileData: isLast ? file : null, children: {} };
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
                    <div key={index} onClick={() => selectViewableFile(node.fileData)} style={{ padding: "6px 8px 6px " + paddingLeft, cursor: "pointer", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px", backgroundColor: isSelected ? "#37373d" : "transparent", color: isSelected ? "#fff" : "#cccccc", borderRadius: "3px" }}>
                        <span style={{ color: "#51a1ff" }}>📄</span> {node.name}
                    </div>
                );
            } else {
                const isExpanded = !!expandedFolders[node.path];
                return (
                    <div key={index}>
                        <div onClick={() => toggleFolder(node.path)} style={{ padding: "6px 8px 6px " + paddingLeft, cursor: "pointer", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px", color: "#e2e2e2", fontWeight: "bold", userSelect: "none" }}>
                            <span style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block", fontSize: "10px" }}>▶</span>
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
            
            <div style={{ width: `${leftWidth}px`, backgroundColor: "#252526", borderRight: "1px solid #3c3c3c", display: "flex", flexDirection: "column", padding: "12px", boxSizing: "border-box", overflowY: "auto" }}>
                
                <h4 style={{ margin: "0 0 10px 0", color: "#fff", borderBottom: "1px solid #3c3c3c", paddingBottom: "5px" }}>🔐 ACCOUNT ACCESS</h4>
                <div style={{ marginBottom: "15px" }}>
                    {!token ? (
                        <button onClick={handleGitHubLoginRedirect} style={{ width: "100%", padding: "10px", backgroundColor: "#0e639c", color: "#fff", border: "none", cursor: "pointer", fontWeight: "bold", borderRadius: "3px" }}>
                            Connect GitHub Profile
                        </button>
                    ) : (
                        <div style={{ color: "#89d4a0", fontSize: "12px", fontWeight: "bold", padding: "5px 0" }}>✓ Account Link Established</div>
                    )}
                </div>

                <h4 style={{ margin: "0 0 10px 0", color: "#fff", borderBottom: "1px solid #3c3c3c", paddingBottom: "5px" }}>💼 REPOSITORY INDEX</h4>
                <div style={{ minHeight: "110px", overflowY: "auto", background: "#1e1e1e", border: "1px solid #3c3c3c", padding: "5px", marginBottom: "15px", borderRadius: "3px" }}>
                    {userRepoList.length === 0 ? (
                        <div style={{ color: "#666", fontSize: "11px", padding: "5px" }}>No indexed environments.</div>
                    ) : (
                        userRepoList.map((repo, idx) => (
                            <div key={idx} onClick={() => setActiveRepoId(repo._id)} style={{ padding: "6px", cursor: "pointer", fontSize: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: activeRepoId === repo._id ? "#37373d" : "transparent", color: activeRepoId === repo._id ? "#fff" : "#aaa", marginBottom: "2px", borderRadius: "2px" }}>
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: "5px" }}>📦 {repo.fullName}</span>
                                <button onClick={(e) => deleteRepositoryContext(e, repo._id)} style={{ background: "transparent", border: "none", color: "#f14c4c", cursor: "pointer", fontWeight: "bold", fontSize: "12px" }}>×</button>
                            </div>
                        ))
                    )}
                </div>

                <h4 style={{ margin: "0 0 10px 0", color: "#fff" }}>🛠️ CONNECT NEW SPACE</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "15px" }}>
                    <input type="text" name="owner" placeholder="Owner" value={repoForm.owner} onChange={handleInputChange} style={{ background: "#3c3c3c", border: "1px solid #6b6b6b", color: "#fff", padding: "5px", fontSize: "12px" }} />
                    <input type="text" name="repoName" placeholder="Repo Name" value={repoForm.repoName} onChange={handleInputChange} style={{ background: "#3c3c3c", border: "1px solid #6b6b6b", color: "#fff", padding: "5px", fontSize: "12px" }} />
                    <input type="text" name="directoryPath" placeholder="Subpath" value={repoForm.directoryPath} onChange={handleInputChange} style={{ background: "#3c3c3c", border: "1px solid #6b6b6b", color: "#fff", padding: "5px", fontSize: "12px" }} />
                    <button onClick={triggerRepositoryIndexing} style={{ padding: "6px", backgroundColor: "#32733d", color: "#fff", border: "none", cursor: "pointer", fontWeight: "bold", fontSize: "12px" }}>Index Target Workspace</button>
                </div>

                {indexingStatus && <div style={{ fontSize: "11px", color: "#cca700", marginBottom: "10px", wordBreak: "break-all" }}>{indexingStatus}</div>}

                <h4 style={{ margin: "5px 0 5px 0", color: "#fff" }}>🌲 WORKSPACE EXPLORER</h4>
                <div style={{ flex: 1, minHeight: "150px", overflowY: "auto", border: "1px solid #3c3c3c", padding: "5px", backgroundColor: "#1e1e1e", borderRadius: "3px", marginBottom: "15px" }}>
                    {workspaceFiles.length === 0 ? (
                        <div style={{ color: "#666", fontSize: "11px", padding: "5px" }}>Select an indexed repo workspace above.</div>
                    ) : (
                        renderFileTree(fileTreeData)
                    )}
                </div>

                <div style={{ display: "flex", gap: "5px", marginTop: "auto", paddingTop: "10px" }}>
                    <button onClick={handleLogOutOnly} style={{ flex: 1, padding: "5px", backgroundColor: "#5a5a5a", color: "#fff", border: "none", cursor: "pointer", fontSize: "11px" }}>Log Out</button>
                    <button onClick={handleFullDatabasePurge} style={{ flex: 1, padding: "5px", backgroundColor: "#a63a3a", color: "#fff", border: "none", cursor: "pointer", fontSize: "11px" }}>Purge All</button>
                </div>
            </div>

            <div onMouseDown={startLeftResize} style={{ width: "4px", cursor: "col-resize", backgroundColor: "#2d2d2d" }} />

            <div style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: "#1e1e1e", overflow: "hidden" }}>
                <div style={{ height: "35px", backgroundColor: "#2d2d2d", display: "flex", alignItems: "center", paddingLeft: "20px", borderBottom: "1px solid #3c3c3c", fontSize: "12px", color: "#fff" }}>
                    {selectedFile ? `📝 Working Text Canvas Context: /${selectedFile.path}` : "⚠ No File Selected"}
                </div>
                <div style={{ flex: 1, padding: "20px", overflow: "auto", boxSizing: "border-box" }}>
                    {isFileLoading ? (
                        <div style={{ color: "#cca700" }}>Loading source map configurations...</div>
                    ) : (
                        <pre style={{ margin: 0, fontFamily: "monospace", fontSize: "13px", lineHeight: "1.6rem", whiteSpace: "pre-wrap", color: "#9cdcfe" }}>
                            {fileContent || "Click on any workspace file from your active profile tree to view its source code panels."}
                        </pre>
                    )}
                </div>
            </div>

            <div onMouseDown={startRightResize} style={{ width: "4px", cursor: "col-resize", backgroundColor: "#2d2d2d" }} />

            <div style={{ width: `${rightWidth}px`, backgroundColor: "#252526", borderLeft: "1px solid #3c3c3c", display: "flex", flexDirection: "column", boxSizing: "border-box", overflow: "hidden" }}>
                <div style={{ padding: "15px", borderBottom: "1px solid #3c3c3c", backgroundColor: "#2d2d2d" }}>
                    <h3 style={{ margin: 0, color: "#fff" }}>🤖 COPILOT ASSISTANT</h3>
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: "15px", display: "flex", flexDirection: "column", gap: "15px", backgroundColor: "#1e1e1e" }}>
                    {chatHistory.length === 0 ? (
                        <div style={{ color: "#777", fontSize: "12px", textAlign: "center", marginTop: "50px" }}>
                            Select a repository and prompt your copilot context vector systems.
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
                    {isChatLoading && <div style={{ color: "#cca700", fontSize: "12px" }}>Processing contextual vector responses...</div>}
                </div>

                <form onSubmit={sendChatMessage} style={{ margin: 0, borderTop: "1px solid #3c3c3c", padding: "10px", backgroundColor: "#2d2d2d", display: "flex", gap: "5px" }}>
                    <input 
                        type="text" 
                        value={chatMessage} 
                        onChange={(e) => setChatMessage(e.target.value)} 
                        placeholder={activeRepoId ? "Ask Copilot about code..." : "Select an active index workspace first..."}
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