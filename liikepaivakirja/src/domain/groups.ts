/* domain/groups — labels that group exercises ("Sali A", "Venyttely").
 *
 * A group is a view, not a prescription: it never changes "done", adherence,
 * weekly targets or the report. It exists so a gym day can show only that
 * day's exercises — in treenitila and, optionally, on Tänään.
 *
 * Labels live on the exercise (`groups: string[]`), so one exercise can be in
 * several groups (a shared warm-up), and the list of groups is derived from
 * the exercises — there is no second list to keep in step, and the labels
 * travel with every export, snapshot, restore and programme link for free.
 * Groups match by name: a template's group merges into an existing one.
 */

export const GROUP_MAX_LEN = 40;
export const GROUP_MAX = 12;

const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, GROUP_MAX_LEN);
const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();

export function normalizeGroups(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  arr.forEach((g) => {
    const c = clean(g);
    if (c && !out.some((x) => same(x, c)) && out.length < GROUP_MAX) out.push(c);
  });
  return out;
}

/* every group in use by an active exercise, in programme order */
export function groupsOf(exercises) {
  const out = [];
  (exercises || []).forEach((e) => {
    if (e.archived) return;
    (e.groups || []).forEach((g) => {
      if (!out.some((x) => same(x, g))) out.push(g);
    });
  });
  return out;
}

/* null (or a group nobody uses any more) means "Kaikki" */
export const inGroup = (ex, group) => !group || (ex.groups || []).some((g) => same(g, group));

export function filterByGroup(exercises, group) {
  if (!group) return exercises;
  const hit = exercises.filter((e) => inGroup(e, group));
  return hit.length ? hit : exercises;
}

/* a stored choice that no longer names a group falls back to "Kaikki" */
export const validGroup = (exercises, group) => (group && groupsOf(exercises).some((g) => same(g, group)) ? groupsOf(exercises).find((g) => same(g, group)) : null);

export const addGroup = (groups, name) => normalizeGroups([...(groups || []), name]);
export const toggleGroup = (groups, name) =>
  (groups || []).some((g) => same(g, name)) ? (groups || []).filter((g) => !same(g, name)) : addGroup(groups, name);

/* rename everywhere; renaming onto an existing group merges the two */
export function renameGroup(exercises, from, to) {
  const t = clean(to);
  if (!t) return exercises;
  return exercises.map((e) =>
    (e.groups || []).some((g) => same(g, from)) ? { ...e, groups: normalizeGroups((e.groups || []).map((g) => (same(g, from) ? t : g))) } : e
  );
}

export const deleteGroup = (exercises, name) =>
  exercises.map((e) => ((e.groups || []).some((g) => same(g, name)) ? { ...e, groups: (e.groups || []).filter((g) => !same(g, name)) } : e));
