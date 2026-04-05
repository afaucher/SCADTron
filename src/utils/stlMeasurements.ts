import * as THREE from 'three';
import { STLLoader } from 'three-stdlib';

export function getModelDimensions(stlContent: string) {
  const loader = new STLLoader();
  // STLLoader.parse expects an ArrayBuffer or string.
  // The openscad-wasm-prebuilt renderToStl returns an ASCII STL string.
  const geometry = loader.parse(stlContent);
  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox;
  if (!bbox) return null;
  
  const size = new THREE.Vector3();
  bbox.getSize(size);
  
  return {
    min: { x: bbox.min.x, y: bbox.min.y, z: bbox.min.z },
    max: { x: bbox.max.x, y: bbox.max.y, z: bbox.max.z },
    size: { x: size.x, y: size.y, z: size.z }
  };
}

export function castRay(stlContent: string, origin: [number, number, number], direction: [number, number, number]) {
  const loader = new STLLoader();
  const geometry = loader.parse(stlContent);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  
  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(...origin),
    new THREE.Vector3(...direction).normalize()
  );
  
  const intersects = raycaster.intersectObject(mesh, false);
  
  return intersects.map(i => ({
    distance: i.distance,
    point: { x: i.point.x, y: i.point.y, z: i.point.z },
    faceNormal: i.face?.normal ? { x: i.face.normal.x, y: i.face.normal.y, z: i.face.normal.z } : null
  }));
}
