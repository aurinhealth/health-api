import { normalizeExerciseName } from "./strength-normalization.js";
import { strengthSetOptions } from "./gym-set-options.js";

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export const LOAD_UNITS = {
  PER_HAND_KG: "per_hand_kg",
  MACHINE_TOTAL_KG: "machine_total_kg",
  BARBELL_KG: "barbell_kg",
  MACHINE_PER_SIDE_KG: "machine_per_side_kg",
  CABLE_STACK_KG: "cable_stack_kg",
  // kg = added weight (a weight belt or a dumbbell); 0 = bodyweight only.
  BODYWEIGHT: "bodyweight",
  KETTLEBELL_KG: "kettlebell_kg",
  MEDICINE_BALL_KG: "medicine_ball_kg",
  // kg = the machine's counterweight: less is harder.
  ASSISTANCE_KG: "assistance_kg"
};

export const EXERCISE_INTELLIGENCE = {
  'Push-up': {muscle:'chest',pattern:'horizontal_push',equipment:'bodyweight',unilateral:false,loadUnit:LOAD_UNITS.BODYWEIGHT,fatigue:.6,variants:[]},
  'Bodyweight squat': {muscle:'quads',pattern:'squat',equipment:'bodyweight',unilateral:false,loadUnit:LOAD_UNITS.BODYWEIGHT,fatigue:.6,variants:[]},
  'Glute bridge': {muscle:'glutes',pattern:'hinge',equipment:'bodyweight',unilateral:false,loadUnit:LOAD_UNITS.BODYWEIGHT,fatigue:.5,variants:[]},
  'Dead bug': {muscle:'core',pattern:'trunk',equipment:'bodyweight',unilateral:false,loadUnit:LOAD_UNITS.BODYWEIGHT,fatigue:.3,variants:[]},
  "DB bench press": { muscle: "chest", pattern: "horizontal_push", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 1.0, variants: ["Chest flat press Prime", "Barbell bench press", "DB incline press"] },
  "Barbell bench press": { muscle: "chest", pattern: "horizontal_push", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.05, variants: ["DB bench press", "DB incline press"] },
  "DB incline press": { muscle: "chest", pattern: "incline_push", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 1.0, variants: ["DB bench press", "Barbell bench press"] },
  "Standing multi flight": { muscle: "side_delts", pattern: "lateral_raise", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.4, variants: ["Cable lateral raise"] },
  "One-arm DB row": { muscle: "back", pattern: "horizontal_pull", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.8, variants: ["Low row", "Standing rowing machine"] },
  "Face pull": { muscle: "rear_delts", pattern: "horizontal_abduction", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.35, variants: ["Rear delt pec deck", "Cable rear delt fly"] },
  "Cable overhead triceps extension": { muscle: "triceps", pattern: "elbow_extension", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.45, variants: ["Cable triceps extension"] },
  "Goblet squat": { muscle: "quads", pattern: "knee_dominant", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.9, variants: ["Pendulum squat", "Pivot leg press"] },
  "Low row": { muscle: "back", pattern: "horizontal_pull", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 1.0, variants: ["Standing rowing machine", "Lat pulldown"] },
  "DB shoulder press": { muscle: "shoulders", pattern: "vertical_push", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.9, variants: ["Shoulder press Prime"] },
  "Pivot leg press": { muscle: "quads", pattern: "knee_dominant", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 1.35, variants: ["Pendulum squat", "Leg extension Prime", "DB Bulgarian split squat"] },
  "Prone leg curl Prime": { muscle: "hamstrings", pattern: "knee_flexion", equipment: "machine", unilateral: true, loadUnit: LOAD_UNITS.MACHINE_PER_SIDE_KG, fatigue: 0.85, variants: ["DB Romanian deadlift", "Barbell Romanian deadlift", "Hip thrust"] },
  "Cable curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.45, variants: ["DB curl", "Hammer curl"] },
  "DB curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.45, variants: ["Cable curl", "Hammer curl"] },
  "Hammer curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.45, variants: ["DB curl", "Cable curl"] },
  "Cable triceps extension": { muscle: "triceps", pattern: "elbow_extension", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.45, variants: ["Cable triceps pushdown", "Overhead cable triceps extension"] },
  "Abs bench crunch": { muscle: "core", pattern: "trunk_flexion", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.35, variants: ["Cable crunch", "Roman chair"] },
  "Chest flat press Prime": { muscle: "chest", pattern: "horizontal_push", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.95, variants: ["DB bench press"] },
  "Shoulder press Prime": { muscle: "shoulders", pattern: "vertical_push", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.9, variants: ["DB shoulder press"] },
  "Lat pulldown": { muscle: "back", pattern: "vertical_pull", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.9, variants: ["Low row", "Cable pullover"] },
  "Standing rowing machine": { muscle: "back", pattern: "horizontal_pull", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.95, variants: ["Low row"] },
  "Pendulum squat": { muscle: "quads", pattern: "knee_dominant", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 1.3, variants: ["Pivot leg press"] },
  "Leg extension Prime": { muscle: "quads", pattern: "knee_extension", equipment: "machine", unilateral: true, loadUnit: LOAD_UNITS.MACHINE_PER_SIDE_KG, fatigue: 0.65, variants: ["Pivot leg press", "DB Bulgarian split squat"] },
  "Hip thrust": { muscle: "glutes", pattern: "hip_extension", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 1.0, variants: ["DB Romanian deadlift"] },
  "DB Romanian deadlift": { muscle: "hamstrings", pattern: "hip_hinge", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 1.0, variants: ["Barbell Romanian deadlift", "Prone leg curl Prime"] },
  "Barbell Romanian deadlift": { muscle: "hamstrings", pattern: "hip_hinge", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.1, variants: ["DB Romanian deadlift"] },
  "DB Bulgarian split squat": { muscle: "quads", pattern: "unilateral_knee_dominant", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 1.0, variants: ["Pivot leg press", "Leg extension Prime"] },
  "Adduction machine": { muscle: "adductors", pattern: "adduction", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.35, variants: [] },
  "Abduction machine": { muscle: "abductors", pattern: "abduction", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.35, variants: [] },
  "Pec deck": { muscle: "chest", pattern: "horizontal_adduction", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.55, variants: ["DB bench press"] },
  "Rear delt pec deck": { muscle: "rear_delts", pattern: "horizontal_abduction", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.45, variants: ["Cable rear delt fly"] },
  "Cable lateral raise": { muscle: "side_delts", pattern: "lateral_raise", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.35, variants: [] },
  "Cable pullover": { muscle: "back", pattern: "vertical_pull", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.45, variants: ["Lat pulldown"] },
  "Cable rear delt fly": { muscle: "rear_delts", pattern: "horizontal_abduction", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.35, variants: ["Rear delt pec deck"] },
  "Pallof press": { muscle: "core", pattern: "anti_rotation", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.3, variants: ["Cable woodchop"] },
  "Cable woodchop": { muscle: "core", pattern: "rotation", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.3, variants: ["Pallof press"] },
  "Roman chair": { muscle: "core", pattern: "trunk_extension", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.4, variants: ["Abs bench crunch"] },
  "Standing calf raise": { muscle: "calves", pattern: "plantar_flexion", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.45, variants: [] },
  "Cable crunch": { muscle: "core", pattern: "trunk_flexion", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.35, variants: ["Abs bench crunch"] },
  "Cable glute kickback": { muscle: "glutes", pattern: "hip_extension", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.35, variants: ["Glute hyperextension", "Hip thrust"] },
  "Cable pull-through": { muscle: "glutes", pattern: "hip_hinge", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.5, variants: ["DB Romanian deadlift", "Hip thrust"] },
  "Cable hip abduction": { muscle: "abductors", pattern: "abduction", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.3, variants: ["Abduction machine"] },
  "Barbell hip thrust": { muscle: "glutes", pattern: "hip_extension", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.0, variants: ["Hip thrust"] },
  "DB reverse lunge": { muscle: "glutes", pattern: "lunge", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.9, variants: ["DB step-up", "DB Bulgarian split squat"] },
  "DB step-up": { muscle: "glutes", pattern: "lunge", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.85, variants: ["DB reverse lunge", "DB Bulgarian split squat"] },
  "DB single-leg Romanian deadlift": { muscle: "hamstrings", pattern: "hip_hinge", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.8, variants: ["DB Romanian deadlift"] },
  "DB sumo squat": { muscle: "quads", pattern: "knee_dominant", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.85, variants: ["Goblet squat"] },
  "Leg press high feet": { muscle: "glutes", pattern: "glute_press", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 1.2, variants: ["Pivot leg press", "Hip thrust"] },
  "Abduction machine forward lean": { muscle: "glutes", pattern: "abduction", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.35, variants: ["Abduction machine"] },
  "Glute hyperextension": { muscle: "glutes", pattern: "hip_extension", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.45, variants: ["Roman chair", "Cable pull-through"] },
  "Cable fly": { muscle: "chest", pattern: "horizontal_adduction", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.5, variants: ["Pec deck", "Low-to-high cable fly"] },
  "Low-to-high cable fly": { muscle: "chest", pattern: "horizontal_adduction", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.45, variants: ["Cable fly"] },
  "Single-arm cable row": { muscle: "back", pattern: "horizontal_pull", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.6, variants: ["One-arm DB row", "Low row"] },
  "Close-grip lat pulldown": { muscle: "back", pattern: "vertical_pull", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.85, variants: ["Lat pulldown"] },
  "Wide-grip low row": { muscle: "back", pattern: "horizontal_pull", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.8, variants: ["Low row"] },
  "Barbell row": { muscle: "back", pattern: "horizontal_pull", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.05, variants: ["One-arm DB row", "Low row"] },
  "DB lateral raise": { muscle: "side_delts", pattern: "lateral_raise", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.35, variants: ["Cable lateral raise", "Standing multi flight"] },
  "DB Arnold press": { muscle: "shoulders", pattern: "vertical_push", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.85, variants: ["DB shoulder press"] },
  "DB rear delt fly": { muscle: "rear_delts", pattern: "horizontal_abduction", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.35, variants: ["Rear delt pec deck", "Face pull"] },
  "DB incline curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.45, variants: ["DB curl", "Hammer curl"] },
  "Cable rope hammer curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.45, variants: ["Cable curl", "Hammer curl"] },
  "Cable triceps kickback": { muscle: "triceps", pattern: "elbow_extension", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.35, variants: ["Cable triceps extension"] },
  "DB overhead triceps extension": { muscle: "triceps", pattern: "elbow_extension", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.45, variants: ["Cable overhead triceps extension"] },
  "Single-leg calf raise": { muscle: "calves", pattern: "plantar_flexion", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.35, variants: ["Standing calf raise"] },
  "Barbell back squat": { muscle: "quads", pattern: "knee_dominant", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.4, variants: ["Smith machine squat", "Pendulum squat"] },
  "Barbell front squat": { muscle: "quads", pattern: "knee_dominant", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.3, variants: ["Barbell back squat", "Goblet squat"] },
  "Smith machine squat": { muscle: "quads", pattern: "knee_dominant", equipment: "smith", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.2, variants: ["Barbell back squat", "Pendulum squat"] },
  "Smith machine split squat": { muscle: "glutes", pattern: "lunge", equipment: "smith", unilateral: true, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.95, variants: ["DB Bulgarian split squat", "DB reverse lunge"] },
  "Smith machine hip thrust": { muscle: "glutes", pattern: "hip_extension", equipment: "smith", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.0, variants: ["Barbell hip thrust", "Hip thrust"] },
  "Smith machine incline press": { muscle: "chest", pattern: "incline_push", equipment: "smith", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.95, variants: ["DB incline press"] },
  "Barbell overhead press": { muscle: "shoulders", pattern: "vertical_push", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.0, variants: ["DB shoulder press", "Shoulder press Prime"] },
  "DB wrist curl": { muscle: "forearms", pattern: "wrist_flexion", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.25, variants: ["Cable reverse curl", "DB reverse wrist curl"] },
  "DB reverse wrist curl": { muscle: "forearms", pattern: "wrist_extension", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.25, variants: ["Cable reverse curl", "DB wrist curl"] },
  "Cable reverse curl": { muscle: "forearms", pattern: "reverse_curl", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.3, variants: ["DB reverse wrist curl", "Hammer curl"] },
  "DB shrug": { muscle: "traps", pattern: "shrug", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.35, variants: ["Barbell shrug", "Smith machine shrug"] },
  "Barbell shrug": { muscle: "traps", pattern: "shrug", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.45, variants: ["DB shrug", "Smith machine shrug"] },
  "Smith machine shrug": { muscle: "traps", pattern: "shrug", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.4, variants: ["Barbell shrug", "DB shrug"] },
  "Cable upright row": { muscle: "traps", pattern: "upright_row", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.4, variants: ["DB shrug"] },
  "Barbell good morning": { muscle: "lower_back", pattern: "hip_hinge", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.9, variants: ["Roman chair"] },
  // Equipment of other gyms and home gyms (added 2026-10-11). A movement whose
  // load is not comparable (a hack squat to a leg press, a kickback machine to
  // a hip thrust) has its own pattern, so no weight carries over to it.
  "Pull-up": { muscle: "back", pattern: "vertical_pull", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.9, variants: ["Chin-up", "Assisted pull-up", "Lat pulldown"] },
  "Chin-up": { muscle: "back", pattern: "vertical_pull", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.9, variants: ["Pull-up", "Assisted pull-up", "Close-grip lat pulldown"] },
  "Assisted pull-up": { muscle: "back", pattern: "vertical_pull", equipment: "assisted_machine", unilateral: false, loadUnit: LOAD_UNITS.ASSISTANCE_KG, fatigue: 0.8, variants: ["Pull-up", "Lat pulldown"] },
  "Hanging leg raise": { muscle: "core", pattern: "trunk_flexion", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.4, variants: ["Abs bench crunch", "Cable crunch"] },
  "Dips": { muscle: "triceps", pattern: "dip", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.8, variants: ["Assisted dip", "Cable triceps extension"] },
  "Assisted dip": { muscle: "triceps", pattern: "dip", equipment: "assisted_machine", unilateral: false, loadUnit: LOAD_UNITS.ASSISTANCE_KG, fatigue: 0.7, variants: ["Dips", "Cable triceps extension"] },
  "Kettlebell swing": { muscle: "glutes", pattern: "kettlebell_swing", equipment: "kettlebell", unilateral: false, loadUnit: LOAD_UNITS.KETTLEBELL_KG, fatigue: 0.7, variants: ["Cable pull-through", "DB Romanian deadlift"] },
  "EZ bar curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "ez_bar", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.5, variants: ["Preacher curl", "Cable curl", "DB curl"] },
  "EZ bar skull crusher": { muscle: "triceps", pattern: "elbow_extension", equipment: "ez_bar", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.5, variants: [] },
  "Preacher curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "ez_bar", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.45, variants: ["EZ bar curl", "Cable curl"] },
  "Band pull-apart": { muscle: "rear_delts", pattern: "horizontal_abduction", equipment: "band", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.25, variants: ["Face pull", "Cable rear delt fly"] },
  "Hack squat": { muscle: "quads", pattern: "hack_squat", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 1.3, variants: ["Pendulum squat", "Smith machine squat"] },
  "Seated leg curl": { muscle: "hamstrings", pattern: "knee_flexion", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.7, variants: ["Prone leg curl Prime"] },
  "Glute kickback machine": { muscle: "glutes", pattern: "glute_kickback", equipment: "machine", unilateral: true, loadUnit: LOAD_UNITS.MACHINE_PER_SIDE_KG, fatigue: 0.4, variants: ["Cable glute kickback"] },
  "Seated calf raise": { muscle: "calves", pattern: "seated_plantar_flexion", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.35, variants: [] },
  "T-bar row": { muscle: "back", pattern: "horizontal_pull", equipment: "t_bar", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 1.0, variants: ["Barbell row", "Chest-supported row"] },
  "Chest-supported row": { muscle: "back", pattern: "horizontal_pull", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.8, variants: ["Low row", "Standing rowing machine"] },
  "TRX row": { muscle: "back", pattern: "horizontal_pull", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.6, variants: ["One-arm DB row", "Low row"] },
  "Barbell incline bench press": { muscle: "chest", pattern: "incline_push", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.0, variants: ["Smith machine incline press", "DB incline press", "Barbell bench press"] },
  "Trap bar deadlift": { muscle: "glutes", pattern: "trap_bar_deadlift", equipment: "trap_bar", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.35, variants: ["Barbell Romanian deadlift"] },
  "Landmine press": { muscle: "shoulders", pattern: "landmine_press", equipment: "landmine", unilateral: true, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.7, variants: [] },
  "Medicine ball slam": { muscle: "core", pattern: "slam", equipment: "medicine_ball", unilateral: false, loadUnit: LOAD_UNITS.MEDICINE_BALL_KG, fatigue: 0.45, variants: [] },
  "Box step-up": { muscle: "glutes", pattern: "lunge", equipment: "bodyweight", unilateral: true, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.7, variants: ["DB step-up", "DB reverse lunge"] },
  "Smith Machine Bench Press": { muscle: "chest", pattern: "horizontal_push", equipment: "smith", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1, variants: ["Barbell bench press","Chest flat press Prime"] },
  "Smith Machine Decline Bench Press": { muscle: "chest", pattern: "horizontal_push", equipment: "smith", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1, variants: ["Smith Machine Bench Press"], variantOf: "Smith Machine Bench Press" },
  "Inverted Row": { muscle: "back", pattern: "horizontal_pull", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.6, variants: ["TRX row"] },
  "Smith Machine Bent-Over Row": { muscle: "back", pattern: "horizontal_pull", equipment: "smith", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.95, variants: ["Barbell row"] },
  "Smith Machine Overhead Press": { muscle: "shoulders", pattern: "vertical_push", equipment: "smith", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.95, variants: ["Barbell overhead press","Shoulder press Prime"] },
  "Smith Machine Seated Overhead Press": { muscle: "shoulders", pattern: "vertical_push", equipment: "smith", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.9, variants: ["Smith Machine Overhead Press"], variantOf: "Smith Machine Overhead Press" },
  "Smith Machine Close Grip Bench Press": { muscle: "triceps", pattern: "elbow_extension", equipment: "smith", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.8, variants: ["Smith Machine Bench Press"] },
  "Smith Machine Front Squat": { muscle: "quads", pattern: "knee_dominant", equipment: "smith", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.2, variants: ["Smith machine squat","Barbell front squat"] },
  "Smith Machine Sumo Romanian Deadlift": { muscle: "hamstrings", pattern: "hip_hinge", equipment: "smith", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1, variants: ["Barbell Romanian deadlift"] },
  "Smith Machine Calf Raise": { muscle: "calves", pattern: "plantar_flexion", equipment: "smith", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.45, variants: ["Standing calf raise"], variantOf: "Standing calf raise" },
  "Cable Bench Chest Fly": { muscle: "chest", pattern: "horizontal_adduction", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.5, variants: ["Cable fly","Pec deck"] },
  "Cable Bench Press": { muscle: "chest", pattern: "horizontal_push", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.8, variants: ["DB bench press"] },
  "Cable Chest Press": { muscle: "chest", pattern: "horizontal_push", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.7, variants: ["Cable fly","Chest flat press Prime"] },
  "Cable Decline Bench Press": { muscle: "chest", pattern: "horizontal_push", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.8, variants: ["Cable Bench Press"] },
  "Cable High-to-Low Fly": { muscle: "chest", pattern: "horizontal_adduction", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.45, variants: ["Cable fly","Low-to-high cable fly"] },
  "Cable Incline Bench Press": { muscle: "chest", pattern: "incline_push", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.8, variants: ["DB incline press"] },
  "Cable Standing Single Arm Chest Press": { muscle: "chest", pattern: "horizontal_push", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.6, variants: ["Cable Chest Press"] },
  "Single-Arm Cable Fly": { muscle: "chest", pattern: "horizontal_adduction", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.4, variants: ["Cable fly"] },
  "Cable Row Bar Standing Row": { muscle: "back", pattern: "horizontal_pull", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.6, variants: ["Single-arm cable row","Low row"] },
  "Cable Supinating Row": { muscle: "back", pattern: "horizontal_pull", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.55, variants: ["Single-arm cable row"] },
  "Straight-Arm Lat Pulldown": { muscle: "back", pattern: "vertical_pull", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.45, variants: ["Cable pullover","Lat pulldown"] },
  "Straight Arm Rope Pulldown (Light)": { muscle: "back", pattern: "vertical_pull", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.4, variants: ["Straight-Arm Lat Pulldown"], variantOf: "Straight-Arm Lat Pulldown" },
  "Cable External Rotation": { muscle: "rear_delts", pattern: "external_rotation", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.2, variants: ["Face pull"] },
  "Cable Front Raise": { muscle: "shoulders", pattern: "front_raise", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.35, variants: ["Cable lateral raise"] },
  "Cable Overhead Press": { muscle: "shoulders", pattern: "vertical_push", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.7, variants: ["DB shoulder press"] },
  "Cable Single Arm Rear Delt Row": { muscle: "rear_delts", pattern: "horizontal_abduction", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.35, variants: ["Cable rear delt fly","Face pull"] },
  "Leaning Cable Lateral Raise": { muscle: "side_delts", pattern: "lateral_raise", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.35, variants: ["Cable lateral raise"] },
  "Cable Bar Pushdown": { muscle: "triceps", pattern: "elbow_extension", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.45, variants: ["Cable triceps extension"] },
  "Cable Overhead Straight Bar Extensions": { muscle: "triceps", pattern: "elbow_extension", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.45, variants: ["Cable overhead triceps extension"] },
  "Cross-Body Cable Tricep Extension": { muscle: "triceps", pattern: "elbow_extension", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.35, variants: ["Cable triceps extension"] },
  "Reverse-Grip Tricep Pushdown": { muscle: "triceps", pattern: "elbow_extension", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.4, variants: ["Cable triceps extension"] },
  "Single-Arm Overhead Cable Extension": { muscle: "triceps", pattern: "elbow_extension", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.35, variants: ["Cable overhead triceps extension"] },
  "Cable Side Bend": { muscle: "core", pattern: "lateral_flexion", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.3, variants: ["Cable woodchop"] },
  "Cable Single Arm Rope Pushdown": { muscle: "triceps", pattern: "elbow_extension", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.35, variants: ["Cable triceps extension"], variantOf: "Cable triceps extension" },
  "Machine Cable V Bar Push Downs": { muscle: "triceps", pattern: "elbow_extension", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.45, variants: ["Cable triceps extension"], variantOf: "Cable triceps extension" },
  "Cable Standing Low To High Wood Chopper": { muscle: "core", pattern: "rotation", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.3, variants: ["Cable woodchop"], variantOf: "Cable woodchop" },
  "Cable Bench Straight Leg Kickback": { muscle: "glutes", pattern: "glute_kickback", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.35, variants: ["Cable glute kickback"], variantOf: "Cable glute kickback" },
  "Cable 30 Degree Shrug": { muscle: "traps", pattern: "shrug", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.3, variants: ["DB shrug"], variantOf: "DB shrug" },
  "Cable Wrist Curl": { muscle: "forearms", pattern: "wrist_flexion", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.2, variants: ["DB wrist curl"], variantOf: "DB wrist curl" },
  "Cable Bar Face Pull": { muscle: "rear_delts", pattern: "horizontal_abduction", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.35, variants: ["Face pull"], variantOf: "Face pull" },
  "Cable Rope Kneeling Face Pull": { muscle: "rear_delts", pattern: "horizontal_abduction", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.3, variants: ["Face pull"], variantOf: "Face pull" },
  "Cable Seated Rope Face Pull": { muscle: "rear_delts", pattern: "horizontal_abduction", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.3, variants: ["Face pull"], variantOf: "Face pull" },
  "Cable Single Leg Laying Leg Curl": { muscle: "hamstrings", pattern: "knee_flexion", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.5, variants: ["Prone leg curl Prime"], variantOf: "Prone leg curl Prime" },
  "Cable Single Arm Underhand Grip Row": { muscle: "back", pattern: "horizontal_pull", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.6, variants: ["Single-arm cable row"], variantOf: "Single-arm cable row" },
  "Straight Bar Bench Mid Rows": { muscle: "back", pattern: "horizontal_pull", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.65, variants: ["Single-arm cable row","Low row"], variantOf: "Single-arm cable row" },
  "Decline Machine Chest Press": { muscle: "chest", pattern: "horizontal_push", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.9, variants: ["Chest flat press Prime"] },
  "Incline Machine Chest Press": { muscle: "chest", pattern: "incline_push", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.9, variants: ["Chest flat press Prime"] },
  "Neutral-Grip Lat Pulldown": { muscle: "back", pattern: "vertical_pull", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.85, variants: ["Lat pulldown","Close-grip lat pulldown"] },
  "Single-Arm Lat Pulldown": { muscle: "back", pattern: "vertical_pull", equipment: "machine", unilateral: true, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.6, variants: ["Lat pulldown"] },
  "Wide-Grip Lat Pulldown": { muscle: "back", pattern: "vertical_pull", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.85, variants: ["Lat pulldown"] },
  "Calf Press": { muscle: "calves", pattern: "plantar_flexion", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.45, variants: ["Standing calf raise"] },
  "Single-Leg Press": { muscle: "quads", pattern: "knee_dominant", equipment: "machine", unilateral: true, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 1, variants: ["Pivot leg press"], variantOf: "Pivot leg press" },
  "Reverse Hack Squat": { muscle: "glutes", pattern: "hip_hinge", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 1.1, variants: ["Hack squat"] },
  "Machine Underhand Row": { muscle: "back", pattern: "horizontal_pull", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.8, variants: ["Chest-supported row"] },
  "Hammer Strength High Row": { muscle: "back", pattern: "vertical_pull", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_PER_SIDE_KG, fatigue: 0.8, variants: ["Lat pulldown"] },
  "Hammer Strength Iso-Lateral Row": { muscle: "back", pattern: "horizontal_pull", equipment: "machine", unilateral: true, loadUnit: LOAD_UNITS.MACHINE_PER_SIDE_KG, fatigue: 0.85, variants: ["Low row","Chest-supported row"] },
  "Machine Lat Pullover": { muscle: "back", pattern: "vertical_pull", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.5, variants: ["Cable pullover"] },
  "Machine Back Extension": { muscle: "lower_back", pattern: "trunk_extension", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.4, variants: ["Roman chair"] },
  "Reverse Hyperextension": { muscle: "glutes", pattern: "hip_extension", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.5, variants: ["Glute hyperextension"] },
  "Machine Preacher Curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.4, variants: ["Preacher curl"] },
  "Machine Tricep Extension": { muscle: "triceps", pattern: "elbow_extension", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.45, variants: ["Cable triceps extension"] },
  "Belt Squat": { muscle: "quads", pattern: "knee_dominant", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 1.1, variants: ["Hack squat","Pendulum squat"] },
  "Machine Crunch": { muscle: "core", pattern: "trunk_flexion", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.35, variants: ["Cable crunch","Abs bench crunch"] },
  "Captain's Chair Knee Raise": { muscle: "core", pattern: "trunk_flexion", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.35, variants: ["Hanging leg raise"] },
  "Selectorized Torso Rotation Machine": { muscle: "core", pattern: "rotation", equipment: "machine", unilateral: true, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.3, variants: ["Cable woodchop"] },
  // Library part 2: free weights, bands and bodyweight (MoveKit names, own texts; added 2026-10-18).
  "Dumbbell Chest Fly": { muscle: "chest", pattern: "horizontal_adduction", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.5, variants: ["Pec deck","Cable fly"] },
  "Dumbbell Incline Chest Fly": { muscle: "chest", pattern: "horizontal_adduction", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.5, variants: ["Dumbbell Chest Fly"], variantOf: "Dumbbell Chest Fly" },
  "Dumbbell Neutral High Incline Bench Press": { muscle: "chest", pattern: "incline_push", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.95, variants: ["DB incline press"], variantOf: "DB incline press" },
  "Neutral-Grip Dumbbell Bench Press": { muscle: "chest", pattern: "horizontal_push", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 1, variants: ["DB bench press"], variantOf: "DB bench press" },
  "One Arm Dumbbell Bench Press": { muscle: "chest", pattern: "horizontal_push", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.85, variants: ["DB bench press"], variantOf: "DB bench press" },
  "Chest-Supported Dumbbell Row": { muscle: "back", pattern: "horizontal_pull", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.75, variants: ["One-arm DB row","Chest-supported row"], variantOf: "Chest-supported row" },
  "Dumbbell Back Extension": { muscle: "core", pattern: "trunk_extension", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.45, variants: ["Roman chair"], variantOf: "Roman chair" },
  "Dumbbell Pullover": { muscle: "back", pattern: "vertical_pull", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.55, variants: ["Cable pullover"] },
  "Cuban Press": { muscle: "rear_delts", pattern: "external_rotation", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.35, variants: ["Cable External Rotation","Face pull"] },
  "Dumbbell Front Raise": { muscle: "shoulders", pattern: "front_raise", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.35, variants: ["Cable Front Raise"] },
  "Dumbbell Incline Front Raise": { muscle: "shoulders", pattern: "front_raise", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.3, variants: ["Dumbbell Front Raise"], variantOf: "Dumbbell Front Raise" },
  "Dumbbell Push Press": { muscle: "shoulders", pattern: "vertical_push", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.85, variants: ["DB shoulder press"] },
  "Dumbbell Seated Lateral Raises": { muscle: "side_delts", pattern: "lateral_raise", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.3, variants: ["DB lateral raise"], variantOf: "DB lateral raise" },
  "Dumbbell Seated Rear Delt Fly": { muscle: "rear_delts", pattern: "horizontal_abduction", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.3, variants: ["DB rear delt fly"], variantOf: "DB rear delt fly" },
  "Dumbbell Upright Row": { muscle: "traps", pattern: "upright_row", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.4, variants: ["Cable upright row"] },
  "Side Plank Lateral Raise": { muscle: "side_delts", pattern: "lateral_raise", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.35, variants: ["DB lateral raise"], variantOf: "DB lateral raise" },
  "Single-Arm Dumbbell Overhead Press": { muscle: "shoulders", pattern: "vertical_push", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.7, variants: ["DB shoulder press"], variantOf: "DB shoulder press" },
  "Standing Dumbbell Press": { muscle: "shoulders", pattern: "vertical_push", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.85, variants: ["DB shoulder press"], variantOf: "DB shoulder press" },
  "Bayesian Curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.35, variants: ["Cable curl"] },
  "Close-Grip Push-Up off a Dumbbell": { muscle: "triceps", pattern: "elbow_extension", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.5, variants: ["Push-up"] },
  "Cross-Body Hammer Curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.35, variants: ["Hammer curl"], variantOf: "Hammer curl" },
  "Dumbbell Concentration Curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.3, variants: ["DB curl","Preacher curl"] },
  "Dumbbell Preacher Curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.4, variants: ["Preacher curl"], variantOf: "Preacher curl" },
  "Dumbbell Skullcrusher": { muscle: "triceps", pattern: "elbow_extension", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.45, variants: ["EZ bar skull crusher"], variantOf: "EZ bar skull crusher" },
  "Dumbbell Tricep Kickback": { muscle: "triceps", pattern: "elbow_extension", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.3, variants: ["Cable triceps kickback"], variantOf: "Cable triceps kickback" },
  "Zottman Curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.4, variants: ["DB curl","Hammer curl"] },
  "Dumbbell Cossack Squat": { muscle: "adductors", pattern: "lunge", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.6, variants: ["Goblet squat","DB sumo squat"] },
  "Dumbbell Cross Body Romanian Deadlift": { muscle: "hamstrings", pattern: "hip_hinge", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.6, variants: ["DB single-leg Romanian deadlift"], variantOf: "DB single-leg Romanian deadlift" },
  "Dumbbell Deadlift": { muscle: "glutes", pattern: "hip_hinge", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.85, variants: ["Trap bar deadlift","DB Romanian deadlift"] },
  "Dumbbell Feet Elevated Glute Bridge": { muscle: "glutes", pattern: "hip_extension", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.5, variants: ["Glute bridge","Hip thrust"], variantOf: "Glute bridge" },
  "Dumbbell Front Squat": { muscle: "quads", pattern: "knee_dominant", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.85, variants: ["Goblet squat","Barbell front squat"] },
  "Dumbbell Goblet Alternating Curtsy Lunge": { muscle: "glutes", pattern: "lunge", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.6, variants: ["DB reverse lunge"] },
  "Dumbbell Goblet Bulgarian Split Squat": { muscle: "quads", pattern: "lunge", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.8, variants: ["DB Bulgarian split squat"], variantOf: "DB Bulgarian split squat" },
  "Dumbbell Goblet Split Squat": { muscle: "quads", pattern: "lunge", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.7, variants: ["DB Bulgarian split squat","DB reverse lunge"] },
  "Dumbbell Lateral Lunge": { muscle: "glutes", pattern: "lunge", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.6, variants: ["DB reverse lunge"] },
  "Dumbbell Overhead Squat": { muscle: "quads", pattern: "knee_dominant", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.6, variants: ["Goblet squat"] },
  "Dumbbell Single Leg Hip Thrust": { muscle: "glutes", pattern: "hip_extension", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.55, variants: ["Barbell hip thrust","Hip thrust"], variantOf: "Barbell hip thrust" },
  "Dumbbell Squat": { muscle: "quads", pattern: "knee_dominant", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.85, variants: ["Goblet squat"] },
  "Dumbbell Thruster": { muscle: "quads", pattern: "squat", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 1, variants: ["Goblet squat","DB shoulder press"] },
  "Dumbbell Tibialis Raise": { muscle: "calves", pattern: "plantar_flexion", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.2, variants: ["Standing calf raise"] },
  "Dumbbell Walking Lunges": { muscle: "glutes", pattern: "lunge", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.8, variants: ["DB reverse lunge"] },
  "Heel Elevated Dumbbell Front Squat": { muscle: "quads", pattern: "knee_dominant", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.8, variants: ["Dumbbell Front Squat"], variantOf: "Dumbbell Front Squat" },
  "Dumbbell Russian Twist": { muscle: "core", pattern: "rotation", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.3, variants: ["Cable woodchop"] },
  "Dumbbell Side Bend": { muscle: "core", pattern: "lateral_flexion", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.3, variants: ["Cable Side Bend"], variantOf: "Cable Side Bend" },
  "Dumbbell Single Arm Clean And Press": { muscle: "shoulders", pattern: "vertical_push", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.8, variants: ["DB shoulder press"] },
  "Dumbbell Superman": { muscle: "lower_back", pattern: "trunk_extension", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.3, variants: ["Supermans"], variantOf: "Supermans" },
  "Dumbbell Windmill": { muscle: "core", pattern: "lateral_flexion", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.4, variants: ["Cable Side Bend"] },
  "Bench Dips": { muscle: "triceps", pattern: "elbow_extension", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.5, variants: ["Dips","Assisted dip"] },
  "Barbell Floor Press": { muscle: "chest", pattern: "horizontal_push", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.9, variants: ["Barbell bench press"], variantOf: "Barbell bench press" },
  "Barbell Deadlift": { muscle: "glutes", pattern: "hip_hinge", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.3, variants: ["Trap bar deadlift","Barbell Romanian deadlift"] },
  "Barbell Pullover": { muscle: "back", pattern: "vertical_pull", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.55, variants: ["Cable pullover","Dumbbell Pullover"] },
  "Barbell Rack Pull": { muscle: "glutes", pattern: "hip_hinge", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.1, variants: ["Barbell Deadlift"], variantOf: "Barbell Deadlift" },
  "Pendlay Row": { muscle: "back", pattern: "horizontal_pull", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1, variants: ["Barbell row"], variantOf: "Barbell row" },
  "Seal Row": { muscle: "back", pattern: "horizontal_pull", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.75, variants: ["Chest-supported row","Barbell row"] },
  "Barbell Rear Delt Row": { muscle: "rear_delts", pattern: "horizontal_abduction", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.6, variants: ["Face pull","DB rear delt fly"] },
  "Barbell Upright Row": { muscle: "traps", pattern: "upright_row", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.5, variants: ["Cable upright row","Dumbbell Upright Row"] },
  "Seated Barbell Military Press": { muscle: "shoulders", pattern: "vertical_push", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.9, variants: ["Barbell overhead press"], variantOf: "Barbell overhead press" },
  "Barbell Curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.45, variants: ["EZ bar curl","DB curl"] },
  "Barbell Drag Curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.45, variants: ["Barbell Curl"], variantOf: "Barbell Curl" },
  "Barbell Skullcrusher": { muscle: "triceps", pattern: "elbow_extension", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.5, variants: ["EZ bar skull crusher"], variantOf: "EZ bar skull crusher" },
  "Reverse Grip Barbell Curl": { muscle: "forearms", pattern: "reverse_curl", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.35, variants: ["Cable reverse curl"] },
  "Spider Curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.35, variants: ["Preacher curl","DB incline curl"] },
  "Barbell Banded Back Squat": { muscle: "quads", pattern: "squat", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.2, variants: ["Barbell back squat"], variantOf: "Barbell back squat" },
  "Barbell Glute Bridge": { muscle: "glutes", pattern: "hip_extension", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.75, variants: ["Barbell hip thrust"], variantOf: "Barbell hip thrust" },
  "Barbell Split Squat": { muscle: "quads", pattern: "lunge", equipment: "barbell", unilateral: true, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.9, variants: ["Smith machine split squat","DB Bulgarian split squat"] },
  "Barbell Thruster": { muscle: "quads", pattern: "squat", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.1, variants: ["Barbell front squat","Dumbbell Thruster"] },
  "Deficit Deadlift": { muscle: "glutes", pattern: "hip_hinge", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.3, variants: ["Barbell Deadlift"], variantOf: "Barbell Deadlift" },
  "Pause Squat": { muscle: "quads", pattern: "squat", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.2, variants: ["Barbell back squat"], variantOf: "Barbell back squat" },
  "Sumo Deadlift": { muscle: "glutes", pattern: "hip_hinge", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.2, variants: ["Trap bar deadlift","Barbell Deadlift"] },
  "Kettlebell Gorilla Row": { muscle: "back", pattern: "horizontal_pull", equipment: "kettlebell", unilateral: true, loadUnit: LOAD_UNITS.KETTLEBELL_KG, fatigue: 0.75, variants: ["One-arm DB row"] },
  "Kettlebell Renegade Rows": { muscle: "back", pattern: "horizontal_pull", equipment: "kettlebell", unilateral: true, loadUnit: LOAD_UNITS.KETTLEBELL_KG, fatigue: 0.75, variants: ["One-arm DB row"] },
  "Kettlebell Single Arm Row": { muscle: "back", pattern: "horizontal_pull", equipment: "kettlebell", unilateral: true, loadUnit: LOAD_UNITS.KETTLEBELL_KG, fatigue: 0.65, variants: ["One-arm DB row"], variantOf: "One-arm DB row" },
  "Kettlebell Clean & Press (Double)": { muscle: "shoulders", pattern: "vertical_push", equipment: "kettlebell", unilateral: false, loadUnit: LOAD_UNITS.KETTLEBELL_KG, fatigue: 0.95, variants: ["DB shoulder press"] },
  "Kettlebell Push Press": { muscle: "shoulders", pattern: "vertical_push", equipment: "kettlebell", unilateral: false, loadUnit: LOAD_UNITS.KETTLEBELL_KG, fatigue: 0.85, variants: ["Dumbbell Push Press"], variantOf: "Dumbbell Push Press" },
  "One-Arm Kettlebell Military Press To Side": { muscle: "shoulders", pattern: "vertical_push", equipment: "kettlebell", unilateral: true, loadUnit: LOAD_UNITS.KETTLEBELL_KG, fatigue: 0.7, variants: ["Two-Arm Kettlebell Military Press"], variantOf: "Two-Arm Kettlebell Military Press" },
  "Two-Arm Kettlebell Military Press": { muscle: "shoulders", pattern: "vertical_push", equipment: "kettlebell", unilateral: false, loadUnit: LOAD_UNITS.KETTLEBELL_KG, fatigue: 0.85, variants: ["DB shoulder press"] },
  "Kettlebell Goblet Curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "kettlebell", unilateral: false, loadUnit: LOAD_UNITS.KETTLEBELL_KG, fatigue: 0.4, variants: ["DB curl"], variantOf: "DB curl" },
  "Kettlebell Romanian Deadlift": { muscle: "hamstrings", pattern: "hip_hinge", equipment: "kettlebell", unilateral: false, loadUnit: LOAD_UNITS.KETTLEBELL_KG, fatigue: 0.8, variants: ["DB Romanian deadlift"], variantOf: "DB Romanian deadlift" },
  "Kettlebell Sumo Deadlift": { muscle: "glutes", pattern: "hip_hinge", equipment: "kettlebell", unilateral: false, loadUnit: LOAD_UNITS.KETTLEBELL_KG, fatigue: 0.8, variants: ["Sumo Deadlift"], variantOf: "Sumo Deadlift" },
  "Kettlebell Thruster": { muscle: "quads", pattern: "squat", equipment: "kettlebell", unilateral: false, loadUnit: LOAD_UNITS.KETTLEBELL_KG, fatigue: 1, variants: ["Dumbbell Thruster"], variantOf: "Dumbbell Thruster" },
  "Kettlebell Windmill": { muscle: "core", pattern: "lateral_flexion", equipment: "kettlebell", unilateral: true, loadUnit: LOAD_UNITS.KETTLEBELL_KG, fatigue: 0.4, variants: ["Dumbbell Windmill"], variantOf: "Dumbbell Windmill" },
  "Turkish Get-Up": { muscle: "core", pattern: "trunk", equipment: "kettlebell", unilateral: true, loadUnit: LOAD_UNITS.KETTLEBELL_KG, fatigue: 0.6, variants: ["Dead bug"] },
  "Band Kneeling Pulldown": { muscle: "back", pattern: "vertical_pull", equipment: "band", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.4, variants: ["Lat pulldown"] },
  "Band Pullover": { muscle: "back", pattern: "vertical_pull", equipment: "band", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.35, variants: ["Cable pullover"], variantOf: "Cable pullover" },
  "Band Row": { muscle: "back", pattern: "horizontal_pull", equipment: "band", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.4, variants: ["Low row","Single-arm cable row"] },
  "Band Seated Pulldown": { muscle: "back", pattern: "vertical_pull", equipment: "band", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.4, variants: ["Band Kneeling Pulldown"], variantOf: "Band Kneeling Pulldown" },
  "Band Straight Arm Pulldown": { muscle: "back", pattern: "vertical_pull", equipment: "band", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.35, variants: ["Straight-Arm Lat Pulldown"], variantOf: "Straight-Arm Lat Pulldown" },
  "Band External Rotation": { muscle: "rear_delts", pattern: "external_rotation", equipment: "band", unilateral: true, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.2, variants: ["Cable External Rotation"], variantOf: "Cable External Rotation" },
  "Band High Face Pull": { muscle: "rear_delts", pattern: "horizontal_abduction", equipment: "band", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.3, variants: ["Face pull"], variantOf: "Face pull" },
  "Band Lateral Raise": { muscle: "side_delts", pattern: "lateral_raise", equipment: "band", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.25, variants: ["DB lateral raise","Cable lateral raise"] },
  "Band Overhead Press": { muscle: "shoulders", pattern: "vertical_push", equipment: "band", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.4, variants: ["DB shoulder press"] },
  "Band Single Arm Lateral Raise": { muscle: "side_delts", pattern: "lateral_raise", equipment: "band", unilateral: true, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.2, variants: ["Band Lateral Raise"], variantOf: "Band Lateral Raise" },
  "Band Curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "band", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.3, variants: ["DB curl"] },
  "Band Tricep Kickbacks": { muscle: "triceps", pattern: "elbow_extension", equipment: "band", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.25, variants: ["Cable triceps kickback"], variantOf: "Cable triceps kickback" },
  "Band Glute Bridge": { muscle: "glutes", pattern: "hip_extension", equipment: "band", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.4, variants: ["Glute bridge"] },
  "Band Good Morning": { muscle: "lower_back", pattern: "hip_hinge", equipment: "band", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.4, variants: ["Barbell good morning"], variantOf: "Barbell good morning" },
  "Band Leg Curl": { muscle: "hamstrings", pattern: "knee_flexion", equipment: "band", unilateral: true, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.3, variants: ["Prone leg curl Prime","Seated leg curl"] },
  "Band Pull-Through": { muscle: "glutes", pattern: "hip_hinge", equipment: "band", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.4, variants: ["Cable pull-through"], variantOf: "Cable pull-through" },
  "Band Romanian Deadlift": { muscle: "hamstrings", pattern: "hip_hinge", equipment: "band", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.4, variants: ["DB Romanian deadlift"], variantOf: "DB Romanian deadlift" },
  "Band Squat": { muscle: "quads", pattern: "knee_dominant", equipment: "band", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.5, variants: ["Bodyweight squat","Goblet squat"] },
  "Banded Eccentric Tibialis Raise": { muscle: "calves", pattern: "plantar_flexion", equipment: "band", unilateral: true, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.15, variants: ["Tibialis Raise"], variantOf: "Tibialis Raise" },
  "Band Hip Abduction": { muscle: "abductors", pattern: "abduction", equipment: "band", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.25, variants: ["Abduction machine","Cable hip abduction"] },
  "Banded Clamshell": { muscle: "abductors", pattern: "abduction", equipment: "band", unilateral: true, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.2, variants: ["Band Hip Abduction"], variantOf: "Band Hip Abduction" },
  "Plate Front Raise": { muscle: "shoulders", pattern: "front_raise", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.35, variants: ["Dumbbell Front Raise"], variantOf: "Dumbbell Front Raise" },
  "Wrist Roller": { muscle: "forearms", pattern: "wrist_flexion", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.25, variants: ["DB wrist curl"] },
  "Plate Forward Lunge": { muscle: "glutes", pattern: "lunge", equipment: "barbell", unilateral: true, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.6, variants: ["Forward Lunge"], variantOf: "Forward Lunge" },
  "EZ Bar Reverse Preacher Curl": { muscle: "forearms", pattern: "reverse_curl", equipment: "ez_bar", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.3, variants: ["Cable reverse curl","Reverse Grip Barbell Curl"] },
  "Barbell Landmine Row": { muscle: "back", pattern: "horizontal_pull", equipment: "landmine", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.85, variants: ["T-bar row","Barbell row"] },
  "Meadows Row": { muscle: "back", pattern: "horizontal_pull", equipment: "landmine", unilateral: true, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.7, variants: ["One-arm DB row","Barbell Landmine Row"] },
  "TRX Squat": { muscle: "quads", pattern: "knee_dominant", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.5, variants: ["Bodyweight squat"] },
  "Bodyweight Knee Push Ups": { muscle: "chest", pattern: "horizontal_push", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.4, variants: ["Push-up"], variantOf: "Push-up" },
  "Decline Push Up": { muscle: "chest", pattern: "incline_push", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.65, variants: ["Push-up"], variantOf: "Push-up" },
  "Incline Push Up": { muscle: "chest", pattern: "horizontal_push", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.45, variants: ["Push-up"], variantOf: "Push-up" },
  "B-stance Back Extension": { muscle: "glutes", pattern: "hip_extension", equipment: "bodyweight", unilateral: true, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.4, variants: ["Glute hyperextension"], variantOf: "Glute hyperextension" },
  "Prone Y-T Raises": { muscle: "rear_delts", pattern: "horizontal_abduction", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.25, variants: ["Band pull-apart","Face pull"] },
  "Diamond Push Ups": { muscle: "triceps", pattern: "elbow_extension", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.55, variants: ["Push-up","Dips"] },
  "Bent-Knee Soleus Raise": { muscle: "calves", pattern: "plantar_flexion", equipment: "bodyweight", unilateral: true, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.25, variants: ["Seated calf raise","Single-leg calf raise"] },
  "Bodyweight Alternating Lateral Lunge": { muscle: "glutes", pattern: "lunge", equipment: "bodyweight", unilateral: true, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.45, variants: ["Dumbbell Lateral Lunge"], variantOf: "Dumbbell Lateral Lunge" },
  "Bodyweight Box Squat": { muscle: "quads", pattern: "knee_dominant", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.45, variants: ["Bodyweight squat"], variantOf: "Bodyweight squat" },
  "Bodyweight Hip Abduction": { muscle: "abductors", pattern: "abduction", equipment: "bodyweight", unilateral: true, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.2, variants: ["Abduction machine"] },
  "Bulgarian Split Squat": { muscle: "quads", pattern: "lunge", equipment: "bodyweight", unilateral: true, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.6, variants: ["DB Bulgarian split squat"], variantOf: "DB Bulgarian split squat" },
  "Cossack Squat": { muscle: "adductors", pattern: "lunge", equipment: "bodyweight", unilateral: true, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.4, variants: ["Dumbbell Cossack Squat"], variantOf: "Dumbbell Cossack Squat" },
  "Eccentric Calf Lowers": { muscle: "calves", pattern: "plantar_flexion", equipment: "bodyweight", unilateral: true, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.3, variants: ["Single-leg calf raise"], variantOf: "Single-leg calf raise" },
  "Fire Hydrants": { muscle: "abductors", pattern: "abduction", equipment: "bodyweight", unilateral: true, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.2, variants: ["Abduction machine"] },
  "Forward Lunge": { muscle: "glutes", pattern: "lunge", equipment: "bodyweight", unilateral: true, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.45, variants: ["DB reverse lunge"] },
  "Frog Pump": { muscle: "glutes", pattern: "hip_extension", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.3, variants: ["Glute bridge"], variantOf: "Glute bridge" },
  "Front-Foot-Elevated Split Squat": { muscle: "quads", pattern: "lunge", equipment: "bodyweight", unilateral: true, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.55, variants: ["Dumbbell Goblet Split Squat"], variantOf: "Dumbbell Goblet Split Squat" },
  "Nordic Hamstring Curl": { muscle: "hamstrings", pattern: "knee_flexion", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.6, variants: ["Prone leg curl Prime","Seated leg curl"] },
  "Single Leg Glute Bridge": { muscle: "glutes", pattern: "hip_extension", equipment: "bodyweight", unilateral: true, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.35, variants: ["Glute bridge"], variantOf: "Glute bridge" },
  "Single-Leg Step-Down": { muscle: "quads", pattern: "lunge", equipment: "bodyweight", unilateral: true, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.4, variants: ["DB step-up","Box step-up"] },
  "Tibialis Raise": { muscle: "calves", pattern: "plantar_flexion", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.15, variants: ["Standing calf raise"] },
  "Walking Lunge": { muscle: "glutes", pattern: "lunge", equipment: "bodyweight", unilateral: true, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.5, variants: ["Dumbbell Walking Lunges"], variantOf: "Dumbbell Walking Lunges" },
  "Bicycle Crunches": { muscle: "core", pattern: "rotation", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.3, variants: ["Cable woodchop"] },
  "Bird Dog": { muscle: "core", pattern: "trunk", equipment: "bodyweight", unilateral: true, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.2, variants: ["Dead bug"] },
  "Crunches": { muscle: "core", pattern: "trunk_flexion", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.25, variants: ["Abs bench crunch","Cable crunch"] },
  "Decline Sit-Up": { muscle: "core", pattern: "trunk_flexion", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.4, variants: ["Abs bench crunch"], variantOf: "Abs bench crunch" },
  "Reverse Crunch": { muscle: "core", pattern: "trunk_flexion", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.3, variants: ["Hanging leg raise"] },
  "Supermans": { muscle: "lower_back", pattern: "trunk_extension", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.25, variants: ["Roman chair"] },
  "V-Up": { muscle: "core", pattern: "trunk_flexion", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.4, variants: ["Hanging leg raise"] },
  "Stability Ball Leg Curl": { muscle: "hamstrings", pattern: "knee_flexion", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.4, variants: ["Prone leg curl Prime","Seated leg curl"] },
  "Slider Leg Curl": { muscle: "hamstrings", pattern: "knee_flexion", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.4, variants: ["Stability Ball Leg Curl"], variantOf: "Stability Ball Leg Curl" },
  "Barbell Close Grip Bench Press": { muscle: "triceps", pattern: "elbow_extension", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.9, variants: ["Smith Machine Close Grip Bench Press","Dips"] },
  "Reverse-Grip Barbell Bench Press": { muscle: "chest", pattern: "horizontal_push", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.95, variants: ["Barbell bench press"], variantOf: "Barbell bench press" },
  "Wide-Grip Barbell Bench Press": { muscle: "chest", pattern: "horizontal_push", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1, variants: ["Barbell bench press"], variantOf: "Barbell bench press" },
  "Barbell High Incline Bench Press": { muscle: "chest", pattern: "incline_push", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.95, variants: ["Barbell incline bench press"], variantOf: "Barbell incline bench press" },
  "Decline Barbell Bench Press": { muscle: "chest", pattern: "horizontal_push", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1, variants: ["Barbell bench press"], variantOf: "Barbell bench press" },
  "Dumbbell Decline Bench Press": { muscle: "chest", pattern: "horizontal_push", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.9, variants: ["DB bench press"], variantOf: "DB bench press" },
  "Band Assisted Pull-Up": { muscle: "back", pattern: "vertical_pull", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.75, variants: ["Assisted pull-up"], variantOf: "Assisted pull-up" },
  "Neutral-Grip Pull-Up": { muscle: "back", pattern: "vertical_pull", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.9, variants: ["Pull-up"], variantOf: "Pull-up" },
  "Weighted Pull Ups": { muscle: "back", pattern: "vertical_pull", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 1, variants: ["Pull-up"], variantOf: "Pull-up" },
  "Wide-Grip Pull-Up": { muscle: "back", pattern: "vertical_pull", equipment: "bodyweight", unilateral: false, loadUnit: LOAD_UNITS.BODYWEIGHT, fatigue: 0.9, variants: ["Pull-up"], variantOf: "Pull-up" }
};

