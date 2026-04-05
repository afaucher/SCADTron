import OpenSCAD from 'openscad-wasm-prebuilt';

async function test() {
  try {
    const scad = await OpenSCAD();
    scad.FS.writeFile('/test.scad', 'color("red") cube();');
    
    console.log("Testing AMF...");
    scad.callMain(['/test.scad', '-o', '/out.amf']);
    const amfOut = scad.FS.readFile('/out.amf');
    console.log('AMF bytes:', amfOut.length);
    console.log('AMF head:', new TextDecoder().decode(amfOut).substring(0, 100));

    console.log("Testing 3MF...");
    scad.callMain(['/test.scad', '-o', '/out.3mf']);
    const m3Out = scad.FS.readFile('/out.3mf');
    console.log('3MF bytes:', m3Out.length);

  } catch(e) {
    console.error(e);
  }
}
test();
