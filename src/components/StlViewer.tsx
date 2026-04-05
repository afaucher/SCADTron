import React, { useEffect, useState, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Stage, Grid, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';

interface ViewerProps {
  stlContent: string | null;
  onScreenshot?: (dataUrl: string) => void;
  screenshotTrigger?: number;
  viewMode?: 'single' | 'quad';
  isRendering?: boolean;
}

function Model({ stlContent }: { stlContent: string }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    if (!stlContent) {
      setGeometry(null);
      return;
    }

    try {
      const loader = new STLLoader();
      const geom = loader.parse(stlContent);
      geom.computeVertexNormals();
      setGeometry(geom);
    } catch (error) {
      console.error("Failed to parse STL", error);
    }
  }, [stlContent]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#facc15" roughness={0.4} metalness={0.1} />
    </mesh>
  );
}

function ScreenshotHelper({ onScreenshot, trigger }: { onScreenshot?: (dataUrl: string) => void, trigger?: number }) {
  const { gl, scene, camera } = useThree();
  
  useEffect(() => {
    if (trigger && trigger > 0 && onScreenshot) {
      requestAnimationFrame(() => {
        gl.render(scene, camera);
        const dataUrl = gl.domElement.toDataURL('image/png');
        onScreenshot(dataUrl);
      });
    }
  }, [trigger, gl, scene, camera, onScreenshot]);

  return null;
}

function SingleView({ stlContent, onScreenshot, screenshotTrigger, cameraType, position, up }: any) {
  return (
    <Canvas shadows={{ type: THREE.PCFShadowMap }} gl={{ preserveDrawingBuffer: true }}>
      {cameraType === 'ortho' ? (
        <OrthographicCamera makeDefault position={position} up={up} zoom={10} />
      ) : (
        <PerspectiveCamera makeDefault position={position} up={up} fov={50} />
      )}
      <color attach="background" args={['#111827']} />
      
      <Stage environment="city" intensity={0.6} adjustCamera={1.2} shadows={false}>
        {stlContent && <Model stlContent={stlContent} />}
      </Stage>
      
      <Grid rotation={[Math.PI / 2, 0, 0]} infiniteGrid fadeDistance={200} sectionColor="#4b5563" cellColor="#374151" />
      <OrbitControls makeDefault enableRotate={cameraType !== 'ortho'} />
      {onScreenshot && <ScreenshotHelper onScreenshot={onScreenshot} trigger={screenshotTrigger} />}
    </Canvas>
  );
}

export function StlViewer({ stlContent, onScreenshot, screenshotTrigger, viewMode = 'single', isRendering = false }: ViewerProps) {
  if (!stlContent) {
    return (
      <div className="w-full h-full bg-gray-900 relative flex items-center justify-center">
        <p className="text-gray-500 font-mono">No model to display</p>
      </div>
    );
  }

  if (viewMode === 'single') {
    return (
      <div className={`w-full h-full bg-gray-900 relative transition-all duration-500 ease-in-out ${isRendering ? 'grayscale opacity-50' : ''}`}>
        <SingleView 
          stlContent={stlContent} 
          onScreenshot={onScreenshot} 
          screenshotTrigger={screenshotTrigger}
          cameraType="perspective"
          position={[50, 50, 50]}
          up={[0, 0, 1]}
        />
      </div>
    );
  }

  return (
    <div className={`w-full h-full bg-gray-900 grid grid-cols-2 grid-rows-2 gap-1 p-1 transition-all duration-500 ease-in-out ${isRendering ? 'grayscale opacity-50' : ''}`}>
      {/* Top View (looking down Z) */}
      <div className="relative border border-gray-800 rounded overflow-hidden">
        <div className="absolute top-2 left-2 z-10 bg-black/50 text-white text-xs px-2 py-1 rounded">Top</div>
        <SingleView stlContent={stlContent} cameraType="ortho" position={[0, 0, 100]} up={[0, 1, 0]} />
      </div>
      
      {/* Perspective View */}
      <div className="relative border border-gray-800 rounded overflow-hidden">
        <div className="absolute top-2 left-2 z-10 bg-black/50 text-white text-xs px-2 py-1 rounded">3D</div>
        <SingleView stlContent={stlContent} cameraType="perspective" position={[50, 50, 50]} up={[0, 0, 1]} />
      </div>

      {/* Front View (looking down Y) */}
      <div className="relative border border-gray-800 rounded overflow-hidden">
        <div className="absolute top-2 left-2 z-10 bg-black/50 text-white text-xs px-2 py-1 rounded">Front</div>
        <SingleView stlContent={stlContent} cameraType="ortho" position={[0, -100, 0]} up={[0, 0, 1]} />
      </div>

      {/* Right View (looking down X) */}
      <div className="relative border border-gray-800 rounded overflow-hidden">
        <div className="absolute top-2 left-2 z-10 bg-black/50 text-white text-xs px-2 py-1 rounded">Right</div>
        <SingleView stlContent={stlContent} cameraType="ortho" position={[100, 0, 0]} up={[0, 0, 1]} />
      </div>
    </div>
  );
}
