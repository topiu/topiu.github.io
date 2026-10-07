import ClipperLib from "clipper-lib";

/* Polygon arithmetic for the 3D view: Clipper's (Angus Johnson's library),
   on integers in tenths of a millimetre. Plan code never imports this: the
   library goes into the 3D view's chunk only.

   A path is Clipper's: [{ X, Y }]. A set of paths is a region, outer
   contours wound one way and holes the other. */

export const K = 10; // tenths of a millimetre

/* points in mm as a path, wound as an outer contour, or as a hole */
export function toPath(pts, outer = true) {
  const path = pts.map((p) => ({ X: Math.round(p.x * K), Y: Math.round(p.y * K) }));
  if (ClipperLib.Clipper.Orientation(path) !== outer) path.reverse();
  return path;
}
export const fromPath = (path) => path.map((q) => ({ x: q.X / K, y: q.Y / K }));
export const pathArea = (path) => Math.abs(ClipperLib.Clipper.Area(path)) / (K * K); // mm²

/* grown by d mm (shrunk if negative), square at the corners */
export function offset(paths, d) {
  if (!paths.length || !d) return paths;
  const co = new ClipperLib.ClipperOffset(2.5, 0.25 * K);
  co.AddPaths(paths, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
  const out = [];
  co.Execute(out, d * K);
  return out;
}

function boolean(type, a, b = []) {
  const c = new ClipperLib.Clipper();
  if (a.length) c.AddPaths(a, ClipperLib.PolyType.ptSubject, true);
  if (b.length) c.AddPaths(b, ClipperLib.PolyType.ptClip, true);
  const out = [];
  c.Execute(type, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return out;
}
export const union = (a, b) => boolean(ClipperLib.ClipType.ctUnion, a, b);
export const minus = (a, b) => boolean(ClipperLib.ClipType.ctDifference, a, b);
export const meet = (a, b) => boolean(ClipperLib.ClipType.ctIntersection, a, b);

/* a region as the pieces it is made of, each a list of paths: its outer
   contour, then its holes */
export function regions(paths) {
  const c = new ClipperLib.Clipper();
  c.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
  const tree = new ClipperLib.PolyTree();
  c.Execute(
    ClipperLib.ClipType.ctUnion,
    tree,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero,
  );
  const out = [];
  const outers = (node) => {
    for (const o of node.Childs()) {
      out.push([o.Contour(), ...o.Childs().map((h) => h.Contour())]);
      for (const h of o.Childs()) outers(h); // islands inside holes
    }
  };
  outers(tree);
  return out;
}

/* the same as polygons in mm with their holes, { outer, holes }, dropping
   pieces and holes smaller than minArea mm² */
export function polygons(paths, minArea = 0) {
  const big = (path) => pathArea(path) >= minArea;
  return regions(paths)
    .filter(([outer]) => big(outer))
    .map(([outer, ...holes]) => ({
      outer: fromPath(outer),
      holes: holes.filter(big).map(fromPath),
    }));
}

/* whether a Clipper point is inside a region (on its edge counts as out) */
export function inside(paths, pt) {
  return (
    paths.reduce(
      (w, ring) =>
        ClipperLib.Clipper.PointInPolygon(pt, ring) === 1
          ? w + (ClipperLib.Clipper.Orientation(ring) ? 1 : -1)
          : w,
      0,
    ) !== 0
  );
}

/* the parts of an open polyline, [a, b], that lie within a region */
export function clipLine(a, b, paths) {
  const NZ = ClipperLib.PolyFillType.pftNonZero;
  const c = new ClipperLib.Clipper();
  c.AddPath([a, b], ClipperLib.PolyType.ptSubject, false);
  c.AddPaths(paths, ClipperLib.PolyType.ptClip, true);
  const tree = new ClipperLib.PolyTree();
  c.Execute(ClipperLib.ClipType.ctIntersection, tree, NZ, NZ);
  return ClipperLib.Clipper.OpenPathsFromPolyTree(tree);
}
