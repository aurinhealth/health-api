// Photos of the start and end position for catalog exercises, from the public
// domain Free Exercise DB (github.com/yuhonas/free-exercise-db, Unlicense).
// Each entry names the closest exercise there; exercises without a close
// match are left out and fall back to a still from their video.
const BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

const PHOTOS = {
  'Dead bug': 'Dead_Bug', 'Push-up': 'Pushups', 'Bodyweight squat': 'Bodyweight_Squat', 'Glute bridge': 'Barbell_Glute_Bridge',
  'DB bench press': 'Dumbbell_Bench_Press', 'Low row': 'Seated_Cable_Rows', 'DB shoulder press': 'Dumbbell_Shoulder_Press',
  'Pivot leg press': 'Leg_Press', 'Prone leg curl Prime': 'Lying_Leg_Curls', 'Cable curl': 'Standing_Biceps_Cable_Curl',
  'DB curl': 'Dumbbell_Bicep_Curl', 'Hammer curl': 'Hammer_Curls', 'Cable triceps extension': 'Triceps_Pushdown',
  'Abs bench crunch': 'Crunches', 'Chest flat press Prime': 'Leverage_Chest_Press', 'Shoulder press Prime': 'Machine_Shoulder_Military_Press',
  'Lat pulldown': 'Wide-Grip_Lat_Pulldown', 'Leg extension Prime': 'Leg_Extensions', 'Hip thrust': 'Barbell_Hip_Thrust',
  'DB Romanian deadlift': 'Stiff-Legged_Dumbbell_Deadlift', 'Barbell Romanian deadlift': 'Romanian_Deadlift',
  'DB Bulgarian split squat': 'Split_Squat_with_Dumbbells', 'Adduction machine': 'Thigh_Adductor', 'Abduction machine': 'Thigh_Abductor',
  'Pec deck': 'Butterfly', 'Rear delt pec deck': 'Reverse_Machine_Flyes', 'Cable lateral raise': 'Cable_Seated_Lateral_Raise',
  'Cable pullover': 'Straight-Arm_Pulldown', 'Cable rear delt fly': 'Cable_Rear_Delt_Fly', 'Pallof press': 'Pallof_Press',
  'Roman chair': 'Hyperextensions_Back_Extensions', 'Standing calf raise': 'Standing_Calf_Raises', 'Cable crunch': 'Cable_Crunch',
  'Barbell bench press': 'Barbell_Bench_Press_-_Medium_Grip', 'DB incline press': 'Incline_Dumbbell_Press', 'One-arm DB row': 'One-Arm_Dumbbell_Row',
  'Face pull': 'Face_Pull', 'Cable overhead triceps extension': 'Cable_Rope_Overhead_Triceps_Extension', 'Goblet squat': 'Goblet_Squat',
  'Cable glute kickback': 'One-Legged_Cable_Kickback', 'Cable pull-through': 'Pull_Through', 'Barbell hip thrust': 'Barbell_Hip_Thrust',
  'DB reverse lunge': 'Dumbbell_Rear_Lunge', 'DB step-up': 'Dumbbell_Step_Ups', 'DB sumo squat': 'Plie_Dumbbell_Squat',
  'Leg press high feet': 'Leg_Press', 'Glute hyperextension': 'Hyperextensions_Back_Extensions', 'Cable fly': 'Cable_Crossover',
  'Low-to-high cable fly': 'Low_Cable_Crossover', 'Single-arm cable row': 'Seated_One-arm_Cable_Pulley_Rows',
  'Close-grip lat pulldown': 'Close-Grip_Front_Lat_Pulldown', 'Wide-grip low row': 'Seated_Cable_Rows', 'Barbell row': 'Bent_Over_Barbell_Row',
  'DB lateral raise': 'Side_Lateral_Raise', 'DB Arnold press': 'Arnold_Dumbbell_Press', 'DB rear delt fly': 'Seated_Bent-Over_Rear_Delt_Raise',
  'DB incline curl': 'Incline_Dumbbell_Curl', 'Cable rope hammer curl': 'Cable_Hammer_Curls_-_Rope_Attachment',
  'Cable triceps kickback': 'Tricep_Dumbbell_Kickback', 'DB overhead triceps extension': 'Standing_Dumbbell_Triceps_Extension',
  'Single-leg calf raise': 'Standing_Dumbbell_Calf_Raise', 'Barbell back squat': 'Barbell_Squat', 'Barbell front squat': 'Front_Barbell_Squat',
  'Smith machine squat': 'Smith_Machine_Squat', 'Smith machine split squat': 'Smith_Single-Leg_Split_Squat', 'Smith machine hip thrust': 'Barbell_Hip_Thrust',
  'Smith machine incline press': 'Smith_Machine_Incline_Bench_Press', 'Barbell overhead press': 'Standing_Military_Press',
  'DB wrist curl': 'Seated_Dumbbell_Palms-Up_Wrist_Curl', 'DB reverse wrist curl': 'Seated_Dumbbell_Palms-Down_Wrist_Curl',
  'Cable reverse curl': 'Reverse_Cable_Curl', 'DB shrug': 'Dumbbell_Shrug', 'Barbell shrug': 'Barbell_Shrug',
  'Smith machine shrug': 'Smith_Machine_Behind_the_Back_Shrug', 'Cable upright row': 'Upright_Cable_Row', 'Barbell good morning': 'Good_Morning',
  'Pull-up': 'Pullups', 'Chin-up': 'Chin-Up', 'Assisted pull-up': 'Band_Assisted_Pull-Up', 'Hanging leg raise': 'Hanging_Leg_Raise',
  'Dips': 'Dips_-_Chest_Version', 'Assisted dip': 'Dip_Machine', 'Kettlebell swing': 'One-Arm_Kettlebell_Swings', 'EZ bar curl': 'EZ-Bar_Curl',
  'EZ bar skull crusher': 'EZ-Bar_Skullcrusher', 'Preacher curl': 'Preacher_Curl', 'Band pull-apart': 'Band_Pull_Apart',
  'Hack squat': 'Hack_Squat', 'Seated leg curl': 'Seated_Leg_Curl', 'Glute kickback machine': 'Glute_Kickback', 'Seated calf raise': 'Seated_Calf_Raise',
  'T-bar row': 'T-Bar_Row_with_Handle', 'Chest-supported row': 'Dumbbell_Incline_Row', 'TRX row': 'Suspended_Row',
  'Barbell incline bench press': 'Barbell_Incline_Bench_Press_-_Medium_Grip', 'Trap bar deadlift': 'Trap_Bar_Deadlift',
  'Medicine ball slam': 'One-Arm_Medicine_Ball_Slam', 'Box step-up': 'Barbell_Step_Ups',
  "Wide-Grip Lat Pulldown": "Wide-Grip_Lat_Pulldown", "Straight-Arm Lat Pulldown": "Straight-Arm_Pulldown", "Straight Arm Rope Pulldown (Light)": "Straight-Arm_Pulldown", "Cable Bar Pushdown": "Triceps_Pushdown", "Machine Cable V Bar Push Downs": "Triceps_Pushdown", "Single-Arm Cable Fly": "Cable_Crossover", "Cable Bar Face Pull": "Face_Pull", "Cable Seated Rope Face Pull": "Face_Pull", "Cable Rope Kneeling Face Pull": "Face_Pull", "Single-Leg Press": "Leg_Press", "Single-Arm Overhead Cable Extension": "Cable_Rope_Overhead_Triceps_Extension", "Cable Overhead Straight Bar Extensions": "Cable_Rope_Overhead_Triceps_Extension", "Straight Bar Bench Mid Rows": "Seated_Cable_Rows", "Cable Single Arm Underhand Grip Row": "Seated_One-arm_Cable_Pulley_Rows", "Cable Bench Straight Leg Kickback": "One-Legged_Cable_Kickback", "Decline Machine Chest Press": "Leverage_Chest_Press", "Incline Machine Chest Press": "Leverage_Chest_Press", "Neutral-Grip Lat Pulldown": "Close-Grip_Front_Lat_Pulldown"
};

// Start and end position photo URLs for an exercise, or an empty list.
export function exercisePhotos(exercise) {
  const id = PHOTOS[exercise];
  return id ? [0, 1].map(i => BASE + id + '/' + i + '.jpg') : [];
}

export const PHOTO_IDS = PHOTOS;

// Without a Free Exercise DB photo, two stills from the exercise's YouTube
// video (one early, one late in it) stand in for the start and end position.
export function videoStills(videoId) {
  return /^[A-Za-z0-9_-]{11}$/.test(videoId || '') ? ['hq1', 'hq3'].map(f => 'https://i.ytimg.com/vi/' + videoId + '/' + f + '.jpg') : [];
}
