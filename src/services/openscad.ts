import OpenScadWorker from './openscad.worker?worker';

let logBuffer: string[] = [];
let worker: Worker | null = null;
let currentRenderId = 0;
let pendingResolvers = new Map<number, { resolve: (stl: string) => void, reject: (err: any) => void }>();

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
  let tag = '[INFO]';
  if (/^(ERROR|error):/.test(t)) tag = '[ERROR]';
  else if (/^(WARNING|EXPORT-WARNING|warn):/.test(t)) tag = '[WARN]';
  logBuffer.push(`${tag} ${t}`);
  if (logBuffer.length > 200) logBuffer.shift();
}

function getWorker() {
  if (!worker) {
    worker = new OpenScadWorker();
    worker.onmessage = (e) => {
      const { type, text, id, stl, error } = e.data;
      if (type === 'print') {
        processPrint(text);
      } else if (type === 'printErr') {
        processPrintErr(text);
      } else if (type === 'done') {
        const resolvers = pendingResolvers.get(id);
        if (resolvers) {
          resolvers.resolve(stl);
          pendingResolvers.delete(id);
        }
      } else if (type === 'error') {
        const resolvers = pendingResolvers.get(id);
        if (resolvers) {
          resolvers.reject(new Error(error));
          pendingResolvers.delete(id);
        }
      }
    };
  }
  return worker;
}

export function renderScadToStl(code: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const id = ++currentRenderId;
    pendingResolvers.set(id, { resolve, reject });
    w.postMessage({ id, code });
  });
}
