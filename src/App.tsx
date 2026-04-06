import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { registerOpenScadLanguage } from './lib/openscadLanguage';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { StlViewer } from './components/StlViewer';
import { ApiKeySetup } from './components/ApiKeySetup';
import { renderOpenScad, getRecentLogs, clearLogs } from './services/openscad';
import { sendMessageToAgent, ChatMessage } from './services/ai';
import { parseScadParameters, updateScadParameter, ScadParameter } from './utils/scadParser';
import { ApiKeyProvider, useApiKey } from './contexts/apiKeyContext';
import { Download, Save, FolderOpen, Send, Loader2, LayoutGrid, Square, CheckCircle2, XCircle, Clock, Circle, FilePlus, KeyRound } from 'lucide-react';

const DEFAULT_CODE = `// OpenSCAD Parameterized Model
width = 20; // [10:1:50] Width of the base
length = 30; // [10:1:50] Length of the base
height = 15; // [5:1:40] Height of the base
corner_radius = 2; // [0:0.5:10] Corner radius
show_sphere = true; // Cutout a sphere?
label = "Hello"; // Text label (not used in geometry yet)

$fn = 50;

difference() {
    minkowski() {
        cube([width - corner_radius*2, length - corner_radius*2, height - corner_radius*2], center=true);
        sphere(r=corner_radius);
    }
    if (show_sphere) {
        // Adding +1 to the radius ensures the sphere cleanly cuts 
        // through the outer faces instead of perfectly tangentially 
        // grazing the x-axis bounds (which caused a 2-manifold error).
        sphere(r=(width/2) + 1);
    }
}
`;

