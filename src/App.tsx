import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { StlViewer } from './components/StlViewer';
import { renderScadToStl, getRecentLogs, clearLogs } from './services/openscad';
import { sendMessageToAgent, ChatMessage } from './services/ai';
import { parseScadParameters, updateScadParameter, ScadParameter } from './utils/scadParser';
import { Play, Download, Save, FolderOpen, Send, Loader2, LayoutGrid, Square } from 'lucide-react';

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
        sphere(r=width/2);
    }
}
`;

export default function App() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [stlContent, setStlContent] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [screenshotTrigger, setScreenshotTrigger] = useState(0);
  const [viewMode, setViewMode] = useState<'single' | 'quad'>('single');
  const [parameters, setParameters] = useState<ScadParameter[]>([]);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [compilerLogs, setCompilerLogs] = useState<string>('');
  const [saveMessage, setSaveMessage] = useState('');
  
  const screenshotResolveRef = useRef<((dataUrl: string) => void) | null>(null);
  const isRenderingRef = useRef(false);
  const pendingCodeRef = useRef<string | null>(null);

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('saved_scad');
    if (saved) {
      setCode(saved);
    }
  }, []);

  const handleRender = useCallback(async (currentCode: string) => {
    if (isRenderingRef.current) {
      pendingCodeRef.current = currentCode;
      return;
    }

    isRenderingRef.current = true;
    setIsRendering(true);
    clearLogs();
    
    try {
      const stl = await renderScadToStl(currentCode);
      setStlContent(stl);
      setRenderError(null);
    } catch (error) {
      console.error("Render failed", error);
      setRenderError(error instanceof Error ? error.message : String(error));
    } finally {
      setCompilerLogs(getRecentLogs());
      isRenderingRef.current = false;
      setIsRendering(false);
      
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

  // Auto-render on code change with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      handleRender(code);
    }, 100); // Reduced debounce for real-time slider updates
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
            screenshotResolveRef.current = resolve;
            setScreenshotTrigger(prev => prev + 1);
          });
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
    setSaveMessage('Saved to browser!');
    setTimeout(() => setSaveMessage(''), 2000);
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

  return (
    <div className="flex h-screen w-full bg-gray-950 text-gray-100 font-sans">
      {/* Sidebar Chat */}
      <div className="w-80 border-r border-gray-800 flex flex-col bg-gray-900">
        <div className="p-4 border-b border-gray-800 font-bold text-lg flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          OpenSCAD AI Assistant
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
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="h-14 border-b border-gray-800 flex items-center justify-between px-4 bg-gray-900">
          <div className="flex items-center gap-2">
            <button onClick={handleLoadScad} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded transition-colors">
              <FolderOpen className="w-4 h-4" /> Load .scad
            </button>
            <button onClick={handleSaveLocal} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded transition-colors relative">
              <Save className="w-4 h-4" /> Save
              {saveMessage && <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-green-600 text-white text-xs px-2 py-1 rounded whitespace-nowrap shadow-lg">{saveMessage}</span>}
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

            {isRendering && <span className="text-xs text-yellow-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Rendering...</span>}
            <button onClick={() => handleRender(code)} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded transition-colors">
              <Play className="w-4 h-4" /> Render
            </button>
            <button onClick={handleExportStl} disabled={!stlContent} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 disabled:bg-gray-800 disabled:text-gray-600 rounded transition-colors">
              <Download className="w-4 h-4" /> Export STL
            </button>
          </div>
        </div>

        {/* Split View */}
        <div className="flex-1 flex min-h-0">
          {/* Editor & Parameters */}
          <div className="w-1/2 border-r border-gray-800 flex flex-col relative">
            {renderError && (
              <div className="absolute top-0 left-0 right-0 z-10 bg-red-900/90 text-red-100 px-4 py-2 text-xs font-mono border-b border-red-700 max-h-32 overflow-y-auto">
                <div className="font-bold mb-1">Compiler Error:</div>
                <pre className="whitespace-pre-wrap">{renderError}</pre>
              </div>
            )}
            
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
                defaultLanguage="cpp"
                theme="vs-dark"
                value={code}
                onChange={(value) => setCode(value || '')}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  wordWrap: 'on',
                  padding: { top: 16 }
                }}
              />
            </div>
          </div>

          {/* 3D Viewer */}
          <div className="w-1/2 relative">
            <StlViewer 
              stlContent={stlContent} 
              onScreenshot={handleScreenshot}
              screenshotTrigger={screenshotTrigger}
              viewMode={viewMode}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