function n(v) { const x = Number(v); return Number.isFinite(x) ? x : null; }
function dateKey(v) { return String(v || "").slice(0, 10); }
function latestByDate(rows) { return [...(rows || [])].sort((a, b) => String(b.workout_date).localeCompare(String(a.workout_date)) || Number(b.set_no || 0) - Number(a.set_no || 0)); }
export function parseRepRange(value) { const m = String(value || "").match(/(\d+)\s*[–-]\s*(\d+)/); return m ? { min: Number(m[1]), max: Number(m[2]) } : null; }
function completedRowsForExercise(history, exercise) {
  const canonical = normalizeExerciseName(exercise).toLowerCase();
  return (history || []).filter(r => normalizeExerciseName(r.exercise).toLowerCase() === canonical && String(r.type || "WORK").toUpperCase() === "WORK" && Number(r.completed) === 1);
}

function scoreSimilarity(from, to) {
  const a = EXERCISE_INTELLIGENCE[from], b = EXERCISE_INTELLIGENCE[to];
  if (!a || !b) return 0;
  let score = 0;
  if (a.muscle === b.muscle) score += 0.40;
  if (a.pattern === b.pattern) score += 0.35;
  if (a.equipment === b.equipment) score += 0.10;
  if (a.unilateral === b.unilateral) score += 0.05;
  if (a.loadUnit === b.loadUnit) score += 0.10;
  return score;
}

