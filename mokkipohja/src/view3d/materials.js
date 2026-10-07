import * as THREE from "three";
import { shade } from "../core";
import {
  ceilingTexture,
  edgeShadowTexture,
  floorTexture,
  grainTexture,
  grassTexture,
  logTexture,
  meadowTexture,
  roofTexture,
  softShadowTexture,
  stoneTexture,
} from "./textures";

/* Every material the 3D view uses, made once per opened view and disposed
   with it. Colours are sRGB hex like the rest of the app (three.js converts).
   A textured surface's colour tints its texture; where there are no textures
   (no canvas, unit tests) it is a plain colour of about the same tone. */
export function makeMaterials() {
  const made = [];
  const keep = (m) => {
    made.push(m);
    return m;
  };
  const std = (o) => keep(new THREE.MeshStandardMaterial(o));
  const surface = (tex, tint, plain, o = {}) => std({ map: tex, color: tex ? tint : plain, ...o });
  const decal = (alpha, opacity) =>
    keep(
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity,
        alphaMap: alpha,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
  const logs = logTexture();
  const grain = grainTexture();

  const m = {
    // the building
    logsIn: surface(logs, "#ffffff", "#C49A64", { roughness: 0.85 }),
    logsOut: surface(logs, "#A08B76", "#8A6E52", { roughness: 0.9 }),
    cut: std({ color: "#A27F55", roughness: 0.9 }), // wall tops, ends and reveals
    slab: std({ color: "#6A5644", roughness: 0.9 }), // wall footprints where walls are cut away
    floor: surface(floorTexture(), "#ffffff", "#C9A570", { roughness: 0.65 }),
    ceiling: surface(ceilingTexture(), "#ffffff", "#E0C89C", { roughness: 0.8 }),
    roof: surface(roofTexture(), "#ffffff", "#3D4346", { roughness: 0.5, metalness: 0.35 }),
    trim: std({ color: "#EFEDE6", roughness: 0.6 }),
    glass: std({
      color: "#C5DCE2",
      roughness: 0.05,
      metalness: 0.2,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
    doorLeaf: std({ color: "#9C6E43", roughness: 0.7 }),
    ground: surface(grassTexture(), "#ffffff", "#7C8F52", { roughness: 1 }),
    // furniture
    wood: surface(grain, "#D7B07A", "#C9A26B", { roughness: 0.7 }),
    woodDark: surface(grain, "#8A623B", "#7E5934", { roughness: 0.7 }),
    sauna: surface(grain, "#E6C696", "#D6B383", { roughness: 0.8 }),
    saunaDark: surface(grain, "#C99D6A", "#B88E5E", { roughness: 0.8 }),
    worktop: surface(grain, "#B88A57", "#A87C4F", { roughness: 0.5 }),
    white: std({ color: "#F2F0EA", roughness: 0.5 }),
    white2: std({ color: "#E6E4DD", roughness: 0.4 }),
    steel: std({ color: "#BCC1C4", roughness: 0.32, metalness: 0.75 }),
    iron: std({ color: "#2E3032", roughness: 0.6, metalness: 0.45 }),
    iron2: std({ color: "#3B3E41", roughness: 0.5, metalness: 0.5 }),
    black: std({ color: "#1C1D1F", roughness: 0.22 }),
    hobRing: std({ color: "#3A3537", roughness: 0.35 }),
    stone: surface(stoneTexture(), "#ffffff", "#8B857C", { roughness: 0.95 }),
    stoneCap: std({ color: "#5E5953", roughness: 0.9 }),
    mattress: std({ color: "#EDE9DF", roughness: 0.9 }),
    pillow: std({ color: "#F7F5EF", roughness: 0.9 }),
    birch: std({ color: "#DED8CB", roughness: 0.9 }),
    ember: std({ color: "#FF8A3D", emissive: "#FF5A10", emissiveIntensity: 1.6, roughness: 1 }),
    books: ["#7D3B32", "#36506B", "#5D6B3E", "#B08D4A", "#3F3A45", "#C9C1AD"].map((c) =>
      std({ color: c, roughness: 0.8 }),
    ),
    stones: ["#77736D", "#5F5B57", "#8E8983"].map((c) => std({ color: c, roughness: 0.95 })),
    bins: ["#D8D3C6", "#6F7F8C", "#B8A27A"].map((c) => std({ color: c, roughness: 0.6 })),
    // a piece that does not fit under the ceiling where it stands: a red
    // shell over its own materials, so it still looks like what it is, and
    // red edges
    badShell: keep(
      new THREE.MeshBasicMaterial({
        color: "#E0402F",
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -2,
      }),
    ),
    badEdge: keep(new THREE.LineBasicMaterial({ color: "#FF4A2E" })),
    // soft contact shadows: under furniture, and along the foot of walls
    shadow: decal(softShadowTexture(), 0.4),
    edgeShadow: decal(edgeShadowTexture(), 0.32),
  };
  const painted = new Map();
  /* a painted or upholstered surface in one of the group colours */
  m.paint = (hex, k = 1, roughness = 0.6) => {
    const key = `${hex}/${k}/${roughness}`;
    if (!painted.has(key)) painted.set(key, std({ color: shade(hex, k), roughness }));
    return painted.get(key);
  };
  m.fabric = (hex, k = 1) => m.paint(hex, k, 0.95);
  // the ground's blades, broken up by broad patches at ten times the scale
  const meadow = meadowTexture();
  if (m.ground.map && meadow) {
    m.ground.onBeforeCompile = (sh) => {
      sh.uniforms.meadow = { value: meadow };
      sh.fragmentShader = `uniform sampler2D meadow;\n${sh.fragmentShader}`.replace(
        "#include <map_fragment>",
        "#include <map_fragment>\n  diffuseColor.rgb *= texture2D(meadow, vMapUv * 0.09).rgb;",
      );
    };
  }
  m.hasTextures = !!logs;
  m.dispose = () => made.forEach((x) => x.dispose());
  return m;
}
