import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import helvetikerRegular from 'three/examples/fonts/helvetiker_regular.typeface.json';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb8cfe0);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 1200);
camera.position.set(0, 0, 120);
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.sortObjects = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1;
const root = document.getElementById('root') ?? document.body;
root.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
ambientLight.name = 'ambientLight';
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.name = 'directionalLight';
dirLight.position.set(60, 100, 40);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.left = -100;
dirLight.shadow.camera.right = 100;
dirLight.shadow.camera.top = 100;
dirLight.shadow.camera.bottom = -100;
dirLight.shadow.bias = -0.001;
dirLight.shadow.normalBias = 0.02;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
fillLight.name = 'fillLight';
fillLight.position.set(-40, 60, -30);
scene.add(fillLight);

// State
let currentSVGGroup = null;
let extrusionDepth = 10;
let bevelEnabled = true;
let bevelSize = 0.5;
let loadedFont = null;
let matColor = '#4a90d9';
let matMetalness = 0.3;
let matRoughness = 0.4;
let selectedMesh = null;
let selectedMeshes = [];
let originalEmissive = new THREE.Color(0x000000);
let modelOffsetY = 5;
let modelOffsetX = 0;
let currentModelSource = { type: 'default', value: null };
let downloadFormat = 'glb';
let transformOffsetX = 0;
let transformOffsetY = 0;
let transformRotationX = 0;
let transformRotationY = 0;
let transformRotationZ = 0;
let transformScale = 1;
let panelDock = 'left';
let lightPreset = 'studio';
let backgroundPreset = 'sky';
const historyStack = [];
const redoStack = [];
const maxHistoryEntries = 40;

// Raycaster for mesh selection
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Outline highlight material cache
const highlightEdgesMap = new WeakMap();
const meshLayerStep = 0.03;

// Load font for text extrusion
const fontLoader = new FontLoader();
loadedFont = fontLoader.parse(helvetikerRegular);

// Ground plane
const groundGeo = new THREE.PlaneGeometry(400, 400);
const groundMat = new THREE.MeshStandardMaterial({ color: 0xd5dfe8, roughness: 0.9 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.name = 'ground';
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.5;
ground.receiveShadow = true;
scene.add(ground);

// Grid helper
const gridHelper = new THREE.GridHelper(200, 40, 0x9ab0c4, 0xc0d0dd);
gridHelper.name = 'gridHelper';
gridHelper.position.y = -0.4;
scene.add(gridHelper);

// Default demo SVG shapes
function createDefaultScene() {
  disposeCurrentModel();

  const group = new THREE.Group();
  group.name = 'svgGroup';

  const starShape = new THREE.Shape();
  const outerRadius = 12;
  const innerRadius = 5;
  const spikes = 5;
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) starShape.moveTo(x, y);
    else starShape.lineTo(x, y);
  }
  starShape.closePath();

  const extrudeSettings = {
    depth: extrusionDepth,
    bevelEnabled: bevelEnabled,
    bevelThickness: bevelSize,
    bevelSize: bevelSize,
    bevelSegments: 3
  };

  const starGeo = finalizeMeshGeometry(new THREE.ExtrudeGeometry(starShape, extrudeSettings));
  const starMat = createSolidMaterial(new THREE.Color(matColor));
  const starMesh = new THREE.Mesh(starGeo, starMat);
  starMesh.name = 'defaultStar';
  starMesh.castShadow = true;
  starMesh.receiveShadow = true;
  starMesh.position.set(-25, 10, 0);
  registerEditableMesh(starMesh, { type: 'shape', shape: starShape }, getDefaultGeometrySettings());
  group.add(starMesh);

  const circleShape = new THREE.Shape();
  circleShape.absarc(0, 0, 8, 0, Math.PI * 2, false);
  const circleGeo = finalizeMeshGeometry(new THREE.ExtrudeGeometry(circleShape, extrudeSettings));
  const circleMat = createSolidMaterial(new THREE.Color(0x6ec87a));
  const circleMesh = new THREE.Mesh(circleGeo, circleMat);
  circleMesh.name = 'defaultCircle';
  circleMesh.castShadow = true;
  circleMesh.receiveShadow = true;
  circleMesh.position.set(0, 10, 0);
  registerEditableMesh(circleMesh, { type: 'shape', shape: circleShape }, getDefaultGeometrySettings());
  group.add(circleMesh);

  const hexShape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const x = Math.cos(angle) * 9;
    const y = Math.sin(angle) * 9;
    if (i === 0) hexShape.moveTo(x, y);
    else hexShape.lineTo(x, y);
  }
  hexShape.closePath();
  const hexGeo = finalizeMeshGeometry(new THREE.ExtrudeGeometry(hexShape, extrudeSettings));
  const hexMat = createSolidMaterial(new THREE.Color(0xc882d9));
  const hexMesh = new THREE.Mesh(hexGeo, hexMat);
  hexMesh.name = 'defaultHex';
  hexMesh.castShadow = true;
  hexMesh.receiveShadow = true;
  hexMesh.position.set(25, 10, 0);
  registerEditableMesh(hexMesh, { type: 'shape', shape: hexShape }, getDefaultGeometrySettings());
  group.add(hexMesh);

  scene.add(group);
  currentSVGGroup = group;
  currentModelSource = { type: 'default', value: null };
  centerCameraOnGroup();
}

createDefaultScene();

// SVG to 3D conversion
function disposeMaterial(material) {
  if (!material) return;
  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
    return;
  }
  material.dispose();
}

function disposeCurrentModel() {
  if (!currentSVGGroup) return;
  scene.remove(currentSVGGroup);
  currentSVGGroup.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) disposeMaterial(child.material);
  });
  currentSVGGroup = null;
  selectMesh(null);
}

function createSolidMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: matMetalness,
    roughness: matRoughness,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
}

async function loadGLTFExporter() {
  const module = await import('three/examples/jsm/exporters/GLTFExporter.js');
  return new module.GLTFExporter();
}

async function loadSTLExporter() {
  const module = await import('three/examples/jsm/exporters/STLExporter.js');
  return new module.STLExporter();
}