// A variant of the same movement: listed as one, or the same muscle and pattern.
function relatedExercises(from, to) {
  const a = EXERCISE_INTELLIGENCE[from], b = EXERCISE_INTELLIGENCE[to];
  if (!a || !b) return false;
  return (a.variants || []).includes(to) || (b.variants || []).includes(from) || (a.muscle === b.muscle && a.pattern === b.pattern);
}
// How a weight carries over between equipment, on the cautious side: a barbell
// holds about twice one dumbbell, a machine stack a bit less than that; another
// tool of the same kind (Smith instead of a free bar, another machine) a tenth
// less. Cable stacks and per-side machines differ too much to compare.
const UNIT_TRANSFER = {
  [LOAD_UNITS.PER_HAND_KG + ">" + LOAD_UNITS.BARBELL_KG]: 2.0, [LOAD_UNITS.BARBELL_KG + ">" + LOAD_UNITS.PER_HAND_KG]: 0.4,
  [LOAD_UNITS.PER_HAND_KG + ">" + LOAD_UNITS.MACHINE_TOTAL_KG]: 1.8, [LOAD_UNITS.MACHINE_TOTAL_KG + ">" + LOAD_UNITS.PER_HAND_KG]: 0.45,
  [LOAD_UNITS.BARBELL_KG + ">" + LOAD_UNITS.MACHINE_TOTAL_KG]: 0.9, [LOAD_UNITS.MACHINE_TOTAL_KG + ">" + LOAD_UNITS.BARBELL_KG]: 0.9
};
function transferFactor(from, to) {
  const a = EXERCISE_INTELLIGENCE[from], b = EXERCISE_INTELLIGENCE[to];
  if (!a || !b || !relatedExercises(from, to) || a.loadUnit === LOAD_UNITS.BODYWEIGHT || b.loadUnit === LOAD_UNITS.BODYWEIGHT) return null;
  // A machine's number belongs to that machine: its lever, sled and
  // counterweight differ from any other's (a 150 kg leg press is no 150 kg
  // pendulum squat or 50 kg goblet squat), so it carries over to nothing else
  // (Revize doporučování tréninků 2026-10-16, nález 21).
  if (a.equipment === "machine") return null;
  if (a.loadUnit === b.loadUnit) return a.equipment === b.equipment && a.pattern === b.pattern ? 1 : 0.9;
  // Across load units only a listed variant (DB bench → barbell bench), not any
  // exercise of the muscle (a leg press is not a heavier squat).
  const variant = (a.variants || []).includes(to) || (b.variants || []).includes(from);
  return variant ? UNIT_TRANSFER[a.loadUnit + ">" + b.loadUnit] ?? null : null;
}

