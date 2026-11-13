import { useEffect, useRef, useState } from 'react';
import { Globe2, LocateFixed, Minus, Plus, RotateCcw } from 'lucide-react';
import * as THREE from 'three';
import EmbeddedMap from './EmbeddedMap';
import { WORLD_LAND } from './worldLand';

export type GlobePin = {
  lat: number;
  lon: number;
  label: string;
  critical?: boolean;
  deviceId?: string;
  capturedAtUtc?: string;
  source?: string;
};

type HoloGlobeProps = {
  pins: GlobePin[];
  reducedMotion: boolean;
  onPinClick?: (pin: GlobePin) => void;
};

type MapStyle = 'blueprint' | 'satellite' | 'night';

const MAP_STYLE_OPTIONS: { id: MapStyle; label: string }[] = [
  { id: 'blueprint', label: 'Vector' },
  { id: 'satellite', label: 'Satellite' },
  { id: 'night', label: 'Night' }
];

// Zooming past DEEP_ZOOM_DISTANCE hands the view over to real tiled imagery:
// the globe is a single 2K texture, so no amount of camera travel can resolve
// buildings. The takeover keeps the same window but paints it with satellite
// tiles down to z19, which is where individual buildings become legible.
const MIN_DISTANCE = 2.7;
const MAX_DISTANCE = 10;
const DEFAULT_DISTANCE = 6.2;
const DEEP_ZOOM_DISTANCE = 3.4;
const RETURN_DISTANCE = 4.8;

const clampDistance = (value: number) => Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, value));

const STYLE_KEY = 'sentinel_globe_style';

function readStoredStyle(): MapStyle {
  try {
    const stored = window.localStorage.getItem(STYLE_KEY);
    if (stored === 'satellite' || stored === 'night' || stored === 'blueprint') return stored;
  } catch {
    // Private-mode storage can throw; fall back to the vector map.
  }
  return 'blueprint';
}

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

// Transparent neon coastlines drawn on top of photographic imagery, so the
// satellite and night views still read as part of the console.
function createCoastlineTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const { width, height } = canvas;
    const project = (lon: number, lat: number): [number, number] => [
      ((lon + 180) / 360) * width,
      ((90 - lat) / 180) * height
    ];

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

    ctx.shadowColor = 'rgba(0, 255, 136, 0.8)';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.75)';
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = 'rgba(190, 255, 228, 0.55)';
    ctx.lineWidth = 0.9;
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