function finalizeMeshGeometry(geometry) {
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function applyMeshDepthOffset(mesh, index) {
  mesh.position.z += index * meshLayerStep;
  mesh.renderOrder = index;
}

function getDefaultGeometrySettings() {
  return {
    depth: extrusionDepth,
    bevelEnabled,
    bevelSize
  };
}

function cloneGeometrySettings(settings = getDefaultGeometrySettings()) {
  return {
    depth: settings.depth,
    bevelEnabled: settings.bevelEnabled,
    bevelSize: settings.bevelSize
  };
}

function buildExtrudeSettings(settings) {
  return {
    depth: settings.depth,
    bevelEnabled: settings.bevelEnabled,
    bevelThickness: settings.bevelSize,
    bevelSize: settings.bevelSize,
    bevelSegments: settings.bevelEnabled ? 3 : 0
  };
}

function registerEditableMesh(mesh, sourceDescriptor = null, geometrySettings = getDefaultGeometrySettings()) {
  mesh.userData.basePosition = mesh.position.clone();
  mesh.userData.baseRotation = mesh.rotation.clone();
  mesh.userData.baseScale = mesh.scale.clone();
  mesh.userData.transformState = { offsetX: 0, offsetY: 0, rotateX: 0, rotateY: 0, rotateZ: 0, scale: 1 };
  mesh.userData.sourceDescriptor = sourceDescriptor;
  mesh.userData.geometrySettings = cloneGeometrySettings(geometrySettings);
}

function getMeshTransformState(mesh) {
  if (!mesh.userData.transformState) {
    registerEditableMesh(mesh);
  }
  return mesh.userData.transformState;
}

function setTransformControlValues(offsetX = 0, offsetY = 0, rx = 0, ry = 0, rz = 0, scale = 1) {
  transformOffsetX = offsetX;
  transformOffsetY = offsetY;
  transformRotationX = rx;
  transformRotationY = ry;
  transformRotationZ = rz;
  transformScale = scale;
  
  document.getElementById('offsetXSlider').value = offsetX;
  const offsetXInput = document.getElementById('offsetXInput');
  if (offsetXInput) offsetXInput.value = offsetX;
  
  document.getElementById('offsetYSlider').value = offsetY;
  const offsetYInput = document.getElementById('offsetYInput');
  if (offsetYInput) offsetYInput.value = offsetY;
  
  document.getElementById('rotateXSlider').value = rx;
  const rotateXInput = document.getElementById('rotateXInput');
  if (rotateXInput) rotateXInput.value = rx;
  
  document.getElementById('rotateYSlider').value = ry;
  const rotateYInput = document.getElementById('rotateYInput');
  if (rotateYInput) rotateYInput.value = ry;
  
  document.getElementById('rotateZSlider').value = rz;
  const rotateZInput = document.getElementById('rotateZInput');
  if (rotateZInput) rotateZInput.value = rz;
  
  document.getElementById('scaleSlider').value = scale;
  const scaleInput = document.getElementById('scaleInput');
  if (scaleInput) scaleInput.value = scale;
}

function applyTransformStateToMesh(mesh, state) {
  const basePosition = mesh.userData.basePosition ?? mesh.position.clone();
  const baseRotation = mesh.userData.baseRotation ?? mesh.rotation.clone();
  const baseScale = mesh.userData.baseScale ?? mesh.scale.clone();
  
  mesh.position.set(basePosition.x + state.offsetX, basePosition.y + state.offsetY, basePosition.z);
  
  // Convert degrees to radians for Three.js
  mesh.rotation.set(
    baseRotation.x + THREE.MathUtils.degToRad(state.rotateX || 0),
    baseRotation.y + THREE.MathUtils.degToRad(state.rotateY || 0),
    baseRotation.z + THREE.MathUtils.degToRad(state.rotateZ || 0)
  );
  
  mesh.scale.set(baseScale.x * state.scale, baseScale.y * state.scale, baseScale.z * state.scale);
  mesh.updateMatrixWorld(true);
}

function applyTransformToMesh(mesh, offsetX, offsetY, rx, ry, rz, scale) {
  const state = getMeshTransformState(mesh);
  state.offsetX = offsetX;
  state.offsetY = offsetY;
  state.rotateX = rx;
  state.rotateY = ry;
  state.rotateZ = rz;
  state.scale = scale;
  applyTransformStateToMesh(mesh, state);
}

function getMeshGeometrySettings(mesh) {
  if (!mesh.userData.geometrySettings) {
    mesh.userData.geometrySettings = cloneGeometrySettings();
  }
  return mesh.userData.geometrySettings;
}

function createGeometryFromDescriptor(sourceDescriptor, geometrySettings) {
  if (!sourceDescriptor) return null;
  if (sourceDescriptor.type === 'shape') {
    return finalizeMeshGeometry(new THREE.ExtrudeGeometry(sourceDescriptor.shape, buildExtrudeSettings(geometrySettings)));
  }
  if (sourceDescriptor.type === 'text') {
    return finalizeMeshGeometry(new TextGeometry(sourceDescriptor.text, {
      font: loadedFont,
      size: sourceDescriptor.size,
      depth: geometrySettings.depth * (sourceDescriptor.depthFactor ?? 1),
      bevelEnabled: geometrySettings.bevelEnabled,
      bevelThickness: geometrySettings.bevelSize * (sourceDescriptor.bevelFactor ?? 1),
      bevelSize: geometrySettings.bevelSize * (sourceDescriptor.bevelFactor ?? 1),
      bevelSegments: geometrySettings.bevelEnabled ? 3 : 0,
      curveSegments: sourceDescriptor.curveSegments ?? 12
    }));
  }
  return null;
}

function refreshSelectionOutline(mesh) {
  const oldOutline = highlightEdgesMap.get(mesh);
  if (oldOutline) {
    mesh.remove(oldOutline);
    oldOutline.geometry.dispose();
    oldOutline.material.dispose();
    highlightEdgesMap.delete(mesh);
  }
  if (!selectedMeshes.includes(mesh)) return;
  const edgesGeo = new THREE.EdgesGeometry(mesh.geometry, 15);
  const edgesMat = new THREE.LineBasicMaterial({
    color: mesh === selectedMesh ? 0x6ab0f3 : 0xb8ddff,
    linewidth: 1,
    transparent: true,
    opacity: mesh === selectedMesh ? 0.9 : 0.45,
    depthTest: false
  });
  const edgeLines = new THREE.LineSegments(edgesGeo, edgesMat);
  edgeLines.name = 'selectionOutline';
  edgeLines.raycast = () => {};
  mesh.add(edgeLines);
  highlightEdgesMap.set(mesh, edgeLines);
}

function rebuildMeshGeometry(mesh) {
  const geometrySettings = getMeshGeometrySettings(mesh);
  const newGeometry = createGeometryFromDescriptor(mesh.userData.sourceDescriptor, geometrySettings);
  if (!newGeometry) return false;
  if (mesh.geometry) mesh.geometry.dispose();
  mesh.geometry = newGeometry;
  refreshSelectionOutline(mesh);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return true;
}

function svgTo3D(svgText, sourceMeta = { type: 'svg', value: svgText }) {
  disposeCurrentModel();

  const loader = new SVGLoader();
  let data;
  try {
    data = loader.parse(svgText);
  } catch (e) {
    showNotification('Error parsing SVG. Please check the format.', 'error');
    return;
  }

  const paths = data.paths;

  // Extract <text> elements from SVG source and extrude them
  const textElements = [];
  const parser = new DOMParser();
  try {
    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
    const texts = svgDoc.querySelectorAll('text');
    texts.forEach(t => {
      textElements.push({
        content: t.textContent.trim(),
        x: parseFloat(t.getAttribute('x')) || 0,
        y: parseFloat(t.getAttribute('y')) || 0,
        fill: t.getAttribute('fill') || '#ffffff',
        fontSize: parseFloat(t.getAttribute('font-size')) || 16,
        textAnchor: (t.getAttribute('text-anchor') || 'start').toLowerCase(),
        dominantBaseline: (t.getAttribute('dominant-baseline') || t.getAttribute('alignment-baseline') || 'middle').toLowerCase()
      });
    });
  } catch (e) { /* ignore parse issues */ }

  if ((!paths || paths.length === 0) && textElements.length === 0) {
    showNotification('No paths or text found in SVG.', 'error');
    return;
  }

  const group = new THREE.Group();
  group.name = 'svgGroup';

  const extrudeSettings = {
    depth: extrusionDepth,
    bevelEnabled: bevelEnabled,
    bevelThickness: bevelSize,
    bevelSize: bevelSize,
    bevelSegments: 3
  };

  const colors = [0x4a90d9, 0x6ec87a, 0xc882d9, 0xe8a84c, 0xd94a6b, 0x4ac8d9, 0x8b6ec8];

  paths.forEach((path, pathIndex) => {
    const shapes = SVGLoader.createShapes(path);
    const pathColor = path.userData?.style?.fill
      ? new THREE.Color(path.userData.style.fill)
      : new THREE.Color(colors[pathIndex % colors.length]);

    shapes.forEach((shape, shapeIndex) => {
      const geometry = finalizeMeshGeometry(new THREE.ExtrudeGeometry(shape, extrudeSettings));
      const material = createSolidMaterial(
        path.userData?.style?.fill && path.userData.style.fill !== 'none'
          ? pathColor
          : new THREE.Color(colors[pathIndex % colors.length])
      );
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `svgPath_${pathIndex}_${shapeIndex}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      applyMeshDepthOffset(mesh, pathIndex * 100 + shapeIndex);
      registerEditableMesh(mesh, { type: 'shape', shape }, getDefaultGeometrySettings());
      group.add(mesh);
    });
  });

  // Add extruded text elements from SVG
  if (loadedFont && textElements.length > 0) {
    textElements.forEach((te, ti) => {
      const textGeo = new TextGeometry(te.content, {
        font: loadedFont,
        size: te.fontSize * 0.6,
        depth: extrusionDepth * 0.6,
        bevelEnabled: bevelEnabled,
        bevelThickness: bevelSize * 0.5,
        bevelSize: bevelSize * 0.5,
        bevelSegments: 2,
        curveSegments: 8
      });
      finalizeMeshGeometry(textGeo);
      const textMat = createSolidMaterial(te.fill !== 'none' ? new THREE.Color(te.fill) : new THREE.Color(colors[ti % colors.length]));
      const textMesh = new THREE.Mesh(textGeo, textMat);
      textMesh.name = `svgText_${ti}`;
      const textBox = textGeo.boundingBox ?? new THREE.Box3().setFromObject(textMesh);
      const textWidth = textBox.max.x - textBox.min.x;
      const textHeight = textBox.max.y - textBox.min.y;

      let anchorOffsetX = 0;
      if (te.textAnchor === 'middle') anchorOffsetX = -textWidth / 2;
      else if (te.textAnchor === 'end') anchorOffsetX = -textWidth;
      else anchorOffsetX = -textBox.min.x;

      let anchorOffsetY = 0;
      if (te.dominantBaseline.includes('hanging') || te.dominantBaseline.includes('text-before-edge')) {
        anchorOffsetY = -textBox.max.y;
      } else if (te.dominantBaseline.includes('baseline') || te.dominantBaseline.includes('alphabetic')) {
        anchorOffsetY = -textBox.min.y;
      } else {
        anchorOffsetY = -(textBox.min.y + textHeight / 2);
      }

      textMesh.position.set(te.x + anchorOffsetX, te.y + anchorOffsetY, 0);
      // SVG groups are flipped on Y to match screen-space coordinates.
      // Flip text back locally so labels remain readable.
      textMesh.scale.y = -1;
      textMesh.castShadow = true;
      textMesh.receiveShadow = true;
      applyMeshDepthOffset(textMesh, paths.length * 100 + ti);
      registerEditableMesh(textMesh, {
        type: 'text',
        text: te.content,
        size: te.fontSize * 0.6,
        depthFactor: 0.6,
        bevelFactor: 0.5,
        curveSegments: 8
      }, getDefaultGeometrySettings());
      group.add(textMesh);
    });
  }

  // Center and scale
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = maxDim > 0 ? 40 / maxDim : 1;
  group.scale.set(scale, -scale, scale);

  group.position.set(0, 0, 0);
  const newBox = new THREE.Box3().setFromObject(group);
  const newCenter = newBox.getCenter(new THREE.Vector3());
  group.position.sub(newCenter);
  const finalBox = new THREE.Box3().setFromObject(group);
  group.position.y -= finalBox.min.y;
  group.position.y += modelOffsetY;
  group.position.x += modelOffsetX;

  scene.add(group);
  currentSVGGroup = group;
  currentModelSource = sourceMeta;

  centerCameraOnGroup();
  showNotification('SVG converted to 3D!', 'success');
}

// Center the camera on the current group — front-facing view
function centerCameraOnGroup() {
  if (!currentSVGGroup) return;
  const box = new THREE.Box3().setFromObject(currentSVGGroup);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const dist = maxDim * 2.5;
  camera.near = Math.max(0.1, dist / 100);
  camera.far = Math.max(400, dist * 10);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  camera.position.set(center.x, center.y, center.z + dist);
  controls.update();
}

// Create SVG from object description
function generateSVGFromLabel(label) {
  const p = label.toLowerCase().trim();

  // Shape generators
  const shapes = {
    star: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,5 61,35 95,35 68,57 79,90 50,70 21,90 32,57 5,35 39,35" fill="#4a90d9"/></svg>`,
    heart: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50,88 C25,65 5,50 5,30 C5,12 18,2 33,2 C42,2 48,8 50,12 C52,8 58,2 67,2 C82,2 95,12 95,30 C95,50 75,65 50,88Z" fill="#d94a6b"/></svg>`,
    circle: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="#6ec87a"/></svg>`,
    square: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" fill="#c882d9"/></svg>`,
    rect: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect x="5" y="5" width="110" height="70" rx="6" fill="#c882d9"/></svg>`,
    triangle: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,5 95,90 5,90" fill="#e8a84c"/></svg>`,
    hexagon: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,3 93,25 93,75 50,97 7,75 7,25" fill="#4ac8d9"/></svg>`,
    pentagon: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,5 97,38 79,92 21,92 3,38" fill="#e8a84c"/></svg>`,
    diamond: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,2 98,50 50,98 2,50" fill="#d94a6b"/></svg>`,
    cross: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M35,5 H65 V35 H95 V65 H65 V95 H35 V65 H5 V35 H35Z" fill="#d94a6b"/></svg>`,
    plus: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M35,5 H65 V35 H95 V65 H65 V95 H35 V65 H5 V35 H35Z" fill="#6ec87a"/></svg>`,
    arrow: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,5 85,50 65,50 65,95 35,95 35,50 15,50" fill="#6ec87a"/></svg>`,
    moon: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M60,5 A45,45 0 1,0 60,95 A35,35 0 1,1 60,5Z" fill="#e8d44c"/></svg>`,
    ring: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="none" stroke="#4a90d9" stroke-width="10"/></svg>`,
    gear: () => presets.gear,
    cog: () => presets.gear,
    house: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,10 90,50 90,90 10,90 10,50" fill="#e8a84c"/><polygon points="50,10 10,50 90,50" fill="#d94a6b"/><rect x="38" y="58" width="24" height="32" fill="#4a2a1a"/></svg>`,
    home: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,10 90,50 90,90 10,90 10,50" fill="#e8a84c"/><polygon points="50,10 10,50 90,50" fill="#d94a6b"/><rect x="38" y="58" width="24" height="32" fill="#4a2a1a"/></svg>`,
    shield: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120"><path d="M50,5 L90,20 L90,60 Q90,95 50,115 Q10,95 10,60 L10,20Z" fill="#4a90d9"/></svg>`,
    lightning: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 120"><polygon points="45,5 15,55 35,55 25,115 65,50 42,50 55,5" fill="#e8d44c"/></svg>`,
    bolt: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 120"><polygon points="45,5 15,55 35,55 25,115 65,50 42,50 55,5" fill="#e8d44c"/></svg>`,
    cloud: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 80"><path d="M30,70 A25,25 0 0,1 25,22 A30,30 0 0,1 75,10 A25,25 0 0,1 120,25 A20,20 0 0,1 115,70Z" fill="#b0d4f1"/></svg>`,
    music: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100"><ellipse cx="20" cy="85" rx="16" ry="12" fill="#c882d9"/><ellipse cx="60" cy="78" rx="16" ry="12" fill="#c882d9"/><rect x="33" y="10" width="5" height="75" fill="#c882d9"/><rect x="73" y="5" width="5" height="73" fill="#c882d9"/><rect x="33" y="5" width="45" height="10" fill="#c882d9"/></svg>`,
    note: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 100"><ellipse cx="20" cy="82" rx="18" ry="14" fill="#c882d9"/><rect x="35" y="10" width="5" height="72" fill="#c882d9"/><path d="M40,10 Q60,15 55,35 L40,30Z" fill="#c882d9"/></svg>`,
    eye: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><path d="M5,30 Q60,-15 115,30 Q60,75 5,30Z" fill="#e0e0e0"/><circle cx="60" cy="30" r="18" fill="#4a90d9"/><circle cx="60" cy="30" r="8" fill="#1a1a2e"/></svg>`,
    sun: () => {
      let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="20" fill="#e8d44c"/>`;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x1 = 50 + Math.cos(a) * 28, y1 = 50 + Math.sin(a) * 28;
        const x2 = 50 + Math.cos(a) * 44, y2 = 50 + Math.sin(a) * 44;
        s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#e8d44c" stroke-width="5" stroke-linecap="round"/>`;
      }
      return s + `</svg>`;
    },
    flower: () => {
      let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">`;
      const cols = ['#d94a6b','#c882d9','#4a90d9','#6ec87a','#e8a84c','#4ac8d9'];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const cx = 50 + Math.cos(a) * 18, cy = 50 + Math.sin(a) * 18;
        s += `<circle cx="${cx}" cy="${cy}" r="14" fill="${cols[i]}"/>`;
      }
      return s + `<circle cx="50" cy="50" r="10" fill="#e8d44c"/></svg>`;
    },
    smiley: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="#e8d44c"/><circle cx="35" cy="38" r="6" fill="#1a1a2e"/><circle cx="65" cy="38" r="6" fill="#1a1a2e"/><path d="M30,60 Q50,82 70,60" fill="none" stroke="#1a1a2e" stroke-width="4" stroke-linecap="round"/></svg>`,
    smile: () => shapes.smiley(),
    face: () => shapes.smiley(),
    check: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M15,55 L40,80 L85,20" fill="none" stroke="#6ec87a" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    checkmark: () => shapes.check(),
    infinity: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 70"><path d="M35,35 C35,15 5,15 5,35 C5,55 35,55 35,35 C35,55 65,55 65,35 C65,15 35,15 35,35Z" fill="none" stroke="#4a90d9" stroke-width="8" transform="translate(35,0)"/></svg>`,
    spiral: () => {
      let d = 'M50,50 ';
      for (let i = 0; i < 720; i += 5) {
        const r = 2 + i * 0.05;
        const a = (i * Math.PI) / 180;
        d += `L${50 + Math.cos(a) * r},${50 + Math.sin(a) * r} `;
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${d}" fill="none" stroke="#c882d9" stroke-width="3"/></svg>`;
    },
    wave: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 60"><path d="M0,30 Q17,5 35,30 Q52,55 70,30 Q87,5 105,30 Q122,55 140,30 L140,60 L0,60Z" fill="#4ac8d9"/></svg>`,
    tree: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120"><polygon points="50,5 80,45 65,45 85,75 20,75 40,45 25,45" fill="#2d8a4e"/><rect x="42" y="75" width="16" height="30" fill="#8B4513"/></svg>`,
    crown: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><polygon points="10,70 10,30 30,50 60,10 90,50 110,30 110,70" fill="#e8d44c"/><circle cx="30" cy="48" r="5" fill="#d94a6b"/><circle cx="60" cy="25" r="5" fill="#d94a6b"/><circle cx="90" cy="48" r="5" fill="#d94a6b"/></svg>`,
  };

  // Check for shape keywords
  for (const [key, gen] of Object.entries(shapes)) {
    if (p.includes(key)) {
      return gen();
    }
  }

  // If nothing matched but contains "text:" or similar, treat as text extrusion
  return null;
}

// Generate 3D text
function generate3DText(text) {
  if (!loadedFont) {
    showNotification('Font still loading, try again...', 'error');
    return;
  }

  disposeCurrentModel();

  const group = new THREE.Group();
  group.name = 'svgGroup';

  const extrudeSettings = {
    depth: extrusionDepth,
    bevelEnabled: bevelEnabled,
    bevelThickness: bevelSize,
    bevelSize: bevelSize,
    bevelSegments: 3
  };

  const textGeo = new TextGeometry(text, {
    font: loadedFont,
    size: 10,
    depth: extrusionDepth,
    bevelEnabled: bevelEnabled,
    bevelThickness: bevelSize,
    bevelSize: bevelSize,
    bevelSegments: 3,
    curveSegments: 12
  });

  finalizeMeshGeometry(textGeo);
  const textMat = createSolidMaterial(new THREE.Color(matColor));
  const textMesh = new THREE.Mesh(textGeo, textMat);
  textMesh.name = 'generatedText';
  textMesh.castShadow = true;
  textMesh.receiveShadow = true;
  applyMeshDepthOffset(textMesh, 0);
  registerEditableMesh(textMesh, {
    type: 'text',
    text,
    size: 10,
    depthFactor: 1,
    bevelFactor: 1,
    curveSegments: 12
  }, getDefaultGeometrySettings());
  group.add(textMesh);

  // Center
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  group.position.sub(center);

  const textBox = new THREE.Box3().setFromObject(group);
  group.position.y -= textBox.min.y;
  group.position.y += modelOffsetY;
  group.position.x += modelOffsetX;

  const wrapper = new THREE.Group();
  wrapper.name = 'svgGroup';
  wrapper.add(group);
  scene.add(wrapper);
  currentSVGGroup = wrapper;
  currentModelSource = { type: 'text', value: text };

  centerCameraOnGroup();
  showNotification('3D text created!', 'success');
}

// Handle shape generation
function handleShapeGeneration(label) {
  const p = label.trim();
  if (!p) {
    showNotification('Please enter a name.', 'error');
    return;
  }
  const svg = generateSVGFromLabel(p);
  if (svg) {
    document.getElementById('svgInput').value = svg;
    svgTo3D(svg, { type: 'svg', value: svg });
    updateExportStats();
    recordHistory();
    return;
  }
  generate3DText(p);
  updateExportStats();
  recordHistory();
}

// Export GLTF/GLB
async function exportGLTF(binary = true) {
  if (!currentSVGGroup) {
    showNotification('Nothing to export.', 'error');
    return;
  }

  const exporter = await loadGLTFExporter();
  const options = { binary: binary };

  exporter.parse(
    currentSVGGroup,
    function (result) {
      const blob = binary
        ? new Blob([result], { type: 'application/octet-stream' })
        : new Blob([JSON.stringify(result)], { type: 'application/json' });

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = binary ? 'svg-to-3d.glb' : 'svg-to-3d.gltf';
      link.click();
      URL.revokeObjectURL(link.href);
      showNotification(`Downloaded ${binary ? 'GLB' : 'GLTF'} file!`, 'success');
    },
    function (error) {
      console.error('Export error:', error);
      showNotification('Export failed.', 'error');
    },
    options
  );
}

async function exportSTL() {
  if (!currentSVGGroup) {
    showNotification('Nothing to export.', 'error');
    return;
  }

  const exporter = await loadSTLExporter();
  const result = exporter.parse(currentSVGGroup, { binary: false });
  const blob = new Blob([result], { type: 'model/stl' });
  triggerDownload(blob, 'svg-to-3d.stl');
  showNotification('Downloaded STL file!', 'success');
}

// Export OBJ
function exportOBJ() {
  if (!currentSVGGroup) {
    showNotification('Nothing to export.', 'error');
    return;
  }

  let objContent = '# SVG to 3D Export\n';
  let vertexOffset = 0;

  currentSVGGroup.traverse(child => {
    if (child.isMesh) {
      const geometry = child.geometry.clone();
      geometry.applyMatrix4(child.matrixWorld);

      const positions = geometry.attributes.position;
      const normals = geometry.attributes.normal;
      const indices = geometry.index;

      objContent += `o ${child.name || 'mesh'}\n`;

      for (let i = 0; i < positions.count; i++) {
        objContent += `v ${positions.getX(i).toFixed(6)} ${positions.getY(i).toFixed(6)} ${positions.getZ(i).toFixed(6)}\n`;
      }

      if (normals) {
        for (let i = 0; i < normals.count; i++) {
          objContent += `vn ${normals.getX(i).toFixed(6)} ${normals.getY(i).toFixed(6)} ${normals.getZ(i).toFixed(6)}\n`;
        }
      }

      if (indices) {
        for (let i = 0; i < indices.count; i += 3) {
          const a = indices.getX(i) + 1 + vertexOffset;
          const b = indices.getX(i + 1) + 1 + vertexOffset;
          const c = indices.getX(i + 2) + 1 + vertexOffset;
          objContent += `f ${a}//${a} ${b}//${b} ${c}//${c}\n`;
        }
      }

      vertexOffset += positions.count;
      geometry.dispose();
    }
  });

  const blob = new Blob([objContent], { type: 'text/plain' });
  triggerDownload(blob, 'svg-to-3d.obj');
  showNotification('Downloaded OBJ file!', 'success');
}

