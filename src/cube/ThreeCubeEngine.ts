import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { cubeAudio } from './audio';
import {
  applyMove,
  computeMoveFromSwipe,
  createSolvedCube,
  getLayerCoordinates,
  getPuzzleSize,
  isCubeSolved,
  parseNotation,
} from './cubeLogic';
import { computeSnapshotDimensions } from './snapshot';
import {
  computeLayerLocalCenter,
  computeTurnAcousticProfile,
  type SpatialAcousticProfile,
  type SpatialListenerPose,
  type Vec3,
} from './spatialAudio';
import { THEMES } from './themes';
import type {
  Axis,
  CubeMove,
  CubieState,
  FaceKey,
  GameState,
  PuzzleType,
  ThemeId,
  ThemePalette,
} from './types';

export interface EngineCallbacks {
  onMoveApplied: (move: CubeMove, isSolved: boolean, isFromQueue: boolean) => void;
  onQueueEmpty: (isSolved: boolean) => void;
}

interface ActiveTurn {
  move: CubeMove;
  isFromQueue: boolean;
  elapsed: number;
  duration: number;
  totalAngle: number;
  axisVec: THREE.Vector3;
  cubieGroups: THREE.Group[];
  pivot: THREE.Group;
  slidePlayed: boolean;
  firstClickPlayed: boolean;
  secondClickPlayed: boolean;
  turnSpeed: number;
}

interface ParticleSlot {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  rotVel: THREE.Vector3;
  scale: number;
  life: number;
  maxLife: number;
}

interface CubieVisual {
  id: number;
  group: THREE.Group;
  homePos: THREE.Vector3;
  currentGrid: [number, number, number];
  /** Radial direction used for Exploded View and Morph Assembly */
  explodeDir: THREE.Vector3;
  morphDelay: number;
  /** Offset from grid center for Mirror Blocks */
  baseLocalPos: THREE.Vector3;
}

const PARTICLE_COUNT = 84;
const AMBIENT_MOTE_COUNT = 18;