export const LOAD_RULES = {
  // METAGYM dumbbells: use a practical standard until the exact rack inventory is verified.
  // Light pairs from 2.5 kg are needed for raises, flies and starting loads of women.
  DUMBBELL: { min: 2.5, max: 50, step: 2.5, strict: true },
  // Cable stacks are machine-specific; 2.5 kg is the temporary conservative default.
  CABLE_STACK: { min: 2.5, max: null, step: 2.5, strict: true },
  // Plate-loaded machines and barbells can be built from 1.25 kg plates per side.
  PLATE_LOADED: { min: 2.5, max: null, step: 2.5, strict: false },
  BARBELL: { min: 10, max: null, step: 2.5, strict: true },
  // Added weight on bodyweight work: none to start.
  BODYWEIGHT: { min: 0, max: null, step: 2.5, strict: false },
  // The usual kettlebell sizes 4, 8, 12 … 32 kg.
  KETTLEBELL: { min: 4, max: 48, step: 4, strict: true },
  MEDICINE_BALL: { min: 1, max: 15, step: 1, strict: true },
  // The counterweight of an assisted machine, down to none.
  ASSISTANCE: { min: 0, max: null, step: 5, strict: false }
};

function loadRule(meta) {
  if (!meta) return LOAD_RULES.PLATE_LOADED;
  if (meta.loadUnit === LOAD_UNITS.PER_HAND_KG) return LOAD_RULES.DUMBBELL;
  if (meta.loadUnit === LOAD_UNITS.CABLE_STACK_KG) return LOAD_RULES.CABLE_STACK;
  if (meta.loadUnit === LOAD_UNITS.BARBELL_KG) return LOAD_RULES.BARBELL;
  if (meta.loadUnit === LOAD_UNITS.MACHINE_TOTAL_KG || meta.loadUnit === LOAD_UNITS.MACHINE_PER_SIDE_KG) return LOAD_RULES.PLATE_LOADED;
  if (meta.loadUnit === LOAD_UNITS.BODYWEIGHT) return LOAD_RULES.BODYWEIGHT;
  if (meta.loadUnit === LOAD_UNITS.KETTLEBELL_KG) return LOAD_RULES.KETTLEBELL;
  if (meta.loadUnit === LOAD_UNITS.MEDICINE_BALL_KG) return LOAD_RULES.MEDICINE_BALL;
  if (meta.loadUnit === LOAD_UNITS.ASSISTANCE_KG) return LOAD_RULES.ASSISTANCE;
  return LOAD_RULES.PLATE_LOADED;
}