function exportFBX() {
  if (!currentSVGGroup) {
    showNotification('Nothing to export.', 'error');
    return;
  }

  const lines = [];
  lines.push('; FBX 7.4.0 project file');
  lines.push('FBXHeaderExtension:  {');
  lines.push('\tFBXHeaderVersion: 1003');
  lines.push('\tFBXVersion: 7400');
  lines.push('\tCreator: "svg-to-3d-converter"');
  lines.push('}');
  lines.push('Objects:  {');

  let objectId = 100000;
  currentSVGGroup.updateMatrixWorld(true);
  currentSVGGroup.traverse(child => {
    if (!child.isMesh) return;
    const geometry = child.geometry.clone().toNonIndexed();
    geometry.applyMatrix4(child.matrixWorld);
    geometry.computeVertexNormals();
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;

    const vertices = [];
    const polygonVertexIndex = [];
    const normalValues = [];

    for (let i = 0; i < positions.count; i++) {
      vertices.push(
        positions.getX(i).toFixed(6),
        positions.getY(i).toFixed(6),
        positions.getZ(i).toFixed(6)
      );
      normalValues.push(
        normals.getX(i).toFixed(6),
        normals.getY(i).toFixed(6),
        normals.getZ(i).toFixed(6)
      );
    }

    for (let i = 0; i < positions.count; i += 3) {
      polygonVertexIndex.push(i, i + 1, -(i + 3));
    }

    lines.push(`\tGeometry: ${objectId}, "Geometry::${child.name || 'mesh'}", "Mesh" {`);
    lines.push(`\t\tVertices: *${vertices.length} {`);
    lines.push(`\t\t\ta: ${vertices.join(',')}`);
    lines.push('\t\t}');
    lines.push(`\t\tPolygonVertexIndex: *${polygonVertexIndex.length} {`);
    lines.push(`\t\t\ta: ${polygonVertexIndex.join(',')}`);
    lines.push('\t\t}');
    lines.push('\t\tLayerElementNormal: 0 {');
    lines.push('\t\t\tVersion: 101');
    lines.push('\t\t\tName: ""');
    lines.push('\t\t\tMappingInformationType: "ByPolygonVertex"');
    lines.push('\t\t\tReferenceInformationType: "Direct"');
    lines.push(`\t\t\tNormals: *${normalValues.length} {`);
    lines.push(`\t\t\t\ta: ${normalValues.join(',')}`);
    lines.push('\t\t\t}');
    lines.push('\t\t}');
    lines.push('\t\tLayer: 0 {');
    lines.push('\t\t\tVersion: 100');
    lines.push('\t\t\tLayerElement:  {');
    lines.push('\t\t\t\tType: "LayerElementNormal"');
    lines.push('\t\t\t\tTypedIndex: 0');
    lines.push('\t\t\t}');
    lines.push('\t\t}');
    lines.push('\t}');
    objectId += 1;
    geometry.dispose();
  });

  lines.push('}');
  const blob = new Blob([lines.join('\n')], { type: 'application/octet-stream' });
  triggerDownload(blob, 'svg-to-3d.fbx');
  showNotification('Downloaded FBX file!', 'success');
}

