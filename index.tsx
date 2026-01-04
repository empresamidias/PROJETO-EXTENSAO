import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

const API_BASE_URL = 'https://lineable-maricela-primly.ngrok-free.dev';

interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'folder';
    children?: FileNode[];
}

const App = () => {
    const [prompt, setPrompt] = useState('');
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [fileNames, setFileNames] = useState<string[]>([]);
    const [fileContents, setFileContents] = useState<Record<string, string>>({});
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root']));

    const addLog = (msg: string) => {
        setLogs(prev => {
            const newLog = `[${new Date().toLocaleTimeString()}] ${msg}`;
            return [newLog, ...prev].slice(0, 10);
        });
    };

    const apiRequest = async (endpoint: string, body: any = {}) => {
        const url = `${API_BASE_URL}${endpoint}`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'ngrok-skip-browser-warning': '69420', 
                },
                body: JSON.stringify(body),
            });
            if (!response.ok) throw new Error(`Status ${response.status}`);
            return await response.json();
        } catch (err: any) {
            throw err;
        }
    };

    const checkStatus = async () => {
        setServerStatus('checking');
        try {
            await apiRequest('/pedir-nomes', {});
            setServerStatus('online');
            addLog('Conectado');
        } catch (e) {
            setServerStatus('offline');
            addLog('Offline');
        }
    };

    useEffect(() => {
        checkStatus();
    }, []);

    const fetchCodigos = async (names: string[]) => {
        if (!names || names.length === 0) return;
        setLoading(true);
        addLog(`Sincronizando ${names.length} arquivos...`);
        try {
            const data = await apiRequest('/pedir-codigos', { names });
            const newContents: Record<string, string> = { ...fileContents };
            
            if (data.codes && Array.isArray(data.codes)) {
                names.forEach((name, index) => {
                    if (data.codes[index] !== undefined) newContents[name] = data.codes[index];
                });
            } else if (data.files && Array.isArray(data.files)) {
                data.files.forEach((f: any) => {
                    if (f.name && typeof f.code === 'string') newContents[f.name] = f.code;
                });
            }

            setFileContents(newContents);
            if (names.length === 1) setSelectedFile(names[0]);
            else if (names.length > 1 && !selectedFile) setSelectedFile(names[0]);

            addLog('Sync concluído');
        } catch (err: any) {
            addLog(`Erro Sync: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handlePedirNomes = async () => {
        setLoading(true);
        try {
            const data = await apiRequest('/pedir-nomes');
            if (data.names) {
                setFileNames(data.names);
                addLog('Workspace atualizado');
            }
        } catch (err: any) {
            addLog(`Erro Nomes: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSendPrompt = async () => {
        if (!prompt.trim()) return;
        setLoading(true);
        addLog('Enviando prompt...');
        try {
            const data = await apiRequest('/send-prompt', { prompt });
            addLog(`IA: ${data.status || 'Sucesso'}`);
            setPrompt('');
        } catch (err: any) {
            addLog(`Erro IA: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const fileTree = useMemo(() => {
        const rootNodes: FileNode[] = [];
        fileNames.forEach(path => {
            const parts = path.split('/');
            let currentLevel = rootNodes;
            let currentPath = '';

            parts.forEach((part, index) => {
                currentPath += (index === 0 ? '' : '/') + part;
                const isFile = index === parts.length - 1;
                let existingNode = currentLevel.find(node => node.name === part);

                if (!existingNode) {
                    existingNode = {
                        name: part,
                        path: currentPath,
                        type: isFile ? 'file' : 'folder',
                        children: isFile ? undefined : []
                    };
                    currentLevel.push(existingNode);
                }
                if (!isFile && existingNode.children) {
                    currentLevel = existingNode.children;
                }
            });
        });

        const sortNodes = (nodes: FileNode[]) => {
            nodes.sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'folder' ? -1 : 1;
            });
            nodes.forEach(node => node.children && sortNodes(node.children));
        };
        sortNodes(rootNodes);
        return rootNodes;
    }, [fileNames]);

    const toggleFolder = (path: string) => {
        setExpandedFolders(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    };

    const handleFileAction = (path: string) => {
        if (fileContents[path]) {
            setSelectedFile(path);
        } else {
            fetchCodigos([path]);
        }
    };

    const highlightCode = (code: string) => {
        if (!code) return '';
        const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const combinedRegex = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*$|\/\*[\s\S]*?\*\/|\b(const|let|var|function|return|if|else|for|while|import|export|from|class|extends|interface|type|default|async|await|true|false|null|undefined)\b)/gm;
        return escaped.replace(combinedRegex, (match, _, keyword) => {
            if (keyword) return `<span style="color:#c586c0">${match}</span>`;
            if (match.startsWith('/') || match.startsWith('/*')) return `<span style="color:#6a9955; font-style:italic">${match}</span>`;
            return `<span style="color:#ce9178">${match}</span>`;
        });
    };

    const TreeNode = ({ node, depth }: { node: FileNode, depth: number }) => {
        const isExpanded = expandedFolders.has(node.path);
        const isSelected = selectedFile === node.path;
        const hasContent = !!fileContents[node.path];

        if (node.type === 'folder') {
            return (
                <div className="select-none">
                    <div 
                        onClick={() => toggleFolder(node.path)}
                        className="flex items-center gap-1.5 px-3 py-1 hover:bg-[#2a2d2e] cursor-pointer transition-colors group"
                        style={{ paddingLeft: `${depth * 12 + 12}px` }}
                    >
                        <span className={`text-[8px] text-[#cccccc] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                        <span className="text-[14px]">📂</span>
                        <span className="text-[13px] text-[#cccccc] truncate">{node.name}</span>
                    </div>
                    {isExpanded && node.children && (
                        <div>
                            {node.children.map(child => <TreeNode key={child.path} node={child} depth={depth + 1} />)}
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div 
                onClick={() => handleFileAction(node.path)}
                className={`flex items-center gap-2 px-3 py-1 hover:bg-[#2a2d2e] cursor-pointer transition-colors group ${isSelected ? 'bg-[#37373d] text-white' : 'text-[#cccccc]'}`}
                style={{ paddingLeft: `${depth * 12 + 24}px` }}
            >
                <span className="text-[14px]">{isSelected ? '📄' : (hasContent ? '📜' : '☁️')}</span>
                <span className="text-[13px] font-medium truncate">{node.name}</span>
                {!hasContent && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); fetchCodigos([node.path]); }}
                        className="ml-auto opacity-0 group-hover:opacity-100 text-xs text-[#007acc] hover:text-[#005a9e]"
                    >
                        📥
                    </button>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-screen w-full bg-[#1e1e1e] text-[#cccccc] overflow-hidden">
            {/* Top Container: Explorer + Editor */}
            <div className="flex flex-grow overflow-hidden">
                {/* File Explorer Sidebar */}
                <div className="w-64 bg-[#252526] flex flex-col border-r border-[#1e1e1e] shrink-0">
                    <div className="px-4 py-3 flex items-center justify-between border-b border-[#1e1e1e] bg-[#252526]">
                        <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#bbbbbb]">Explorer</h2>
                        <div className="flex gap-2">
                            <button onClick={handlePedirNomes} title="Refresh" className="hover:text-white transition-colors">🔄</button>
                            <button onClick={() => fetchCodigos(fileNames)} title="Sync All" className="hover:text-white transition-colors">📥</button>
                        </div>
                    </div>
                    <div className="flex-grow overflow-y-auto no-scrollbar py-2">
                        {fileNames.length > 0 ? (
                            fileTree.map(node => <TreeNode key={node.path} node={node} depth={0} />)
                        ) : (
                            <div className="p-8 text-center opacity-30 italic text-xs">
                                Clique em refresh para listar arquivos
                            </div>
                        )}
                    </div>
                    {/* Tiny Logs at Sidebar Bottom */}
                    <div className="bg-[#1e1e1e] p-2 border-t border-[#333]">
                        <div className="text-[9px] font-mono text-slate-500 max-h-20 overflow-y-auto no-scrollbar">
                            {logs.map((log, i) => <div key={i}> {log}</div>)}
                        </div>
                    </div>
                </div>

                {/* Editor Content */}
                <div className="flex-grow flex flex-col min-w-0 bg-[#1e1e1e]">
                    {/* Tabs */}
                    <div className="bg-[#252526] h-9 flex items-center overflow-x-auto no-scrollbar border-b border-[#1e1e1e] shrink-0">
                        {Object.keys(fileContents).map(path => (
                            <div 
                                key={path}
                                onClick={() => setSelectedFile(path)}
                                className={`h-full flex items-center gap-2 px-4 cursor-pointer text-[13px] border-r border-[#1e1e1e] transition-all min-w-[120px] max-w-[200px] group ${
                                    selectedFile === path ? 'bg-[#1e1e1e] text-white' : 'text-[#969696] bg-[#2d2d2d] hover:bg-[#2a2d2e]'
                                }`}
                            >
                                <span className="truncate">{path.split('/').pop()}</span>
                                <button className="ml-auto opacity-0 group-hover:opacity-100 hover:text-rose-400 text-[10px]" onClick={(e) => {
                                    e.stopPropagation();
                                    const newC = { ...fileContents }; delete newC[path]; setFileContents(newC);
                                    if (selectedFile === path) setSelectedFile(Object.keys(newC)[0] || null);
                                }}>×</button>
                            </div>
                        ))}
                    </div>

                    {/* Code Editor Surface */}
                    <div className="flex-grow relative overflow-hidden flex">
                        {selectedFile && fileContents[selectedFile] ? (
                            <>
                                <div className="w-12 bg-[#1e1e1e] text-[#858585] flex flex-col items-end pr-4 pt-4 select-none shrink-0 font-mono text-[12px] leading-[20px]">
                                    {fileContents[selectedFile].split('\n').map((_, i) => (
                                        <div key={i} className="h-[20px]">{i + 1}</div>
                                    ))}
                                </div>
                                <div className="flex-grow overflow-auto p-4 pt-4 font-mono text-[13px] leading-[20px] text-[#d4d4d4] selection:bg-[#264f78]">
                                    <pre className="whitespace-pre" dangerouslySetInnerHTML={{ __html: highlightCode(fileContents[selectedFile]) }} />
                                </div>
                            </>
                        ) : (
                            <div className="flex-grow flex items-center justify-center flex-col opacity-10">
                                <span className="text-9xl">V S</span>
                                <p className="text-xs uppercase tracking-[1em] mt-4 font-bold">Select a file to begin</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom Section: IA Command Bar (ChatGPT Style) */}
            <div className="bg-[#1e1e1e] border-t border-[#333] p-4 flex flex-col items-center">
                <div className="w-full max-w-4xl relative">
                    <textarea 
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Mensagem para IA (Ex: Adicione um botão de delete no Preview.tsx)..."
                        rows={1}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendPrompt(); } }}
                        className="w-full bg-[#2d2d2d] text-[#cccccc] text-[14px] rounded-xl border border-[#444] focus:border-[#007acc] focus:ring-1 focus:ring-[#007acc] p-4 pr-12 outline-none resize-none min-h-[56px] shadow-lg"
                    />
                    <button 
                        onClick={handleSendPrompt}
                        disabled={loading || !prompt.trim()}
                        className={`absolute right-3 bottom-3 p-2 rounded-lg transition-all ${
                            loading || !prompt.trim() ? 'text-[#555] cursor-not-allowed' : 'text-[#007acc] hover:bg-[#3e3e42]'
                        }`}
                    >
                        <svg className="w-6 h-6 rotate-90" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                        </svg>
                    </button>
                </div>
                <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                    <span className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${serverStatus === 'online' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                        {serverStatus}
                    </span>
                    <span>AI Remote v2.0</span>
                </div>
            </div>

            {/* Status Bar */}
            <div className="bg-[#007acc] h-6 flex items-center justify-between px-3 text-[11px] text-white shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                        <span>{selectedFile ? 'UTF-8' : '--'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span>{selectedFile ? 'Spaces: 2' : '--'}</span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {loading && <span className="animate-spin text-[10px]">◌</span>}
                    <span>Ready</span>
                </div>
            </div>
        </div>
    );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);