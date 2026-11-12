import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export type GlobePin = {
  lat: number;
  lon: number;
  label: string;
  critical?: boolean;
};

function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// Real WebGL globe (three.js). Deliberately small: a wireframe sphere, a
// faint inner shell and one marker per real device location - no textures to
// download, so it stays cheap on mobile data.
function HoloGlobe({ pins, reducedMotion }: { pins: GlobePin[]; reducedMotion: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      setFailed(true);
      return;
    }

    const width = mount.clientWidth || 600;
    const height = mount.clientHeight || 420;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0, 6.2);

    const globe = new THREE.Group();
    scene.add(globe);

    const wireframe = new THREE.Mesh(
      new THREE.SphereGeometry(2, 40, 28),
      new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, transparent: true, opacity: 0.14 })
    );
    globe.add(wireframe);

    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(1.985, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0x002416, transparent: true, opacity: 0.85 })
    );
    globe.add(shell);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(2.16, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0x00d9ff, transparent: true, opacity: 0.055, side: THREE.BackSide })
    );
    globe.add(atmosphere);

    const ringGeometry = new THREE.RingGeometry(2.55, 2.58, 128);
    const ring = new THREE.Mesh(
      ringGeometry,
      new THREE.MeshBasicMaterial({ color: 0x00d9ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
    );
    ring.rotation.x = Math.PI / 2.2;
    globe.add(ring);

    const pinMeshes: THREE.Mesh[] = [];
    pins.slice(0, 12).forEach((pin) => {
      const critical = Boolean(pin.critical);
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(critical ? 0.075 : 0.055, 12, 12),
        new THREE.MeshBasicMaterial({ color: critical ? 0xff1744 : 0x00ff88 })
      );
      marker.position.copy(latLonToVector3(pin.lat, pin.lon, 2.02));
      globe.add(marker);
      pinMeshes.push(marker);

      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(critical ? 0.16 : 0.12, 12, 12),
        new THREE.MeshBasicMaterial({ color: critical ? 0xff1744 : 0x00ff88, transparent: true, opacity: 0.16 })
      );
      halo.position.copy(marker.position);
      globe.add(halo);
    });

    let frame = 0;
    let paused = false;
    const clock = new THREE.Clock();

    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (paused) return;
      const elapsed = clock.getElapsedTime();
      if (!reducedMotion) {
        globe.rotation.y = elapsed * 0.075;
        ring.rotation.z = elapsed * 0.05;
        pinMeshes.forEach((mesh, index) => {
          const pulse = 1 + Math.sin(elapsed * 2 + index) * 0.12;
          mesh.scale.setScalar(pulse);
        });
      }
      renderer.render(scene, camera);
    };
    animate();

    const onVisibility = () => {
      paused = document.hidden;
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onResize = () => {
      const nextWidth = mount.clientWidth || width;
      const nextHeight = mount.clientHeight || height;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(mount);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material?.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [pins, reducedMotion]);

  if (failed) {
    return (
      <div className="flex h-full min-h-[260px] items-center justify-center text-center font-mono text-xs text-slate-400">
        WebGL is unavailable on this device, so the globe is disabled.
      </div>
    );
  }

  return <div ref={mountRef} className="h-full w-full" aria-label="Device location globe" role="img" />;
}

export default HoloGlobe;
