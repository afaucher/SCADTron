import { createOpenSCAD } from "openscad-wasm-prebuilt";

self.onmessage = async (e: MessageEvent) => {
  const { code, id } = e.data;
  
  if (!code || id === undefined) return;

  try {
    const scad = await createOpenSCAD({
      print: (text) => {
        self.postMessage({ type: 'print', text, id });
      },
      printErr: (text) => {
        self.postMessage({ type: 'printErr', text, id });
      },
    });

    // Bypass the high-level renderToStl so we can pass advanced experimental flags
    // Manifold and fast-csg drastically improve OpenSCAD evaluation speeds!
    const instance = scad.getInstance();
    instance.FS.writeFile("/input.scad", code);
    instance.callMain(["/input.scad", "--enable=manifold", "--enable=fast-csg", "-o", "/output.stl"]);
    
    // Read the output
    const outputBuffer = instance.FS.readFile("/output.stl", { encoding: "utf8" });
    const stl = typeof outputBuffer === 'string' ? outputBuffer : new TextDecoder().decode(outputBuffer);

    self.postMessage({ type: 'done', id, stl });
  } catch (error) {
    self.postMessage({ type: 'error', id, error: error instanceof Error ? error.message : String(error) });
  }
};
