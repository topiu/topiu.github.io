
export const DEF_WALL_H = 2500;
export const openSill = (o) => (o.sill != null ? o.sill : o.kind === "door" ? 0 : 900);
export const openHead = (o) => (o.head != null ? o.head : o.kind === "door" ? 2050 : 1800);
