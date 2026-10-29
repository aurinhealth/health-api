// Photos of the start and end position for catalog exercises, from the public
// domain Free Exercise DB (github.com/yuhonas/free-exercise-db, Unlicense).
// Each entry names the closest exercise there; exercises without a close
// match are left out and fall back to drawings from RepDB's free tier, or else
// to a still from their video.
const BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
// RepDB free tier (github.com/RepDB/exercise-dataset): flat 512 px drawings,
// free in a commercial app with the visible credit the app shows in Settings.
// Square, so the app shows them uncropped. Only drawings of the same movement
// with the same equipment; "<id>~" marks a pair RepDB stores end first.
const REPDB_BASE = 'https://raw.githubusercontent.com/RepDB/exercise-dataset/main/images/flat/';

const PHOTOS = {
  'Dead bug': 'Dead_Bug', 'Push-up': 'Pushups', 'Bodyweight squat': 'Bodyweight_Squat', 'Glute bridge': 'Butt_Lift_Bridge',
  'DB bench press': 'Dumbbell_Bench_Press', 'Low row': 'Seated_Cable_Rows', 'DB shoulder press': 'Dumbbell_Shoulder_Press',
  'Pivot leg press': 'Leg_Press', 'Prone leg curl Prime': 'Lying_Leg_Curls', 'Cable curl': 'Standing_Biceps_Cable_Curl',
  'DB curl': 'Dumbbell_Bicep_Curl', 'Hammer curl': 'Hammer_Curls', 'Cable triceps extension': 'Triceps_Pushdown',
  'Abs bench crunch': 'Ab_Crunch_Machine', 'Chest flat press Prime': 'Leverage_Chest_Press', 'Shoulder press Prime': 'Machine_Shoulder_Military_Press',
  'Lat pulldown': 'Wide-Grip_Lat_Pulldown', 'Leg extension Prime': 'Leg_Extensions', 'Hip thrust': 'Barbell_Hip_Thrust',
  'DB Romanian deadlift': 'Stiff-Legged_Dumbbell_Deadlift', 'Barbell Romanian deadlift': 'Romanian_Deadlift',
  'DB Bulgarian split squat': 'Split_Squat_with_Dumbbells', 'Adduction machine': 'Thigh_Adductor', 'Abduction machine': 'Thigh_Abductor',
  'Pec deck': 'Butterfly', 'Rear delt pec deck': 'Reverse_Machine_Flyes', 'Cable lateral raise': 'Standing_Low-Pulley_Deltoid_Raise',
  'Cable pullover': 'Straight-Arm_Pulldown', 'Cable rear delt fly': 'Cable_Rear_Delt_Fly', 'Pallof press': 'Pallof_Press',
  'Hyperextension': 'Hyperextensions_Back_Extensions', 'Standing calf raise': 'Standing_Calf_Raises', 'Cable crunch': 'Cable_Crunch',
  'Barbell bench press': 'Barbell_Bench_Press_-_Medium_Grip', 'DB incline press': 'Incline_Dumbbell_Press', 'One-arm DB row': 'One-Arm_Dumbbell_Row',
  'Face pull': 'Face_Pull', 'Cable overhead triceps extension': 'Cable_Rope_Overhead_Triceps_Extension', 'Goblet squat': 'Goblet_Squat',
  'Cable glute kickback': 'One-Legged_Cable_Kickback', 'Cable pull-through': 'Pull_Through', 'Barbell hip thrust': 'Barbell_Hip_Thrust',
  'DB reverse lunge': 'Dumbbell_Rear_Lunge', 'DB step-up': 'Dumbbell_Step_Ups', 'DB sumo squat': 'Plie_Dumbbell_Squat',
  'Leg press high feet': 'Leg_Press', 'Glute hyperextension': 'Hyperextensions_Back_Extensions', 'Cable fly': 'Cable_Crossover',
  'Low-to-high cable fly': 'Low_Cable_Crossover', 'Single-arm cable row': 'Seated_One-arm_Cable_Pulley_Rows',
  'Close-grip lat pulldown': 'Close-Grip_Front_Lat_Pulldown', 'Wide-grip low row': 'Seated_Cable_Rows', 'Barbell row': 'Bent_Over_Barbell_Row',
  'DB lateral raise': 'Side_Lateral_Raise', 'DB Arnold press': 'Arnold_Dumbbell_Press', 'DB rear delt fly': 'Dumbbell_Lying_Rear_Lateral_Raise',
  'DB incline curl': 'Incline_Dumbbell_Curl', 'Cable rope hammer curl': 'Cable_Hammer_Curls_-_Rope_Attachment',
  'DB overhead triceps extension': 'Standing_Dumbbell_Triceps_Extension',
  'Barbell back squat': 'Barbell_Squat', 'Barbell front squat': 'Front_Barbell_Squat',
  'Smith machine squat': 'Smith_Machine_Squat', 'Smith machine split squat': 'Smith_Single-Leg_Split_Squat', 
  'Smith machine incline press': 'Smith_Machine_Incline_Bench_Press', 'Barbell overhead press': 'Standing_Military_Press',
  'DB wrist curl': 'Seated_Dumbbell_Palms-Up_Wrist_Curl', 'DB reverse wrist curl': 'Seated_Dumbbell_Palms-Down_Wrist_Curl',
  'Cable reverse curl': 'Reverse_Cable_Curl', 'DB shrug': 'Dumbbell_Shrug', 'Barbell shrug': 'Barbell_Shrug',
  'Smith machine shrug': 'Smith_Machine_Behind_the_Back_Shrug', 'Cable upright row': 'Upright_Cable_Row', 'Barbell good morning': 'Good_Morning',
  'Pull-up': 'Pullups', 'Chin-up': 'Chin-Up', 'Assisted pull-up': 'Band_Assisted_Pull-Up', 'Hanging leg raise': 'Hanging_Leg_Raise',
  'Dips': 'Dips_-_Chest_Version', 'Assisted dip': 'Dip_Machine', 'Kettlebell swing': 'One-Arm_Kettlebell_Swings', 'EZ bar curl': 'EZ-Bar_Curl',
  'EZ bar skull crusher': 'EZ-Bar_Skullcrusher', 'Preacher curl': 'Preacher_Curl', 'Band pull-apart': 'Band_Pull_Apart',
  'Hack squat': 'Hack_Squat', 'Seated leg curl': 'Seated_Leg_Curl', 'Glute kickback machine': 'Glute_Kickback', 'Seated calf raise': 'Seated_Calf_Raise',
  'T-bar row': 'T-Bar_Row_with_Handle', 'Chest-supported row': 'Lying_T-Bar_Row', 'TRX row': 'Suspended_Row',
  'Barbell incline bench press': 'Barbell_Incline_Bench_Press_-_Medium_Grip', 'Trap bar deadlift': 'Trap_Bar_Deadlift',
  'Medicine ball slam': 'Overhead_Slam', 'Box step-up': 'Dumbbell_Step_Ups',
  "Wide-Grip Lat Pulldown": "Wide-Grip_Lat_Pulldown", "Straight-Arm Lat Pulldown": "Straight-Arm_Pulldown", "Straight Arm Rope Pulldown (Light)": "Straight-Arm_Pulldown", "Cable Bar Pushdown": "Triceps_Pushdown", "Machine Cable V Bar Push Downs": "Triceps_Pushdown", "Single-Arm Cable Fly": "Single-Arm_Cable_Crossover", "Cable Bar Face Pull": "Face_Pull", "Cable Seated Rope Face Pull": "Face_Pull", "Cable Rope Kneeling Face Pull": "Face_Pull", "Single-Arm Overhead Cable Extension": "Cable_Rope_Overhead_Triceps_Extension", "Cable Overhead Straight Bar Extensions": "Cable_Rope_Overhead_Triceps_Extension", "Straight Bar Bench Mid Rows": "Seated_Cable_Rows", "Cable Single Arm Underhand Grip Row": "Seated_One-arm_Cable_Pulley_Rows", "Cable Bench Straight Leg Kickback": "One-Legged_Cable_Kickback", "Decline Machine Chest Press": "Leverage_Decline_Chest_Press", "Incline Machine Chest Press": "Leverage_Incline_Chest_Press", "Neutral-Grip Lat Pulldown": "Close-Grip_Front_Lat_Pulldown",
  "Dumbbell Chest Fly": "Dumbbell_Flyes", "Dumbbell Incline Chest Fly": "Incline_Dumbbell_Flyes", "Dumbbell Neutral High Incline Bench Press": "Hammer_Grip_Incline_DB_Bench_Press", "Neutral-Grip Dumbbell Bench Press": "Dumbbell_Bench_Press_with_Neutral_Grip", "One Arm Dumbbell Bench Press": "One_Arm_Dumbbell_Bench_Press", "Chest-Supported Dumbbell Row": "Dumbbell_Incline_Row", "Dumbbell Back Extension": "Hyperextensions_Back_Extensions", "Dumbbell Pullover": "Bent-Arm_Dumbbell_Pullover", "Cuban Press": "Cuban_Press", "Dumbbell Front Raise": "Front_Dumbbell_Raise", "Dumbbell Incline Front Raise": "Front_Incline_Dumbbell_Raise", "Dumbbell Seated Lateral Raises": "Seated_Side_Lateral_Raise", "Dumbbell Seated Rear Delt Fly": "Seated_Bent-Over_Rear_Delt_Raise", "Dumbbell Upright Row": "Standing_Dumbbell_Upright_Row", "Single-Arm Dumbbell Overhead Press": "Dumbbell_One-Arm_Shoulder_Press", "Standing Dumbbell Press": "Standing_Dumbbell_Press", "Close-Grip Push-Up off a Dumbbell": "Close-Grip_Push-Up_off_of_a_Dumbbell", "Cross-Body Hammer Curl": "Cross_Body_Hammer_Curl", "Dumbbell Concentration Curl": "Concentration_Curls", "Dumbbell Preacher Curl": "One_Arm_Dumbbell_Preacher_Curl", "Dumbbell Skullcrusher": "Lying_Dumbbell_Tricep_Extension", "Dumbbell Tricep Kickback": "Tricep_Dumbbell_Kickback", "Zottman Curl": "Zottman_Curl", "Dumbbell Goblet Bulgarian Split Squat": "Split_Squat_with_Dumbbells", "Dumbbell Squat": "Dumbbell_Squat", "Dumbbell Walking Lunges": "Dumbbell_Lunges", "Dumbbell Russian Twist": "Russian_Twist", "Dumbbell Side Bend": "Dumbbell_Side_Bend", "Dumbbell Superman": "Superman", "Dumbbell Windmill": "Kettlebell_Windmill", "Bench Dips": "Bench_Dips", "Barbell Floor Press": "Floor_Press", "Barbell Deadlift": "Barbell_Deadlift", "Barbell Pullover": "Bent-Arm_Barbell_Pullover", "Barbell Rack Pull": "Rack_Pulls", "Pendlay Row": "Bent_Over_Barbell_Row", "Seal Row": "Lying_Cambered_Barbell_Row", "Barbell Rear Delt Row": "Barbell_Rear_Delt_Row", "Barbell Upright Row": "Upright_Barbell_Row", "Seated Barbell Military Press": "Seated_Barbell_Military_Press", "Barbell Curl": "Barbell_Curl", "Barbell Drag Curl": "Drag_Curl", "Barbell Skullcrusher": "Lying_Triceps_Press", "Reverse Grip Barbell Curl": "Reverse_Barbell_Curl", "Spider Curl": "Spider_Curl", "Barbell Banded Back Squat": "Squat_with_Bands", "Barbell Glute Bridge": "Barbell_Glute_Bridge", "Barbell Split Squat": "Barbell_Lunge", "Deficit Deadlift": "Deficit_Deadlift", "Pause Squat": "Barbell_Squat", "Sumo Deadlift": "Sumo_Deadlift", "Kettlebell Gorilla Row": "Two-Arm_Kettlebell_Row", "Kettlebell Renegade Rows": "Alternating_Renegade_Row", "Kettlebell Single Arm Row": "One-Arm_Kettlebell_Row", "Kettlebell Push Press": "Double_Kettlebell_Push_Press", "One-Arm Kettlebell Military Press To Side": "One-Arm_Kettlebell_Military_Press_To_The_Side", "Two-Arm Kettlebell Military Press": "Two-Arm_Kettlebell_Military_Press", "Kettlebell Thruster": "Kettlebell_Thruster", "Kettlebell Windmill": "Kettlebell_Windmill", "Turkish Get-Up": "Kettlebell_Turkish_Get-Up_Squat_style", "Band External Rotation": "External_Rotation_with_Band", "Band Lateral Raise": "Lateral_Raise_-_With_Bands", "Band Overhead Press": "Shoulder_Press_-_With_Bands", "Band Single Arm Lateral Raise": "Lateral_Raise_-_With_Bands", "Band Good Morning": "Band_Good_Morning", "Band Leg Curl": "Seated_Band_Hamstring_Curl", "Band Pull-Through": "Pull_Through", "Band Squat": "Squats_-_With_Bands", "Plate Front Raise": "Front_Plate_Raise", "Wrist Roller": "Wrist_Roller", "EZ Bar Reverse Preacher Curl": "Reverse_Barbell_Preacher_Curls", "Barbell Landmine Row": "Bent_Over_Two-Arm_Long_Bar_Row", "Meadows Row": "One-Arm_Long_Bar_Row", "Decline Push Up": "Decline_Push-Up", "Incline Push Up": "Incline_Push-Up", "Diamond Push Ups": "Push-Ups_-_Close_Triceps_Position", "Nordic Hamstring Curl": "Natural_Glute_Ham_Raise", "Single Leg Glute Bridge": "Single_Leg_Glute_Bridge", "Walking Lunge": "Bodyweight_Walking_Lunge", "Bicycle Crunches": "Air_Bike", "Crunches": "Crunches", "Decline Sit-Up": "Sit-Up", "Reverse Crunch": "Reverse_Crunch", "Supermans": "Superman", "Stability Ball Leg Curl": "Ball_Leg_Curl", "Barbell Close Grip Bench Press": "Close-Grip_Barbell_Bench_Press", "Wide-Grip Barbell Bench Press": "Wide-Grip_Barbell_Bench_Press", "Decline Barbell Bench Press": "Decline_Barbell_Bench_Press", "Dumbbell Decline Bench Press": "Decline_Dumbbell_Bench_Press", "Band Assisted Pull-Up": "Band_Assisted_Pull-Up", "Neutral-Grip Pull-Up": "V-Bar_Pullup", "Weighted Pull Ups": "Pullups",
  // Matched on 24 Oct 2026 against the database's exercise list (same movement and equipment).
  "Cable woodchop": "Standing_Cable_Wood_Chop", "Abduction machine forward lean": "Thigh_Abductor", "Smith Machine Bench Press": "Smith_Machine_Bench_Press", "Smith Machine Decline Bench Press": "Smith_Machine_Decline_Press", "Inverted Row": "Inverted_Row", "Smith Machine Bent-Over Row": "Smith_Machine_Bent_Over_Row", "Smith Machine Overhead Press": "Smith_Machine_Overhead_Shoulder_Press", "Smith Machine Seated Overhead Press": "Smith_Machine_Overhead_Shoulder_Press", "Smith Machine Close Grip Bench Press": "Smith_Machine_Close-Grip_Bench_Press", "Smith Machine Calf Raise": "Smith_Machine_Calf_Raise", "Cable Bench Chest Fly": "Flat_Bench_Cable_Flyes", "Cable Chest Press": "Cable_Chest_Press", "Cable High-to-Low Fly": "Cable_Crossover", "Cable Incline Bench Press": "Incline_Cable_Chest_Press", "Cable External Rotation": "External_Rotation_with_Cable", "Cable Front Raise": "Front_Cable_Raise", "Cable Overhead Press": "Cable_Shoulder_Press", "Leaning Cable Lateral Raise": "Standing_Low-Pulley_Deltoid_Raise", "Reverse-Grip Tricep Pushdown": "Reverse_Grip_Triceps_Pushdown", "Cable Single Arm Rope Pushdown": "Cable_One_Arm_Tricep_Extension", "Cable Standing Low To High Wood Chopper": "Standing_Cable_Lift", "Cable 30 Degree Shrug": "Cable_Shrugs", "Cable Wrist Curl": "Cable_Wrist_Curl", "Single-Arm Lat Pulldown": "One_Arm_Lat_Pulldown", "Calf Press": "Calf_Press_On_The_Leg_Press_Machine", "Hammer Strength High Row": "Leverage_High_Row", "Hammer Strength Iso-Lateral Row": "Leverage_Iso_Row", "Reverse Hyperextension": "Reverse_Hyperextension", "Machine Preacher Curl": "Machine_Preacher_Curls", "Machine Tricep Extension": "Machine_Triceps_Extension", "Machine Crunch": "Ab_Crunch_Machine", "Captain's Chair Knee Raise": "Knee_Hip_Raise_On_Parallel_Bars", "Forward Lunge": "Bodyweight_Walking_Lunge", "V-Up": "Jackknife_Sit-Up", "Slider Leg Curl": "Platform_Hamstring_Slides", "Reverse-Grip Barbell Bench Press": "Reverse_Triceps_Bench_Press", "Barbell High Incline Bench Press": "Barbell_Incline_Bench_Press_-_Medium_Grip"
};

