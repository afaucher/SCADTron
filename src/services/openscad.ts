import { createOpenSCAD, OpenSCADInstance } from "openscad-wasm-prebuilt";

let instance: OpenSCADInstance | null = null;
let isInitializing = false;
let initPromise: Promise<OpenSCADInstance> | null = null;

let logBuffer: string[] = [];

export function getRecentLogs(): string {
  return logBuffer.join('\n');
}

export function clearLogs(): void {
  logBuffer = [];
}

export async function getOpenSCAD(): Promise<OpenSCADInstance> {
  if (instance) return instance;
  if (initPromise) return initPromise;

  isInitializing = true;
  initPromise = createOpenSCAD({
    print: (text) => {
      console.log(text);
      logBuffer.push(`[INFO] ${text}`);
      if (logBuffer.length > 200) logBuffer.shift();
    },
    printErr: (text) => {
      console.error(text);
      logBuffer.push(`[ERROR] ${text}`);
      if (logBuffer.length > 200) logBuffer.shift();
    },
  }).then((scad) => {
    instance = scad;
    isInitializing = false;
    return scad;
  });

  return initPromise;
}

export async function renderScadToStl(code: string): Promise<string> {
  const scad = await getOpenSCAD();
  try {
    return await scad.renderToStl(code);
  } catch (error) {
    console.error("Error rendering SCAD to STL:", error);
    throw error;
  }
}
