import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/* The renderer, camera, sky, ground and light the cabin model sits in. It
   draws only when something has changed (dirty), and redraws the sun's
   shadows only when the model or what is shown of it changes, not when the
   camera moves: on a phone most frames then cost nothing. */

const SKY_TOP = "#7FA6C6";
const HORIZON = "#DCE5E8";
const SUN_HEIGHT = 0.68; // the sun's direction's upward part: about 43° up

export class Stage {
  constructor(canvas) {
    const r = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = false;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.setClearColor(HORIZON);
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(HORIZON, 60, 400);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    this.dirty = true;
    this.shadows = true;

    const pmrem = new THREE.PMREMGenerator(r);
    const room = new RoomEnvironment();
    this.env = pmrem.fromScene(room, 0.04).texture;
    room.dispose?.();
    pmrem.dispose();
    this.scene.environment = this.env;
    this.scene.environmentIntensity = 0.3;

    this.hemi = new THREE.HemisphereLight("#DCE8F2", "#8E7F62", 1.15);
    this.sun = new THREE.DirectionalLight("#FFF0DC", 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 2.5;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        uniforms: {
          top: { value: new THREE.Color(SKY_TOP) },
          horizon: { value: new THREE.Color(HORIZON) },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        // no tone mapping: the horizon must come out the exact colour of the fog
        fragmentShader: /* glsl */ `
          uniform vec3 top;
          uniform vec3 horizon;
          varying vec3 vDir;
          void main() {
            float h = max(vDir.y, 0.0);
            gl_FragColor = vec4(mix(horizon, top, pow(h, 0.55)), 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    const ground = new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2);
    const uv = ground.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 150, uv.getY(i) * 150); // the grass texture covers 4 m
    this.groundGeo = ground;
    this.ground = null;

    this.controls = new OrbitControls(this.camera, canvas);
    const c = this.controls;
    c.enableDamping = true;
    c.dampingFactor = 0.12;
    c.maxPolarAngle = (84 * Math.PI) / 180;
    c.minDistance = 1;
    c.addEventListener("change", () => {
      this.dirty = true;
    });

    this.cabin = null;
    this.sunDir = new THREE.Vector3(-0.52, SUN_HEIGHT, 0.54).normalize();
  }

  /* textures look sharper at a slant with anisotropic filtering */
  sharpen(mats) {
    const max = this.renderer.capabilities.getMaxAnisotropy();
    for (const m of [mats.floor, mats.ground, mats.logsIn, mats.logsOut, mats.roof, mats.ceiling])
      if (m.map && m.map.anisotropy !== max) {
        m.map.anisotropy = max;
        m.map.needsUpdate = true;
      }
  }

  setGround(mats) {
    if (this.ground) this.scene.remove(this.ground);
    this.ground = new THREE.Mesh(this.groundGeo, mats.ground);
    this.ground.receiveShadow = true;
    this.ground.position.y = -0.02;
    this.scene.add(this.ground);
  }

  setCabin(cabin) {
    if (this.cabin) this.scene.remove(this.cabin.group);
    this.cabin = cabin;
    this.scene.add(cabin.group);
    const { centre, radius } = cabin.bounds;
    if (this.ground) this.ground.position.set(centre.x, -0.02, centre.z);
    this.placeSun();
    this.scene.fog.near = radius * 4 + 25;
    this.scene.fog.far = radius * 14 + 180;
    this.controls.maxDistance = radius * 10 + 30;
    this.invalidate(true);
  }

  /* the sun's horizontal direction (plan x, plan y), towards the sun */
  setSun(x, y) {
    const k = Math.sqrt(1 - SUN_HEIGHT * SUN_HEIGHT) / (Math.hypot(x, y) || 1);
    this.sunDir.set(x * k, SUN_HEIGHT, y * k);
    this.placeSun();
  }

  /* the sun's shadow camera just covers the model and its eaves */
  placeSun() {
    if (!this.cabin) return;
    const { centre, radius } = this.cabin.bounds;
    const s = this.sun;
    const reach = radius * 1.25 + 1;
    s.position.copy(centre).addScaledVector(this.sunDir, reach * 3);
    s.target.position.copy(centre);
    const cam = s.shadow.camera;
    cam.left = cam.bottom = -reach;
    cam.right = cam.top = reach;
    cam.near = 0.1;
    cam.far = reach * 6;
    cam.updateProjectionMatrix();
    this.invalidate(true);
  }

  /* something changed: draw again, and redraw shadows if what casts them did */
  invalidate(shadows = false) {
    this.dirty = true;
    if (shadows) this.shadows = true;
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  render() {
    if (!this.dirty) return false;
    this.dirty = false;
    if (this.shadows) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadows = false;
    }
    this.sky.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
    return true;
  }

  dispose() {
    this.controls.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.groundGeo.dispose();
    this.env.dispose();
    this.sun.shadow.map?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