function roundToStep(value, step, min = 0, max = null) {
  if (value == null || !Number.isFinite(value)) return null;
  let rounded = Math.max(min, Math.round(value / step) * step);
  if (max != null) rounded = Math.min(max, rounded);
  return Math.round(rounded * 100) / 100;
}

export function resolveLoad(exercise, value) {
  exercise = normalizeExerciseName(exercise);
  const meta = EXERCISE_INTELLIGENCE[exercise];
  const rule = loadRule(meta);
  return roundToStep(value, rule.step, rule.min, rule.max);
}

function normalizeRpe(value) {
  const x = n(value);
  // 0 is used by the sheet/import pipeline for an unknown RPE, not for an
  // actual maximal-effort score.
  return x != null && x > 0 && x <= 10 ? x : null;
}

function progressionMultiplier(reps, rpeValue, targetReps) {
  const rpe = normalizeRpe(rpeValue);
  const range = parseRepRange(targetReps);
  if (rpe == null) return 1;
  if (rpe >= 9.5) return 0.92;
  if (rpe >= 9) return 0.95;
  if (range && reps != null && reps >= range.max && rpe <= 8) return 1.025;
  if (rpe <= 6.5) return 1.05;
  if (rpe <= 7.5) return 1.025;
  return 1;
}

function recoveryMultiplier(loadFactor) { return clamp(0.92 + 0.08 * loadFactor, 0.92, 1); }

