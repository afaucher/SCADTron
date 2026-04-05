self.onmessage = async (e: MessageEvent) => {
  const { code, id } = e.data;
  
  if (!code || id === undefined) return;

  try {
    // Avoid Rollup trying to resolve this absolute path at build time
    const wasmUrl = self.location.origin + '/wasm/openscad.js';
    // @ts-ignore
    const { default: OpenSCAD } = await import(/* @vite-ignore */ wasmUrl);
    
    const instance = await OpenSCAD({
      noInitialRun: true,
      print: (text: string) => {
        self.postMessage({ type: 'print', text, id });
      },
      printErr: (text: string) => {
        self.postMessage({ type: 'printErr', text, id });
      },
    });

    instance.FS.writeFile("/input.scad", code);
    
    // Create variables for tracking string loading
    let stlCode;

    // OpenSCAD WASM modules often exit/teardown after main() completes.
    // Calling callMain twice on the same instance is generally unsafe.
    // Since AMF wasn't compiled in anyways, we will only run exactly one 
    // export pass for STL.
    
    try {
      instance.callMain(["/input.scad", "-o", "/output.stl"]);
      const stlBuffer = instance.FS.readFile("/output.stl", { encoding: "utf8" });
      stlCode = typeof stlBuffer === 'string' ? stlBuffer : new TextDecoder().decode(stlBuffer as Uint8Array);
    } catch (e) {
      throw new Error(`STL Generation Failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    self.postMessage({ type: 'done', id, stl: stlCode, amf: null });
  } catch (error) {
    self.postMessage({ type: 'error', id, error: error instanceof Error ? error.message : String(error) });
  }
};