const REPDB = {
  'Standing rowing machine': 'rowing-machine', 'DB single-leg Romanian deadlift': 'single-leg-romanian-deadlift~',
  'Cable triceps kickback': 'cable-tricep-kickback', 'Single-leg calf raise': 'single-leg-calf-raise',
  'Smith machine hip thrust': 'smith-machine-hip-thrust', 'Landmine press': 'landmine-press',
  'Smith Machine Front Squat': 'smith-machine-front-squat', 'Single-Leg Press': 'single-leg-press',
  'Machine Back Extension': 'machine-back-extension',
  'Dumbbell Push Press': 'dumbbell-push-press', 'Dumbbell Deadlift': 'dumbbell-deadlift', 'Dumbbell Front Squat': 'dumbbell-front-squat',
  'Kettlebell Clean & Press (Double)': 'double-kettlebell-clean-and-press', 'Kettlebell Sumo Deadlift': 'kettlebell-sumo-deadlift',
  'Band Romanian Deadlift': 'banded-romanian-deadlift~', 'Band Hip Abduction': 'banded-standing-hip-abduction',
  'Banded Clamshell': 'banded-clamshell', 'TRX Squat': 'trx-squat', 'Bodyweight Knee Push Ups': 'knee-push-ups',
  'Bodyweight Box Squat': 'box-squat', 'Bodyweight Hip Abduction': 'standing-hip-abduction', 'Cossack Squat': 'cossack-squat',
  'Fire Hydrants': 'fire-hydrant', 'Bird Dog': 'bird-dog', 'Box Jump': 'box-jump', 'Squat Jump': 'jump-squat',
  'Wide-Grip Pull-Up': 'wide-grip-pull-ups', 'Barbell Thruster': 'thruster', 'Band Glute Bridge': 'banded-glute-bridge'
};

// Start and end position photo URLs for an exercise, or an empty list.
export function exercisePhotos(exercise) {
  const id = PHOTOS[exercise];
  if (id) return [0, 1].map(i => BASE + id + '/' + i + '.jpg');
  const rep = REPDB[exercise];
  if (!rep) return [];
  const slug = rep.replace(/~$/, ''), ends = rep.endsWith('~') ? ['peak', 'start'] : ['start', 'peak'];
  return ends.map(end => REPDB_BASE + slug + '-' + end + '.webp');
}

// Width to height of the photos: Free Exercise DB is 3:2, RepDB square.
export function exercisePhotoAspect(exercise) {
  return !PHOTOS[exercise] && REPDB[exercise] ? 1 : 1.5;
}

export const PHOTO_IDS = PHOTOS;
export const REPDB_IDS = REPDB;