function scoreHistoryRow(r, targetReps) {
  const range = parseRepRange(targetReps);
  const reps = n(r.actual_reps), rpe = normalizeRpe(r.rpe);
  let score = 0;
  if (range && reps >= range.min && reps <= range.max) score += 3;
  if (range && reps >= range.max) score += 1;
  if (rpe != null && rpe <= 8) score += 2;
  if (rpe != null && rpe >= 9.5) score -= 2;
  return score;
}

function selectReference(rows, targetReps) {
  const usable = latestByDate(rows).filter(r => n(r.actual_kg) != null && n(r.actual_reps) != null);
  if (!usable.length) return null;
  const latestDate = String(usable[0].workout_date || "").slice(0, 10);
  const latestWorkout = usable.filter(r => String(r.workout_date || "").slice(0, 10) === latestDate);
  const candidates = latestWorkout.length ? latestWorkout : usable.slice(0, 12);
  return [...candidates].sort((a, b) =>
    scoreHistoryRow(b, targetReps) - scoreHistoryRow(a, targetReps) ||
    Number(b.actual_reps || 0) - Number(a.actual_reps || 0) ||
    Number(b.set_no || 0) - Number(a.set_no || 0)
  )[0];
}

// Double progression from the latest session: all work sets at the top of the
// rep range (or an easy RPE) earn the next load step, a missed range or a
// near-maximal set takes a step back, anything else keeps the load and aims
// for more reps. The change is at least one real step of the equipment, so
// rounding never swallows it, and older sessions only count for the trend.
function stepDown(value, step, min = 0) { return Math.max(min, Math.floor(value / step + 1e-9) * step); }
export function progressionDecision(rows, exercise, targetReps, loadFactor = 1, today = null) {
  const sessions = new Map();
  for (const r of rows || []) {
    const kg = n(r.actual_kg), reps = n(r.actual_reps), date = dateKey(r.workout_date);
    if (kg == null || reps == null || !date) continue;
    // A set the plan sent to failure is stored as RPE 10; that is the plan,
    // not a sign the load was too heavy, so its RPE doesn't decide the step.
    (sessions.get(date) || sessions.set(date, []).get(date)).push({ kg, reps, rpe: strengthSetOptions(r).toFailure ? null : normalizeRpe(r.rpe) });
  }
  const dates = [...sessions.keys()].sort((a, b) => b.localeCompare(a));
  if (!dates.length) return null;
  const range = parseRepRange(targetReps), meta = EXERCISE_INTELLIGENCE[normalizeExerciseName(exercise)], rule = loadRule(meta), step = rule.step;
  const latest = sessions.get(dates[0]);
  // The working load is the heaviest one that reached the bottom of the range.
  const inRange = latest.filter(s => !range || s.reps >= range.min);
  const topKg = Math.max(...(inRange.length ? inRange : latest).map(s => s.kg));
  const atTop = latest.filter(s => s.kg === topKg);
  const minReps = Math.min(...atTop.map(s => s.reps));
  const rpes = atTop.map(s => s.rpe).filter(x => x != null), maxRpe = rpes.length ? Math.max(...rpes) : null;
  let decision = "hold", kg = topKg;
  if ((range && minReps < range.min - 1) || (maxRpe != null && maxRpe >= 9.5)) {
    decision = "decrease";
    kg = Math.min(topKg - step, stepDown(topKg * 0.925, step, rule.min));
  } else if ((range && minReps >= range.max && (maxRpe == null || maxRpe <= 9)) || (range && minReps >= range.min && maxRpe != null && maxRpe <= 7)) {
    decision = "increase";
    const easy = maxRpe != null && maxRpe <= 6.5 && (!range || minReps >= range.max);
    kg = topKg + Math.max(step, stepDown(topKg * (easy ? 0.05 : 0.025), step));
  }
  // Body weight alone progresses by reps, not by a 2,5 kg the athlete may not
  // have; added weight (a belt) still steps up (Revize 2026-10-16, nález 25).
  if (decision === "increase" && meta?.loadUnit === LOAD_UNITS.BODYWEIGHT && topKg === 0) { decision = "hold"; kg = 0; }
  // A poor recovery day keeps the load instead of adding to it.
  if (decision === "increase" && loadFactor < 0.9) { decision = "hold"; kg = topKg; }
  // After three weeks without the exercise, start a little lighter.
  const gap = today ? (Date.parse(dateKey(today) + "T12:00:00Z") - Date.parse(dates[0] + "T12:00:00Z")) / 86400000 : 0;
  if (gap > 21 && decision !== "decrease") { decision = "return"; kg = Math.min(topKg, stepDown(topKg * 0.9, step, rule.min) || topKg); }
  // An assisted machine works the other way: progress takes counterweight
  // off, a step back (or a return after a break) adds a step of it.
  if (meta?.loadUnit === LOAD_UNITS.ASSISTANCE_KG) kg = decision === "increase" ? Math.max(rule.min, topKg - step) : decision === "decrease" || decision === "return" ? topKg + step : topKg;
  kg = resolveLoad(exercise, kg);
  // Stagnation: the same load for the last three sessions without more reps.
  const previous = dates.slice(1, 3).map(d => sessions.get(d));
  const stalled = decision === "hold" && previous.length === 2 && previous.every(p => Math.max(...p.map(s => s.kg)) === topKg && Math.min(...p.filter(s => s.kg === topKg).map(s => s.reps)) >= minReps);
  return { kg, decision, stalled, topKg, minReps, maxRpe, sets: atTop.length, date: dates[0], sessions: dates.length, range };
}

