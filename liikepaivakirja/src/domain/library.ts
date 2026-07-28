/* domain/library — moved verbatim from liikepaivakirja.jsx (Phase 1 split). */
import { C } from "../styles/tokens";

/* ------------------------------------------------------------------ */
/*  Source provenance for library presets                               */
/* ------------------------------------------------------------------ */
export const SOURCES = {
  boren2011: {
    tag: "EMG",
    text:
      "Boren K, Conrey C, Le Coguic J, Paprocki L, Voight M, Robinson TK (2011). Electromyographic analysis of gluteus medius and gluteus maximus during rehabilitation exercises. Int J Sports Phys Ther 6(3):206–223.",
  },
  compendium2024: {
    tag: "MET",
    text:
      "2024 Adult Compendium of Physical Activities. Journal of Sport and Health Science 13(1). Arvot: pacompendium.com — tarkista oma vauhtiluokkasi.",
  },
  anatomy: {
    tag: "Anatomia",
    text:
      "Kohdelihakset perustuvat vakiintuneeseen toiminnalliseen anatomiaan (agonisti tai venytettävä lihas). Ei mittausdataa, mutta ei myöskään kiistanalaista.",
  },
  estimate: {
    tag: "Arvio",
    text:
      "Ei mittausdataa eikä yksiselitteistä anatomista vastausta. Arvot ovat perusteltu arvio — tarkista ja muokkaa omaan tarpeeseesi.",
  },
};

export const SRC_ORDER = { boren2011: 0, anatomy: 1, compendium2024: 1, estimate: 2 };

export const SCALE_NOTE =
  "EMG-lähteissä aktiivisuus on mitattu prosentteina maksimisupistuksesta (%MVIC). Muunnos kolmiportaiseksi on tämän sovelluksen tekemä, ei tutkimuksen väite: ≥70 % = pää, 40–69 % = sivu, 20–39 % = kevyt. Kynnys 70 % seuraa kirjallisuuden tapaa pitää sitä voimavaikutukseen riittävänä.";

export const LIB_CATS = [
  { id: "physio_hip", label: "Fysioterapia · lonkka" },
  { id: "physio_back", label: "Fysioterapia · selkä ja keskivartalo" },
  { id: "physio_knee", label: "Fysioterapia · polvi" },
  { id: "physio_shoulder", label: "Fysioterapia · olkapää" },
  { id: "stretch", label: "Venytykset" },
  { id: "w_legs", label: "Vapaat painot · jalat" },
  { id: "w_back", label: "Vapaat painot · selkä" },
  { id: "w_chest", label: "Vapaat painot · rinta" },
  { id: "w_sh", label: "Vapaat painot · olkapäät" },
  { id: "w_arms", label: "Vapaat painot · kädet" },
  { id: "bw", label: "Kehonpaino" },
  { id: "cardio", label: "Kestävyys" },
];

/* compact constructor: L(id, name, cat, type, muscles, opts) */
export const L = (id, name, cat, type, muscles, o) => ({ id, name, cat, type, muscles, ...(o || {}) });



export const ST = { sets: 3, reps: null, hold: 30, min: null }; /* stretching convention */
export const CARDIO_DOSE = { sets: null, reps: null, hold: null, min: 30 };