function triggerDownload(blob, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

function loadSvgFile(file) {
  const reader = new FileReader();
  reader.onload = (event) => {
    const svgText = event.target.result;
    document.getElementById('svgInput').value = svgText;
    svgTo3D(svgText, { type: 'svg', value: svgText });
    updateExportStats();
    recordHistory();
  };
  reader.readAsText(file);
}

async function exportCurrentModel() {
  switch (downloadFormat) {
    case 'gltf':
      await exportGLTF(false);
      break;
    case 'obj':
      exportOBJ();
      break;
    case 'fbx':
      exportFBX();
      break;
    case 'stl':
      await exportSTL();
      break;
    case 'glb':
    default:
      await exportGLTF(true);
      break;
  }
}

function rerenderCurrentModel() {
  switch (currentModelSource.type) {
    case 'svg':
    case 'preset':
      if (currentModelSource.value) {
        document.getElementById('svgInput').value = currentModelSource.value;
        svgTo3D(currentModelSource.value, currentModelSource);
        return;
      }
      break;
    case 'text':
      if (currentModelSource.value) {
        generate3DText(currentModelSource.value);
        return;
      }
      break;
    case 'default':
    default:
      createDefaultScene();
      return;
  }

  createDefaultScene();
}

function getEditableMeshes() {
  const meshes = [];
  currentSVGGroup?.traverse(child => {
    if (child.isMesh) meshes.push(child);
  });
  return meshes;
}

function serializeMesh(mesh, index) {
  return {
    key: mesh.name || `mesh-${index}`,
    index,
    visible: mesh.visible,
    transformState: { ...getMeshTransformState(mesh) },
    geometrySettings: { ...getMeshGeometrySettings(mesh) },
    material: {
      color: `#${mesh.material.color.getHexString()}`,
      metalness: mesh.material.metalness,
      roughness: mesh.material.roughness
    }
  };
}

function captureProjectState() {
  const meshes = getEditableMeshes();
  return {
    version: 1,
    source: currentModelSource,
    globalDefaults: {
      depth: extrusionDepth,
      bevelEnabled,
      bevelSize
    },
    sceneLooks: {
      lightPreset,
      backgroundPreset
    },
    wireframeOn,
    panelDock,
    downloadFormat,
    meshes: meshes.map(serializeMesh)
  };
}

function recordHistory() {
  historyStack.push(JSON.stringify(captureProjectState()));
  if (historyStack.length > maxHistoryEntries) historyStack.shift();
  redoStack.length = 0;
}

function syncStateFromMesh(mesh, saved) {
  const transformState = getMeshTransformState(mesh);
  Object.assign(transformState, saved.transformState ?? {});
  applyTransformStateToMesh(mesh, transformState);
  const geometrySettings = getMeshGeometrySettings(mesh);
  Object.assign(geometrySettings, saved.geometrySettings ?? {});
  rebuildMeshGeometry(mesh);
  mesh.visible = saved.visible ?? true;
  if (saved.material) {
    matColor = saved.material.color;
    matMetalness = saved.material.metalness;
    matRoughness = saved.material.roughness;
    applyMaterialToMesh(mesh);
  }
}

function applyProjectState(state, { skipHistory = false } = {}) {
  if (!state) return;
  extrusionDepth = state.globalDefaults?.depth ?? extrusionDepth;
  bevelEnabled = state.globalDefaults?.bevelEnabled ?? bevelEnabled;
  bevelSize = state.globalDefaults?.bevelSize ?? bevelSize;
  currentModelSource = state.source ?? currentModelSource;
  rerenderCurrentModel();
  const meshes = getEditableMeshes();
  state.meshes?.forEach(saved => {
    const mesh = meshes[saved.index] ?? meshes.find(item => item.name === saved.key);
    if (mesh) syncStateFromMesh(mesh, saved);
  });
  wireframeOn = !!state.wireframeOn;
  meshes.forEach(mesh => { mesh.material.wireframe = wireframeOn; });
  lightPreset = state.sceneLooks?.lightPreset ?? lightPreset;
  backgroundPreset = state.sceneLooks?.backgroundPreset ?? backgroundPreset;
  applySceneLooks();
  document.getElementById('lightPreset').value = lightPreset;
  document.getElementById('backgroundPreset').value = backgroundPreset;
  panelDock = state.panelDock ?? panelDock;
  updatePanelDock();
  downloadFormat = state.downloadFormat ?? downloadFormat;
  document.getElementById('downloadFormat').value = downloadFormat;
  document.getElementById('toggleWire').textContent = wireframeOn ? 'Solid' : 'Wireframe';
  selectMesh(null);
  updateExportStats();
  if (!skipHistory) recordHistory();
}

function undoChange() {
  if (historyStack.length < 2) {
    showNotification('Nothing to undo yet.', 'error');
    return;
  }
  const current = historyStack.pop();
  redoStack.push(current);
  applyProjectState(JSON.parse(historyStack[historyStack.length - 1]), { skipHistory: true });
}

function redoChange() {
  if (redoStack.length === 0) {
    showNotification('Nothing to redo yet.', 'error');
    return;
  }
  const next = redoStack.pop();
  historyStack.push(next);
  applyProjectState(JSON.parse(next), { skipHistory: true });
}

function saveProjectToFile() {
  const blob = new Blob([JSON.stringify(captureProjectState(), null, 2)], { type: 'application/json' });
  triggerDownload(blob, 'svg-to-3d-project.json');
  showNotification('Project saved!', 'success');
}

function loadProjectFromText(text) {
  try {
    const state = JSON.parse(text);
    applyProjectState(state);
    showNotification('Project loaded!', 'success');
  } catch (error) {
    console.error(error);
    showNotification('Could not load project file.', 'error');
  }
}

function updatePanelDock() {
  panel.classList.toggle('right', panelDock === 'right');
  panelOpenBtn.style.left = panelDock === 'right' ? 'auto' : '12px';
  panelOpenBtn.style.right = panelDock === 'right' ? '12px' : 'auto';
}

function applySceneLooks() {
  const lightPresets = {
    studio: { ambient: 0.85, dir: 1.05, fill: 0.2, dirColor: 0xffffff, fillColor: 0xffffff },
    daylight: { ambient: 0.92, dir: 0.95, fill: 0.18, dirColor: 0xfffaf0, fillColor: 0xffffff },
    dramatic: { ambient: 0.5, dir: 1.25, fill: 0.12, dirColor: 0xffffff, fillColor: 0xf5f7ff },
    soft: { ambient: 0.95, dir: 0.85, fill: 0.12, dirColor: 0xffffff, fillColor: 0xffffff }
  };
  const backgroundPresets = {
    sky: 0xb8cfe0,
    night: 0x1e2636,
    sand: 0xd9c9b2,
    mint: 0xc2ddd5
  };
  const light = lightPresets[lightPreset] ?? lightPresets.studio;
  ambientLight.intensity = light.ambient;
  dirLight.intensity = light.dir;
  fillLight.intensity = light.fill;
  dirLight.color.setHex(light.dirColor);
  fillLight.color.setHex(light.fillColor);
  scene.background = new THREE.Color(backgroundPresets[backgroundPreset] ?? backgroundPresets.sky);
}

function countTriangles(mesh) {
  const geometry = mesh.geometry;
  if (!geometry?.attributes?.position) return 0;
  return geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
}

function getMeshBox(mesh) {
  return new THREE.Box3().setFromObject(mesh);
}

function updateExportStats() {
  const statsEl = document.getElementById('exportStats');
  if (!statsEl) return;
  const meshes = getEditableMeshes();
  if (meshes.length === 0) {
    statsEl.innerHTML = 'No model loaded.';
    return;
  }
  let triangleCount = 0;
  let overlapWarnings = 0;
  meshes.forEach(mesh => { triangleCount += countTriangles(mesh); });
  for (let i = 0; i < meshes.length; i++) {
    const a = getMeshBox(meshes[i]);
    for (let j = i + 1; j < meshes.length; j++) {
      const b = getMeshBox(meshes[j]);
      if (a.intersectsBox(b)) overlapWarnings += 1;
    }
  }
  statsEl.innerHTML = `<strong>${meshes.length} meshes</strong>
  ${Math.round(triangleCount).toLocaleString()} triangles<br/>
  ${overlapWarnings > 0 ? `${overlapWarnings} overlap warning${overlapWarnings > 1 ? 's' : ''}` : 'No overlap warnings detected'}<br/>
  Best compatibility: GLB, OBJ, STL`;
}

function applyGeometrySettingsToMesh(mesh, settings) {
  Object.assign(getMeshGeometrySettings(mesh), settings);
  rebuildMeshGeometry(mesh);
}

function applyGeometryToSelection(targetMeshes) {
  if (targetMeshes.length === 0) {
    showNotification('Select a mesh first to change individual geometry.', 'error');
    return;
  }
  const geometrySettings = {
    depth: extrusionDepth,
    bevelEnabled,
    bevelSize
  };
  targetMeshes.forEach(mesh => applyGeometrySettingsToMesh(mesh, geometrySettings));
  updateSelectionUI();
  updateExportStats();
  refreshMeshList();
  recordHistory();
}

function getActiveTargetMeshes() {
  return selectedMeshes.length > 0 ? selectedMeshes : getEditableMeshes();
}

function applyGeometryLive() {
  const targetMeshes = getActiveTargetMeshes();
  if (targetMeshes.length === 0) return;
  const geometrySettings = {
    depth: extrusionDepth,
    bevelEnabled,
    bevelSize
  };
  targetMeshes.forEach(mesh => applyGeometrySettingsToMesh(mesh, geometrySettings));
  updateSelectionUI();
  updateExportStats();
  refreshMeshList();
}

function centerSelectedMeshes() {
  if (selectedMeshes.length === 0) {
    showNotification('Select at least one mesh first.', 'error');
    return;
  }
  selectedMeshes.forEach(mesh => {
    applyTransformToMesh(mesh, 0, 0, getMeshTransformState(mesh).scale);
  });
  refreshMeshList();
  updateExportStats();
  recordHistory();
}

function alignSelectedMeshes(mode) {
  if (selectedMeshes.length === 0) {
    showNotification('Select at least one mesh first.', 'error');
    return;
  }
  const boxes = selectedMeshes.map(getMeshBox);
  let target;
  if (mode === 'left') {
    target = Math.min(...boxes.map(box => box.min.x));
  }
  if (mode === 'bottom') {
    target = Math.min(...boxes.map(box => box.min.y));
  }
  selectedMeshes.forEach((mesh) => {
    const box = getMeshBox(mesh);
    const state = getMeshTransformState(mesh);
    if (mode === 'left') {
      state.offsetX += target - box.min.x;
    }
    if (mode === 'bottom') {
      state.offsetY += target - box.min.y;
    }
    applyTransformStateToMesh(mesh, state);
  });
  refreshMeshList();
  updateExportStats();
  recordHistory();
}

function distributeSelectedHorizontally() {
  if (selectedMeshes.length === 0) {
    showNotification('Select at least one mesh first.', 'error');
    return;
  }
  if (selectedMeshes.length === 1) {
    centerSelectedMeshes();
    showNotification('Single selected mesh centered.', 'success');
    return;
  }
  if (selectedMeshes.length === 2) {
    showNotification('Two selected meshes are already spaced by their current positions.', 'info');
    return;
  }
  const ordered = [...selectedMeshes].sort((a, b) => getMeshBox(a).min.x - getMeshBox(b).min.x);
  const first = getMeshBox(ordered[0]).min.x;
  const last = getMeshBox(ordered[ordered.length - 1]).min.x;
  const step = (last - first) / (ordered.length - 1);
  ordered.forEach((mesh, index) => {
    if (index === 0 || index === ordered.length - 1) return;
    const box = getMeshBox(mesh);
    const state = getMeshTransformState(mesh);
    state.offsetX += (first + step * index) - box.min.x;
    applyTransformStateToMesh(mesh, state);
  });
  refreshMeshList();
  updateExportStats();
  recordHistory();
}

function deleteMeshes(meshesToDelete) {
  if (!currentSVGGroup || meshesToDelete.length === 0) {
    showNotification('Nothing to delete.', 'error');
    return;
  }
  meshesToDelete.forEach(mesh => {
    clearMeshHighlight(mesh);
    mesh.parent?.remove(mesh); // Fix: Remove from actual parent (could be nested)
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) disposeMaterial(mesh.material);
  });
  selectedMeshes = [];
  selectedMesh = null;
  updateSelectionUI();
  refreshMeshList();
  updateExportStats();
  if (getEditableMeshes().length === 0) {
    currentModelSource = { type: 'default', value: null };
  }
  recordHistory();
}

