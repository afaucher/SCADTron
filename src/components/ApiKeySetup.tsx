import React, { useState, useRef, useEffect } from 'react';
import { useApiKey } from '../contexts/apiKeyContext';
import { Key, Eye, EyeOff, ExternalLink, Loader2, CheckCircle2, XCircle, Sparkles, Zap } from 'lucide-react';

type ValidationState = 'idle' | 'validating' | 'valid' | 'invalid';

async function validateApiKey(key: string): Promise<{ valid: boolean; error?: string }> {
  // Quick format check
  if (!key || key.trim().length < 10) {
    return { valid: false, error: 'Key is too short' };
  }

  // Probe the API with a minimal request
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key.trim())}`, {
      method: 'GET',
    });
    if (res.ok) {
      return { valid: true };
    }
    if (res.status === 400 || res.status === 403) {
      return { valid: false, error: 'Invalid API key' };
    }
    return { valid: false, error: `API returned status ${res.status}` };
  } catch (e) {
    return { valid: false, error: 'Could not reach API. Check your connection.' };
  }
}

export function ApiKeySetup() {
  const { setApiKey } = useApiKey();
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [validation, setValidation] = useState<ValidationState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleConnect = async () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;

    setValidation('validating');
    setErrorMsg('');

    const result = await validateApiKey(trimmed);
    if (result.valid) {
      setValidation('valid');
      // Small delay so user sees the success state
      setTimeout(() => {
        setApiKey(trimmed);
      }, 600);
    } else {
      setValidation('invalid');
      setErrorMsg(result.error || 'Invalid key');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && keyInput.trim() && validation !== 'validating') {
      handleConnect();
    }
  };

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at 30% 20%, rgba(59,130,246,0.3) 0%, transparent 60%),' +
                         'radial-gradient(ellipse at 70% 80%, rgba(139,92,246,0.2) 0%, transparent 60%)',
            animation: 'byok-pulse 8s ease-in-out infinite alternate',
          }}
        />
      </div>

      <style>{`
        @keyframes byok-pulse {
          0% { opacity: 0.3; transform: scale(1); }
          100% { opacity: 0.6; transform: scale(1.05); }
        }
        @keyframes byok-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes byok-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
      `}</style>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
        {/* Logo / Icon */}
        <div
          className="mb-6 p-4 rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/20"
          style={{ animation: 'byok-float 4s ease-in-out infinite' }}
        >
          <Sparkles className="w-10 h-10 text-blue-400" />
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-white mb-2 text-center">
          Connect Your AI
        </h2>
        <p className="text-sm text-gray-400 text-center mb-8 max-w-[260px] leading-relaxed">
          Enter your Gemini API key to enable AI-powered OpenSCAD assistance.
        </p>

        {/* Input area */}
        <div className="w-full max-w-[300px] space-y-4">
          <div className="relative">
            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              ref={inputRef}
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={e => { setKeyInput(e.target.value); setValidation('idle'); setErrorMsg(''); }}
              onKeyDown={handleKeyDown}
              placeholder="Paste your API key..."
              className={`w-full bg-gray-800/80 backdrop-blur border rounded-lg pl-10 pr-10 py-3 text-sm font-mono focus:outline-none transition-colors ${
                validation === 'invalid'
                  ? 'border-red-500/60 focus:border-red-400'
                  : validation === 'valid'
                    ? 'border-green-500/60'
                    : 'border-gray-700 focus:border-blue-500'
              }`}
              disabled={validation === 'validating' || validation === 'valid'}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              onClick={() => setShowKey(prev => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
              tabIndex={-1}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Error message */}
          {validation === 'invalid' && errorMsg && (
            <div className="flex items-center gap-2 text-xs text-red-400 px-1">
              <XCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Connect button */}
          <button
            onClick={handleConnect}
            disabled={!keyInput.trim() || validation === 'validating' || validation === 'valid'}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all duration-300 ${
              validation === 'valid'
                ? 'bg-green-600 text-white'
                : validation === 'validating'
                  ? 'bg-blue-600/50 text-blue-200 cursor-wait'
                  : 'bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:from-blue-600 disabled:hover:to-violet-600'
            }`}
          >
            {validation === 'validating' && (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Validating...
              </>
            )}
            {validation === 'valid' && (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Connected!
              </>
            )}
            {(validation === 'idle' || validation === 'invalid') && (
              <>
                <Zap className="w-4 h-4" />
                Connect
              </>
            )}
          </button>
        </div>

        {/* Help link */}
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors group"
        >
          Get a free API key from Google AI Studio
          <ExternalLink className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity" />
        </a>
      </div>

      {/* Footer note */}
      <div className="px-6 py-4 text-center border-t border-gray-800/50 relative z-10">
        <p className="text-[11px] text-gray-600 leading-relaxed">
          Your key is stored locally in your browser and never sent to any server except Google's API.
        </p>
      </div>
    </div>
  );
}
