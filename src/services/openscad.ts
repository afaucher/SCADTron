import OpenScadWorker from './openscad.worker?worker';

interface RenderResponse {
  type: 'done' | 'error' | 'print' | 'printErr';
  id: number;
  text?: string;
  stl?: string;
  amf?: string;
  error?: string;
}

let logBuffer: string[] = [];
let worker: Worker | null = null;
let currentRenderId = 0;
let pendingResolvers = new Map<number, { resolve: (result: { stl: string, amf: string }) => void, reject: (err: any) => void }>();

export function getRecentLogs(): string {
  return logBuffer.join('\n');
}

export function clearLogs(): void {
  logBuffer = [];
}

function processPrint(text: string) {
  console.log(text);
  logBuffer.push(`[INFO] ${text}`);
  if (logBuffer.length > 200) logBuffer.shift();
}

function processPrintErr(text: string) {
  console.warn(text);
  const t = text.trim();
  if (!t || t.includes('Could not initialize localization')) return; // noise
  if (t.includes('AMF export is deprecated')) return;
  let tag = '[INFO]';
  if (/^(ERROR|error):/.test(t) || t.includes('EXPORT-WARNING') || t.includes('valid 2-manifold')) tag = '[ERROR]';
  else if (/^(WARNING|warn):/.test(t)) tag = '[WARN]';
  logBuffer.push(`${tag} ${t}`);
  if (logBuffer.length > 200) logBuffer.shift();
}

function getWorker() {
  if (!worker) {
    worker = new OpenScadWorker();
    worker.onmessage = (e: MessageEvent<RenderResponse>) => {
      const msg = e.data;
      if (msg.type === 'print') {
        processPrint((msg as any).text);
      } else if (msg.type === 'printErr') {
        processPrintErr((msg as any).text);
      } else if (msg.type === 'done') {
        const resolvers = pendingResolvers.get(msg.id);
        if (resolvers && msg.stl) {
          resolvers.resolve({ stl: msg.stl, amf: msg.amf || '' });
          pendingResolvers.delete(msg.id);
        }
      } else if (msg.type === 'error') {
        const resolvers = pendingResolvers.get(msg.id);
        if (resolvers) {
          resolvers.reject(new Error(msg.error || 'Unknown render error'));
          pendingResolvers.delete(msg.id);
        }
      }
    };
  }
  return worker;
}

export function renderOpenScad(code: string): Promise<{ stl: string, amf: string }> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const id = ++currentRenderId;
    pendingResolvers.set(id, { resolve, reject });
    w.postMessage({ id, code });
  });
}