// Notification system
function showNotification(message, type = 'info') {
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();

  const notif = document.createElement('div');
  notif.className = 'notification';
  notif.style.cssText = `
    position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
    padding:12px 24px; border-radius:8px; font-family:Inter,sans-serif;
    font-size:14px; z-index:10000; transition:opacity 0.3s;
    background:${type === 'success' ? '#1a1a2e' : type === 'error' ? '#2e1a1a' : '#1a2e2e'};
    color:${type === 'success' ? '#6ec87a' : type === 'error' ? '#d94a6b' : '#4ac8d9'};
    border:1px solid ${type === 'success' ? '#2a3a2e' : type === 'error' ? '#3a2a2a' : '#2a3a3a'};
  `;
  notif.textContent = message;
  document.body.appendChild(notif);
  setTimeout(() => { notif.style.opacity = '0'; setTimeout(() => notif.remove(), 300); }, 2500);
}

// ========== UI =========
const style = document.createElement('style');
style.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  
  :root {
    --accent: #4a90d9;
    --accent-glow: rgba(74, 144, 217, 0.3);
    --bg-panel: rgba(13, 13, 23, 0.85);
    --bg-card: rgba(255, 255, 255, 0.04);
    --border: rgba(255, 255, 255, 0.08);
    --text-main: #e0e0e0;
    --text-dim: rgba(255, 255, 255, 0.4);
    --radius: 12px;
  }

  .panel {
    position: fixed;
    top: 12px;
    left: 12px;
    width: 320px;
    max-height: calc(100vh - 24px);
    display: flex;
    flex-direction: column;
    background: var(--bg-panel);
    backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-family: 'Inter', system-ui, sans-serif;
    color: var(--text-main);
    z-index: 1000;
    box-shadow: 0 12px 40px rgba(0,0,0,0.5);
    overflow: hidden;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  .panel-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  
  .panel-header h2 {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.2px;
    color: #fff;
  }

  .tabs-nav {
    display: flex;
    padding: 4px;
    background: rgba(0,0,0,0.2);
    margin: 12px 16px;
    border-radius: 10px;
    gap: 2px;
  }
  
  .tab-btn {
    flex: 1;
    padding: 8px;
    border: none;
    background: transparent;
    color: var(--text-dim);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border-radius: 8px;
    transition: all 0.2s;
  }
  
  .tab-btn:hover { color: #fff; }
  .tab-btn.active {
    background: var(--bg-card);
    color: var(--accent);
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 0 16px 16px;
    height: 100%;
    min-height: 0;
  }
  
  .panel-content::-webkit-scrollbar { width: 4px; }
  .panel-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

  .tab-pane { display: none; }
  .tab-pane.active { 
    display: block; 
    animation: fadeIn 0.3s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .control-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px;
    margin-bottom: 12px;
  }

  .section-label {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn {
    width: 100%;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-family: inherit;
  }
  
  .btn-primary {
    background: var(--accent);
    color: #fff;
    border: none;
    box-shadow: 0 4px 12px var(--accent-glow);
  }
  .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 16px var(--accent-glow); }
  
  .btn-secondary {
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-main);
  }
  .btn-secondary:hover { background: rgba(255, 255, 255, 0.1); }

  .btn-success {
    background: #2d8a4e;
    color: #fff;
    border: none;
  }

  .toolbar-mini {
    display: flex;
    gap: 6px;
    margin-bottom: 16px;
  }
  .toolbar-mini .btn { padding: 8px; font-size: 11px; }

  .slider-row {
    margin: 12px 0;
  }
  .slider-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .slider-header label { font-size: 12px; color: var(--text-main); }
  .slider-header .val { display: none; }
  
  .input-group {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  
  .num-input {
    width: 54px;
    height: 28px;
    background: rgba(0,0,0,0.2);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: #fff;
    font-size: 11px;
    text-align: center;
    -webkit-appearance: none;
    -moz-appearance: textfield;
  }
  
  .num-input::-webkit-outer-spin-button,
  .num-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  input[type="range"] {
    -webkit-appearance: none;
    width: 100%;
    height: 4px;
    background: rgba(255,255,255,0.1);
    border-radius: 2px;
    outline: none;
  }
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    background: var(--accent);
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 0 10px var(--accent-glow);
  }

  .svg-input {
    width: 100%;
    height: 100px;
    background: rgba(0,0,0,0.2);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: #aaa;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 11px;
    padding: 10px;
    resize: none;
    outline: none;
  }

  .presets-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .preset-btn {
    padding: 8px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-main);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .preset-btn:hover { border-color: var(--accent); color: var(--accent); }

  .panel-footer {
    padding: 16px;
    background: rgba(0,0,0,0.3);
    border-top: 1px solid var(--border);
  }

  .stat-box {
    font-size: 11px;
    color: var(--text-dim);
    margin-bottom: 12px;
    line-height: 1.6;
  }
  .stat-box strong { color: #fff; display: block; font-size: 13px; margin-bottom: 2px; }

  .panel.right { left: auto; right: 12px; }
`;
document.head.appendChild(style);

// Panel HTML
const panel = document.createElement('div');
panel.className = 'panel';
panel.innerHTML = `
  <div class="panel-header">
    <h2>3D Creator</h2>
    <div style="display:flex; gap:8px;">
      <button id="dockToggleBtn" class="btn-secondary" style="padding:6px 10px; border-radius:6px; border:none; cursor:pointer;" title="Switch Side">Switch Side</button>
      <button id="panelCloseBtn" class="btn-secondary" style="padding:6px 10px; border-radius:6px; border:none; cursor:pointer;" title="Close">Hide</button>
    </div>
  </div>

  <div class="tabs-nav">
    <button class="tab-btn active" data-tab="create">Create</button>
    <button class="tab-btn" data-tab="design">Design</button>
    <button class="tab-btn" data-tab="arrange">Arrange</button>
  </div>

  <div class="panel-content">
    <div class="toolbar-mini">
      <button class="btn btn-secondary" id="undoBtn" title="Undo">Undo</button>
      <button class="btn btn-secondary" id="redoBtn" title="Redo">Redo</button>
      <button class="btn btn-secondary" id="saveProjectBtn" title="Save Project">Save</button>
      <button class="btn btn-secondary" id="loadProjectBtn" title="Load Project">Open</button>
    </div>

    <div class="tab-pane active" id="tab-create">
      <div class="control-card">
        <div class="section-label">Import File</div>
        <div id="fileUpload" class="upload-zone">
          <span style="font-size:12px;opacity:0.8;">Drop SVG file here</span>
          <textarea id="svgInput" placeholder="...or paste SVG code here" style="width:100%; height:80px; margin-top:10px; background:rgba(0,0,0,0.2); border:1px solid var(--border); border-radius:8px; color:#fff; font-size:11px; padding:8px; resize:none; overflow-y:auto; scrollbar-width:thin;"></textarea>
        </div>
        <div class="btn-group-dual" style="margin-top:10px;">
          <button class="btn btn-secondary" id="importSvgBtn">Choose File</button>
          <button class="btn btn-primary" id="convertBtn">Convert Code</button>
        </div>
      </div>

      <div class="control-card">
        <div class="section-label">Shape Generator</div>
        <div class="input-group">
          <input type="text" id="shapeLabelInput" placeholder="Describe a shape (e.g. 'lightning bolt')..." style="flex:1; padding:12px; background:rgba(0,0,0,0.2); border:1px solid var(--border); border-radius:10px; color:#fff; font-size:13px; outline:none; transition:border-color 0.2s;"/>
          <button class="btn btn-primary" id="generateShapeBtn" style="width:auto; padding:0 18px;">Create</button>
        </div>
      </div>

      <div class="control-card">
        <div class="section-label">Library Presets</div>
        <div class="presets-grid">
          <button class="preset-btn" data-preset="star">Star</button>
          <button class="preset-btn" data-preset="heart">Heart</button>
          <button class="preset-btn" data-preset="gear">Gear</button>
          <button class="preset-btn" data-preset="arrow">Arrow</button>
          <button class="preset-btn" data-preset="logo">Logo</button>
          <button class="preset-btn" data-preset="crown">Crown</button>
        </div>
      </div>
    </div>

    <!-- DESIGN TAB -->
    <div class="tab-pane" id="tab-design">
      <div class="control-card">
        <div class="section-label">Geometry Settings</div>
        <div class="slider-row">
          <div class="slider-header"><label>Extrusion Depth</label></div>
          <div class="input-group">
            <input type="range" id="depthSlider" min="1" max="50" value="10">
            <input type="number" id="depthInput" class="num-input" value="10">
          </div>
        </div>
        <div class="slider-row">
          <div class="slider-header"><label>Bevel Radius</label></div>
          <div class="input-group">
            <input type="range" id="bevelSlider" min="0" max="3" step="0.1" value="0.5">
            <input type="number" id="bevelInput" class="num-input" value="0.5">
          </div>
        </div>
        <div class="toggle-row">
          <label style="font-size:12px;">Enable Beveling</label>
          <div class="toggle active" id="bevelToggle"></div>
        </div>
        <div class="btn-group-dual" style="margin-top:12px;">
          <button class="btn btn-secondary" id="applyGeometrySelected">Apply to Selected</button>
          <button class="btn btn-secondary" id="applyGeometryAll">Apply to All</button>
        </div>
      </div>

      <div class="control-card">
        <div class="section-label">Material & Color</div>
        <div id="selectionInfo" style="display:none; align-items:center; gap:8px; margin-bottom:12px; padding:8px; background:rgba(74,144,217,0.1); border:1px solid var(--accent-glow); border-radius:8px;">
          <span id="selectionName" style="font-size:11px; color:var(--accent); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Target Object</span>
          <span id="deselectBtn" style="font-size:14px; cursor:pointer;" title="Deselect">Clear</span>
        </div>
        <div class="slider-row">
          <div class="slider-header"><label>Surface Color</label></div>
          <input type="color" id="matColorPicker" value="#4a90d9" style="width:100%; height:32px; border:none; border-radius:6px; background:transparent; cursor:pointer;">
        </div>
        <div class="slider-row">
          <div class="slider-header"><label>Metallic Finish</label></div>
          <div class="input-group">
            <input type="range" id="metalnessSlider" min="0" max="1" step="0.05" value="0.3">
            <input type="number" id="metalnessInput" class="num-input" value="0.3">
          </div>
        </div>
        <div class="slider-row">
          <div class="slider-header"><label>Surface Roughness</label></div>
          <div class="input-group">
            <input type="range" id="roughnessSlider" min="0" max="1" step="0.05" value="0.4">
            <input type="number" id="roughnessInput" class="num-input" value="0.4">
          </div>
        </div>
        <div class="btn-group-dual" style="margin-top:12px;">
          <button class="btn btn-secondary" id="applyMatBtn">Apply to Selected</button>
          <button class="btn btn-secondary" id="applyMatAllBtn">Apply to All</button>
        </div>
      </div>

      <div class="control-card">
        <div class="section-label">Environment Settings</div>
        <div class="slider-row">
          <label style="font-size:12px; display:block; margin-bottom:6px;">Lighting Setup</label>
          <select id="lightPreset" class="panel-select" style="width:100%; padding:8px; border-radius:8px; background:rgba(0,0,0,0.2); border:1px solid var(--border); color:#fff; outline:none;">
            <option value="studio">Studio Environment</option>
            <option value="daylight">Outdoor Daylight</option>
            <option value="dramatic">High Contrast</option>
            <option value="soft">Soft Ambient</option>
          </select>
        </div>
        <div class="slider-row">
          <label style="font-size:12px; display:block; margin-bottom:6px;">Viewport Background</label>
          <select id="backgroundPreset" class="panel-select" style="width:100%; padding:8px; border-radius:8px; background:rgba(0,0,0,0.2); border:1px solid var(--border); color:#fff; outline:none;">
            <option value="sky">Clear Sky</option>
            <option value="night">Classic Dark</option>
            <option value="sand">Neutral Warm</option>
            <option value="mint">Neutral Cool</option>
          </select>
        </div>
      </div>
    </div>    <!-- ARRANGE TAB -->
    <div class="tab-pane" id="tab-arrange">
      <div class="control-card">
        <div class="section-label">Translation & Position</div>
        <div class="slider-row">
          <div class="slider-header"><label>Y Position</label></div>
          <div class="input-group">
            <input type="range" id="offsetYSlider" min="-100" max="100" step="0.5" value="0">
            <input type="number" id="offsetYInput" class="num-input" value="0">
          </div>
        </div>
        <div class="slider-row">
          <div class="slider-header"><label>X Position</label></div>
          <div class="input-group">
            <input type="range" id="offsetXSlider" min="-100" max="100" step="0.5" value="0">
            <input type="number" id="offsetXInput" class="num-input" value="0">
          </div>
        </div>
        <div class="slider-row">
          <div class="slider-header"><label>Uniform Scale</label></div>
          <div class="input-group">
            <input type="range" id="scaleSlider" min="0.1" max="5" step="0.05" value="1.0">
            <input type="number" id="scaleInput" class="num-input" value="1.0">
          </div>
        </div>
      </div>

      <div class="control-card">
        <div class="section-label">Rotation Settings</div>
        <div class="slider-row">
          <div class="slider-header"><label>Rotation X (Vertical)</label></div>
          <div class="input-group">
            <input type="range" id="rotateXSlider" min="-180" max="180" step="1" value="0">
            <input type="number" id="rotateXInput" class="num-input" value="0">
          </div>
        </div>
        <div class="slider-row">
          <div class="slider-header"><label>Rotation Y (Horizontal)</label></div>
          <div class="input-group">
            <input type="range" id="rotateYSlider" min="-180" max="180" step="1" value="0">
            <input type="number" id="rotateYInput" class="num-input" value="0">
          </div>
        </div>
        <div class="slider-row">
          <div class="slider-header"><label>Rotation Z (Roll)</label></div>
          <div class="input-group">
            <input type="range" id="rotateZSlider" min="-180" max="180" step="1" value="0">
            <input type="number" id="rotateZInput" class="num-input" value="0">
          </div>
        </div>
      </div>

      <div class="control-card">
        <div class="section-label">Layout Alignment</div>
        <div class="grid-tools" style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <button class="btn btn-secondary" id="centerSelectedBtn" style="font-size:11px;">Reset Placement</button>
          <button class="btn btn-secondary" id="alignLeftBtn" style="font-size:11px;">Align Min X</button>
          <button class="btn btn-secondary" id="alignBottomBtn" style="font-size:11px;">Align Min Y</button>
          <button class="btn btn-secondary" id="distributeHorizBtn" style="font-size:11px;">Distribute X</button>
        </div>
        <div class="btn-group-dual" style="margin-top:12px;">
          <button class="btn btn-primary" id="applyTransformSelected">Apply Selection</button>
          <button class="btn btn-secondary" id="applyTransformAll">Apply to All</button>
        </div>
      </div>

      <div class="control-card">
        <div class="section-label">Mesh Organization</div>
        <div class="input-group" style="margin-bottom:10px;">
          <input type="text" id="renameInput" placeholder="New object name..." style="flex:1; padding:10px; background:rgba(0,0,0,0.2); border:1px solid var(--border); border-radius:8px; color:#fff; font-size:12px; outline:none;"/>
          <button class="btn btn-secondary" id="renameBtn" style="width:auto; padding:10px 14px;">Rename</button>
        </div>
        <div id="meshList" class="mesh-list-container" style="max-height:200px; overflow-y:auto; padding-right:4px;">
           <!-- Parts will appear here -->
        </div>
        <div class="btn-group-dual" style="margin-top:12px;">
          <button class="btn btn-secondary" id="deleteSelectedBtn" style="color:#ff6b6b; border-color:rgba(255,107,107,0.2);">Delete Selected</button>
          <button class="btn btn-secondary" id="deleteAllBtn" style="color:#ff6b6b; border-color:rgba(255,107,107,0.2);">Delete All</button>
        </div>
      </div>
    </div>
  </div>

  <div class="panel-footer">
    <div id="exportStats" class="stat-box">No model loaded.</div>
    <div class="input-group">
      <select id="downloadFormat" class="panel-select" style="flex:0.6; padding:8px; border-radius:8px; background:rgba(255,255,255,0.05); border:1px solid var(--border); color:#fff; font-size:12px; outline:none;">
        <option value="glb">GLB</option>
        <option value="gltf">GLTF</option>
        <option value="obj">OBJ</option>
        <option value="fbx">FBX</option>
        <option value="stl">STL</option>
      </select>
      <button class="btn btn-success" id="downloadModel" style="flex:1;">⬇ Download</button>
    </div>
    <div class="btn-row" style="margin-top:10px;">
      <button class="btn btn-secondary" id="resetCam" style="font-size:11px;">↺ Reset View</button>
      <button class="btn btn-secondary" id="toggleWire" style="font-size:11px;">◫ Wireframe</button>
    </div>
  </div>
`;
document.body.appendChild(panel);

// Tab switching logic
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');
  });
});

// Panel toggle button (visible when panel is closed)
const panelOpenBtn = document.createElement('button');
panelOpenBtn.id = 'panelOpenBtn';
panelOpenBtn.innerHTML = '☰';
panelOpenBtn.style.cssText = `
  position:fixed; top:12px; left:12px; z-index:1001;
  width:40px; height:40px; border-radius:10px;
  background:rgba(18,18,30,0.92); backdrop-filter:blur(12px);
  border:1px solid rgba(255,255,255,0.08); color:#e0e0e0;
  font-size:20px; cursor:pointer; display:none;
  align-items:center; justify-content:center;
  font-family:Inter,sans-serif; transition:background 0.2s;
`;
panelOpenBtn.addEventListener('mouseenter', () => { panelOpenBtn.style.background = 'rgba(74,144,217,0.25)'; });
panelOpenBtn.addEventListener('mouseleave', () => { panelOpenBtn.style.background = 'rgba(18,18,30,0.92)'; });
document.body.appendChild(panelOpenBtn);

// Panel close/open logic
document.getElementById('panelCloseBtn').addEventListener('click', () => {
  panel.style.display = 'none';
  panelOpenBtn.style.display = 'flex';
});
panelOpenBtn.addEventListener('click', () => {
  panel.style.display = 'block';
  panelOpenBtn.style.display = 'none';
});
document.getElementById('dockToggleBtn').addEventListener('click', () => {
  panelDock = panelDock === 'left' ? 'right' : 'left';
  updatePanelDock();
});
document.getElementById('undoBtn').addEventListener('click', undoChange);
document.getElementById('redoBtn').addEventListener('click', redoChange);
document.getElementById('saveProjectBtn').addEventListener('click', saveProjectToFile);
document.getElementById('loadProjectBtn').addEventListener('click', () => projectFileInput.click());

// Hidden file input
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.svg';
fileInput.style.display = 'none';
document.body.appendChild(fileInput);

const projectFileInput = document.createElement('input');
projectFileInput.type = 'file';
projectFileInput.accept = '.json';
projectFileInput.style.display = 'none';
document.body.appendChild(projectFileInput);
projectFileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => loadProjectFromText(e.target.result);
  reader.readAsText(file);
});

// Preset SVGs
const presets = {
  star: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <polygon points="50,5 61,35 95,35 68,57 79,90 50,70 21,90 32,57 5,35 39,35" fill="#4a90d9"/>
  </svg>`,
  heart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path d="M50,88 C25,65 5,50 5,30 C5,12 18,2 33,2 C42,2 48,8 50,12 C52,8 58,2 67,2 C82,2 95,12 95,30 C95,50 75,65 50,88Z" fill="#d94a6b"/>
  </svg>`,
  gear: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path d="M50,10 L55,10 L58,20 L68,15 L72,19 L65,28 L75,33 L73,38 L62,37 L63,48 L58,48 L55,38 L50,35 L45,38 L42,48 L37,48 L38,37 L27,38 L25,33 L35,28 L28,19 L32,15 L42,20 L45,10Z" fill="#e8a84c"/>
    <circle cx="50" cy="32" r="8" fill="none" stroke="#e8a84c" stroke-width="3"/>
    <path d="M50,55 L55,55 L58,65 L68,60 L72,64 L65,73 L75,78 L73,83 L62,82 L63,93 L58,93 L55,83 L50,80 L45,83 L42,93 L37,93 L38,82 L27,83 L25,78 L35,73 L28,64 L32,60 L42,65 L45,55Z" fill="#c882d9"/>
  </svg>`,
  arrow: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <polygon points="50,5 85,50 65,50 65,95 35,95 35,50 15,50" fill="#6ec87a"/>
  </svg>`,
  logo: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
    <rect x="10" y="10" width="40" height="40" rx="6" fill="#4a90d9"/>
    <rect x="60" y="10" width="50" height="40" rx="6" fill="#c882d9"/>
    <rect x="10" y="60" width="50" height="50" rx="6" fill="#6ec87a"/>
    <rect x="70" y="60" width="40" height="50" rx="6" fill="#e8a84c"/>
    <circle cx="60" cy="60" r="12" fill="#d94a6b"/>
  </svg>`
};

// Event listeners
document.getElementById('importSvgBtn').addEventListener('click', () => fileInput.click());
document.getElementById('fileUpload').addEventListener('click', (e) => { 
  if (e.target.tagName !== 'TEXTAREA') fileInput.click(); 
});
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) loadSvgFile(file);
});