// Real WebGL globe (three.js): vector, satellite and night-lights mappings,
// drag-to-rotate with inertia, wheel/pinch zoom, and clickable pin sprites.
function HoloGlobe({ pins, reducedMotion, onPinClick }: HoloGlobeProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const clickRef = useRef(onPinClick);
  const [style, setStyle] = useState<MapStyle>(readStoredStyle);
  const styleRef = useRef<MapStyle>(style);
  const apiRef = useRef<{
    zoomBy?: (factor: number) => void;
    resetView?: () => void;
    setStyle?: (next: MapStyle) => void;
    openStreetLevel?: () => void;
    leaveStreetLevel?: () => void;
  }>({});
  const [localView, setLocalView] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [textureReady, setTextureReady] = useState<Record<'satellite' | 'night', boolean>>({
    satellite: false,
    night: false
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    clickRef.current = onPinClick;
  }, [onPinClick]);

  const chooseStyle = (next: MapStyle) => {
    styleRef.current = next;
    setStyle(next);
    apiRef.current.setStyle?.(next);
    try {
      window.localStorage.setItem(STYLE_KEY, next);
    } catch {
      // Preference simply won't persist.
    }
  };

  const closeStreetLevel = () => {
    apiRef.current.leaveStreetLevel?.();
    setLocalView(null);
  };

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

    const blueprintMaterial = new THREE.MeshBasicMaterial({ map: worldTexture });
    const satelliteMaterial = new THREE.MeshPhongMaterial({
      shininess: 32,
      specular: new THREE.Color(0x14343c)
    });
    const nightMaterial = new THREE.MeshBasicMaterial();

    const surface = new THREE.Mesh<THREE.SphereGeometry, THREE.Material>(
      new THREE.SphereGeometry(2, 96, 64),
      blueprintMaterial
    );
    globe.add(surface);

    scene.add(new THREE.AmbientLight(0xffffff, 0.78));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(1.4, 2.2, 5);
    scene.add(sun);

    const coastlineTexture = createCoastlineTexture();
    coastlineTexture.anisotropy = worldTexture.anisotropy;
    const coastline = new THREE.Mesh(
      new THREE.SphereGeometry(2.006, 96, 64),
      new THREE.MeshBasicMaterial({ map: coastlineTexture, transparent: true, opacity: 0, depthWrite: false })
    );
    globe.add(coastline);

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

    const textures: THREE.Texture[] = [worldTexture, coastlineTexture];
    let cancelled = false;

    const applyStyle = (name: MapStyle) => {
      // Imagery may still be downloading; keep the current material until the
      // loader calls back instead of flashing a black sphere.
      if (name === 'satellite' && !satelliteMaterial.map) return;
      if (name === 'night' && !nightMaterial.map) return;
      surface.material =
        name === 'satellite' ? satelliteMaterial : name === 'night' ? nightMaterial : blueprintMaterial;
      (coastline.material as THREE.MeshBasicMaterial).opacity = name === 'blueprint' ? 0 : 0.3;
      (wireframe.material as THREE.MeshBasicMaterial).opacity = name === 'blueprint' ? 0.045 : 0.03;
    };
    apiRef.current.setStyle = applyStyle;

    const loader = new THREE.TextureLoader();
    const loadSurfaceMap = (url: string, material: THREE.MeshBasicMaterial | THREE.MeshPhongMaterial, key: 'satellite' | 'night') => {
      const texture = loader.load(url, () => {
        if (cancelled) return;
        material.map = texture;
        material.needsUpdate = true;
        setTextureReady((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
        if (styleRef.current === key) applyStyle(key);
      });
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      textures.push(texture);
    };

    loadSurfaceMap('/globe/earth-day.jpg', satelliteMaterial, 'satellite');
    loadSurfaceMap('/globe/earth-night.png', nightMaterial, 'night');

    const specularTexture = loader.load('/globe/earth-specular.jpg', () => {
      if (cancelled) return;
      satelliteMaterial.specularMap = specularTexture;
      satelliteMaterial.needsUpdate = true;
    });
    specularTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    textures.push(specularTexture);

    applyStyle(styleRef.current);
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
    const initialYaw = yaw;
    const initialPitch = pitch;
    let velocityX = 0;
    let velocityY = 0;
    let lastInteraction = performance.now();

    let distance = DEFAULT_DISTANCE;
    let targetDistance = DEFAULT_DISTANCE;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchSpread = 0;
    const spread = () => {
      const points = [...pointers.values()];
      if (points.length < 2) return 0;
      return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    };

    // Once the camera is this close, the texture is useless; swap in tiled
    // imagery instead. The focus is the pin nearest the camera, or the
    // surface point the camera is aimed at when there are no pins.
    let streetOpen = false;
    const facingWorld = new THREE.Vector3();
    const enterStreetLevel = () => {
      if (streetOpen) return;
      streetOpen = true;

      let focusPin: GlobePin | null = null;
      let closestZ = 0.7;
      for (let index = 0; index < pinSprites.length; index += 1) {
        const pin = pins[index];
        if (!pin) continue;
        pinSprites[index].getWorldPosition(facingWorld);
        if (facingWorld.z > closestZ) {
          closestZ = facingWorld.z;
          focusPin = pin;
        }
      }

      let focus: { lat: number; lon: number; label: string };
      if (focusPin) {
        focus = { lat: focusPin.lat, lon: focusPin.lon, label: focusPin.label };
      } else {
        // Local surface point currently facing the camera: invert the globe's
        // YXZ rotation and the lat/lon -> vector3 projection above.
        const cp = Math.cos(pitch);
        const sp = Math.sin(pitch);
        const cy = Math.cos(yaw);
        const sy = Math.sin(yaw);
        const vx = -sy;
        const vy = sp * cy;
        const vz = cp * cy;
        focus = {
          lat: 90 - (Math.acos(Math.max(-1, Math.min(1, vy))) * 180) / Math.PI,
          lon: (Math.atan2(vz, -vx) * 180) / Math.PI - 180,
          label: 'View centre'
        };
      }

      targetDistance = RETURN_DISTANCE;
      lastInteraction = performance.now();
      setLocalView(focus);
    };
    apiRef.current.openStreetLevel = enterStreetLevel;
    apiRef.current.leaveStreetLevel = () => {
      streetOpen = false;
      targetDistance = RETURN_DISTANCE;
      lastInteraction = performance.now();
    };

    const nudgeZoom = (next: number) => {
      if (streetOpen) return;
      targetDistance = clampDistance(next);
      if (targetDistance <= DEEP_ZOOM_DISTANCE) enterStreetLevel();
      lastInteraction = performance.now();
    };

    apiRef.current.zoomBy = (factor: number) => {
      nudgeZoom(targetDistance * factor);
    };
    apiRef.current.resetView = () => {
      yaw = initialYaw;
      pitch = initialPitch;
      velocityX = 0;
      velocityY = 0;
      targetDistance = DEFAULT_DISTANCE;
      lastInteraction = performance.now();
    };

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
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size >= 2) {
        dragging = false;
        pinchSpread = spread();
        hideTooltip();
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
      if (pointers.has(event.pointerId)) {
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }
      if (pointers.size >= 2) {
        const nextSpread = spread();
        if (pinchSpread > 0 && nextSpread > 0) {
          nudgeZoom(targetDistance * (pinchSpread / nextSpread));
        }
        pinchSpread = nextSpread;
        lastInteraction = performance.now();
        return;
      }
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
      pointers.delete(event.pointerId);
      if (pointers.size >= 2) return;
      pinchSpread = 0;
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

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      nudgeZoom(targetDistance + event.deltaY * 0.0018);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', finishDrag);
    canvas.addEventListener('pointercancel', finishDrag);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

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

      distance += (targetDistance - distance) * 0.14;
      camera.position.z = distance;

      // Shrink pins slightly as the camera closes in, so they stay markers
      // instead of growing to cover the region under the cursor.
      const zoomComp = Math.pow(distance / DEFAULT_DISTANCE, 0.55);
      pinSprites.forEach((sprite, index) => {
        const base = pinScale[index];
        const pulse = reducedMotion ? 1 : 1 + Math.sin(elapsed * 2.4 + index * 0.7) * 0.055;
        sprite.scale.set(base.x * zoomComp * pulse, base.y * zoomComp * pulse, 1);
      });
      hitSprites.forEach((hit, index) => {
        const base = pinScale[index];
        hit.scale.set(base.x * 2.1 * zoomComp, base.y * 2.1 * zoomComp, 1);
      });

      if (!reducedMotion) ring.rotation.z = elapsed * 0.05;

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
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', finishDrag);
      canvas.removeEventListener('pointercancel', finishDrag);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('wheel', onWheel);
      apiRef.current = {};
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material?.dispose();
      });
      textures.forEach((texture) => texture.dispose());
      blueprintMaterial.dispose();
      satelliteMaterial.dispose();
      nightMaterial.dispose();
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

  const controls = (
    <>
      <div className="flex overflow-hidden border border-white/10 bg-black/70 backdrop-blur-sm">
        {MAP_STYLE_OPTIONS.map((option) => {
          const active = style === option.id;
          const pending =
            option.id === 'satellite' ? !textureReady.satellite : option.id === 'night' ? !textureReady.night : false;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => chooseStyle(option.id)}
              aria-pressed={active}
              className={`h-8 px-1.5 font-mono text-[9px] uppercase tracking-[0.06em] transition sm:h-auto sm:px-2 sm:py-1 sm:tracking-[0.16em] ${
                active
                  ? 'bg-brand-green/15 text-brand-green'
                  : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-200'
              }`}
            >
              {option.label}
              {pending ? (
                <span className="ml-1 inline-block h-1 w-1 animate-pulse rounded-full bg-brand-cyan align-middle" />
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="flex overflow-hidden border border-white/10 bg-black/70 backdrop-blur-sm">
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => apiRef.current.zoomBy?.(1.25)}
          className="flex h-8 w-7 items-center justify-center border-l border-white/10 text-slate-400 transition first:border-l-0 hover:bg-white/[0.06] hover:text-brand-green sm:h-6 sm:w-7"
        >
          <Minus size={12} />
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => apiRef.current.zoomBy?.(0.8)}
          className="flex h-8 w-7 items-center justify-center border-l border-white/10 text-slate-400 transition hover:bg-white/[0.06] hover:text-brand-green sm:h-6 sm:w-7"
        >
          <Plus size={12} />
        </button>
        <button
          type="button"
          aria-label="Reset view"
          onClick={() => apiRef.current.resetView?.()}
          className="flex h-8 w-7 items-center justify-center border-l border-white/10 text-slate-400 transition hover:bg-white/[0.06] hover:text-brand-green sm:h-6 sm:w-7"
        >
          <RotateCcw size={12} />
        </button>
        <button
          type="button"
          aria-label="Open street-level imagery"
          title="Street-level imagery"
          onClick={() => apiRef.current.openStreetLevel?.()}
          className="flex h-8 w-7 items-center justify-center border-l border-white/10 text-slate-400 transition hover:bg-white/[0.06] hover:text-brand-cyan sm:h-6 sm:w-7"
        >
          <LocateFixed size={12} />
        </button>
      </div>
    </>
  );

  return (
    <div className="relative flex h-full w-full min-w-0 flex-col overflow-hidden" aria-label="Interactive device location globe" role="img">
      {/* Phones: controls sit in their own row so they never cover the sphere. */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1.5 pb-1.5 sm:hidden">{controls}</div>
      <div className="relative min-h-0 flex-1">
        <div ref={mountRef} className="h-full w-full" />
        <div
          ref={tooltipRef}
          className="pointer-events-none absolute left-0 top-0 z-10 whitespace-nowrap border border-brand-green/40 bg-black/85 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-brand-green opacity-0 transition-opacity duration-150"
        />
        <div className="pointer-events-none absolute bottom-1 right-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-slate-500 sm:hidden">
          <span className="h-1.5 w-1.5 bg-brand-green" />
          tap a pin
        </div>
      </div>
      <div className="absolute right-2 top-2 z-20 hidden flex-col items-end gap-1.5 sm:flex">{controls}</div>
      <div className="pointer-events-none absolute bottom-2 right-2 hidden items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500 sm:flex">
        <span className="h-1.5 w-1.5 bg-brand-green" />
        drag · zoom to street level · click a pin
      </div>

      {localView ? (
        <div className="absolute inset-0 z-30 flex flex-col overflow-hidden bg-[#020906]">
          <div className="flex items-center justify-between gap-2 border-b border-brand-cyan/25 px-2 py-1.5">
            <p className="min-w-0 truncate font-mono text-[9px] uppercase tracking-[0.16em] text-brand-cyan">
              <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand-cyan align-middle" />
              Street level · {localView.label}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500 sm:inline">
                {localView.lat.toFixed(4)}, {localView.lon.toFixed(4)}
              </span>
              <button
                type="button"
                onClick={closeStreetLevel}
                className="flex min-h-[26px] items-center gap-1 border border-brand-green/40 px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-brand-green transition hover:bg-brand-green/15"
              >
                <Globe2 size={11} />
                Globe
              </button>
            </div>
          </div>
          <div className="relative min-h-0 flex-1">
            <EmbeddedMap
              lat={localView.lat}
              lon={localView.lon}
              label={localView.label}
              zoom={19}
              defaultProvider="console"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default HoloGlobe;
