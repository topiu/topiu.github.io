import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/* The renderer, camera, sky, ground and light the cabin model sits in. It
   draws only when something has changed (dirty), and redraws the sun's
   shadows only when the model or what is shown of it changes, not when the
   camera moves: on a phone most frames then cost nothing. */

const SUN_HEIGHT = 0.68; // the default sun's direction's upward part: about 43° up

/* How the light looks with the sun at a given height, from deep night to
   full day: sky, haze at the horizon (also the fog), the sun's colour and
   strength, sky light, reflections, exposure. Blended between the rows. */
const DAYLIGHT = [
  [-12, "#0A1322", "#1A2436", "#000000", 0, 0.16, 0.04, 1.15],
  [-4, "#22375A", "#7D7488", "#FF9050", 0, 0.42, 0.1, 1.1],
  [2, "#4A729F", "#EDB088", "#FF9A55", 1.1, 0.72, 0.18, 1.05],
  [10, "#6C96BF", "#E6D3BD", "#FFD2A0", 2.0, 0.98, 0.26, 1.05],
  [28, "#7FA6C6", "#DCE5E8", "#FFF0DC", 2.4, 1.15, 0.3, 1.05],
];
function daylight(el) {
  const k = DAYLIGHT;
  let i = k.findIndex((row) => el <= row[0]);
  if (i === -1) i = k.length - 1;
  if (i === 0) i = 1;
  const a = k[i - 1],
    b = k[i];
  const t = Math.min(1, Math.max(0, (el - a[0]) / (b[0] - a[0])));
  const col = (n) => new THREE.Color(a[n]).lerp(new THREE.Color(b[n]), t);
  const num = (n) => a[n] + (b[n] - a[n]) * t;
  return {
    top: col(1),
    horizon: col(2),
    sun: col(3),
    sunI: num(4),
    hemi: num(5),
    env: num(6),
    exposure: num(7),
  };
}

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
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog("#DCE5E8", 60, 400);
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
          top: { value: new THREE.Color() },
          horizon: { value: new THREE.Color() },
          sunDir: { value: new THREE.Vector3(0, 1, 0) },
          glow: { value: new THREE.Color(0, 0, 0) },
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
          uniform vec3 sunDir;
          uniform vec3 glow;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            float h = max(d.y, 0.0);
            float s = max(dot(d, sunDir), 0.0);
            vec3 col = mix(horizon, top, pow(h, 0.55));
            col += glow * (pow(s, 900.0) * 4.0 + pow(s, 14.0) * 0.16); // the sun, and the glow round it
            gl_FragColor = vec4(col, 1.0);
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
    this.sunDir = new THREE.Vector3();
    this.studio = new THREE.Vector3(-0.52, SUN_HEIGHT, 0.54).normalize();
    this.study = false;
    this.light(this.studio, 40);
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

  /* The usual light, a fine afternoon with the sun from where it shows the
     model best: x, y its horizontal direction in plan axes. */
  setStudioSun(x, y) {
    const k = Math.sqrt(1 - SUN_HEIGHT * SUN_HEIGHT) / (Math.hypot(x, y) || 1);
    this.studio.set(x * k, SUN_HEIGHT, y * k);
    if (!this.study) this.light(this.studio, 40);
  }

  /* The sun where it really is, for the sun study: dir towards it in plan
     axes ({ x, y, up }), elevation in degrees. */
  setStudySun(dir, elevation) {
    this.study = true;
    this.light(new THREE.Vector3(dir.x, dir.up, dir.y), elevation);
  }

  endStudy() {
    if (!this.study) return;
    this.study = false;
    this.light(this.studio, 40);
  }

  light(dir, elevation) {
    const d = daylight(elevation);
    this.sunDir.copy(dir).normalize();
    const u = this.sky.material.uniforms;
    u.top.value.copy(d.top);
    u.horizon.value.copy(d.horizon);
    u.sunDir.value.copy(this.sunDir);
    u.glow.value.copy(d.sun).multiplyScalar(elevation > -2 ? 1 : 0);
    this.scene.fog.color.copy(d.horizon);
    this.renderer.setClearColor(d.horizon);
    this.sun.color.copy(d.sun);
    this.sun.intensity = d.sunI;
    this.hemi.intensity = d.hemi;
    this.scene.environmentIntensity = d.env;
    this.renderer.toneMappingExposure = d.exposure;
    this.placeSun();
  }

  /* The sun's shadow camera covers the model and its eaves. Seen from the
     sun, a shadow on the ground is never longer than what casts it is tall,
     but it lies far off along the sun's direction when the sun is low, so
     the camera reaches deep. */
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
    cam.far = reach * 6 + 80;
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