// Drag and drop
const uploadArea = document.getElementById('fileUpload');
uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.borderColor = 'rgba(74,144,217,0.5)'; });
uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = 'rgba(255,255,255,0.12)'; });
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.style.borderColor = 'rgba(255,255,255,0.12)';
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.svg')) loadSvgFile(file);
});

document.getElementById('convertBtn').addEventListener('click', () => {
  const svgText = document.getElementById('svgInput').value.trim();
  if (svgText) {
    svgTo3D(svgText, { type: 'svg', value: svgText });
    updateExportStats();
    recordHistory();
  }
  else showNotification('Please paste or upload SVG code.', 'error');
});

document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const preset = btn.dataset.preset;
    if (presets[preset]) {
      document.getElementById('svgInput').value = presets[preset];
      svgTo3D(presets[preset], { type: 'preset', value: presets[preset] });
      updateExportStats();
      recordHistory();
    }
  });
});

const depthSlider = document.getElementById('depthSlider');
const depthInput = document.getElementById('depthInput');
function syncDepth(value) {
  extrusionDepth = parseFloat(value);
  depthSlider.value = extrusionDepth;
  depthInput.value = extrusionDepth;
  applyGeometryLive();
}
depthSlider.addEventListener('input', () => syncDepth(depthSlider.value));
depthInput.addEventListener('input', () => syncDepth(depthInput.value));