// Pre-allocated scratch math objects (zero GC in render loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _m4 = new THREE.Matrix4();
const _s1 = new THREE.Vector3();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);
const _axisZ = new THREE.Vector3(0, 0, 1);
const _camForward = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _layerLocalPos = new THREE.Vector3();
const _layerWorldPos = new THREE.Vector3();
const _cubeWorldPos = new THREE.Vector3();

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createRoundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width * 0.45, height * 0.45);
  s.moveTo(x + r, y);
  s.lineTo(x + width - r, y);
  s.quadraticCurveTo(x + width, y, x + width, y + r);
  s.lineTo(x + width, y + height - r);
  s.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  s.lineTo(x + r, y + height);
  s.quadraticCurveTo(x, y + height, x, y + height - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function createMicroGrainTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 120 + Math.floor(Math.random() * 24);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createBrushedMetalTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#c8ccd2';
  ctx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y++) {
    const shade = 188 + Math.floor(Math.sin(y * 0.35) * 10 + (Math.random() - 0.5) * 28);
    ctx.fillStyle = `rgb(${shade}, ${shade + 1}, ${shade + 3})`;
    ctx.fillRect(0, y, 256, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 124);
  grad.addColorStop(0, 'rgba(10, 12, 18, 0.85)');
  grad.addColorStop(0.45, 'rgba(10, 12, 18, 0.38)');
  grad.addColorStop(0.78, 'rgba(10, 12, 18, 0.08)');
  grad.addColorStop(1, 'rgba(10, 12, 18, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function easeOutMagnetic(t: number): number {
  // Snappy magnetic speedcube turn with subtle 3% detent overshoot
  if (t >= 1) return 1;
  const c1 = 1.15;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

export class ThreeCubeEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private isSoftwareGl: boolean;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;

  // Lighting
  private keyLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;

  // Scene hierarchy
  private stageRoot: THREE.Group;
  private cubeHolder: THREE.Group;
  private cubeRoot: THREE.Group;
  private coreGroup: THREE.Group;
  private guideArrowGroup: THREE.Group;
  private contactShadow: THREE.Mesh;
  private studioRing: THREE.Mesh;

  // Shared procedural resources
  private microGrainTex: THREE.CanvasTexture;
  private brushedMetalTex: THREE.CanvasTexture;
  private shadowTex: THREE.CanvasTexture;
  private chassisMat: THREE.MeshStandardMaterial;
  private coreMetalMat: THREE.MeshStandardMaterial;
  private collarMetalMat: THREE.MeshStandardMaterial;
  private mirrorTileMat: THREE.MeshPhysicalMaterial;
  private faceMaterials: Record<FaceKey, THREE.MeshPhysicalMaterial>;
  private guideArrowMat: THREE.MeshStandardMaterial;
  private ringMat: THREE.MeshStandardMaterial;
  private shadowMat: THREE.MeshBasicMaterial;
  private particleMat: THREE.MeshStandardMaterial;

  // Pooled particles (InstancedMesh)
  private particleMesh: THREE.InstancedMesh;
  private particles: ParticleSlot[] = [];
  private particleCursor = 0;

  // State
  private puzzleType: PuzzleType = '3x3';
  private activePalette: ThemePalette = THEMES.atelier;
  private gameState: GameState = 'title';
  private cubieStates: CubieState[] = [];
  private cubieVisuals: Map<number, CubieVisual> = new Map();
  private pickableMeshes: THREE.Object3D[] = [];

  // Animation state
  private activeTurn: ActiveTurn | null = null;
  private moveQueue: { move: CubeMove; isFromQueue: boolean; speedMultiplier?: number }[] = [];
  private turnDurationBase = 0.24; // seconds for 90 deg
  private explodeTarget = 0;
  private explodeCurrent = 0;
  private morphProgress = 0; // 1 -> 0 on puzzle switch
  private victoryWaveTime = 0;
  private recoilY = 0;
  private recoilVel = 0;
  private ringPulse = 0;
  private pointerParallaxX = 0;
  private pointerParallaxY = 0;
  private titleAutoMoveTimer = 1.6;
  private titleShowcaseIndex = 0;

  // Camera transition
  private cameraTargetPos = new THREE.Vector3(4.8, 3.8, 5.4);
  private cameraTargetLook = new THREE.Vector3(-1.1, 0, 0);
  private isCameraLerping = true;
  private hasUserOrbited = false;

  // Interaction (swipe-to-turn + multi-touch pinch safety)
  private raycaster = new THREE.Raycaster();
  private pointerDownPos = new THREE.Vector2();
  private activePointers = new Set<number>();
  private swipePointerId: number | null = null;
  private swipeActive = false;
  private layerDragLocked = false;
  private layerDragPointerId: number | null = null;
  private swipeHitCubieId: number | null = null;
  private swipeHitNormal = new THREE.Vector3();
  private swipeHitPoint = new THREE.Vector3();

  // Loop
  private frameId = 0;
  private disposed = false;
  private lastTime = performance.now();
  private resizeObserver: ResizeObserver;

  constructor(
    container: HTMLElement,
    callbacks: EngineCallbacks,
    initialTheme: ThemePalette | ThemeId = 'atelier'
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.activePalette = typeof initialTheme === 'string' ? THEMES[initialTheme] : initialTheme;
    this.isSoftwareGl = detectSoftwareGl();

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    // Scene & Studio Environment
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Camera
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    this.camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    this.camera.position.set(5.2, 4.0, 5.8);

    // OrbitControls (Desktop mouse + native Mobile/Tablet 1-finger orbit & 2-finger pinch zoom)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableZoom = true;
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_ROTATE,
    };
    this.controls.minDistance = 4.4;
    this.controls.maxDistance = 20.5;
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.rotateSpeed = 0.78;
    this.controls.addEventListener('start', () => {
      this.isCameraLerping = false;
      this.hasUserOrbited = true;
    });

    // WebGL context safety listeners
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost, false);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored, false);

    // 3-Point Studio Lighting Rig
    this.hemiLight = new THREE.HemisphereLight(0xe6effc, 0xd8d3c8, 1.05);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfff7eb, 2.3);
    this.keyLight.position.set(6.5, 9.5, 7.2);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 1;
    this.keyLight.shadow.camera.far = 26;
    const d = 4.5;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight(0xdbeafe, 1.2);
    this.rimLight.position.set(-7, 4.5, -6.5);
    this.scene.add(this.rimLight);

    // Procedural Textures
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.microGrainTex = createMicroGrainTexture();
    this.microGrainTex.anisotropy = maxAniso;

    this.brushedMetalTex = createBrushedMetalTexture();
    this.brushedMetalTex.anisotropy = maxAniso;

    this.shadowTex = createContactShadowTexture();

    // Shared PBR Materials
    const theme = this.activePalette.scene;
    this.chassisMat = new THREE.MeshStandardMaterial({
      color: theme.chassisColor,
      roughness: theme.chassisRoughness,
      metalness: theme.chassisMetalness,
      bumpMap: this.microGrainTex,
      bumpScale: 0.004,
    });

    this.coreMetalMat = new THREE.MeshStandardMaterial({
      color: theme.coreMetalColor,
      roughness: 0.24,
      metalness: 0.88,
    });

    this.collarMetalMat = new THREE.MeshStandardMaterial({
      color: 0x3b3f4a,
      roughness: 0.28,
      metalness: 0.82,
    });

    this.mirrorTileMat = new THREE.MeshPhysicalMaterial({
      color: theme.mirrorColor,
      map: this.brushedMetalTex,
      bumpMap: this.brushedMetalTex,
      bumpScale: 0.008,
      roughness: 0.22,
      metalness: 0.86,
      clearcoat: 0.65,
      clearcoatRoughness: 0.16,
    });

    const faceKeys: FaceKey[] = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
    this.faceMaterials = {} as Record<FaceKey, THREE.MeshPhysicalMaterial>;
    for (const fk of faceKeys) {
      this.faceMaterials[fk] = new THREE.MeshPhysicalMaterial({
        color: theme.faceColors[fk],
        roughness: theme.tileRoughness,
        metalness: theme.tileMetalness,
        clearcoat: theme.tileClearcoat,
        clearcoatRoughness: 0.14,
        envMapIntensity: 0.42,
        bumpMap: this.microGrainTex,
        bumpScale: 0.002,
      });
    }

    this.guideArrowMat = new THREE.MeshStandardMaterial({
      color: theme.particleColor,
      emissive: theme.particleColor,
      emissiveIntensity: 0.55,
      roughness: 0.22,
      metalness: 0.35,
      transparent: true,
      opacity: 0.92,
    });

    this.ringMat = new THREE.MeshStandardMaterial({
      color: theme.ringColor,
      roughness: 0.45,
      metalness: 0.35,
      transparent: true,
      opacity: 0.65,
    });

    this.shadowMat = new THREE.MeshBasicMaterial({
      map: this.shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: theme.shadowOpacity,
    });

    this.particleMat = new THREE.MeshStandardMaterial({
      color: theme.particleColor,
      emissive: theme.particleColor,
      emissiveIntensity: 0.35,
      roughness: 0.2,
      metalness: 0.5,
    });

    // Scene Hierarchy
    this.stageRoot = new THREE.Group();
    this.scene.add(this.stageRoot);

    this.cubeHolder = new THREE.Group();
    this.stageRoot.add(this.cubeHolder);

    this.cubeRoot = new THREE.Group();
    this.cubeHolder.add(this.cubeRoot);

    this.coreGroup = this.buildSpiderCore();
    this.cubeHolder.add(this.coreGroup);

    this.guideArrowGroup = new THREE.Group();
    this.guideArrowGroup.visible = false;
    this.cubeHolder.add(this.guideArrowGroup);

    // Contact Shadow & Architectural Studio Reference Ring
    this.contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), this.shadowMat);
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = -2.42;
    this.stageRoot.add(this.contactShadow);

    this.studioRing = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.014, 12, 72), this.ringMat);
    this.studioRing.rotation.x = Math.PI / 2;
    this.studioRing.position.y = -2.4;
    this.stageRoot.add(this.studioRing);

    // Pooled InstancedMesh Particle System (Zero-GC)
    const shardGeo = new THREE.OctahedronGeometry(0.06, 0);
    this.particleMesh = new THREE.InstancedMesh(shardGeo, this.particleMat, PARTICLE_COUNT);
    this.particleMesh.frustumCulled = false;
    this.stageRoot.add(this.particleMesh);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const isAmbient = i < AMBIENT_MOTE_COUNT;
      const angle = (i / AMBIENT_MOTE_COUNT) * Math.PI * 2;
      const radius = 3.6 + (i % 5) * 0.55;
      this.particles.push({
        active: isAmbient,
        pos: new THREE.Vector3(
          Math.cos(angle) * radius,
          -1.4 + ((i * 1.37) % 3.2),
          Math.sin(angle) * radius
        ),
        vel: new THREE.Vector3(0, 0.08 + (i % 3) * 0.04, 0),
        rot: new THREE.Euler(i * 0.5, i * 0.7, 0),
        rotVel: new THREE.Vector3(0.4, 0.6, 0.3),
        scale: isAmbient ? 0.35 + (i % 4) * 0.12 : 0,
        life: 0,
        maxLife: 1,
      });
    }

    // Apply Theme & Build Initial 3x3 Cube
    this.applyTheme(this.activePalette);
    this.loadPuzzle('3x3', false);
    this.handleResize();
    this.updateCameraFraming('title', true);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Event bindings
    this.bindPointerEvents();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    // Start render loop
    this.lastTime = performance.now();
    this.scheduleNextFrame();
  }

  /**
   * Builds the internal 6-axis machined metallic spider core (composite 13-part Group)
   * revealed dramatically when users open the Exploded View slider.
   */
  private buildSpiderCore(): THREE.Group {
    const group = new THREE.Group();
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 16), this.coreMetalMat);
    group.add(hub);

    const axleGeo = new THREE.CylinderGeometry(0.085, 0.085, 1.55, 14);
    const capGeo = new THREE.CylinderGeometry(0.18, 0.16, 0.12, 16);
    const ringGeo = new THREE.TorusGeometry(0.14, 0.025, 8, 18);

    const axes: [THREE.Vector3, THREE.Euler][] = [
      [new THREE.Vector3(1, 0, 0), new THREE.Euler(0, 0, Math.PI / 2)],
      [new THREE.Vector3(0, 1, 0), new THREE.Euler(0, 0, 0)],
      [new THREE.Vector3(0, 0, 1), new THREE.Euler(Math.PI / 2, 0, 0)],
    ];

    for (const [dir, euler] of axes) {
      const axle = new THREE.Mesh(axleGeo, this.coreMetalMat);
      axle.rotation.copy(euler);
      group.add(axle);

      for (const sign of [-1, 1]) {
        const cap = new THREE.Mesh(capGeo, this.collarMetalMat);
        cap.position.copy(dir).multiplyScalar(sign * 0.78);
        cap.rotation.copy(euler);
        group.add(cap);

        const ring = new THREE.Mesh(ringGeo, this.coreMetalMat);
        ring.position.copy(dir).multiplyScalar(sign * 0.56);
        ring.rotation.copy(euler);
        ring.rotateX(Math.PI / 2);
        group.add(ring);
      }
    }

    return group;
  }

  /**
   * Builds a composite multi-part cubie (rounded beveled chassis + internal metallic collar + raised beveled clearcoat tiles).
   */
  private buildCubieGroup(cubie: CubieState, unitScale: number, isMirror: boolean): THREE.Group {
    const group = new THREE.Group();
    group.userData.cubieId = cubie.id;

    const gap = isMirror ? 0.042 : 0.048;
    const sx = cubie.dimensions[0] * unitScale - gap;
    const sy = cubie.dimensions[1] * unitScale - gap;
    const sz = cubie.dimensions[2] * unitScale - gap;

    const bevel = Math.min(sx, sy, sz) * 0.095;
    const cornerR = Math.min(sx, sy) * 0.13;

    // 1. Primary Silhouette: Beveled rounded extruded chassis
    const bodyShape = createRoundedRectShape(sx - bevel * 2, sy - bevel * 2, cornerR);
    const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
      depth: Math.max(0.05, sz - bevel * 2),
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
      curveSegments: 2,
    });
    bodyGeo.center();

    const bodyMesh = new THREE.Mesh(bodyGeo, this.chassisMat);
    bodyMesh.castShadow = !this.isSoftwareGl;
    bodyMesh.receiveShadow = !this.isSoftwareGl;
    bodyMesh.userData.cubieId = cubie.id;
    group.add(bodyMesh);
    this.pickableMeshes.push(bodyMesh);

    // 2. Secondary Mechanical Detail: Internal magnetic collar stud facing origin
    const innerCollarGeo = new THREE.CylinderGeometry(
      Math.min(sx, sy, sz) * 0.16,
      Math.min(sx, sy, sz) * 0.19,
      Math.min(sx, sy, sz) * 0.12,
      10
    );
    const innerCollar = new THREE.Mesh(innerCollarGeo, this.collarMetalMat);
    const dirToCenter = new THREE.Vector3(-cubie.home[0], -cubie.home[1], -cubie.home[2]).normalize();
    innerCollar.position.copy(dirToCenter).multiplyScalar(Math.min(sx, sy, sz) * 0.36);
    innerCollar.quaternion.setFromUnitVectors(_axisY, dirToCenter);
    group.add(innerCollar);

    // 3. Accent Hero Detail: Elevated rounded beveled outer sticker/metal tiles
    const tileInset = Math.min(sx, sy, sz) * 0.11;
    const tileDepth = 0.018;
    const tileBevel = 0.012;

    const addFaceTile = (face: FaceKey, colorKey: FaceKey) => {
      let tw = sx - tileInset * 2;
      let th = sy - tileInset * 2;
      const offset = new THREE.Vector3();
      const rot = new THREE.Euler();

      if (face === 'px' || face === 'nx') {
        tw = sz - tileInset * 2;
        th = sy - tileInset * 2;
        offset.set((face === 'px' ? 1 : -1) * (sx / 2 + 0.004), 0, 0);
        rot.set(0, face === 'px' ? Math.PI / 2 : -Math.PI / 2, 0);
      } else if (face === 'py' || face === 'ny') {
        tw = sx - tileInset * 2;
        th = sz - tileInset * 2;
        offset.set(0, (face === 'py' ? 1 : -1) * (sy / 2 + 0.004), 0);
        rot.set(face === 'py' ? -Math.PI / 2 : Math.PI / 2, 0, 0);
      } else {
        tw = sx - tileInset * 2;
        th = sy - tileInset * 2;
        offset.set(0, 0, (face === 'pz' ? 1 : -1) * (sz / 2 + 0.004));
        rot.set(0, face === 'pz' ? 0 : Math.PI, 0);
      }

      const safeW = Math.max(0.08, tw);
      const safeH = Math.max(0.08, th);
      const tileShape = createRoundedRectShape(safeW, safeH, Math.min(safeW, safeH) * 0.14);
      const tileGeo = new THREE.ExtrudeGeometry(tileShape, {
        depth: tileDepth,
        bevelEnabled: true,
        bevelThickness: tileBevel,
        bevelSize: tileBevel,
        bevelSegments: 1,
        curveSegments: 2,
      });
      tileGeo.center();

      const mat = isMirror ? this.mirrorTileMat : this.faceMaterials[colorKey];
      const tileMesh = new THREE.Mesh(tileGeo, mat);
      tileMesh.position.copy(offset);
      tileMesh.rotation.copy(rot);
      tileMesh.userData.cubieId = cubie.id;
      group.add(tileMesh);
      this.pickableMeshes.push(tileMesh);
    };

    for (const [face, colorKey] of Object.entries(cubie.stickers) as [FaceKey, FaceKey][]) {
      addFaceTile(face, colorKey);
    }

    return group;
  }

  private clearCubeMeshes() {
    this.activeTurn = null;
    this.moveQueue = [];
    this.pickableMeshes = [];
    this.cubieVisuals.clear();

    while (this.cubeRoot.children.length > 0) {
      const child = this.cubeRoot.children[0];
      child.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          (obj as THREE.Mesh).geometry.dispose();
        }
      });
      this.cubeRoot.remove(child);
    }
  }

  /**
   * Loads a puzzle type (2x2, 3x3, 4x4, or Mirror Blocks) with optional explosive magnetic morph animation.
   */
  public loadPuzzle(puzzleType: PuzzleType, animateMorph = true) {
    this.clearCubeMeshes();
    this.puzzleType = puzzleType;
    this.cubieStates = createSolvedCube(puzzleType);
    this.clearGuideArrow();

    const size = getPuzzleSize(puzzleType);
    const isMirror = puzzleType === 'mirror';
    // Normalize visual cube span to ~2.75 world units across all puzzle types!
    const unitScale = isMirror ? 0.92 : 2.75 / size;

    // Scale internal spider core cleanly to fit inside the puzzle
    const coreScale = puzzleType === '2x2' ? 0.72 : puzzleType === '4x4' ? 0.92 : 0.85;
    this.coreGroup.scale.setScalar(coreScale);

    for (let i = 0; i < this.cubieStates.length; i++) {
      const cubie = this.cubieStates[i];
      const group = this.buildCubieGroup(cubie, unitScale, isMirror);
      const basePos = new THREE.Vector3(
        cubie.homeCenter[0] * unitScale,
        cubie.homeCenter[1] * unitScale,
        cubie.homeCenter[2] * unitScale
      );
      group.position.copy(basePos);
      this.cubeRoot.add(group);

      const explodeDir = basePos.clone();
      if (explodeDir.lengthSq() < 0.001) explodeDir.set(0, 1, 0);
      else explodeDir.normalize();

      this.cubieVisuals.set(cubie.id, {
        id: cubie.id,
        group,
        homePos: basePos.clone(),
        currentGrid: [...cubie.pos],
        explodeDir,
        morphDelay: (i % 9) * 0.035,
        baseLocalPos: basePos.clone(),
      });
    }

    if (animateMorph) {
      this.morphProgress = 1.0;
      this.emitBurst(new THREE.Vector3(0, 0, 0), 22, 2.8);
      cubeAudio.playMorphWhoosh(this.getCubeWorldCoords());
    } else {
      this.morphProgress = 0;
    }
  }

  /**
   * Loads an arbitrary validated 3x3 CubieState[] (e.g., from the physical Smart Hint camera scanner)
   * directly onto the 3D stage with exact sticker colors and cubie coordinates.
   */
  public loadCubieStates(states: CubieState[], animateMorph = true) {
    this.clearCubeMeshes();
    this.puzzleType = '3x3';
    this.cubieStates = states.map((c) => ({
      ...c,
      home: [...c.home],
      pos: [...c.pos],
      stickers: { ...c.stickers },
      dimensions: [...c.dimensions],
      homeCenter: [...c.pos],
      rotMatrix: [...c.rotMatrix],
    }));
    this.clearGuideArrow();

    const size = getPuzzleSize('3x3');
    const unitScale = 2.75 / size;
    this.coreGroup.scale.setScalar(0.85);

    for (let i = 0; i < this.cubieStates.length; i++) {
      const cubie = this.cubieStates[i];
      const group = this.buildCubieGroup(cubie, unitScale, false);
      const basePos = new THREE.Vector3(
        cubie.pos[0] * unitScale,
        cubie.pos[1] * unitScale,
        cubie.pos[2] * unitScale
      );
      group.position.copy(basePos);
      this.cubeRoot.add(group);

      const explodeDir = basePos.clone();
      if (explodeDir.lengthSq() < 0.001) explodeDir.set(0, 1, 0);
      else explodeDir.normalize();

      this.cubieVisuals.set(cubie.id, {
        id: cubie.id,
        group,
        homePos: basePos.clone(),
        currentGrid: [...cubie.pos],
        explodeDir,
        morphDelay: (i % 9) * 0.035,
        baseLocalPos: basePos.clone(),
      });
    }

    if (animateMorph) {
      this.morphProgress = 1.0;
      this.emitBurst(new THREE.Vector3(0, 0, 0), 22, 2.8);
      cubeAudio.playMorphWhoosh(this.getCubeWorldCoords());
    } else {
      this.morphProgress = 0;
      this.ringPulse = 0.85;
      cubeAudio.playMorphWhoosh(this.getCubeWorldCoords());
    }
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Switches between built-in Figma themes and custom user sticker palettes in real time.
   */
  public applyTheme(themeOrId: ThemePalette | ThemeId) {
    const palette = typeof themeOrId === 'string' ? THEMES[themeOrId] : themeOrId;
    this.activePalette = palette;
    const t = palette.scene;

    this.scene.background = new THREE.Color(t.background);
    this.scene.fog = new THREE.FogExp2(t.fogColor, t.fogDensity);

    this.keyLight.color.setHex(t.keyLightColor);
    this.keyLight.intensity = t.keyLightIntensity;
    this.hemiLight.color.setHex(t.hemiSkyColor);
    this.hemiLight.groundColor.setHex(t.hemiGroundColor);
    this.hemiLight.intensity = t.hemiIntensity;
    this.rimLight.color.setHex(t.rimLightColor);
    this.rimLight.intensity = t.rimLightIntensity;

    this.chassisMat.color.setHex(t.chassisColor);
    this.chassisMat.roughness = t.chassisRoughness;
    this.chassisMat.metalness = t.chassisMetalness;
    this.coreMetalMat.color.setHex(t.coreMetalColor);

    this.mirrorTileMat.color.setHex(t.mirrorColor);
    this.ringMat.color.setHex(t.ringColor);
    this.shadowMat.opacity = t.shadowOpacity;
    this.particleMat.color.setHex(t.particleColor);
    this.particleMat.emissive.setHex(t.particleColor);
    this.guideArrowMat.color.setHex(t.particleColor);
    this.guideArrowMat.emissive.setHex(t.particleColor);

    for (const fk of Object.keys(t.faceColors) as FaceKey[]) {
      const m = this.faceMaterials[fk];
      m.color.setHex(t.faceColors[fk]);
      m.roughness = t.tileRoughness;
      m.metalness = t.tileMetalness;
      m.clearcoat = t.tileClearcoat;
    }
  }

  public setGameState(state: GameState) {
    const prev = this.gameState;
    this.gameState = state;
    this.controls.enabled = state === 'playing';
    if (prev !== state) {
      if (prev === 'title' || state === 'title') {
        this.hasUserOrbited = false;
      }
      this.updateCameraFraming(state, false, false);
    }
  }

  public updateCameraFraming(state: GameState, immediate = false, preserveOrbit = false) {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    const aspect = Math.max(this.camera.aspect || width / height, 0.25);
    const isPortrait = aspect < 0.96;
    const isCompactMobilePortrait = aspect < 0.68;
    const isShortLandscape = !isPortrait && height < 520;

    if (state === 'title') {
      if (isPortrait) {
        // Place hero cube cleanly in upper half above the bottom-anchored mobile/tablet title card
        const portraitScale = Math.max(isCompactMobilePortrait ? 1.44 : 1.24, 1.04 / Math.max(aspect, 0.44));
        this.cameraTargetPos.set(4.8 * portraitScale, 3.6 * portraitScale, 5.8 * portraitScale);
        this.cameraTargetLook.set(0, isCompactMobilePortrait ? -1.32 : -1.05, 0);
      } else if (isShortLandscape) {
        this.cameraTargetPos.set(6.5, 4.4, 7.2);
        this.cameraTargetLook.set(-1.55, -0.05, 0);
      } else {
        // Place hero cube cleanly in right 55% with full margins above/below (Desktop unchanged)
        this.cameraTargetPos.set(6.0, 4.3, 6.8);
        this.cameraTargetLook.set(-1.45, -0.08, 0);
      }
    } else {
      // Exact bounding-sphere framing for dedicated non-overlapping 3D stage on every device & aspect ratio.
      // Accounts for cube corner diagonals (~2.38), 3D guide arrow arc (~2.25), plinth ring, and Exploded View.
      const halfVFov = THREE.MathUtils.degToRad(this.camera.fov) * 0.5;
      const halfHFov = Math.atan(Math.tan(halfVFov) * aspect);
      const explodeFactor = 1 + this.explodeTarget * 0.36;
      const boundingRadiusV = 2.58 * explodeFactor;
      const boundingRadiusH = 2.48 * explodeFactor;

      const distV = boundingRadiusV / Math.sin(halfVFov);
      const distH = boundingRadiusH / Math.sin(halfHFov);
      const targetDistance = THREE.MathUtils.clamp(Math.max(distV, distH), 7.8, 18.8);

      // Center cleanly on the cube + subtle plinth ring with balanced margins above and below
      this.cameraTargetLook.set(0, -0.18, 0);

      // Preserve user's current orbit viewing angle on layout resize (e.g., collapsing/expanding side panel)
      const dir = _v1.set(4.6, 3.45, 5.4).normalize();
      if (preserveOrbit) {
        const currentOffset = _v2.copy(this.camera.position).sub(this.controls.target);
        if (currentOffset.lengthSq() > 0.01) {
          dir.copy(currentOffset).normalize();
        }
      }
      this.cameraTargetPos.copy(this.cameraTargetLook).addScaledVector(dir, targetDistance);
    }

    if (immediate) {
      this.camera.position.copy(this.cameraTargetPos);
      this.controls.target.copy(this.cameraTargetLook);
      this.controls.update();
      this.isCameraLerping = false;
    } else {
      this.isCameraLerping = true;
    }
  }

  public resetCamera() {
    this.hasUserOrbited = false;
    this.updateCameraFraming(this.gameState, false, false);
  }

  public setExplodeAmount(amount: number) {
    this.explodeTarget = THREE.MathUtils.clamp(amount, 0, 1);
    if (this.gameState === 'playing') {
      this.updateCameraFraming('playing', false, true);
    }
  }

  public setTurnSpeed(speedMultiplier: number) {
    // speedMultiplier in [0.5, 2.2]
    this.turnDurationBase = 0.25 / THREE.MathUtils.clamp(speedMultiplier, 0.5, 2.5);
  }

  public enqueueMove(move: CubeMove, isFromQueue = false, speedMultiplier = 1) {
    this.moveQueue.push({ move, isFromQueue, speedMultiplier });
  }

  public enqueueMoves(moves: CubeMove[], speedMultiplier = 1) {
    for (const m of moves) {
      this.moveQueue.push({ move: m, isFromQueue: true, speedMultiplier });
    }
  }

  public clearQueue() {
    this.moveQueue = [];
  }

  /**
   * Returns a safe deep-cloned snapshot of the current 3D cubie state array
   * so state-based method solvers (Beginner, CFOP, Roux, ZZ/ZOLL) inspect exact stickers.
   */
  public getCubieStates(): CubieState[] {
    return this.cubieStates.map((c) => ({
      ...c,
      home: [...c.home] as [number, number, number],
      pos: [...c.pos] as [number, number, number],
      stickers: { ...c.stickers },
      dimensions: [...c.dimensions] as [number, number, number],
      homeCenter: [...c.homeCenter] as [number, number, number],
      rotMatrix: [...c.rotMatrix] as CubieState['rotMatrix'],
    }));
  }

  /**
   * Instantly applies a sequence of setup moves without waiting for animation
   * (used to stage lesson cases cleanly with a crisp morph pop).
   */
  public applySetupInstantly(notations: string[]) {
    this.loadPuzzle(this.puzzleType, false);
    for (const token of notations) {
      const move = parseNotation(token, this.puzzleType);
      if (!move) continue;
      this.applyMoveInstantVisual(move);
    }
    this.morphProgress = 0.55;
    cubeAudio.playMorphWhoosh(this.getCubeWorldCoords());
  }

  private applyMoveInstantVisual(move: CubeMove) {
    const axisIdx = move.axis === 'x' ? 0 : move.axis === 'y' ? 1 : 2;
    const axisVec = move.axis === 'x' ? _axisX : move.axis === 'y' ? _axisY : _axisZ;
    const angle = move.direction * move.turns * (Math.PI / 2);
    const q = new THREE.Quaternion().setFromAxisAngle(axisVec, angle);

    for (const vis of this.cubieVisuals.values()) {
      const coord = vis.currentGrid[axisIdx];
      if (move.layers.some((l) => Math.abs(l - coord) < 0.01)) {
        vis.baseLocalPos.applyQuaternion(q);
        vis.group.position.copy(vis.baseLocalPos);
        vis.group.quaternion.premultiply(q);
        vis.explodeDir.copy(vis.baseLocalPos).normalize();
      }
    }

    this.cubieStates = applyMove(this.cubieStates, move);
    for (const c of this.cubieStates) {
      const vis = this.cubieVisuals.get(c.id);
      if (vis) vis.currentGrid = [...c.pos];
    }
  }

  /**
   * Displays a glowing 3D curved arc arrow hovering around the exact layer for the hinted move.
   */
  public showGuideArrow(move: CubeMove | null) {
    this.clearGuideArrow();
    if (!move) return;

    const avgLayer = move.layers.reduce((acc, v) => acc + v, 0) / move.layers.length;
    const size = getPuzzleSize(this.puzzleType);
    const unitScale = this.puzzleType === 'mirror' ? 0.92 : 2.75 / size;
    const isWholeCube = move.layers.length === size;
    const isMiddleSlice = !isWholeCube && Math.abs(avgLayer) < 0.01;
    const layerOffset = isWholeCube ? 0 : avgLayer * unitScale;
    const radius = isWholeCube ? 2.18 : isMiddleSlice ? 2.02 : 1.92;

    // Build a 95-degree curved arc in XY plane, then orient to move.axis
    const arcSpan = (Math.PI * 0.56) * move.direction;
    const startAngle = -arcSpan * 0.5;
    const points: THREE.Vector3[] = [];
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const a = startAngle + (arcSpan * i) / steps;
      points.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.045, 8, false);
    const tubeMesh = new THREE.Mesh(tubeGeo, this.guideArrowMat);
    this.guideArrowGroup.add(tubeMesh);

    // Arrowhead cone at the tip of the arc
    const endPt = points[points.length - 1];
    const prevPt = points[points.length - 2];
    const tangent = endPt.clone().sub(prevPt).normalize();
    const coneGeo = new THREE.ConeGeometry(0.13, 0.28, 12);
    const coneMesh = new THREE.Mesh(coneGeo, this.guideArrowMat);
    coneMesh.position.copy(endPt);
    coneMesh.quaternion.setFromUnitVectors(_axisY, tangent);
    this.guideArrowGroup.add(coneMesh);

    // Orient arc around the rotation axis & shift to layer plane
    this.guideArrowGroup.position.set(0, 0, 0);
    this.guideArrowGroup.rotation.set(0, 0, 0);

    if (move.axis === 'x') {
      this.guideArrowGroup.rotation.y = Math.PI / 2;
      this.guideArrowGroup.position.x = layerOffset;
    } else if (move.axis === 'y') {
      this.guideArrowGroup.rotation.x = -Math.PI / 2;
      this.guideArrowGroup.position.y = layerOffset;
    } else {
      this.guideArrowGroup.position.z = layerOffset;
    }

    this.guideArrowGroup.visible = true;
    this.renderer.render(this.scene, this.camera);
  }

  public clearGuideArrow() {
    this.guideArrowGroup.visible = false;
    while (this.guideArrowGroup.children.length > 0) {
      const child = this.guideArrowGroup.children[0];
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).geometry.dispose();
      }
      this.guideArrowGroup.remove(child);
    }
  }

  public triggerVictoryCelebration() {
    this.victoryWaveTime = 1.8;
    this.ringPulse = 1.0;
    this.emitBurst(new THREE.Vector3(0, 0.2, 0), 54, 4.2);
    cubeAudio.playVictoryChord(this.getCubeWorldCoords());
  }

  private emitBurst(origin: THREE.Vector3, count: number, speed: number, axis?: Axis) {
    for (let i = 0; i < count; i++) {
      const idx = AMBIENT_MOTE_COUNT + (this.particleCursor % (PARTICLE_COUNT - AMBIENT_MOTE_COUNT));
      this.particleCursor++;
      const slot = this.particles[idx];
      slot.active = true;
      slot.life = 0;
      slot.maxLife = 0.5 + Math.random() * 0.45;
      slot.scale = 0.55 + Math.random() * 0.75;

      const angle = Math.random() * Math.PI * 2;
      const r = 1.15 + Math.random() * 0.55;
      if (axis === 'x') {
        slot.pos.set(origin.x, Math.cos(angle) * r, Math.sin(angle) * r);
        slot.vel.set((Math.random() - 0.5) * 0.8, Math.cos(angle) * speed, Math.sin(angle) * speed);
      } else if (axis === 'y') {
        slot.pos.set(Math.cos(angle) * r, origin.y, Math.sin(angle) * r);
        slot.vel.set(Math.cos(angle) * speed, (Math.random() - 0.5) * 0.8, Math.sin(angle) * speed);
      } else if (axis === 'z') {
        slot.pos.set(Math.cos(angle) * r, Math.sin(angle) * r, origin.z);
        slot.vel.set(Math.cos(angle) * speed, Math.sin(angle) * speed, (Math.random() - 0.5) * 0.8);
      } else {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const dirX = Math.sin(phi) * Math.cos(theta);
        const dirY = Math.sin(phi) * Math.sin(theta);
        const dirZ = Math.cos(phi);
        slot.pos.copy(origin);
        slot.vel.set(dirX * speed, dirY * speed + 0.8, dirZ * speed);
      }
      slot.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      slot.rotVel.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    }
  }

  private startNextQueuedMove() {
    if (this.activeTurn || this.moveQueue.length === 0) return;
    const item = this.moveQueue.shift()!;
    const { move, isFromQueue, speedMultiplier = 1 } = item;

    const axisIdx = move.axis === 'x' ? 0 : move.axis === 'y' ? 1 : 2;
    const axisVec = (move.axis === 'x' ? _axisX : move.axis === 'y' ? _axisY : _axisZ).clone();

    const pivot = new THREE.Group();
    this.cubeRoot.add(pivot);

    const affectedGroups: THREE.Group[] = [];
    for (const vis of this.cubieVisuals.values()) {
      const coord = vis.currentGrid[axisIdx];
      if (move.layers.some((l) => Math.abs(l - coord) < 0.01)) {
        pivot.attach(vis.group);
        affectedGroups.push(vis.group);
      }
    }

    const totalAngle = move.direction * move.turns * (Math.PI / 2);
    const duration = Math.max(0.08, (this.turnDurationBase * (move.turns === 2 ? 1.32 : 1.0)) / speedMultiplier);
    const effectiveTurnSpeed = (0.25 / Math.max(this.turnDurationBase, 0.05)) * speedMultiplier;

    this.activeTurn = {
      move,
      isFromQueue,
      elapsed: 0,
      duration,
      totalAngle,
      axisVec,
      cubieGroups: affectedGroups,
      pivot,
      slidePlayed: false,
      firstClickPlayed: false,
      secondClickPlayed: false,
      turnSpeed: effectiveTurnSpeed,
    };
  }

  private getCubeWorldCoords(): Vec3 {
    this.cubeRoot.updateWorldMatrix(true, false);
    this.cubeRoot.getWorldPosition(_cubeWorldPos);
    return [_cubeWorldPos.x, _cubeWorldPos.y, _cubeWorldPos.z];
  }

  private syncSpatialAudioListener(): SpatialListenerPose {
    this.camera.getWorldDirection(_camForward);
    _camUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion).normalize();
    const pose: SpatialListenerPose = {
      position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      forward: [_camForward.x, _camForward.y, _camForward.z],
      up: [_camUp.x, _camUp.y, _camUp.z],
    };
    cubeAudio.updateListenerPose(pose);
    return pose;
  }

  private buildTurnAcousticProfile(
    turn: ActiveTurn,
    listener: SpatialListenerPose,
    clickIndex: 0 | 1
  ): SpatialAcousticProfile {
    const unitScale = this.puzzleType === 'mirror' ? 0.92 : 2.75 / getPuzzleSize(this.puzzleType);
    this.cubeRoot.updateWorldMatrix(true, false);
    this.cubeRoot.getWorldPosition(_cubeWorldPos);

    const localCenter = computeLayerLocalCenter(
      turn.move,
      this.puzzleType,
      unitScale,
      this.explodeCurrent
    );
    _layerLocalPos.set(localCenter[0], localCenter[1], localCenter[2]);
    _layerWorldPos.copy(_layerLocalPos).applyMatrix4(this.cubeRoot.matrixWorld);

    return computeTurnAcousticProfile({
      move: turn.move,
      puzzleType: this.puzzleType,
      unitScale,
      explodeAmount: this.explodeCurrent,
      turnSpeed: turn.turnSpeed,
      cubeWorldPos: [_cubeWorldPos.x, _cubeWorldPos.y, _cubeWorldPos.z],
      layerWorldPos: [_layerWorldPos.x, _layerWorldPos.y, _layerWorldPos.z],
      listener,
      clickIndex,
    });
  }

  private finishActiveTurn() {
    const turn = this.activeTurn;
    if (!turn) return;

    turn.pivot.setRotationFromAxisAngle(turn.axisVec, turn.totalAngle);
    turn.pivot.updateMatrixWorld(true);

    const q = new THREE.Quaternion().setFromAxisAngle(turn.axisVec, turn.totalAngle);
    const unitScale = this.puzzleType === 'mirror' ? 0.92 : 2.75 / getPuzzleSize(this.puzzleType);

    for (const grp of turn.cubieGroups) {
      this.cubeRoot.attach(grp);
      const id = grp.userData.cubieId as number;
      const vis = this.cubieVisuals.get(id);
      if (vis) {
        vis.baseLocalPos.applyQuaternion(q);
        // Snap standard cube coordinates cleanly to avoid drift
        if (this.puzzleType !== 'mirror') {
          const halfStep = unitScale * 0.5;
          vis.baseLocalPos.set(
            Math.round(vis.baseLocalPos.x / halfStep) * halfStep,
            Math.round(vis.baseLocalPos.y / halfStep) * halfStep,
            Math.round(vis.baseLocalPos.z / halfStep) * halfStep
          );
        }
        vis.explodeDir.copy(vis.baseLocalPos).normalize();
      }
    }

    this.cubeRoot.remove(turn.pivot);

    // Update pure logical state
    this.cubieStates = applyMove(this.cubieStates, turn.move);
    for (const c of this.cubieStates) {
      const vis = this.cubieVisuals.get(c.id);
      if (vis) vis.currentGrid = [...c.pos];
    }

    // Subtle physical snap recoil & slice burst
    this.recoilVel = -0.65;
    this.ringPulse = Math.max(this.ringPulse, 0.55);
    const avgLayer = turn.move.layers.reduce((a, b) => a + b, 0) / turn.move.layers.length;
    const burstOrigin = new THREE.Vector3();
    if (turn.move.axis === 'x') burstOrigin.x = avgLayer * unitScale;
    else if (turn.move.axis === 'y') burstOrigin.y = avgLayer * unitScale;
    else burstOrigin.z = avgLayer * unitScale;
    this.emitBurst(burstOrigin, 10, 2.2, turn.move.axis);

    const solved = isCubeSolved(this.cubieStates, this.puzzleType);
    const wasFromQueue = turn.isFromQueue;
    const completedMove = turn.move;
    this.activeTurn = null;

    if (this.gameState === 'playing') {
      this.callbacks.onMoveApplied(completedMove, solved, wasFromQueue);
      if (this.moveQueue.length === 0) {
        this.callbacks.onQueueEmpty(solved);
      }
    }
  }

  private bindPointerEvents() {
    const dom = this.renderer.domElement;
    const container = this.container;

    const getNDC = (clientX: number, clientY: number, target: THREE.Vector2) => {
      const rect = dom.getBoundingClientRect();
      target.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      target.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const releaseLayerDragLock = () => {
      this.swipeActive = false;
      this.swipePointerId = null;
      this.swipeHitCubieId = null;
      this.layerDragLocked = false;
      this.layerDragPointerId = null;
      this.controls.enabled = this.gameState === 'playing';
    };

    // Capture-phase listener on the parent container runs strictly BEFORE OrbitControls'
    // bubble-phase listener on renderer.domElement, ensuring OrbitControls never enters
    // rotate state when the user grabs a cube layer.
    const onPointerDown = (e: PointerEvent) => {
      if (this.gameState !== 'playing') return;
      if (e.target !== dom) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;

      this.activePointers.add(e.pointerId);

      // If a second finger touches down (pinch-to-zoom / 2-finger orbit), cancel face swipe and yield to OrbitControls
      if (this.activePointers.size > 1) {
        if (this.swipeActive || this.layerDragLocked) {
          releaseLayerDragLock();
        }
        return;
      }

      const ndc = new THREE.Vector2();
      getNDC(e.clientX, e.clientY, ndc);
      this.raycaster.setFromCamera(ndc, this.camera);
      const hits = this.raycaster.intersectObjects(this.pickableMeshes, false);

      const hit = hits[0];
      const hitFace = hit?.face;
      if (hit && hitFace) {
        const cubieId = hit.object.userData.cubieId as number | undefined;
        if (cubieId !== undefined) {
          this.swipeActive = true;
          this.swipePointerId = e.pointerId;
          this.layerDragLocked = true;
          this.layerDragPointerId = e.pointerId;
          this.swipeHitCubieId = cubieId;
          this.pointerDownPos.set(e.clientX, e.clientY);
          this.swipeHitPoint.copy(hit.point);

          // Convert face normal to cubeRoot local space
          const worldNormal = hitFace.normal
            .clone()
            .transformDirection(hit.object.matrixWorld)
            .normalize();
          const invCubeQuat = this.cubeHolder.getWorldQuaternion(_q1).invert();
          this.swipeHitNormal.copy(worldNormal).applyQuaternion(invCubeQuat).normalize();

          // Hard-lock OrbitControls and block propagation so the camera/cube never rotates
          this.controls.enabled = false;
          e.stopPropagation();
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      // Subtle cursor parallax on title screen (pointer mouse/pen only to avoid erratic touch jumps)
      if (e.pointerType !== 'touch') {
        const rect = dom.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          this.pointerParallaxX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
          this.pointerParallaxY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
        }
      }

      if (!this.swipeActive || this.swipeHitCubieId === null || this.swipePointerId !== e.pointerId) return;
      if (this.activePointers.size > 1) return;
      if (this.activeTurn) return;

      const dx = e.clientX - this.pointerDownPos.x;
      const dy = e.clientY - this.pointerDownPos.y;
      const swipeThreshold = e.pointerType === 'touch' ? 16 : 20;
      if (Math.hypot(dx, dy) < swipeThreshold) return;

      // Map screen drag vector onto camera right/up plane, then into cubeHolder local space
      const camRight = _v1.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const camUp = _v2.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
      const dragWorld = _v3.set(0, 0, 0).addScaledVector(camRight, dx).addScaledVector(camUp, -dy);

      const invCubeQuat = this.cubeHolder.getWorldQuaternion(_q1).invert();
      dragWorld.applyQuaternion(invCubeQuat);

      const vis = this.cubieVisuals.get(this.swipeHitCubieId);
      if (vis) {
        const move = computeMoveFromSwipe(
          vis.currentGrid,
          [this.swipeHitNormal.x, this.swipeHitNormal.y, this.swipeHitNormal.z],
          [dragWorld.x, dragWorld.y, dragWorld.z],
          this.puzzleType
        );
        if (move) {
          this.enqueueMove(move, false, 1.0);
        }
      }

      // Disarm swipe so one drag triggers one crisp turn, while keeping OrbitControls
      // locked until pointerup so continuing the drag never rotates the cube.
      this.swipeActive = false;
      this.swipePointerId = null;
      this.swipeHitCubieId = null;
    };

    const onPointerUp = (e: PointerEvent) => {
      this.activePointers.delete(e.pointerId);
      if (
        (this.swipeActive || this.layerDragLocked) &&
        (this.layerDragPointerId === e.pointerId ||
          this.swipePointerId === e.pointerId ||
          this.activePointers.size === 0)
      ) {
        releaseLayerDragLock();
      }
    };

    container.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    this.cleanupPointers = () => {
      container.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }

  private cleanupPointers: () => void = () => {};

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
  };

  private handleContextRestored = () => {
    if (this.disposed) return;
    this.handleResize();
    this.lastTime = performance.now();
    this.scheduleNextFrame();
  };

  private handleResize() {
    if (this.disposed) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    const inActiveStudio = this.gameState !== 'title';
    this.updateCameraFraming(this.gameState, !inActiveStudio, inActiveStudio && this.hasUserOrbited);
  }

  /**
   * Captures a lossless high-resolution PNG screenshot of the exact current 3D cube state
   * (stickers, custom/studio theme, lighting, exploded core, and user camera orientation)
   * without causing any CSS layout shift or visible viewport flicker.
   */
  public captureHighResSnapshot(options?: {
    width?: number;
    height?: number;
  }): { dataUrl: string; width: number; height: number } | null {
    if (this.disposed) return null;

    const prevSize = new THREE.Vector2();
    this.renderer.getSize(prevSize);
    const prevWidth = Math.max(prevSize.x || this.container.clientWidth, 1);
    const prevHeight = Math.max(prevSize.y || this.container.clientHeight, 1);
    const prevPixelRatio = this.renderer.getPixelRatio();
    const prevAspect = this.camera.aspect;

    const gl = this.renderer.getContext();
    const glMaxRb = Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)) || 4096;
    const maxRenderbufferSize = Math.min(this.renderer.capabilities.maxTextureSize || 4096, glMaxRb);
    const { width, height } = computeSnapshotDimensions({
      targetWidth: options?.width,
      targetHeight: options?.height,
      maxRenderbufferSize,
    });

    try {
      this.controls.update();
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camera);

      const dataUrl = this.renderer.domElement.toDataURL('image/png');
      return { dataUrl, width, height };
    } catch {
      return null;
    } finally {
      this.renderer.setPixelRatio(prevPixelRatio);
      this.renderer.setSize(prevWidth, prevHeight, false);
      this.camera.aspect = prevAspect;
      this.camera.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camera);
    }
  }

  private updateSimulation(dt: number, elapsedSec: number) {
    // 1. Title screen kinetic showcase choreography
    if (this.gameState === 'title') {
      this.cubeHolder.rotation.y += dt * 0.28;
      const targetTiltX = Math.sin(elapsedSec * 0.7) * 0.1 + this.pointerParallaxY * 0.14;
      const targetTiltZ = Math.cos(elapsedSec * 0.55) * 0.08 - this.pointerParallaxX * 0.14;
      this.cubeHolder.rotation.x = THREE.MathUtils.damp(this.cubeHolder.rotation.x, targetTiltX, 4, dt);
      this.cubeHolder.rotation.z = THREE.MathUtils.damp(this.cubeHolder.rotation.z, targetTiltZ, 4, dt);

      // Gentle rhythmic showcase moves (Sexy Move cycle so cube always resolves itself!)
      this.titleAutoMoveTimer -= dt;
      if (this.titleAutoMoveTimer <= 0 && !this.activeTurn && this.moveQueue.length === 0) {
        const showcaseSeq = ['R', 'U', "R'", "U'"];
        const token = showcaseSeq[this.titleShowcaseIndex % showcaseSeq.length];
        this.titleShowcaseIndex++;
        const move = parseNotation(token, this.puzzleType);
        if (move) this.enqueueMove(move, true, 0.75);
        this.titleAutoMoveTimer = 0.85;
      }
    } else if (this.gameState === 'playing') {
      // Smoothly return holder rotation back to neutral upright alignment
      this.cubeHolder.rotation.x = THREE.MathUtils.damp(this.cubeHolder.rotation.x, 0, 6, dt);
      this.cubeHolder.rotation.y = THREE.MathUtils.damp(this.cubeHolder.rotation.y, 0, 6, dt);
      this.cubeHolder.rotation.z = THREE.MathUtils.damp(this.cubeHolder.rotation.z, 0, 6, dt);
    }

    // 2. Smooth levitation + magnetic turn recoil spring
    this.recoilVel += -34 * this.recoilY * dt;
    this.recoilVel *= Math.exp(-9 * dt);
    this.recoilY += this.recoilVel * dt;
    const hoverY = Math.sin(elapsedSec * 1.45) * 0.08 + this.recoilY * 0.12;
    this.cubeHolder.position.y = hoverY;

    // 3. Camera damping transitions
    if (this.isCameraLerping) {
      const k = 4.8;
      const alpha = 1 - Math.exp(-k * dt);
      this.camera.position.lerp(this.cameraTargetPos, alpha);
      this.controls.target.lerp(this.cameraTargetLook, alpha);
      if (
        this.camera.position.distanceToSquared(this.cameraTargetPos) < 0.001 &&
        this.controls.target.distanceToSquared(this.cameraTargetLook) < 0.001
      ) {
        this.isCameraLerping = false;
      }
    }
    this.controls.update();
    const listenerPose = this.syncSpatialAudioListener();

    // 4. Advance active slice turn or dequeue next
    if (!this.activeTurn && this.moveQueue.length > 0 && this.gameState !== 'paused') {
      this.startNextQueuedMove();
    }

    if (this.activeTurn && this.gameState !== 'paused') {
      const turn = this.activeTurn;
      turn.elapsed += dt;
      const rawT = Math.min(turn.elapsed / turn.duration, 1);

      if (this.gameState === 'playing') {
        if (!turn.slidePlayed && rawT >= 0.08) {
          turn.slidePlayed = true;
          cubeAudio.playSpatialTurnSlide(this.buildTurnAcousticProfile(turn, listenerPose, 0));
        }

        if (turn.move.turns === 2) {
          if (!turn.firstClickPlayed && rawT >= 0.34) {
            turn.firstClickPlayed = true;
            cubeAudio.playSpatialTurnClick(this.buildTurnAcousticProfile(turn, listenerPose, 0));
          }
          if (!turn.secondClickPlayed && rawT >= 0.78) {
            turn.secondClickPlayed = true;
            cubeAudio.playSpatialTurnClick(this.buildTurnAcousticProfile(turn, listenerPose, 1));
          }
        } else if (!turn.firstClickPlayed && rawT >= 0.66) {
          turn.firstClickPlayed = true;
          cubeAudio.playSpatialTurnClick(this.buildTurnAcousticProfile(turn, listenerPose, 0));
        }
      }

      const eased = easeOutMagnetic(rawT);
      turn.pivot.setRotationFromAxisAngle(turn.axisVec, turn.totalAngle * eased);

      if (rawT >= 1) {
        this.finishActiveTurn();
      }
    }

    // 5. Exploded view & Morph assembly & Victory wave displacement
    this.explodeCurrent = THREE.MathUtils.damp(this.explodeCurrent, this.explodeTarget, 7.5, dt);
    if (this.morphProgress > 0) {
      this.morphProgress = Math.max(0, this.morphProgress - dt * 1.85);
    }
    if (this.victoryWaveTime > 0) {
      this.victoryWaveTime = Math.max(0, this.victoryWaveTime - dt);
    }

    if (!this.activeTurn) {
      const explodeDist = this.explodeCurrent * 0.92;
      for (const vis of this.cubieVisuals.values()) {
        const localMorph = Math.max(0, Math.min(1, this.morphProgress - vis.morphDelay));
        const morphEase = localMorph * localMorph * localMorph;
        const wave =
          this.victoryWaveTime > 0
            ? Math.sin(this.victoryWaveTime * 11 - vis.id * 0.38) * 0.14 * (this.victoryWaveTime / 1.8)
            : 0;
        const radialOffset = explodeDist + morphEase * 2.1 + wave;
        vis.group.position.copy(vis.baseLocalPos).addScaledVector(vis.explodeDir, radialOffset);
        const s = 1 - morphEase * 0.35;
        vis.group.scale.setScalar(s);
      }
    }

    // 6. Animate 3D guide arrow pulse
    if (this.guideArrowGroup.visible) {
      const pulse = 1 + Math.sin(elapsedSec * 5.2) * 0.045;
      this.guideArrowGroup.scale.setScalar(pulse);
    }

    // 7. Studio plinth ring pulse
    this.ringPulse = Math.max(0, this.ringPulse - dt * 1.6);
    const ringScale = 1 + this.ringPulse * 0.07;
    this.studioRing.scale.setScalar(ringScale);
    this.ringMat.opacity = 0.45 + this.ringPulse * 0.35;

    // 8. Update pooled InstancedMesh particles (zero-GC)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = this.particles[i];
      const isAmbient = i < AMBIENT_MOTE_COUNT;

      if (isAmbient) {
        const angle = elapsedSec * 0.12 + (i / AMBIENT_MOTE_COUNT) * Math.PI * 2;
        const radius = 3.6 + (i % 5) * 0.55;
        p.pos.set(
          Math.cos(angle) * radius,
          Math.sin(elapsedSec * 0.55 + i) * 1.25,
          Math.sin(angle) * radius
        );
        p.rot.x += p.rotVel.x * dt;
        p.rot.y += p.rotVel.y * dt;
        _q1.setFromEuler(p.rot);
        _s1.setScalar(p.scale);
        _m4.compose(p.pos, _q1, _s1);
        this.particleMesh.setMatrixAt(i, _m4);
      } else if (p.active) {
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          _s1.setScalar(0);
          _m4.compose(p.pos, _q1.identity(), _s1);
          this.particleMesh.setMatrixAt(i, _m4);
        } else {
          p.pos.addScaledVector(p.vel, dt);
          p.vel.multiplyScalar(Math.exp(-2.8 * dt));
          p.rot.x += p.rotVel.x * dt;
          p.rot.y += p.rotVel.y * dt;
          const fade = 1 - p.life / p.maxLife;
          _q1.setFromEuler(p.rot);
          _s1.setScalar(p.scale * fade);
          _m4.compose(p.pos, _q1, _s1);
          this.particleMesh.setMatrixAt(i, _m4);
        }
      } else {
        _s1.setScalar(0);
        _m4.compose(_v1.set(0, -100, 0), _q1.identity(), _s1);
        this.particleMesh.setMatrixAt(i, _m4);
      }
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 90);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 85);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = () => {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    this.updateSimulation(dt, now / 1000);
    this.renderer.render(this.scene, this.camera);
    this.scheduleNextFrame();
  };

  private scheduleNextFrame() {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    this.cleanupPointers();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost, false);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored, false);
    this.controls.dispose();
    this.clearCubeMeshes();
    this.clearGuideArrow();
    this.microGrainTex.dispose();
    this.brushedMetalTex.dispose();
    this.shadowTex.dispose();
    this.chassisMat.dispose();
    this.coreMetalMat.dispose();
    this.collarMetalMat.dispose();
    this.mirrorTileMat.dispose();
    this.guideArrowMat.dispose();
    this.ringMat.dispose();
    this.shadowMat.dispose();
    this.particleMat.dispose();
    for (const m of Object.values(this.faceMaterials)) {
      m.dispose();
    }
    this.particleMesh.geometry.dispose();
    this.contactShadow.geometry.dispose();
    this.studioRing.geometry.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