function estimateFromOwnHistory(own, exercise, targetReps, loadFactor, today = null) {
  const result = progressionDecision(own, exercise, targetReps, loadFactor, today);
  if (!result) return null;
  const confidence = clamp(0.72 + Math.min(result.sessions, 5) * 0.055, 0.72, 1);
  return {
    kg: result.kg, source: "own-history", confidence,
    referenceExercise: exercise, referenceKg: result.topKg,
    referenceReps: result.minReps, referenceRpe: result.maxRpe,
    referenceDate: result.date, performanceCount: Math.min(result.sessions, 5),
    progression: result.decision, stalled: result.stalled, referenceSets: result.sets,
    deltaPct: result.topKg ? Math.round((result.kg / result.topKg - 1) * 1000) / 10 : 0
  };
}

// A variant (variantOf) and its main exercise keep one weight history: the
// sets of the main exercise and of all its variants measured the same way
// (a cable variant of a dumbbell shrug has its own numbers).
export function historyFamily(exercise) {
  const meta = EXERCISE_INTELLIGENCE[exercise];
  if (!meta) return [exercise];
  // A one-side variant of a two-side exercise (Single-Leg Press of the leg
  // press) lifts a different weight, so it keeps its own history (Coach
  // evaluation run 26, S19: 150 kg from the leg press on one leg).
  const root = meta.variantOf || exercise;
  return [exercise, ...Object.keys(EXERCISE_INTELLIGENCE).filter(name => name !== exercise && (name === root || EXERCISE_INTELLIGENCE[name].variantOf === root) && EXERCISE_INTELLIGENCE[name].loadUnit === meta.loadUnit && Boolean(EXERCISE_INTELLIGENCE[name].unilateral) === Boolean(meta.unilateral))];
}