const bevelSlider = document.getElementById('bevelSlider');
const bevelInput = document.getElementById('bevelInput');
function syncBevel(value) {
  bevelSize = parseFloat(value);
  bevelSlider.value = bevelSize;
  bevelInput.value = bevelSize;
  applyGeometryLive();
}
bevelSlider.addEventListener('input', () => syncBevel(bevelSlider.value));
bevelInput.addEventListener('input', () => syncBevel(bevelInput.value));

const bevelToggle = document.getElementById('bevelToggle');
bevelToggle.addEventListener('click', () => {
  bevelEnabled = !bevelEnabled;
  bevelToggle.classList.toggle('active');
  applyGeometryLive();
});

document.getElementById('applyGeometrySelected').addEventListener('click', () => applyGeometryToSelection(selectedMeshes));
document.getElementById('applyGeometryAll').addEventListener('click', () => applyGeometryToSelection(getEditableMeshes()));

const downloadFormatSelect = document.getElementById('downloadFormat');
downloadFormatSelect.addEventListener('change', (e) => {
  downloadFormat = e.target.value;
});

document.getElementById('downloadModel').addEventListener('click', () => exportCurrentModel());

// Shape generator controls
document.getElementById('generateShapeBtn').addEventListener('click', () => {
  handleShapeGeneration(document.getElementById('shapeLabelInput').value);
});
document.getElementById('shapeLabelInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleShapeGeneration(document.getElementById('shapeLabelInput').value);
});
document.getElementById('renameBtn').addEventListener('click', () => {
  if (!selectedMesh) {
    showNotification('Select a mesh first to rename it.', 'error');
    return;
  }
  const value = document.getElementById('renameInput').value.trim();
  if (!value) {
    showNotification('Enter a new name first.', 'error');
    return;
  }
  selectedMesh.name = value;
  document.getElementById('selectionName').textContent = value;
  refreshMeshList();
  updateExportStats();
  recordHistory();
});
document.getElementById('deleteSelectedBtn').addEventListener('click', () => {
  deleteMeshes([...selectedMeshes]);
});
document.getElementById('deleteAllBtn').addEventListener('click', () => {
  deleteMeshes(getEditableMeshes());
});
document.getElementById('lightPreset').addEventListener('change', (e) => {
  lightPreset = e.target.value;
  applySceneLooks();
  recordHistory();
});
document.getElementById('backgroundPreset').addEventListener('change', (e) => {
  backgroundPreset = e.target.value;
  applySceneLooks();
  recordHistory();
});

document.getElementById('resetCam').addEventListener('click', () => {
  centerCameraOnGroup();
});

// Position sliders
const offsetYSlider = document.getElementById('offsetYSlider');
const offsetYInput = document.getElementById('offsetYInput');
function syncOffsetY(value) {
  transformOffsetY = parseFloat(value);
  offsetYSlider.value = transformOffsetY;
  offsetYInput.value = transformOffsetY;
  applyTransformToSelected(true);
}
offsetYSlider.addEventListener('input', () => syncOffsetY(offsetYSlider.value));
offsetYInput.addEventListener('input', () => syncOffsetY(offsetYInput.value));

const offsetXSlider = document.getElementById('offsetXSlider');
const offsetXInput = document.getElementById('offsetXInput');
function syncOffsetX(value) {
  transformOffsetX = parseFloat(value);
  offsetXSlider.value = transformOffsetX;
  offsetXInput.value = transformOffsetX;
  applyTransformToSelected(true);
}
offsetXSlider.addEventListener('input', () => syncOffsetX(offsetXSlider.value));
offsetXInput.addEventListener('input', () => syncOffsetX(offsetXInput.value));

const scaleSlider = document.getElementById('scaleSlider');
const scaleInput = document.getElementById('scaleInput');
function syncScale(value) {
  transformScale = parseFloat(value);
  scaleSlider.value = transformScale;
  scaleInput.value = transformScale;
  applyTransformToSelected(true);
}
scaleSlider.addEventListener('input', () => syncScale(scaleSlider.value));
scaleInput.addEventListener('input', () => syncScale(scaleInput.value));

const rotateXSlider = document.getElementById('rotateXSlider');
const rotateXInput = document.getElementById('rotateXInput');
function syncRotateX(value) {
  transformRotationX = parseFloat(value);
  rotateXSlider.value = transformRotationX;
  rotateXInput.value = transformRotationX;
  applyTransformToSelected(true);
}
rotateXSlider.addEventListener('input', () => syncRotateX(rotateXSlider.value));
rotateXInput.addEventListener('input', () => syncRotateX(rotateXInput.value));

const rotateYSlider = document.getElementById('rotateYSlider');
const rotateYInput = document.getElementById('rotateYInput');
function syncRotateY(value) {
  transformRotationY = parseFloat(value);
  rotateYSlider.value = transformRotationY;
  rotateYInput.value = transformRotationY;
  applyTransformToSelected(true);
}
rotateYSlider.addEventListener('input', () => syncRotateY(rotateYSlider.value));
rotateYInput.addEventListener('input', () => syncRotateY(rotateYInput.value));

const rotateZSlider = document.getElementById('rotateZSlider');
const rotateZInput = document.getElementById('rotateZInput');
function syncRotateZ(value) {
  transformRotationZ = parseFloat(value);
  rotateZSlider.value = transformRotationZ;
  rotateZInput.value = transformRotationZ;
  applyTransformToSelected(true);
}
rotateZSlider.addEventListener('input', () => syncRotateZ(rotateZSlider.value));
rotateZInput.addEventListener('input', () => syncRotateZ(rotateZInput.value));

function applyTransformToSelected(isLive = false) {
  const targetMeshes = getActiveTargetMeshes();
  if (targetMeshes.length === 0) {
    if (!isLive) showNotification('Select an object first to apply changes.', 'error');
    return;
  }
  targetMeshes.forEach(mesh => {
    applyTransformToMesh(mesh, transformOffsetX, transformOffsetY, transformRotationX, transformRotationY, transformRotationZ, transformScale);
  });
  
  if (!isLive) {
    showNotification(`Updates applied to ${targetMeshes.length} object${targetMeshes.length > 1 ? 's' : ''}.`, 'success');
    refreshMeshList();
    updateExportStats();
    recordHistory();
  } else {
    refreshMeshList();
    updateExportStats();
  }
}

function applyTransformToAll() {
  if (!currentSVGGroup) {
    showNotification('No data to update.', 'error');
    return;
  }
  currentSVGGroup.traverse(child => {
    if (child.isMesh) {
      applyTransformToMesh(child, transformOffsetX, transformOffsetY, transformRotationX, transformRotationY, transformRotationZ, transformScale);
    }
  });
  showNotification('Updates applied to all objects.', 'success');
  refreshMeshList();
  updateExportStats();
  recordHistory();
}

document.getElementById('applyTransformSelected').addEventListener('click', () => applyTransformToSelected());
document.getElementById('applyTransformAll').addEventListener('click', applyTransformToAll);
document.getElementById('centerSelectedBtn').addEventListener('click', centerSelectedMeshes);
document.getElementById('alignLeftBtn').addEventListener('click', () => alignSelectedMeshes('left'));
document.getElementById('alignBottomBtn').addEventListener('click', () => alignSelectedMeshes('bottom'));
document.getElementById('distributeHorizBtn').addEventListener('click', distributeSelectedHorizontally);

