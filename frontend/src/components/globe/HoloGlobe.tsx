import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { WORLD_LAND } from './worldLand';

export type GlobePin = {
  lat: number;
  lon: number;
  label: string;
  critical?: boolean;
  deviceId?: string;
};

type HoloGlobeProps = {
  pins: GlobePin[];
  reducedMotion: boolean;
  onPinClick?: (pin: GlobePin) => void;
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

function createWorldTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const { width, height } = canvas;
    // Equirectangular projection matching the sphere's default UVs: lon -180
    // sits at x=0, lat +90 at y=0.
    const project = (lon: number, lat: number): [number, number] => [
      ((lon + 180) / 360) * width,
      ((90 - lat) / 180) * height
    ];

    ctx.fillStyle = '#04140d';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(0, 255, 136, 0.07)';
    ctx.lineWidth = 1.5;
    for (let lon = -180; lon <= 180; lon += 15) {
      const x = project(lon, 0)[0];
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let lat = -75; lat <= 75; lat += 15) {
      const y = project(0, lat)[1];
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(0, 217, 255, 0.16)';
    ctx.lineWidth = 2;
    const equatorY = project(0, 0)[1];
    ctx.beginPath();
    ctx.moveTo(0, equatorY);
    ctx.lineTo(width, equatorY);
    ctx.stroke();

    const traceLand = () => {
      ctx.beginPath();
      for (const ring of WORLD_LAND) {
        let started = false;
        for (const [lon, lat] of ring) {
          const [x, y] = project(lon, lat);
          if (started) ctx.lineTo(x, y);
          else {
            ctx.moveTo(x, y);
            started = true;
          }
        }
        ctx.closePath();
      }
    };

    traceLand();
    ctx.fillStyle = '#0a3323';
    ctx.fill('evenodd');

    ctx.shadowColor = 'rgba(0, 255, 136, 0.65)';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.85)';
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.shadowBlur = 0;

    traceLand();
    ctx.strokeStyle = 'rgba(150, 255, 214, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createPinTexture(critical: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const color = critical ? '#ff1744' : '#00ff88';
  const glow = critical ? 'rgba(255, 23, 68, 0.5)' : 'rgba(0, 255, 136, 0.45)';
  if (ctx) {
    const radial = ctx.createRadialGradient(64, 58, 4, 64, 58, 60);
    radial.addColorStop(0, glow);
    radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, 128, 128);

    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(64, 118);
    ctx.bezierCurveTo(30, 88, 22, 64, 22, 46);
    ctx.bezierCurveTo(22, 22, 40, 8, 64, 8);
    ctx.bezierCurveTo(88, 8, 106, 22, 106, 46);
    ctx.bezierCurveTo(106, 64, 98, 88, 64, 118);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.arc(64, 46, 16, 0, Math.PI * 2);
    ctx.fillStyle = '#03100a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// Real WebGL globe (three.js): equirectangular land texture generated from
// Natural Earth data, drag-to-rotate with inertia, and clickable pin sprites.
function HoloGlobe({ pins, reducedMotion, onPinClick }: HoloGlobeProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const clickRef = useRef(onPinClick);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    clickRef.current = onPinClick;
  }, [onPinClick]);

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
    // Without this the canvas keeps its pixel width as intrinsic size after a
    // viewport shrink, which makes the whole grid track refuse to get narrower.
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.maxWidth = '100%';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.cursor = 'grab';
    mount.appendChild(renderer.domElement);
    const canvas = renderer.domElement;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0, 6.2);

    const globe = new THREE.Group();
    globe.rotation.order = 'YXZ';
    scene.add(globe);

    const worldTexture = createWorldTexture();
    worldTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const surface = new THREE.Mesh(
      new THREE.SphereGeometry(2, 96, 64),
      new THREE.MeshBasicMaterial({ map: worldTexture })
    );
    globe.add(surface);

    const wireframe = new THREE.Mesh(
      new THREE.SphereGeometry(2.008, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, transparent: true, opacity: 0.045 })
    );
    globe.add(wireframe);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(2.16, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0x00d9ff, transparent: true, opacity: 0.055, side: THREE.BackSide })
    );
    globe.add(atmosphere);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.55, 2.58, 128),
      new THREE.MeshBasicMaterial({ color: 0x00d9ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide })
    );
    ring.rotation.x = Math.PI / 2.2;
    globe.add(ring);

    const textures: THREE.Texture[] = [worldTexture];
    const pinTextures = new Map<boolean, THREE.Texture>();
    const pinSprites: THREE.Sprite[] = [];
    const hitSprites: THREE.Sprite[] = [];
    const pinScale: THREE.Vector2[] = [];

    pins.slice(0, 24).forEach((pin) => {
      const critical = Boolean(pin.critical);
      let pinTexture = pinTextures.get(critical);
      if (!pinTexture) {
        pinTexture = createPinTexture(critical);
        pinTextures.set(critical, pinTexture);
        textures.push(pinTexture);
      }

      const anchor = latLonToVector3(pin.lat, pin.lon, 2.012);

      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTexture, transparent: true, depthWrite: false }));
      sprite.position.copy(anchor);
      sprite.center.set(0.5, 0.04);
      const scale = critical ? 0.3 : 0.24;
      sprite.scale.set(scale, scale, 1);
      sprite.userData.pinIndex = pinSprites.length;
      globe.add(sprite);
      pinSprites.push(sprite);
      pinScale.push(new THREE.Vector2(scale, scale));

      const hit = new THREE.Sprite(
        new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
      hit.position.copy(anchor);
      hit.center.set(0.5, 0.25);
      hit.scale.set(scale * 2.1, scale * 2.1, 1);
      hit.userData.pinIndex = pinSprites.length - 1;
      globe.add(hit);
      hitSprites.push(hit);
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const tooltip = tooltipRef.current;

    let hovered = -1;
    let dragging = false;
    let pointerId: number | null = null;
    let lastX = 0;
    let lastY = 0;
    let travel = 0;
    // Face the pin cluster on load instead of leaving every pin on the far
    // hemisphere until the user happens to rotate the globe around.
    const meanLon = pins.length ? pins.reduce((sum, pin) => sum + pin.lon, 0) / pins.length : 0;
    let yaw = pins.length ? Math.PI / 2 - ((meanLon + 180) * Math.PI) / 180 : 0.35;
    let pitch = -0.18;
    let velocityX = 0;
    let velocityY = 0;
    let lastInteraction = performance.now();

    const isFacingCamera = (sprite: THREE.Sprite) => {
      const world = sprite.getWorldPosition(new THREE.Vector3());
      return world.z > 0.55;
    };

    const hideTooltip = () => {
      hovered = -1;
      canvas.style.cursor = dragging ? 'grabbing' : 'grab';
      if (tooltip) tooltip.style.opacity = '0';
    };

    const showTooltip = (index: number, x: number, y: number) => {
      const pin = pins[index];
      if (!pin || !tooltip) return;
      hovered = index;
      canvas.style.cursor = 'pointer';
      tooltip.textContent = pin.label;
      tooltip.style.transform = `translate(${x + 14}px, ${y + 16}px)`;
      tooltip.style.opacity = '1';
    };

    const pickPin = (clientX: number, clientY: number): number => {
      if (hitSprites.length === 0) return -1;
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(hitSprites, false);
      for (const hit of hits) {
        const index = hit.object.userData.pinIndex as number | undefined;
        if (index === undefined) continue;
        if (isFacingCamera(pinSprites[index])) return index;
      }
      return -1;
    };

    const onPointerDown = (event: PointerEvent) => {
      const index = pickPin(event.clientX, event.clientY);
      if (index >= 0) {
        const rect = canvas.getBoundingClientRect();
        showTooltip(index, event.clientX - rect.left, event.clientY - rect.top);
      } else {
        hideTooltip();
      }
      dragging = true;
      pointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      travel = 0;
      velocityX = 0;
      velocityY = 0;
      lastInteraction = performance.now();
      canvas.style.cursor = 'grabbing';
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Capture is unavailable for some synthetic/older pointers; dragging
        // still works while the pointer stays over the canvas.
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (dragging) {
        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;
        lastX = event.clientX;
        lastY = event.clientY;
        travel += Math.abs(dx) + Math.abs(dy);
        yaw += dx * 0.005;
        pitch = Math.max(-1.15, Math.min(1.15, pitch + dy * 0.004));
        velocityX = dx * 0.0021;
        velocityY = dy * 0.0015;
        lastInteraction = performance.now();
        return;
      }
      const index = pickPin(event.clientX, event.clientY);
      if (index >= 0) {
        const rect = canvas.getBoundingClientRect();
        showTooltip(index, event.clientX - rect.left, event.clientY - rect.top);
      } else {
        hideTooltip();
      }
    };

    const finishDrag = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      const wasTap = travel < 8;
      if (pointerId !== null && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
      pointerId = null;
      lastInteraction = performance.now();
      if (wasTap) {
        const index = pickPin(event.clientX, event.clientY);
        if (index >= 0) {
          const pin = pins[index];
          if (pin && clickRef.current) clickRef.current(pin);
        }
      }
      hideTooltip();
    };

    const onPointerLeave = () => {
      if (!dragging) hideTooltip();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', finishDrag);
    canvas.addEventListener('pointercancel', finishDrag);
    canvas.addEventListener('pointerleave', onPointerLeave);

    let frame = 0;
    let paused = false;
    const clock = new THREE.Clock();

    const animate = () => {
      frame = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      if (paused) return;
      const elapsed = clock.elapsedTime;

      if (!dragging) {
        if (!reducedMotion) {
          yaw += velocityX;
          pitch = Math.max(-1.15, Math.min(1.15, pitch + velocityY));
          velocityX *= 0.93;
          velocityY *= 0.9;
          if (Math.abs(velocityX) < 0.00004) velocityX = 0;
          if (Math.abs(velocityY) < 0.00004) velocityY = 0;
        }
        if (!reducedMotion && performance.now() - lastInteraction > 2600) {
          yaw += delta * 0.12;
        }
      }

      globe.rotation.y = yaw;
      globe.rotation.x = pitch;

      if (!reducedMotion) {
        ring.rotation.z = elapsed * 0.05;
        pinSprites.forEach((sprite, index) => {
          const base = pinScale[index];
          const pulse = 1 + Math.sin(elapsed * 2.4 + index * 0.7) * 0.055;
          sprite.scale.set(base.x * pulse, base.y * pulse, 1);
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
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', finishDrag);
      canvas.removeEventListener('pointercancel', finishDrag);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material?.dispose();
      });
      textures.forEach((texture) => texture.dispose());
      renderer.dispose();
      if (canvas.parentElement === mount) mount.removeChild(canvas);
    };
  }, [pins, reducedMotion]);

  if (failed) {
    return (
      <div className="flex h-full min-h-[260px] items-center justify-center text-center font-mono text-xs text-slate-400">
        WebGL is unavailable on this device, so the globe is disabled.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full min-w-0 overflow-hidden" aria-label="Device location globe" role="img">
      <div ref={mountRef} className="h-full w-full" />
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute left-0 top-0 z-10 whitespace-nowrap border border-brand-green/40 bg-black/85 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-brand-green opacity-0 transition-opacity duration-150"
      />
      <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">
        <span className="h-1.5 w-1.5 bg-brand-green" />
        drag to rotate · click a pin
      </div>
    </div>
  );
}

export default HoloGlobe;
