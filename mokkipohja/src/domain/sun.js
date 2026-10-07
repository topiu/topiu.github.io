/* Where the sun is, for the 3D view's sun study. */

const R = Math.PI / 180;

/* Where a plan is, with the defaults for plans that never said: north
   straight up the screen, and the middle of Finland. */
export const siteOf = (doc) => ({
  north: doc.site?.north ?? 0,
  lat: doc.site?.lat ?? 61,
  lon: doc.site?.lon ?? 25,
});

/* The sun's azimuth (degrees clockwise from north) and elevation (degrees
   above the horizon) at a moment, seen from a latitude and longitude. The
   Astronomical Almanac's low-precision formulas: within a few tenths of a
   degree for decades either side of 2000, plenty for shadows. */
export function sunPosition(date, lat, lon) {
  const n = date.getTime() / 86400000 - 10957.5; // days from noon 1 Jan 2000, UT
  const L = 280.46 + 0.9856474 * n;
  const g = (357.528 + 0.9856003 * n) * R;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * R;
  const eps = (23.439 - 0.0000004 * n) * R;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const gmst = 280.46061837 + 360.98564736629 * n; // degrees
  const ha = (gmst + lon) * R - ra;
  const phi = lat * R;
  const el = Math.asin(
    Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha),
  );
  const az = Math.atan2(
    -Math.sin(ha),
    Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha),
  );
  return { azimuth: (az / R + 720) % 360, elevation: el / R };
}

/* The direction towards the sun in plan axes: x right, y down the screen,
   and up, for a plan whose north points `north` degrees clockwise from
   straight up the screen. A unit vector. */
export function sunDirection(azimuth, elevation, north = 0) {
  const a = (north + azimuth) * R;
  const c = Math.cos(elevation * R);
  return { x: Math.sin(a) * c, y: -Math.cos(a) * c, up: Math.sin(elevation * R) };
}

/* the compass point nearest an azimuth, as a key into the strings */
export function compassPoint(azimuth) {
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][
    Math.round((((azimuth % 360) + 360) % 360) / 45) % 8
  ];
}