export const LIBRARY = [
  /* ---------------- physio · hip ---------------- */
  L("side_plank_abd_bottom", "Kylkilankku + loitonnus (alempi jalka)", "physio_hip", "strength", { glute_med: 1, obliques: 2, glute_max: 2, core_deep: 2 }, { src: "boren2011", note: "103 % MVIC (keskimmäinen pakaralihas)" }),
  L("side_plank_abd_top", "Kylkilankku + loitonnus (päällimmäinen jalka)", "physio_hip", "strength", { glute_med: 1, glute_max: 1, obliques: 2, core_deep: 2 }, { src: "boren2011", note: "89 % / 73 % MVIC" }),
  L("single_leg_squat", "Yhden jalan kyykky", "physio_hip", "strength", { quad: 1, glute_max: 1, glute_med: 1, hamstring: 2, core_deep: 3 }, { src: "boren2011", note: "82 % / 71 % MVIC", structures: ["j_knee", "j_hip"] }),
  L("clamshell", "Simpukka", "physio_hip", "strength", { glute_med: 1, hip_rotators: 2, glute_max: 3 }, { src: "boren2011", note: "77 % MVIC (progressio 4)" }),
  L("front_plank_hip_ext", "Lankka + lonkan ojennus", "physio_hip", "strength", { glute_max: 1, core_deep: 1, abs: 2, lumbar: 2, shoulder_front: 3 }, { src: "boren2011", note: "106 % MVIC (iso pakaralihas)" }),
  L("glute_squeeze", "Pakaroiden puristus", "physio_hip", "strength", { glute_max: 1 }, { src: "boren2011", note: "81 % MVIC" }),
  L("sidelying_abduction", "Kylkimakuulla loitonnus", "physio_hip", "strength", { glute_med: 1, tfl: 2, glute_max: 3 }, { src: "boren2011" }),
  L("glute_bridge", "Lantionnosto", "physio_hip", "strength", { glute_max: 1, hamstring: 2, lumbar: 2, core_deep: 3 }, { src: "anatomy" }),
  L("single_leg_bridge", "Yhden jalan lantionnosto", "physio_hip", "strength", { glute_max: 1, hamstring: 2, core_deep: 2, lumbar: 2 }, { src: "anatomy" }),
  L("hip_abduction_standing", "Seisten lonkan loitonnus", "physio_hip", "strength", { glute_med: 1, tfl: 2 }, { src: "anatomy" }),
  L("monster_walk", "Kuminauhakävely sivuttain", "physio_hip", "strength", { glute_med: 1, tfl: 2, glute_max: 3 }, { src: "estimate" }),
  L("fire_hydrant", "Palopostinosto", "physio_hip", "strength", { glute_med: 1, hip_rotators: 2, glute_max: 3 }, { src: "estimate" }),
  L("hip_flexor_march", "Lonkan koukistajan marssi", "physio_hip", "stability", { hip_flexor: 1, core_deep: 2, abs: 3 }, { src: "anatomy" }),
  L("adductor_squeeze", "Lähentäjien puristus (pallo)", "physio_hip", "strength", { adductor: 1, core_deep: 3 }, { src: "anatomy" }),
  L("copenhagen_plank", "Copenhagen-lankku", "physio_hip", "strength", { adductor: 1, obliques: 2, core_deep: 2 }, { src: "anatomy" }),
  L("hip_airplane", "Hip airplane", "physio_hip", "stability", { glute_med: 1, hip_rotators: 1, glute_max: 2, hamstring: 3 }, { src: "estimate", structures: ["j_hip"] }),

  /* ---------------- physio · back & core ---------------- */
  L("dead_bug", "Dead bug", "physio_back", "stability", { core_deep: 1, abs: 2, hip_flexor: 2, lumbar: 3 }, { src: "anatomy" }),
  L("dead_bug_leg", "Dead bug -jalka", "physio_back", "stability", { core_deep: 1, abs: 2, hip_flexor: 2, lumbar: 3 }, { src: "anatomy" }),
  L("bird_dog", "Linnunkoira", "physio_back", "stability", { lumbar: 1, glute_max: 2, core_deep: 2, thoracic: 2, trap_lower: 3 }, { src: "anatomy" }),
  L("front_plank", "Etunojalankku", "physio_back", "stability", { core_deep: 1, abs: 1, obliques: 2, shoulder_front: 3 }, { src: "anatomy" }),
  L("side_plank", "Kylkilankku", "physio_back", "stability", { obliques: 1, core_deep: 1, glute_med: 2, lat: 3 }, { src: "anatomy" }),
  L("curl_up", "McGillin curl-up", "physio_back", "stability", { abs: 1, core_deep: 2 }, { src: "anatomy" }),
  L("pallof_press", "Pallof-puristus", "physio_back", "stability", { obliques: 1, core_deep: 1, abs: 2, shoulder_front: 3 }, { src: "anatomy" }),
  L("waiter_bow", "Tarjoilijankumarrus", "physio_back", "strength", { hamstring: 1, glute_max: 2, lumbar: 2, thoracic: 3 }, { src: "anatomy" }),
  L("prone_extension", "Päinmakuulla selän ojennus", "physio_back", "strength", { lumbar: 1, thoracic: 2, glute_max: 3 }, { src: "anatomy" }),
  L("pelvic_tilt", "Lantion kallistus selinmakuulla", "physio_back", "stability", { core_deep: 1, abs: 2, lumbar: 2 }, { src: "anatomy" }),
  L("cat_camel", "Kissa–kameli", "physio_back", "mobility", { lumbar: 1, thoracic: 2, core_deep: 3 }, { src: "anatomy", structures: ["j_lumbar", "j_thoracic"] }),
  L("thoracic_rotation", "Rintarangan kierto kylkimakuulla", "physio_back", "mobility", { thoracic: 1, lat: 2, obliques: 3 }, { src: "anatomy", structures: ["j_thoracic"] }),
  L("quadruped_rocking", "Nelinkontin keinunta", "physio_back", "mobility", { hip_rotators: 2, glute_med: 3 }, { src: "anatomy", structures: ["j_hip"] }),
  L("sciatic_slider", "Iskiashermon liu'utus", "physio_back", "mobility", { hamstring: 3 }, { src: "anatomy", structures: ["n_sciatic"], note: "Mobilisointi — ei tavoitteena kuormitus." }),
  L("femoral_slider", "Reisihermon liu'utus", "physio_back", "mobility", { quad: 3, hip_flexor: 3 }, { src: "anatomy", structures: ["n_femoral"], note: "Mobilisointi — ei tavoitteena kuormitus." }),
  L("median_slider", "Keskihermon liu'utus", "physio_back", "mobility", { forearm: 3 }, { src: "anatomy", structures: ["n_median"] }),

  /* ---------------- physio · knee ---------------- */
  L("quad_set", "Nelipäisen jännitys (quad set)", "physio_knee", "strength", { quad: 1 }, { src: "anatomy" }),
  L("straight_leg_raise", "Suoran jalan nosto", "physio_knee", "strength", { quad: 1, hip_flexor: 2, core_deep: 3 }, { src: "anatomy" }),
  L("terminal_knee_ext", "Polven loppuojennus kuminauhalla", "physio_knee", "strength", { quad: 1 }, { src: "anatomy", structures: ["j_knee"] }),
  L("wall_sit", "Seinäistunta", "physio_knee", "strength", { quad: 1, glute_max: 2, adductor: 3 }, { src: "anatomy" }),
  L("step_up", "Askelnousu korokkeelle", "physio_knee", "strength", { quad: 1, glute_max: 1, hamstring: 2, calf: 3 }, { src: "anatomy", structures: ["j_knee"] }),
  L("lateral_step_down", "Sivuttainen askellasku", "physio_knee", "strength", { quad: 1, glute_med: 1, glute_max: 2 }, { src: "anatomy" }),
  L("heel_slide", "Kantapään liu'utus", "physio_knee", "mobility", { hamstring: 2, quad: 2 }, { src: "anatomy", structures: ["j_knee"] }),
  L("calf_raise", "Varvasnousu", "physio_knee", "strength", { calf: 1, tibialis: 3 }, { src: "anatomy", structures: ["j_ankle"] }),
  L("ball_hamstring_curl", "Takareiden koukistus pallolla", "physio_knee", "strength", { hamstring: 1, glute_max: 2, core_deep: 3 }, { src: "anatomy" }),
  L("nordic_hamstring", "Nordic hamstring", "physio_knee", "strength", { hamstring: 1, glute_max: 2, lumbar: 3 }, { src: "anatomy" }),

  /* ---------------- physio · shoulder ---------------- */
  L("scapular_retraction", "Lapojen lähennys", "physio_shoulder", "strength", { trap_lower: 1, trap_upper: 2, shoulder_rear: 2 }, { src: "anatomy" }),
  L("wall_slide", "Seinäliuku", "physio_shoulder", "mobility", { trap_lower: 1, shoulder_front: 2, thoracic: 2 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("external_rotation_band", "Olkanivelen ulkokierto kuminauhalla", "physio_shoulder", "strength", { shoulder_rear: 1, trap_lower: 2 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("internal_rotation_band", "Olkanivelen sisäkierto kuminauhalla", "physio_shoulder", "strength", { shoulder_front: 1, chest: 2 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("prone_y", "Y-nosto päinmakuulla", "physio_shoulder", "strength", { trap_lower: 1, shoulder_rear: 2, thoracic: 3 }, { src: "anatomy" }),
  L("prone_t", "T-nosto päinmakuulla", "physio_shoulder", "strength", { shoulder_rear: 1, trap_lower: 1, thoracic: 3 }, { src: "anatomy" }),
  L("pendulum", "Heiluriliike", "physio_shoulder", "mobility", { shoulder_front: 3 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("serratus_punch", "Etusahan työntö", "physio_shoulder", "strength", { chest: 2, trap_lower: 2, shoulder_front: 2 }, { src: "estimate" }),
  L("band_pull_apart", "Kuminauhan avaus", "physio_shoulder", "strength", { shoulder_rear: 1, trap_lower: 2, trap_upper: 3 }, { src: "anatomy" }),
  L("sleeper_stretch", "Sleeper-venytys", "physio_shoulder", "stretch", { shoulder_rear: 1 }, { src: "anatomy", dose: ST, structures: ["j_shoulder"] }),

  /* ---------------- stretches ---------------- */
  L("st_hamstring", "Takareiden venytys selinmakuulla", "stretch", "stretch", { hamstring: 1, calf: 3 }, { src: "anatomy", dose: ST }),
  L("st_quad", "Etureiden venytys seisten", "stretch", "stretch", { quad: 1, hip_flexor: 2 }, { src: "anatomy", dose: ST }),
  L("st_hip_flexor", "Lonkan koukistajan venytys askelkyykyssä", "stretch", "stretch", { hip_flexor: 1, quad: 2 }, { src: "anatomy", dose: ST }),
  L("st_piriformis", "Piriformis-venytys (nelonen)", "stretch", "stretch", { hip_rotators: 1, glute_max: 2, glute_med: 2 }, { src: "anatomy", dose: ST }),
  L("st_adductor_butterfly", "Lähentäjien venytys (perhonen)", "stretch", "stretch", { adductor: 1 }, { src: "anatomy", dose: ST }),
  L("st_adductor_side", "Lähentäjien venytys sivuaskelkyykyssä", "stretch", "stretch", { adductor: 1, quad: 2 }, { src: "anatomy", dose: ST }),
  L("st_hip_internal", "Lonkan sisäkierron venytys", "stretch", "stretch", { hip_rotators: 1, glute_med: 2, adductor: 3 }, { src: "anatomy", dose: ST, structures: ["j_hip"] }),
  L("st_calf_wall", "Pohkeen venytys seinää vasten", "stretch", "stretch", { calf: 1, tibialis: 3 }, { src: "anatomy", dose: ST, structures: ["j_ankle"] }),
  L("st_soleus", "Leveän kantalihaksen venytys", "stretch", "stretch", { calf: 1 }, { src: "anatomy", dose: ST, structures: ["j_ankle"] }),
  L("st_glute_supine", "Pakaran venytys selinmakuulla", "stretch", "stretch", { glute_max: 1, hip_rotators: 2 }, { src: "anatomy", dose: ST }),
  L("st_itband", "IT-jänteen venytys", "stretch", "stretch", { tfl: 1, glute_med: 2 }, { src: "anatomy", dose: ST }),
  L("st_knees_chest", "Alaselän venytys polvet rintaan", "stretch", "stretch", { lumbar: 1, glute_max: 3 }, { src: "anatomy", dose: ST, structures: ["j_lumbar"] }),
  L("st_child_pose", "Lapsen asento", "stretch", "stretch", { lumbar: 1, lat: 2, thoracic: 2 }, { src: "anatomy", dose: ST }),
  L("st_cobra", "Kobra", "stretch", "stretch", { abs: 1, hip_flexor: 2 }, { src: "anatomy", dose: ST, structures: ["j_lumbar"] }),
  L("st_thoracic_roller", "Rintarangan ojennus rullalla", "stretch", "stretch", { thoracic: 1, chest: 2 }, { src: "anatomy", dose: ST, structures: ["j_thoracic"] }),
  L("st_pec_doorway", "Rintalihaksen venytys ovenkarmissa", "stretch", "stretch", { chest: 1, shoulder_front: 2 }, { src: "anatomy", dose: ST }),
  L("st_lat", "Leveän selkälihaksen venytys", "stretch", "stretch", { lat: 1, trap_lower: 2 }, { src: "anatomy", dose: ST }),
  L("st_neck_lateral", "Niskan sivutaivutus", "stretch", "stretch", { neck_back: 1, trap_upper: 2 }, { src: "anatomy", dose: ST }),
  L("st_levator", "Lapaa kohottavan lihaksen venytys", "stretch", "stretch", { neck_back: 1, trap_upper: 2 }, { src: "anatomy", dose: ST }),
  L("st_wrist_flexor", "Kyynärvarren koukistajien venytys", "stretch", "stretch", { forearm: 1 }, { src: "anatomy", dose: ST, structures: ["n_median"] }),
  L("st_triceps", "Ojentajan venytys pään takaa", "stretch", "stretch", { triceps: 1, lat: 2 }, { src: "anatomy", dose: ST }),

  /* ---------------- free weights · legs ---------------- */
  L("back_squat", "Takakyykky", "w_legs", "strength", { quad: 1, glute_max: 1, adductor: 2, hamstring: 2, lumbar: 2, core_deep: 2, calf: 3 }, { src: "anatomy", structures: ["j_knee", "j_hip"] }),
  L("front_squat", "Etukyykky", "w_legs", "strength", { quad: 1, glute_max: 2, core_deep: 2, thoracic: 2, lumbar: 2 }, { src: "anatomy", structures: ["j_knee"] }),
  L("goblet_squat", "Goblet-kyykky", "w_legs", "strength", { quad: 1, glute_max: 2, core_deep: 2, adductor: 3 }, { src: "anatomy" }),
  L("deadlift", "Maastaveto", "w_legs", "strength", { glute_max: 1, hamstring: 1, lumbar: 1, lat: 2, trap_upper: 2, quad: 2, forearm: 3 }, { src: "anatomy", structures: ["j_hip", "j_lumbar"] }),
  L("romanian_deadlift", "Romanialainen maastaveto", "w_legs", "strength", { hamstring: 1, glute_max: 1, lumbar: 2, lat: 3 }, { src: "anatomy", structures: ["j_hip"] }),
  L("sumo_deadlift", "Sumomaastaveto", "w_legs", "strength", { glute_max: 1, quad: 1, adductor: 2, lumbar: 2, trap_upper: 3 }, { src: "anatomy", structures: ["j_hip"] }),
  L("bulgarian_split_squat", "Bulgarialainen askelkyykky", "w_legs", "strength", { quad: 1, glute_max: 1, adductor: 2, hamstring: 2 }, { src: "anatomy" }),
  L("walking_lunge", "Kävelevä askelkyykky", "w_legs", "strength", { quad: 1, glute_max: 1, hamstring: 2, calf: 3 }, { src: "anatomy" }),
  L("lateral_lunge", "Sivuaskelkyykky", "w_legs", "strength", { adductor: 1, quad: 1, glute_med: 2, glute_max: 2 }, { src: "anatomy" }),
  L("hip_thrust_barbell", "Levytangon lantionnosto", "w_legs", "strength", { glute_max: 1, hamstring: 2, quad: 3 }, { src: "anatomy" }),
  L("barbell_good_morning", "Good morning levytangolla", "w_legs", "strength", { hamstring: 1, lumbar: 1, glute_max: 2 }, { src: "anatomy" }),
  L("leg_press", "Jalkaprässi", "w_legs", "strength", { quad: 1, glute_max: 2, hamstring: 3 }, { src: "anatomy" }),
  L("step_up_db", "Askelnousu käsipainoilla", "w_legs", "strength", { quad: 1, glute_max: 1, calf: 3 }, { src: "anatomy" }),
  L("calf_raise_db", "Varvasnousu käsipainoilla", "w_legs", "strength", { calf: 1 }, { src: "anatomy" }),

  /* ---------------- free weights · back ---------------- */
  L("barbell_row", "Kulmasoutu", "w_back", "strength", { lat: 1, trap_lower: 2, shoulder_rear: 2, biceps: 2, lumbar: 2, forearm: 3 }, { src: "anatomy" }),
  L("one_arm_db_row", "Yhden käden käsipainosoutu", "w_back", "strength", { lat: 1, trap_lower: 2, shoulder_rear: 2, biceps: 2 }, { src: "anatomy" }),
  L("pull_up", "Leuanveto (vastaote)", "w_back", "strength", { lat: 1, biceps: 2, trap_lower: 2, forearm: 2, abs: 3 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("chin_up", "Leuanveto (myötäote)", "w_back", "strength", { lat: 1, biceps: 1, trap_lower: 2 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("lat_pulldown", "Ylätalja", "w_back", "strength", { lat: 1, biceps: 2, trap_lower: 2 }, { src: "anatomy" }),
  L("seated_row", "Alatalja", "w_back", "strength", { lat: 1, trap_lower: 1, shoulder_rear: 2, biceps: 2 }, { src: "anatomy" }),
  L("t_bar_row", "T-tankosoutu", "w_back", "strength", { lat: 1, trap_lower: 2, shoulder_rear: 2, biceps: 2 }, { src: "anatomy" }),
  L("face_pull", "Face pull", "w_back", "strength", { shoulder_rear: 1, trap_lower: 2, trap_upper: 2 }, { src: "anatomy" }),
  L("shrug", "Olankohautus", "w_back", "strength", { trap_upper: 1, forearm: 2 }, { src: "anatomy" }),
  L("back_extension", "Selänojennus penkissä", "w_back", "strength", { lumbar: 1, glute_max: 2, hamstring: 2 }, { src: "anatomy" }),

  /* ---------------- free weights · chest ---------------- */
  L("bench_press", "Penkkipunnerrus", "w_chest", "strength", { chest: 1, triceps: 2, shoulder_front: 2 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("incline_bench", "Vinopenkkipunnerrus", "w_chest", "strength", { chest: 1, shoulder_front: 1, triceps: 2 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("db_bench", "Käsipainopenkkipunnerrus", "w_chest", "strength", { chest: 1, shoulder_front: 2, triceps: 2 }, { src: "anatomy" }),
  L("db_fly", "Vipunosto rinnalle", "w_chest", "strength", { chest: 1, shoulder_front: 2 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("dips_chest", "Dipit rintapainotteisesti", "w_chest", "strength", { chest: 1, triceps: 1, shoulder_front: 2 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("cable_crossover", "Ristikkäistalja", "w_chest", "strength", { chest: 1, shoulder_front: 3 }, { src: "anatomy" }),
  L("floor_press", "Lattiapunnerrus", "w_chest", "strength", { chest: 1, triceps: 1, shoulder_front: 2 }, { src: "anatomy" }),
  L("pushup", "Punnerrus", "w_chest", "strength", { chest: 1, triceps: 2, shoulder_front: 2, core_deep: 2, abs: 3 }, { src: "anatomy" }),

  /* ---------------- free weights · shoulders ---------------- */
  L("overhead_press", "Pystypunnerrus tangolla", "w_sh", "strength", { shoulder_front: 1, triceps: 2, trap_upper: 2, core_deep: 2 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("db_shoulder_press", "Pystypunnerrus käsipainoilla", "w_sh", "strength", { shoulder_front: 1, triceps: 2, trap_upper: 2 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("lateral_raise", "Sivunosto", "w_sh", "strength", { shoulder_front: 1, trap_upper: 2 }, { src: "anatomy" }),
  L("front_raise", "Etunosto", "w_sh", "strength", { shoulder_front: 1, chest: 3 }, { src: "anatomy" }),
  L("rear_delt_fly", "Takaolkapään vipunosto", "w_sh", "strength", { shoulder_rear: 1, trap_lower: 2 }, { src: "anatomy" }),
  L("upright_row", "Pystysoutu", "w_sh", "strength", { trap_upper: 1, shoulder_front: 2, biceps: 3 }, { src: "anatomy" }),
  L("arnold_press", "Arnold-punnerrus", "w_sh", "strength", { shoulder_front: 1, triceps: 2, trap_upper: 2 }, { src: "anatomy" }),
  L("landmine_press", "Landmine-punnerrus", "w_sh", "strength", { shoulder_front: 1, chest: 2, triceps: 2, core_deep: 3 }, { src: "estimate" }),

  /* ---------------- free weights · arms ---------------- */
  L("barbell_curl", "Hauiskääntö tangolla", "w_arms", "strength", { biceps: 1, forearm: 2 }, { src: "anatomy" }),
  L("db_curl", "Hauiskääntö käsipainoilla", "w_arms", "strength", { biceps: 1, forearm: 2 }, { src: "anatomy" }),
  L("hammer_curl", "Vasarakääntö", "w_arms", "strength", { biceps: 1, forearm: 1 }, { src: "anatomy" }),
  L("preacher_curl", "Scott-kääntö", "w_arms", "strength", { biceps: 1 }, { src: "anatomy" }),
  L("triceps_pushdown", "Ojentajapunnerrus taljassa", "w_arms", "strength", { triceps: 1 }, { src: "anatomy" }),
  L("skullcrusher", "Ranskalainen punnerrus", "w_arms", "strength", { triceps: 1 }, { src: "anatomy" }),
  L("overhead_triceps", "Ojentajan punnerrus pään takaa", "w_arms", "strength", { triceps: 1, shoulder_front: 3 }, { src: "anatomy" }),
  L("wrist_curl", "Ranteen koukistus", "w_arms", "strength", { forearm: 1 }, { src: "anatomy" }),

  /* ---------------- bodyweight ---------------- */
  L("bw_squat", "Kyykky ilman lisäpainoa", "bw", "strength", { quad: 1, glute_max: 2, adductor: 3 }, { src: "anatomy" }),
  L("bw_lunge", "Askelkyykky", "bw", "strength", { quad: 1, glute_max: 1, hamstring: 2 }, { src: "anatomy" }),
  L("mountain_climber", "Vuorikiipeilijä", "bw", "strength", { core_deep: 1, abs: 2, hip_flexor: 2, shoulder_front: 2 }, { src: "estimate" }),
  L("burpee", "Burpee", "bw", "strength", { quad: 1, chest: 2, shoulder_front: 2, core_deep: 2, glute_max: 2 }, { src: "estimate" }),
  L("hollow_hold", "Hollow hold", "bw", "stability", { abs: 1, core_deep: 1, hip_flexor: 2 }, { src: "anatomy" }),
  L("superman", "Superman", "bw", "strength", { lumbar: 1, glute_max: 2, thoracic: 2 }, { src: "anatomy" }),
  L("pike_pushup", "Pike-punnerrus", "bw", "strength", { shoulder_front: 1, triceps: 2, trap_upper: 2 }, { src: "anatomy" }),
  L("inverted_row", "Vastasoutu", "bw", "strength", { lat: 1, trap_lower: 2, biceps: 2 }, { src: "anatomy" }),
  L("jump_squat", "Hyppykyykky", "bw", "strength", { quad: 1, glute_max: 1, calf: 2 }, { src: "estimate" }),
  L("reverse_plank", "Käänteinen lankku", "bw", "stability", { glute_max: 1, hamstring: 2, lumbar: 2, shoulder_rear: 3 }, { src: "anatomy" }),

  /* ---------------- endurance (MET, minutes) ---------------- */
  L("walk_slow", "Kävely, rauhallinen (n. 3–4 km/h)", "cardio", "endurance", { quad: 2, hamstring: 2, calf: 2, glute_max: 2, tibialis: 3, core_deep: 3 }, { src: "compendium2024", unit: "min", met: 2.8, dose: CARDIO_DOSE }),
  L("walk_moderate", "Kävely, reipas (n. 4,5–5,5 km/h)", "cardio", "endurance", { quad: 2, hamstring: 2, calf: 1, glute_max: 2, tibialis: 3, core_deep: 3 }, { src: "compendium2024", unit: "min", met: 3.5, dose: CARDIO_DOSE }),
  L("walk_brisk", "Kävely, ripeä (n. 6,5 km/h)", "cardio", "endurance", { quad: 1, hamstring: 2, calf: 1, glute_max: 2, tibialis: 2, core_deep: 3 }, { src: "compendium2024", unit: "min", met: 5.0, dose: CARDIO_DOSE }),
  L("nordic_walk", "Sauvakävely", "cardio", "endurance", { quad: 2, calf: 2, glute_max: 2, lat: 2, triceps: 2, core_deep: 3 }, { src: "compendium2024", unit: "min", met: 5.5, dose: CARDIO_DOSE }),
  L("run_jog", "Hölkkä (n. 8 km/h)", "cardio", "endurance", { quad: 1, hamstring: 1, calf: 1, glute_max: 2, tibialis: 2, core_deep: 3 }, { src: "compendium2024", unit: "min", met: 8.3, dose: CARDIO_DOSE }),
  L("run_moderate", "Juoksu (n. 9,5–10 km/h)", "cardio", "endurance", { quad: 1, hamstring: 1, calf: 1, glute_max: 1, tibialis: 2, core_deep: 3 }, { src: "compendium2024", unit: "min", met: 9.8, dose: CARDIO_DOSE }),
  L("run_fast", "Juoksu, vauhdikas (n. 11–12 km/h)", "cardio", "endurance", { quad: 1, hamstring: 1, calf: 1, glute_max: 1, tibialis: 2, core_deep: 2 }, { src: "compendium2024", unit: "min", met: 11.0, dose: CARDIO_DOSE }),
  L("swim_free_mod", "Uinti, vapaauinti kohtalainen", "cardio", "endurance", { lat: 1, shoulder_front: 2, shoulder_rear: 2, triceps: 2, core_deep: 2, glute_max: 3, quad: 3 }, { src: "compendium2024", unit: "min", met: 5.8, dose: CARDIO_DOSE }),
  L("swim_free_vig", "Uinti, vapaauinti ripeä", "cardio", "endurance", { lat: 1, shoulder_front: 1, shoulder_rear: 2, triceps: 2, core_deep: 2, glute_max: 3, quad: 3 }, { src: "compendium2024", unit: "min", met: 9.8, dose: CARDIO_DOSE }),
  L("swim_breast", "Uinti, rintauinti", "cardio", "endurance", { chest: 2, lat: 2, adductor: 2, quad: 2, shoulder_front: 2, core_deep: 3 }, { src: "compendium2024", unit: "min", met: 5.3, dose: CARDIO_DOSE }),
  L("cycle_moderate", "Pyöräily (n. 19–22 km/h)", "cardio", "endurance", { quad: 1, glute_max: 2, hamstring: 2, calf: 2, lumbar: 3 }, { src: "compendium2024", unit: "min", met: 8.0, dose: CARDIO_DOSE }),
  L("row_erg", "Soutulaite, kohtalainen", "cardio", "endurance", { lat: 1, quad: 1, glute_max: 2, lumbar: 2, biceps: 2, core_deep: 2 }, { src: "compendium2024", unit: "min", met: 7.0, dose: CARDIO_DOSE }),
  L("elliptical", "Crosstrainer", "cardio", "endurance", { quad: 2, glute_max: 2, calf: 2, lat: 3, core_deep: 3 }, { src: "compendium2024", unit: "min", met: 5.0, dose: CARDIO_DOSE }),
  L("stair_climb", "Portaiden nousu", "cardio", "endurance", { quad: 1, glute_max: 1, calf: 2, hamstring: 2 }, { src: "compendium2024", unit: "min", met: 8.8, dose: CARDIO_DOSE }),
];

export const LIB_BY_ID = {};
LIBRARY.forEach((e) => (LIB_BY_ID[e.id] = e));