function AppInner() {
  const { apiKey, hasKey, isEnvKey, clearApiKey } = useApiKey();
  const [code, setCode] = useState(DEFAULT_CODE);
  const [stlContent, setStlContent] = useState<string | null>(null);
  const [amfContent, setAmfContent] = useState<string | null>(null);
  const [renderStatus, setRenderStatus] = useState<'stale' | 'working' | 'done' | 'failed'>('stale');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [screenshotTrigger, setScreenshotTrigger] = useState(0);
  const [viewMode, setViewMode] = useState<'single' | 'quad'>('quad');
  const [parameters, setParameters] = useState<ScadParameter[]>([]);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [compilerLogs, setCompilerLogs] = useState<string>('');
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const isDirty = savedCode !== null ? code !== savedCode : code !== DEFAULT_CODE;
  
  const screenshotResolveRef = useRef<((dataUrl: string) => void) | null>(null);
  const isRenderingRef = useRef(false);
  const pendingCodeRef = useRef<string | null>(null);
  const logLinesRef = useRef<string[]>([]);

  const appendLog = (line: string) => {
    logLinesRef.current = [...logLinesRef.current, line];
    setCompilerLogs(logLinesRef.current.join('\n'));
  };

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('saved_scad');
    if (saved) {
      setCode(saved);
      setSavedCode(saved);
    }
  }, []);

  const handleRender = useCallback(async (currentCode: string) => {
    if (isRenderingRef.current) {
      pendingCodeRef.current = currentCode;
      return;
    }

    isRenderingRef.current = true;
    setRenderStatus('working');
    clearLogs();
    logLinesRef.current = [];
    
    try {
      const result = await renderOpenScad(currentCode);
      setStlContent(result.stl);
      setAmfContent(result.amf);
      setRenderError(null);
      setRenderStatus('done');
    } catch (error) {
      console.error("Render failed", error);
      const errStr = error instanceof Error ? error.message : String(error);
      setRenderError(errStr);
      setRenderStatus('failed');
      appendLog(`[ERROR] Render sequence failed: ${errStr} (This usually means the object geometry was invalid and OpenSCAD refused to export it.)`);
    } finally {
      const logs = getRecentLogs();
      logLinesRef.current = logs ? logs.split('\n') : [];
      setCompilerLogs(logs);
      isRenderingRef.current = false;
      
      if (pendingCodeRef.current !== null) {
        const nextCode = pendingCodeRef.current;
        pendingCodeRef.current = null;
        handleRender(nextCode);
      }
    }
  }, []);

  // Parse parameters whenever code changes
  useEffect(() => {
    const parsed = parseScadParameters(code);
    setParameters(parsed);
  }, [code]);

  // Mark stale immediately on code change, then auto-render with debounce
  useEffect(() => {
    setRenderStatus('stale');
    const timer = setTimeout(() => {
      handleRender(code);
    }, 300);
    return () => clearTimeout(timer);
  }, [code, handleRender]);

  const handleParameterChange = (param: ScadParameter, newValue: string | number | boolean) => {
    const newCode = updateScadParameter(code, param, newValue);
    setCode(newCode);
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const newMessages: ChatMessage[] = [...messages, { role: 'user', text: inputMessage }];
    setMessages(newMessages);
    setInputMessage('');
    setIsAgentTyping(true);

    try {
      const responseText = await sendMessageToAgent(
        apiKey!,
        newMessages,
        code,
        compilerLogs,
        renderError,
        stlContent,
        (action, target, replacement) => {
          setCode(prevCode => {
            if (action === 'replace_string' && target && replacement) {
              return prevCode.replace(target, replacement);
            } else if (action === 'replace_all' && replacement) {
              return replacement;
            }
            return prevCode;
          });
        },
        () => {
          return new Promise<string>((resolve) => {
            const tryCapture = () => {
              // If we are currently rendering or have a render queued, wait!
              if (isRenderingRef.current || pendingCodeRef.current !== null) {
                setTimeout(tryCapture, 100);
              } else {
                screenshotResolveRef.current = resolve;
                setScreenshotTrigger(prev => prev + 1);
              }
            };
            tryCapture();
          });
        },
        (toolName, args) => {
          const argSummary = toolName === 'editCode'
            ? `(${(args as any)?.action})`
            : args && Object.keys(args).length > 0
              ? `(${JSON.stringify(args).slice(0, 80)})`
              : '';
          appendLog(`[TOOL] ${toolName}${argSummary}`);
        }
      );

      setMessages(prev => [...prev, { role: 'model', text: responseText }]);
    } catch (error) {
      console.error("Agent error", error);
      setMessages(prev => [...prev, { role: 'model', text: "Sorry, I encountered an error." }]);
    } finally {
      setIsAgentTyping(false);
    }
  };

  const handleScreenshot = (dataUrl: string) => {
    if (screenshotResolveRef.current) {
      screenshotResolveRef.current(dataUrl);
      screenshotResolveRef.current = null;
    }
  };

  const handleExportStl = () => {
    if (!stlContent) return;
    const blob = new Blob([stlContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'model.stl';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveScad = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'model.scad';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveLocal = () => {
    localStorage.setItem('saved_scad', code);
    setSavedCode(code);
  };

  const handleLoadScad = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.scad';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          setCode(content);
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleNew = () => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard them and start new?')) return;
    setCode(DEFAULT_CODE);
    setSavedCode(null);
    setMessages([]);
    localStorage.removeItem('saved_scad');
  };

  return (
    <div className="flex h-screen w-full bg-gray-950 text-gray-100 font-sans overflow-hidden">
      <PanelGroup orientation="horizontal">
      {/* Sidebar: BYOK Setup or Chat */}
      <Panel defaultSize={25} minSize={15} className="flex flex-col bg-gray-900 border-r border-gray-800">
        {!hasKey ? (
          <ApiKeySetup />
        ) : (
          <>
            <div className="p-4 border-b border-gray-800 font-bold text-lg flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className="flex-1">OpenSCAD AI Assistant</span>
              {!isEnvKey && (
                <button
                  onClick={clearApiKey}
                  title="Change API key"
                  className="p-1.5 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <KeyRound className="w-4 h-4" />
                </button>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-gray-500 text-sm italic text-center mt-10">
                  Ask me to create or modify a 3D model!
                </div>
              )}
              {messages.map((msg, idx) => (
                <div key={idx} className={`p-3 rounded-lg ${msg.role === 'user' ? 'bg-blue-900/40 ml-4' : 'bg-gray-800 mr-4'}`}>
                  <div className="text-xs text-gray-400 mb-1">{msg.role === 'user' ? 'You' : 'AI'}</div>
                  <div className="text-sm whitespace-pre-wrap">{msg.text}</div>
                </div>
              ))}
              {isAgentTyping && (
                <div className="p-3 rounded-lg bg-gray-800 mr-4 flex items-center gap-2 text-gray-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> AI is thinking...
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-800">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={inputMessage}
                  onChange={e => setInputMessage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Ask for changes..."
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={isAgentTyping || !inputMessage.trim()}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 p-2 rounded transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </Panel>

      <PanelResizeHandle className="w-1.5 bg-gray-900 hover:bg-blue-600 transition-colors flex items-center justify-center group shrink-0 z-10 cursor-col-resize">
        <div className="w-0.5 h-8 bg-gray-700 group-hover:bg-blue-300 rounded" />
      </PanelResizeHandle>

      {/* Main Content */}
      <Panel defaultSize={75} minSize={30} className="flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="h-14 border-b border-gray-800 flex items-center justify-between px-4 bg-gray-900 shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={handleNew} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded transition-colors">
              <FilePlus className="w-4 h-4" /> New
            </button>
            <button onClick={handleLoadScad} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded transition-colors">
              <FolderOpen className="w-4 h-4" /> Load .scad
            </button>
            <button onClick={handleSaveLocal} className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded transition-colors relative ${isDirty ? 'bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-300' : 'bg-gray-800 hover:bg-gray-700'}`}>
              <Save className="w-4 h-4" />
              Save
              {isDirty && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-yellow-500 rounded-full border-2 border-gray-900" />}
            </button>
            <button onClick={handleSaveScad} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded transition-colors">
              <Download className="w-4 h-4" /> Download .scad
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-800 rounded overflow-hidden mr-4">
              <button 
                onClick={() => setViewMode('single')} 
                className={`px-3 py-1.5 flex items-center gap-1 text-sm transition-colors ${viewMode === 'single' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
              >
                <Square className="w-4 h-4" /> 3D
              </button>
              <button 
                onClick={() => setViewMode('quad')} 
                className={`px-3 py-1.5 flex items-center gap-1 text-sm transition-colors ${viewMode === 'quad' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
              >
                <LayoutGrid className="w-4 h-4" /> Quad
              </button>
            </div>

            {/* Render status pill */}
            {renderStatus === 'stale' && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-gray-700 text-gray-400 select-none">
                <Circle className="w-3 h-3" /> Stale
              </span>
            )}
            {renderStatus === 'working' && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-yellow-500/20 text-yellow-400 select-none">
                <Loader2 className="w-3 h-3 animate-spin" /> Rendering
              </span>
            )}
            {renderStatus === 'done' && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-green-500/20 text-green-400 select-none">
                <CheckCircle2 className="w-3 h-3" /> Ready
              </span>
            )}
            {renderStatus === 'failed' && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-red-500/20 text-red-400 select-none">
                <XCircle className="w-3 h-3" /> Failed
              </span>
            )}
            <button onClick={handleExportStl} disabled={!stlContent} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 disabled:bg-gray-800 disabled:text-gray-600 rounded transition-colors">
              <Download className="w-4 h-4" /> Export STL
            </button>
          </div>
        </div>

        {/* Split View */}
        <PanelGroup orientation="horizontal" className="flex-1 min-h-0">
          {/* Editor & Parameters */}
          <Panel defaultSize={50} minSize={20} className="flex flex-col relative border-r border-gray-800">
            
            {parameters.length > 0 && (
              <div className="bg-gray-900 border-b border-gray-800 p-4 max-h-64 overflow-y-auto shrink-0">
                <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">Parameters</h3>
                <div className="space-y-3">
                  {parameters.map((param, idx) => (
                    <div key={idx} className="flex items-center gap-4">
                      <label className="w-1/3 text-sm text-gray-400 truncate" title={param.description || param.name}>
                        {param.name}
                      </label>
                      <div className="flex-1 flex items-center gap-2">
                        {param.type === 'boolean' ? (
                          <input 
                            type="checkbox" 
                            checked={param.value as boolean}
                            onChange={(e) => handleParameterChange(param, e.target.checked)}
                            className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900"
                          />
                        ) : param.type === 'number' && param.min !== undefined && param.max !== undefined ? (
                          <>
                            <input 
                              type="range" 
                              min={param.min} 
                              max={param.max} 
                              step={param.step || 1}
                              value={param.value as number}
                              onChange={(e) => handleParameterChange(param, Number(e.target.value))}
                              className="flex-1 accent-blue-500"
                            />
                            <input 
                              type="number" 
                              value={param.value as number}
                              onChange={(e) => handleParameterChange(param, Number(e.target.value))}
                              className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-blue-500"
                            />
                          </>
                        ) : param.type === 'number' ? (
                          <input 
                            type="number" 
                            value={param.value as number}
                            onChange={(e) => handleParameterChange(param, Number(e.target.value))}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
                          />
                        ) : (
                          <input 
                            type="text" 
                            value={param.value as string}
                            onChange={(e) => handleParameterChange(param, e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="bg-gray-900 px-4 py-2 text-xs font-mono text-gray-400 border-b border-gray-800">
              model.scad
            </div>
            <div className="flex-1">
              <Editor
                height="100%"
                defaultLanguage="openscad"
                theme="vs-dark"
                value={code}
                onChange={(value) => setCode(value || '')}
                beforeMount={(monaco) => registerOpenScadLanguage(monaco)}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  wordWrap: 'on',
                  padding: { top: 16 }
                }}
              />
            </div>
          </Panel>

          <PanelResizeHandle className="w-1.5 bg-gray-900 hover:bg-blue-600 transition-colors flex items-center justify-center group shrink-0 z-10 cursor-col-resize">
            <div className="w-0.5 h-8 bg-gray-700 group-hover:bg-blue-300 rounded" />
          </PanelResizeHandle>

          {/* 3D Viewer + Log Panel */}
          <Panel defaultSize={50} minSize={20} className="flex flex-col">
            <PanelGroup orientation="vertical" className="flex-1 min-h-0">
              <Panel defaultSize={70} minSize={30} className="relative">
                <StlViewer 
                  stlContent={amfContent || stlContent} 
                  onScreenshot={handleScreenshot}
                  screenshotTrigger={screenshotTrigger}
                  viewMode={viewMode}
                  isRendering={renderStatus === 'stale' || renderStatus === 'working'}
                />
              </Panel>

              <PanelResizeHandle className="h-1.5 bg-gray-900 hover:bg-blue-600 transition-colors flex items-center justify-center group shrink-0 z-10 cursor-row-resize">
                <div className="h-0.5 w-8 bg-gray-700 group-hover:bg-blue-300 rounded" />
              </PanelResizeHandle>

              {/* Log Panel */}
              <Panel defaultSize={30} minSize={10} className="flex flex-col bg-gray-950 border-t border-gray-800">
                <div className="px-3 py-1.5 border-b border-gray-800 flex items-center justify-between shrink-0">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Console</span>
                  {compilerLogs && (
                    <span className={`text-xs font-medium ${
                      renderStatus === 'failed' ? 'text-red-400' : 'text-gray-500'
                    }`}>
                      {renderStatus === 'failed' ? 'Errors detected' : 'OK'}
                    </span>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-2 font-mono text-xs leading-relaxed">
                  {compilerLogs ? (
                    compilerLogs.split('\n').map((line, i) => (
                      <div
                        key={i}
                        className={`whitespace-pre-wrap ${
                          line.startsWith('[ERROR]') ? 'text-red-400' :
                          line.startsWith('[WARN]') ? 'text-yellow-400' :
                          line.startsWith('[TOOL]') ? 'text-blue-400' :
                          line.startsWith('[INFO]') ? 'text-gray-400' :
                          'text-gray-500'
                        }`}
                      >
                        {line}
                      </div>
                    ))
                  ) : (
                    <span className="text-gray-600 italic">No output yet.</span>
                  )}
                </div>
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </Panel>
      </PanelGroup>
    </div>
  );
}

export default function App() {
  return (
    <ApiKeyProvider>
      <AppInner />
    </ApiKeyProvider>
  );
}