// Mesh list panel
function refreshMeshList() {
  const meshList = document.getElementById('meshList');
  meshList.innerHTML = '';
  if (!currentSVGGroup) {
    meshList.innerHTML = '<div style="font-size:11px;color:rgba(255,255,255,0.25);padding:4px 0;">No model loaded.</div>';
    return;
  }
  const meshes = [];
  currentSVGGroup.traverse(child => { if (child.isMesh) meshes.push(child); });
  if (meshes.length === 0) {
    meshList.innerHTML = '<div style="font-size:11px;color:rgba(255,255,255,0.25);padding:4px 0;">No meshes found.</div>';
    return;
  }
  meshes.forEach((mesh, i) => {
    const row = document.createElement('div');
    row.dataset.meshIndex = i;
    const isSelected = selectedMeshes.includes(mesh);
    const hexColor = '#' + mesh.material.color.getHexString();
    row.style.cssText = `
      display:flex; align-items:center; gap:8px; padding:6px 8px;
      border-radius:7px; cursor:pointer; transition:background 0.15s;
      background:${isSelected ? 'rgba(74,144,217,0.15)' : 'rgba(255,255,255,0.03)'};
      border:1px solid ${isSelected ? 'rgba(74,144,217,0.35)' : 'rgba(255,255,255,0.07)'};
    `;
    const swatch = document.createElement('div');
    swatch.style.cssText = `width:14px;height:14px;border-radius:4px;background:${hexColor};
      flex-shrink:0;border:1px solid rgba(255,255,255,0.15);`;
    const label = document.createElement('span');
    label.style.cssText = `font-size:11px;color:${isSelected ? '#6ab0f3' : 'rgba(255,255,255,0.6)'};
      flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
    label.textContent = mesh.name || `Mesh ${i + 1}`;
    const visBtn = document.createElement('span');
    visBtn.title = mesh.visible ? 'Hide' : 'Show';
    visBtn.textContent = mesh.visible ? '👁' : '🚫';
    visBtn.style.cssText = 'font-size:12px;cursor:pointer;opacity:0.6;flex-shrink:0;';
    visBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      mesh.visible = !mesh.visible;
      visBtn.textContent = mesh.visible ? '👁' : '🚫';
      visBtn.title = mesh.visible ? 'Hide' : 'Show';
    });
    row.appendChild(swatch);
    row.appendChild(label);
    row.appendChild(visBtn);
    row.addEventListener('click', (event) => selectMesh(mesh, { additive: event.ctrlKey || event.metaKey || event.shiftKey, toggle: event.ctrlKey || event.metaKey }));
    meshList.appendChild(row);
  });
}

// Material picker logic
function applyMaterialToMesh(mesh) {
  const c = new THREE.Color(matColor);
  mesh.material.color.copy(c);
  mesh.material.metalness = matMetalness;
  mesh.material.roughness = matRoughness;
  mesh.material.side = THREE.FrontSide;
  mesh.material.polygonOffset = true;
  mesh.material.polygonOffsetFactor = 1;
  mesh.material.polygonOffsetUnits = 1;
  mesh.material.needsUpdate = true;
}

function applyMaterialToGroup() {
  if (!currentSVGGroup) return;
  currentSVGGroup.traverse(child => {
    if (child.isMesh) {
      applyMaterialToMesh(child);
    }
  });
  showNotification('Material applied to all meshes!', 'success');
}

function applyMaterialToSelected() {
  if (selectedMeshes.length === 0) {
    showNotification('Select a mesh first to apply individual material changes.', 'error');
    return;
  }
  selectedMeshes.forEach(mesh => {
    const highlightEmissive = new THREE.Color(mesh === selectedMesh ? 0x1a2a44 : 0x0d1b2a);
    applyMaterialToMesh(mesh);
    mesh.material.emissive.copy(highlightEmissive);
    mesh.material.needsUpdate = true;
  });
  showNotification(`Material applied to ${selectedMeshes.length} selected mesh${selectedMeshes.length > 1 ? 'es' : ''}!`, 'success');
}

const matColorPicker = document.getElementById('matColorPicker');
matColorPicker.addEventListener('input', (e) => {
  matColor = e.target.value;
  const targetMeshes = getActiveTargetMeshes();
  targetMeshes.forEach(mesh => applyMaterialToMesh(mesh));
  updateSelectionUI();
});

const metalnessSlider = document.getElementById('metalnessSlider');
const metalnessInput = document.getElementById('metalnessInput');
function syncMetalness(value) {
  matMetalness = parseFloat(value);
  metalnessSlider.value = matMetalness;
  metalnessInput.value = matMetalness;
  const targetMeshes = getActiveTargetMeshes();
  targetMeshes.forEach(mesh => applyMaterialToMesh(mesh));
  updateSelectionUI();
}
metalnessSlider.addEventListener('input', () => syncMetalness(metalnessSlider.value));
metalnessInput.addEventListener('input', () => syncMetalness(metalnessInput.value));

const roughnessSlider = document.getElementById('roughnessSlider');
const roughnessInput = document.getElementById('roughnessInput');
function syncRoughness(value) {
  matRoughness = parseFloat(value);
  roughnessSlider.value = matRoughness;
  roughnessInput.value = matRoughness;
  const targetMeshes = getActiveTargetMeshes();
  targetMeshes.forEach(mesh => applyMaterialToMesh(mesh));
  updateSelectionUI();
}
roughnessSlider.addEventListener('input', () => syncRoughness(roughnessSlider.value));
roughnessInput.addEventListener('input', () => syncRoughness(roughnessInput.value));

document.getElementById('applyMatBtn').addEventListener('click', () => {
  applyMaterialToSelected();
  updateExportStats();
  recordHistory();
});

document.getElementById('applyMatAllBtn').addEventListener('click', () => {
  applyMaterialToGroup();
  updateExportStats();
  recordHistory();
});

document.getElementById('deselectBtn').addEventListener('click', () => {
  selectMesh(null);
});

let wireframeOn = false;
document.getElementById('toggleWire').addEventListener('click', () => {
  wireframeOn = !wireframeOn;
  if (currentSVGGroup) {
    currentSVGGroup.traverse(child => {
      if (child.isMesh) child.material.wireframe = wireframeOn;
    });
  }
  document.getElementById('toggleWire').textContent = wireframeOn ? 'Solid' : 'Wireframe';
  recordHistory();
});

// --- Per-mesh selection via click ---
function clearMeshHighlight(mesh) {
  if (!mesh?.material?.emissive) return;
  mesh.material.emissive.set(0x000000);
  mesh.material.needsUpdate = true;
  const oldOutline = highlightEdgesMap.get(mesh);
  if (oldOutline) {
    mesh.remove(oldOutline);
    oldOutline.geometry.dispose();
    oldOutline.material.dispose();
    highlightEdgesMap.delete(mesh);
  }
}

function updateSelectionUI() {
  if (selectedMeshes.length > 0) {
    const primary = selectedMesh ?? selectedMeshes[0];
    const hex = '#' + primary.material.color.getHexString();
    document.getElementById('matColorPicker').value = hex;
    document.getElementById('metalnessSlider').value = primary.material.metalness;
    document.getElementById('metalnessInput').value = primary.material.metalness;
    document.getElementById('metalnessVal').textContent = primary.material.metalness.toFixed(2);
    document.getElementById('roughnessSlider').value = primary.material.roughness;
    document.getElementById('roughnessInput').value = primary.material.roughness;
    document.getElementById('roughnessVal').textContent = primary.material.roughness.toFixed(2);
    matColor = hex;
    matMetalness = primary.material.metalness;
    matRoughness = primary.material.roughness;
    const transformState = getMeshTransformState(primary);
    setTransformControlValues(transformState.offsetX, transformState.offsetY, transformState.rotateX, transformState.rotateY, transformState.rotateZ, transformState.scale);
    const geometrySettings = getMeshGeometrySettings(primary);
    document.getElementById('depthSlider').value = geometrySettings.depth;
    document.getElementById('depthInput').value = geometrySettings.depth;
    const bevelSliderEl = document.getElementById('bevelSlider');
    if (bevelSliderEl) bevelSliderEl.value = geometrySettings.bevelSize;
    const bevelInputEl = document.getElementById('bevelInput');
    if (bevelInputEl) bevelInputEl.value = geometrySettings.bevelSize;
    const bevelToggleEl = document.getElementById('bevelToggle');
    if (bevelToggleEl) bevelToggleEl.classList.toggle('active', geometrySettings.bevelEnabled);
    document.getElementById('selectionInfo').style.display = 'flex';
    document.getElementById('selectionName').textContent = selectedMeshes.length === 1
      ? (primary.name || 'Unnamed mesh')
      : `${selectedMeshes.length} parts selected`;
    document.getElementById('renameInput').value = selectedMeshes.length === 1 ? (primary.name || '') : '';
  } else {
    document.getElementById('selectionInfo').style.display = 'none';
    document.getElementById('renameInput').value = '';
  }
}

function selectMesh(mesh, options = {}) {
  const { additive = false, toggle = false } = options;

  if (!additive) {
    selectedMeshes.forEach(clearMeshHighlight);
    selectedMeshes = mesh ? [mesh] : [];
  } else if (mesh) {
    const exists = selectedMeshes.includes(mesh);
    if (toggle && exists) {
      clearMeshHighlight(mesh);
      selectedMeshes = selectedMeshes.filter(item => item !== mesh);
    } else if (!exists) {
      selectedMeshes = [...selectedMeshes, mesh];
    }
  }

  selectedMesh = selectedMeshes.length > 0
    ? (mesh && selectedMeshes.includes(mesh) ? mesh : selectedMeshes[selectedMeshes.length - 1])
    : null;

  selectedMeshes.forEach((item, index) => {
    if (item.material?.emissive) {
      item.material.emissive.set(index === selectedMeshes.length - 1 ? 0x1a2a44 : 0x102338);
      item.material.needsUpdate = true;
    }
    refreshSelectionOutline(item);
  });

  updateSelectionUI();
  refreshMeshList();
}

function onCanvasClick(event) {
  // Ignore clicks on the UI panel
  if (event.target.closest('.panel')) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Only raycast against meshes in the SVG group
  const meshes = [];
  if (currentSVGGroup) {
    currentSVGGroup.traverse(child => {
      if (child.isMesh && child.name !== 'ground') meshes.push(child);
    });
  }

  const intersects = raycaster.intersectObjects(meshes, false);

  if (intersects.length > 0) {
    selectMesh(intersects[0].object, {
      additive: event.ctrlKey || event.metaKey || event.shiftKey,
      toggle: event.ctrlKey || event.metaKey
    });
  } else {
    selectMesh(null);
  }
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  // Track pointer start for distinguishing click vs drag
  renderer.domElement._pointerStart = { x: e.clientX, y: e.clientY, time: Date.now() };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  const start = renderer.domElement._pointerStart;
  if (!start) return;
  const dx = e.clientX - start.x;
  const dy = e.clientY - start.y;
  const dt = Date.now() - start.time;
  // Only count as click if minimal movement and quick
  if (Math.sqrt(dx * dx + dy * dy) < 5 && dt < 300) {
    onCanvasClick(e);
  }
});

// Refresh mesh list when a new model is loaded — patch svgTo3D and generate3DText end
// Animation loop (no auto-rotate)
function animate() {
  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

applySceneLooks();
updatePanelDock();
updateExportStats();
syncDepth(extrusionDepth);
syncBevel(bevelSize);
syncMetalness(matMetalness);
syncRoughness(matRoughness);
setTransformControlValues(transformOffsetX, transformOffsetY, transformRotationX, transformRotationY, transformRotationZ, transformScale);
document.getElementById('lightPreset').value = lightPreset;
document.getElementById('backgroundPreset').value = backgroundPreset;
document.getElementById('downloadFormat').value = downloadFormat;
recordHistory();