// A one-arm cable exercise of a two-arm one (Cable Single Arm Rope Pushdown of
// the Cable triceps extension): one arm pulls about half the stack of both.
// Without it a one-arm variant fell back to the catalogue (5 kg planned after
// 35 kg with both arms, 2026-10-23).
function oneArmOf(from, to) {
  const a = EXERCISE_INTELLIGENCE[from], b = EXERCISE_INTELLIGENCE[to];
  return Boolean(a && b && !a.unilateral && b.unilateral && a.loadUnit === LOAD_UNITS.CABLE_STACK_KG && b.loadUnit === LOAD_UNITS.CABLE_STACK_KG && a.pattern === b.pattern
    && (b.variantOf === from || (b.variants || []).includes(from) || (a.variants || []).includes(to)));
}

export function estimateStartingLoad({ exercise, history = [], targetReps = "8–15", fallbackKg = null, loadFactor = 1, today = null }) {
  exercise = normalizeExerciseName(exercise);
  const def = EXERCISE_INTELLIGENCE[exercise];
  if (!def) return { kg: fallbackKg, source: fallbackKg == null ? "unknown" : "fallback", confidence: fallbackKg == null ? 0 : 0.2 };
  const family = historyFamily(exercise);
  const ownEstimate = estimateFromOwnHistory(family.flatMap(name => completedRowsForExercise(history, name)), exercise, targetReps, loadFactor, today);
  if (ownEstimate) return ownEstimate;
  const candidates = [];
  for (const name of Object.keys(EXERCISE_INTELLIGENCE)) {
    if (family.includes(name)) continue;
    const rows = completedRowsForExercise(history, name);
    const ref = selectReference(rows, targetReps);
    if (!ref) continue;
    const kg = n(ref.actual_kg);
    if (kg == null) continue;
    const similarity = scoreSimilarity(name, exercise);
    const factor = transferFactor(name, exercise);
    // A one-arm cable exercise takes half of its two-arm movement's stack;
    // other one-side and two-side pairs aren't compared.
    const half = oneArmOf(name, exercise);
    if (!half && Boolean(EXERCISE_INTELLIGENCE[name].unilateral) !== Boolean(def.unilateral)) continue;
    // Only a variant of the same movement says anything about this one.
    if (factor == null || similarity < 0.75 && !(EXERCISE_INTELLIGENCE[name].variants || []).includes(exercise) && !(EXERCISE_INTELLIGENCE[exercise].variants || []).includes(name)) continue;
    candidates.push({ name, kg, rpe: normalizeRpe(ref.rpe), reps: n(ref.actual_reps), similarity, factor: half ? factor * 0.5 : factor, half, date: ref.workout_date });
  }
  candidates.sort((a, b) => b.similarity - a.similarity || String(b.date).localeCompare(String(a.date)));
  const ref = candidates[0];
  if (ref) {
    let kg = ref.kg * ref.factor;
    kg *= progressionMultiplier(ref.reps, normalizeRpe(ref.rpe), targetReps);
    kg *= recoveryMultiplier(loadFactor);
    // Never far above the catalogue's start for an exercise not done yet.
    // Half of the athlete's own two-arm weight needs no such limit.
    if (!ref.half && fallbackKg != null && Number(fallbackKg) > 0) kg = Math.min(kg, Number(fallbackKg) * 2);
    const rounded = resolveLoad(exercise, kg);
    return { kg: rounded, source: "cross-exercise-estimate", confidence: clamp(0.55 + ref.similarity * 0.45, 0.55, 1), referenceExercise: ref.name, referenceKg: ref.kg, referenceRpe: ref.rpe, referenceReps: ref.reps, referenceDate: ref.date, similarity: ref.similarity, transferFactor: ref.factor };
  }
  if (fallbackKg != null) return { kg: resolveLoad(exercise, Number(fallbackKg)), source: "catalogue-default", confidence: 0.25 };
  return { kg: null, source: "no-reference", confidence: 0 };
}

export function findExerciseAlternatives(exercise, history = [], requestedMuscle = null) {
  exercise = normalizeExerciseName(exercise);
  const base = EXERCISE_INTELLIGENCE[exercise];
  const targetMuscle = requestedMuscle || base?.muscle;
  return Object.entries(EXERCISE_INTELLIGENCE)
    .filter(([name, meta]) => name !== exercise && (!targetMuscle || meta.muscle === targetMuscle))
    .map(([name, meta]) => ({ name, muscle: meta.muscle, pattern: meta.pattern, equipment: meta.equipment, unilateral: meta.unilateral, loadUnit: meta.loadUnit, similarity: base ? scoreSimilarity(exercise, name) : 0 }))
    .sort((a, b) => b.similarity - a.similarity);
}
