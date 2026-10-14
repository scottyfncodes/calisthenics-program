/* =========================================================
   EXERCISE LIBRARY — shared by the on-demand app and the classic program.
   Loaded as a classic script (globals EX, CAT, PATTERNS, EQUIPMENT,
   RESTRICTIONS); scripts/check.js and the unit tests require() it.

   Every exercise:
     name, type (animation in js/figure.js), cue (one-sentence how-to),
     cues   short form cues for the workout player
     pat    movement patterns it trains (first = primary), see PATTERNS
     lvl    difficulty 1 (easiest) .. 5 within its pattern ladder
     eq     equipment it needs (all of them), see EQUIPMENT; [] = none
     m      'reps' or 'time'; reps:[lo,hi] / sec:[lo,hi] = working range
     tempo  seconds per rep, including the pause between reps
     uni    true = done per side (reps/seconds are per side)
     stress joints/areas it loads, matched against RESTRICTIONS
     role   'main' (strength/skill work), 'cond' (conditioning),
            'warm' (warm-up), 'cool' (stretch / mobility)
     warm / stretch   which areas a warm-up / cool-down move prepares
     skill  true = a technique-heavy progression worth practising fresh
   ========================================================= */
const EX = {
  // ---- warm-up ----
  armCircles:{name:"Arm Circles", type:"armcircle", cue:"Stand tall, sweep arms in big slow circles. Reverse direction halfway through.",
    cues:["Big, slow circles", "Reverse halfway"], role:'warm', pat:['warm'], warm:['upper'], m:'time', sec:[30,45], lvl:1, eq:[], stress:[]},
  shoulderRolls:{name:"Shoulder Rolls", type:"shoulderroll", cue:"Small circles at the shoulder — loosen the joint before loading it.",
    cues:["Up, back, down", "Arms relaxed"], role:'warm', pat:['warm'], warm:['upper'], m:'time', sec:[25,40], lvl:1, eq:[], stress:[]},
  jumpingJacksLight:{name:"March in Place", type:"march", cue:"Easy march, arms swinging — raise the heart rate gently before the work.",
    cues:["Easy pace", "Swing the arms"], role:'warm', pat:['warm'], warm:['general'], m:'time', sec:[30,60], lvl:1, eq:[], stress:[]},
  jumpingJacks:{name:"Jumping Jacks", type:"jumpingjack", cue:"Full jack — feet and arms open together, land soft on the balls of your feet.",
    cues:["Land soft", "Arms and feet together"], role:'warm', pat:['warm','cond'], warm:['general'], m:'time', sec:[20,45], lvl:1, eq:[], stress:['impact']},
  hipCircles:{name:"Hip Circles", type:"hipcircle", cue:"Hands on hips, trace a big slow circle at the hip in both directions.",
    cues:["Big, slow circle", "Both directions"], role:'warm', pat:['warm'], warm:['lower'], m:'time', sec:[30,45], lvl:1, eq:[], stress:[]},
  highKneesLight:{name:"High Knees (easy)", type:"highkneeseasy", cue:"Light jog on the spot, knees to hip height, relaxed pace.",
    cues:["Relaxed pace", "Stay on the balls of your feet"], role:'warm', pat:['warm'], warm:['general','lower'], m:'time', sec:[30,45], lvl:1, eq:[], stress:['impact']},
  highKnees:{name:"High Knees", type:"highknees", cue:"Drive knees up fast to hip height, stay on the balls of your feet, arms pumping.",
    cues:["Knees to hip height", "Pump the arms"], role:'cond', pat:['cond','warm'], warm:['general'], m:'time', sec:[20,40], lvl:2, eq:[], stress:['impact']},
  catCow:{name:"Cat–Cow", type:"catcow", cue:"On all fours: arch the spine up on the exhale, dip it down on the inhale.",
    cues:["Move with the breath", "Whole spine moves"], role:'warm', pat:['warm','mob'], warm:['spine','core'], stretch:['spine'], m:'time', sec:[30,45], lvl:1, eq:[], stress:['wrists']},
  birdDogWarm:{name:"Bird Dog (slow)", type:"birddog", cue:"All fours, reach opposite arm and leg out slow and controlled.",
    cues:["Slow reach", "Hips square"], role:'warm', pat:['warm'], warm:['core','spine'], m:'time', sec:[30,45], lvl:1, eq:[], stress:['wrists']},

  // ---- horizontal push ----
  inclinePushup:{name:"Incline Push-up", type:"inclinepushup", cue:"Hands on a counter, sturdy table or couch edge, body straight. Lower chest to the edge, press back up.",
    cues:["Body in one straight line", "Chest to the edge", "Elbows back, not flared"], role:'main', pat:['hpush'], lvl:1, eq:[], m:'reps', reps:[8,20], tempo:2.6, stress:['wrists'], mus:['chest','triceps','shoulders']},
  kneePushup:{name:"Knee Push-up", type:"kneepushup", cue:"Knees down, straight line from knee to head. Lower chest to the floor.",
    cues:["Straight line knee to head", "Chest to the floor"], role:'main', pat:['hpush'], lvl:1, eq:[], m:'reps', reps:[6,20], tempo:2.6, stress:['wrists'], mus:['chest','triceps','shoulders']},
  pushup:{name:"Push-up", type:"pushup", cue:"Hands under shoulders, body rigid plank. Chest to floor, drive back up.",
    cues:["Rigid plank, squeeze glutes", "Chest a fist from the floor", "Elbows about 45°"], role:'main', pat:['hpush'], lvl:2, eq:[], m:'reps', reps:[5,20], tempo:3, stress:['wrists'], mus:['chest','triceps','shoulders','core']},
  diamondPushup:{name:"Diamond Push-up", type:"diamondpushup", cue:"Hands together under chest, thumbs and index fingers touching. Lower with elbows tucked.",
    cues:["Hands under the chest", "Elbows brush the ribs"], role:'main', pat:['hpush'], lvl:3, eq:[], m:'reps', reps:[5,15], tempo:3, stress:['wrists'], mus:['triceps','chest']},
  archerPushup:{name:"Archer Push-up", type:"archerpushup", cue:"Wide hands, shift weight to one side as you lower, straight arm stays extended.",
    cues:["Straight arm stays long", "Alternate sides"], role:'main', skill:true, pat:['hpush'], lvl:4, eq:[], m:'reps', reps:[4,12], tempo:4, stress:['wrists','shoulders'], mus:['chest','triceps']},
  pseudoPlanchePushup:{name:"Pseudo Planche Push-up", type:"ppushup", cue:"Hands by your hips, fingers turned out, lean your shoulders forward past your hands, then lower with elbows tucked.",
    cues:["Shoulders past the hands", "Elbows tucked", "Keep the lean"], role:'main', skill:true, pat:['hpush'], lvl:5, eq:[], m:'reps', reps:[3,10], tempo:3.5, stress:['wrists','shoulders'], mus:['shoulders','chest','triceps']},

  // ---- vertical push ----
  pikePushup:{name:"Pike Push-up", type:"pike", cue:"Hips high, forming an upside-down V. Lower the top of your head toward the floor.",
    cues:["Hips high", "Head forward of the hands", "Elbows back"], role:'main', skill:true, pat:['vpush'], lvl:2, eq:[], m:'reps', reps:[4,12], tempo:3, stress:['wrists','shoulders'], mus:['shoulders','triceps']},
  benchDip:{name:"Bench Dip", type:"benchdip", cue:"Hands on a chair or bench edge behind you, legs out. Bend the elbows straight back to about 90°, press up.",
    cues:["Shoulders down, away from ears", "Elbows straight back", "Stop at about 90°"], role:'main', pat:['vpush'], lvl:2, eq:['bench'], m:'reps', reps:[6,15], tempo:2.6, stress:['shoulders','wrists'], mus:['triceps','chest','shoulders']},
  dip:{name:"Parallel Bar Dip", type:"dip", cue:"Support on straight arms, lean slightly forward, lower until the shoulders are just below the elbows, press up.",
    cues:["Slight forward lean", "Shoulders down", "Lower with control"], role:'main', pat:['vpush'], lvl:4, eq:['dip'], m:'reps', reps:[3,12], tempo:3, stress:['shoulders'], mus:['chest','triceps','shoulders']},

  // ---- horizontal pull ----
  towelRow:{name:"Towel Row", type:"row", cue:"Loop a towel around a sturdy post, lean back, pull your chest to your hands.",
    cues:["Body straight", "Elbows drive back", "Squeeze the shoulder blades"], role:'main', pat:['hpull'], lvl:2, eq:['towel'], m:'reps', reps:[6,15], tempo:3, stress:[], mus:['back','biceps']},
  tableRow:{name:"Table Row", type:"tablerow", cue:"Lie under a sturdy table, grip the edge, pull your chest up to the table.",
    cues:["Heels down, body rigid", "Chest to the edge", "Lower slowly"], role:'main', pat:['hpull'], lvl:2, eq:['table'], m:'reps', reps:[5,15], tempo:3, stress:[], mus:['back','biceps']},
  archerTableRow:{name:"Archer Table Row", type:"archertablerow", cue:"Table row, but pull mostly with one arm while the other stays lighter.",
    cues:["One arm does the work", "Alternate sides"], role:'main', pat:['hpull'], lvl:4, eq:['table'], m:'reps', reps:[4,10], tempo:4, stress:[], mus:['back','biceps']},

  // ---- vertical pull ----
  deadHang:{name:"Active Dead Hang", type:"deadhang", cue:"Hang from the bar with straight arms, shoulders gently pulled down away from the ears. Breathe.",
    cues:["Shoulders away from ears", "Ribs down", "Breathe"], role:'main', pat:['vpull'], lvl:1, eq:['bar'], m:'time', sec:[15,45], stress:['shoulders'], mus:['back','grip']},
  scapPull:{name:"Scapular Pull-up", type:"scappull", cue:"From a dead hang, arms straight, pull the shoulder blades down to lift the body an inch, then lower.",
    cues:["Arms stay straight", "Shoulders down, chest up", "Small, controlled lift"], role:'main', pat:['vpull','scap'], lvl:1, eq:['bar'], m:'reps', reps:[5,12], tempo:2.6, stress:['shoulders'], mus:['back']},
  negativePullup:{name:"Negative Pull-up", type:"negpullup", cue:"Jump or step to the top with your chin over the bar, then lower yourself slowly — about five seconds.",
    cues:["Start chin over bar", "Lower for 5 seconds", "Reset each rep"], role:'main', pat:['vpull'], lvl:2, eq:['bar'], m:'reps', reps:[3,6], tempo:7.5, stress:['shoulders'], mus:['back','biceps']},
  chinup:{name:"Chin-up", type:"chinup", cue:"Palms facing you, shoulder width. Pull until your chin clears the bar, lower all the way.",
    cues:["Full hang at the bottom", "Chest to the bar", "No kipping"], role:'main', pat:['vpull'], lvl:3, eq:['bar'], m:'reps', reps:[3,10], tempo:4, stress:['shoulders'], mus:['back','biceps']},
  pullup:{name:"Pull-up", type:"pullup", cue:"Palms away, slightly wider than shoulders. Pull the elbows down to bring the chin over the bar, lower fully.",
    cues:["Start from a full hang", "Elbows to the ribs", "Lower all the way"], role:'main', pat:['vpull'], lvl:4, eq:['bar'], m:'reps', reps:[3,10], tempo:4, stress:['shoulders'], mus:['back','biceps']},

  // ---- scapular control / upper back (no equipment) ----
  superman:{name:"Superman", type:"superman", cue:"Lie face down, lift arms, chest and legs off the floor together, hold, lower slow.",
    cues:["Neck long, eyes down", "Lift and pause", "Lower slowly"], role:'main', pat:['hinge','scap'], lvl:1, eq:[], m:'reps', reps:[8,15], tempo:3.2, stress:['lowerBack'], mus:['back','glutes']},
  reverseSnowAngel:{name:"Reverse Snow Angel", type:"snowangel", cue:"Face down, arms hovering just off the floor, sweep them straight from your hips out and up overhead, then back.",
    cues:["Arms hover off the floor", "Slow sweep", "Squeeze the upper back"], role:'main', pat:['scap'], lvl:1, eq:[], m:'reps', reps:[6,15], tempo:4, stress:[], mus:['back','shoulders']},
  proneYRaise:{name:"Prone Y-Raise", type:"yraise", cue:"Face down, arms forming a Y overhead, lift them off the floor squeezing your upper back.",
    cues:["Thumbs up", "Lift from the upper back", "Pause at the top"], role:'main', pat:['scap'], lvl:1, eq:[], m:'reps', reps:[8,15], tempo:3, stress:[], mus:['back','shoulders']},
  scapularSqueeze:{name:"Scapular Squeeze Hold", type:"scapsqueeze", cue:"Arms at your sides, squeeze your shoulder blades together and hold.",
    cues:["Shoulder blades back and down", "Chest proud", "Breathe"], role:'main', pat:['scap'], lvl:1, eq:[], m:'time', sec:[20,40], stress:[], mus:['back']},

  // ---- squat / single leg ----
  squat:{name:"Bodyweight Squat", type:"squat", cue:"Feet shoulder-width, sit hips back and down, chest up. Drive through the heels to stand.",
    cues:["Hips back and down", "Chest up", "Knees track over toes"], role:'main', pat:['squat'], lvl:1, eq:[], m:'reps', reps:[10,25], tempo:3, stress:['knees'], mus:['quads','glutes']},
  jumpSquat:{name:"Jump Squat", type:"jumpsquat", cue:"Squat down then explode straight up, land soft back into the squat.",
    cues:["Explode up", "Land soft and quiet"], role:'main', pat:['squat','cond'], lvl:3, eq:[], m:'reps', reps:[6,15], tempo:2.6, stress:['knees','impact'], mus:['quads','glutes','calves']},
  reverseLunge:{name:"Reverse Lunge", type:"lunge", cue:"Step one foot back, drop the back knee toward the floor, front shin stays vertical.",
    cues:["Step back long", "Back knee toward the floor", "Front shin vertical"], role:'main', pat:['single'], lvl:2, eq:[], m:'reps', reps:[6,12], uni:true, tempo:3, stress:['knees'], mus:['quads','glutes']},
  walkingLunge:{name:"Walking Lunge", type:"walklunge", cue:"Step forward into a lunge, drive up and step the back foot through into the next lunge.",
    cues:["Long step", "Torso tall", "Drive through the front heel"], role:'main', pat:['single'], lvl:2, eq:[], m:'reps', reps:[6,12], uni:true, tempo:2.6, stress:['knees'], mus:['quads','glutes']},
  bulgarianSplitSquat:{name:"Bulgarian Split Squat", type:"bulgariansplit", cue:"Rear foot up on a chair behind you, lower your back knee straight down toward the floor.",
    cues:["Rear foot laces-down", "Drop straight down", "Front heel stays planted"], role:'main', pat:['single'], lvl:3, eq:['bench'], m:'reps', reps:[5,12], uni:true, tempo:3.5, stress:['knees'], mus:['quads','glutes']},
  jumpLunge:{name:"Jump Lunge", type:"jumplunge", cue:"From a lunge, jump and switch legs mid-air, land soft into the opposite lunge.",
    cues:["Switch in the air", "Land soft"], role:'main', pat:['single','cond'], lvl:4, eq:[], m:'reps', reps:[6,16], tempo:2.2, stress:['knees','impact'], mus:['quads','glutes']},
  pistolSquat:{name:"Assisted Pistol Squat", type:"pistol", cue:"One leg extended forward, hold a doorframe for balance, lower slow onto the standing leg.",
    cues:["Heel stays down", "Free leg long", "Use the doorframe lightly"], role:'main', skill:true, pat:['single','squat'], lvl:5, eq:[], m:'reps', reps:[3,8], uni:true, tempo:4.5, stress:['knees'], mus:['quads','glutes']},

  // ---- hinge / posterior chain ----
  gluteBridge:{name:"Glute Bridge", type:"glutebridge", cue:"Lie on your back, knees bent. Squeeze glutes and lift hips to a straight line.",
    cues:["Drive through the heels", "Squeeze at the top", "Ribs down"], role:'main', pat:['hinge'], lvl:1, eq:[], m:'reps', reps:[10,20], tempo:3, stress:[], mus:['glutes','hamstrings']},
  gluteBridgeMarch:{name:"Glute Bridge March", type:"glutemarch", cue:"Hold the bridge position, lift one knee toward your chest at a time without dropping your hips.",
    cues:["Hips stay level", "Slow knee lifts"], role:'main', pat:['hinge','coreS'], lvl:2, eq:[], m:'reps', reps:[5,12], uni:true, tempo:2.6, stress:[], mus:['glutes','hamstrings','core']},
  singleLegBridge:{name:"Single-Leg Glute Bridge", type:"slbridge", cue:"One foot planted, the other leg straight. Drive through the planted heel to lift the hips level.",
    cues:["Hips stay level", "Free leg in line with the thigh", "Pause at the top"], role:'main', pat:['hinge'], lvl:3, eq:[], m:'reps', reps:[6,15], uni:true, tempo:3, stress:[], mus:['glutes','hamstrings']},
  singleLegRdl:{name:"Single-Leg Romanian Deadlift", type:"slrdl", cue:"Stand on one leg, soft knee. Hinge at the hip, the free leg reaching back, until the torso is near level; stand back up.",
    cues:["Hinge, don't squat", "Back flat, hips square", "Free leg reaches back"], role:'main', pat:['hinge','single'], lvl:2, eq:[], m:'reps', reps:[6,12], uni:true, tempo:3.6, stress:[], mus:['hamstrings','glutes']},
  calfRaise:{name:"Calf Raise", type:"calfraise", cue:"Stand tall, rise onto the balls of both feet, pause, lower slow.",
    cues:["Rise high", "Pause", "Lower slowly"], role:'main', pat:['calf'], lvl:1, eq:[], m:'reps', reps:[12,25], tempo:2.4, stress:[], mus:['calves']},

  // ---- core: stability ----
  deadBug:{name:"Dead Bug", type:"deadbug", cue:"On your back, arms up, knees at 90°. Lower opposite arm and leg without arching your low back.",
    cues:["Low back stays down", "Slow and controlled", "Exhale as you reach"], role:'main', pat:['coreS'], lvl:1, eq:[], m:'reps', reps:[5,12], uni:true, tempo:3, stress:[], mus:['core']},
  birdDog:{name:"Bird Dog", type:"birddog", cue:"All fours, extend opposite arm and leg fully, hold, keep hips square.",
    cues:["Reach long", "Hips square", "Pause at full reach"], role:'main', pat:['coreS'], lvl:1, eq:[], m:'reps', reps:[5,10], uni:true, tempo:3.5, stress:['wrists'], mus:['core','glutes']},
  kneePlank:{name:"Knee Plank", type:"kneeplank", cue:"Forearms and knees down, one straight line from knees to head. Brace the core.",
    cues:["Straight line knees to head", "Brace", "Breathe"], role:'main', pat:['coreS'], lvl:1, eq:[], m:'time', sec:[20,45], stress:[], mus:['core']},
  plank:{name:"Plank", type:"plank", cue:"Forearms and toes down, one straight line from ankles to head. Squeeze glutes and abs.",
    cues:["Elbows under shoulders", "Squeeze glutes", "Don't let hips sag"], role:'main', pat:['coreS'], lvl:2, eq:[], m:'time', sec:[20,60], stress:[], mus:['core']},
  sidePlank:{name:"Side Plank", type:"sideplank", cue:"One forearm down, stack your feet, lift hips into a straight line. Switch sides at the halfway point.",
    cues:["Elbow under shoulder", "Hips high", "Switch sides halfway"], role:'main', pat:['coreS'], lvl:2, eq:[], m:'time', sec:[15,40], uni:true, stress:['shoulders'], mus:['core','obliques']},
  hollowBody:{name:"Hollow Body Hold", type:"hollow", cue:"On your back, lift shoulders and legs, low back pressed into the floor, arms reaching long.",
    cues:["Low back glued down", "Reach long", "Bend knees to make it easier"], role:'main', skill:true, pat:['coreS'], lvl:3, eq:[], m:'time', sec:[15,40], stress:['lowerBack'], mus:['core']},
  bearCrawlHold:{name:"Bear Crawl Hold", type:"bearhold", cue:"Hands and toes down, knees hovering an inch off the floor. Hold, breathe.",
    cues:["Knees an inch up", "Back flat", "Breathe"], role:'main', pat:['coreS'], lvl:2, eq:[], m:'time', sec:[20,45], stress:['wrists'], mus:['core','shoulders','quads']},

  // ---- core: dynamic ----
  bicycleCrunch:{name:"Bicycle Crunch", type:"crunch", cue:"Hands behind head, bring opposite elbow to opposite knee in a slow pedal.",
    cues:["Slow pedal", "Low back down", "Don't pull on the neck"], role:'main', pat:['coreD'], lvl:2, eq:[], m:'reps', reps:[10,24], tempo:1.6, stress:[], mus:['core','obliques']},
  lyingLegRaise:{name:"Lying Leg Raise", type:"legraise", cue:"On your back, legs straight. Raise them to vertical and lower slowly without the low back arching.",
    cues:["Low back stays down", "Lower slowly", "Bend knees to make it easier"], role:'main', pat:['coreD'], lvl:2, eq:[], m:'reps', reps:[6,15], tempo:3, stress:['lowerBack'], mus:['core','hip flexors']},
  vUp:{name:"V-Up", type:"vup", cue:"Lie flat, simultaneously lift straight legs and torso to touch hands to feet.",
    cues:["Lift together", "Reach for the shins", "Lower with control"], role:'main', pat:['coreD'], lvl:4, eq:[], m:'reps', reps:[5,12], tempo:3, stress:['lowerBack'], mus:['core']},
  hangingKneeRaise:{name:"Hanging Knee Raise", type:"hangknee", cue:"Hang from the bar, shoulders engaged. Draw the knees up toward the chest, lower without swinging.",
    cues:["No swinging", "Curl the pelvis up", "Lower slowly"], role:'main', pat:['coreD'], lvl:3, eq:['bar'], m:'reps', reps:[5,12], tempo:3, stress:['shoulders'], mus:['core','grip']},
  mountainClimbers:{name:"Mountain Climbers", type:"mountainclimber", cue:"Plank position, drive knees toward your chest quickly, hips stay low.",
    cues:["Shoulders over hands", "Hips low", "Quick knees"], role:'cond', pat:['cond','coreD'], lvl:2, eq:[], m:'time', sec:[20,40], stress:['wrists'], mus:['core','shoulders']},

  // ---- conditioning / full body ----
  stepBackBurpee:{name:"Step-Back Burpee", type:"burpeestep", cue:"Hands down, step feet back to a plank one at a time, step back in, stand up.",
    cues:["Step, don't jump", "Solid plank"], role:'cond', pat:['cond'], lvl:1, eq:[], m:'reps', reps:[5,12], tempo:6, stress:['wrists'], mus:['full']},
  halfBurpee:{name:"Half Burpee", type:"halfburpee", cue:"Hands down, jump feet back to a plank, jump them back in, stand up (no push-up, no jump).",
    cues:["Hands down first", "Land in a solid plank"], role:'cond', pat:['cond'], lvl:2, eq:[], m:'reps', reps:[5,12], tempo:4, stress:['wrists','impact'], mus:['full']},
  burpee:{name:"Burpee", type:"burpee", cue:"Squat, hands down, jump back to plank, push-up, jump feet in, jump up reaching overhead.",
    cues:["Chest to the floor", "Jump and reach"], role:'cond', pat:['cond'], lvl:3, eq:[], m:'reps', reps:[5,12], tempo:5, stress:['wrists','impact'], mus:['full']},
  burpeeTuckJump:{name:"Burpee Tuck Jump", type:"burpeetuck", cue:"Full burpee, finish with a jump and pull both knees up toward your chest.",
    cues:["Knees to chest", "Land soft"], role:'cond', pat:['cond'], lvl:4, eq:[], m:'reps', reps:[4,10], tempo:6, stress:['wrists','impact','knees'], mus:['full']},
  starJump:{name:"Star Jump", type:"starjump", cue:"Squat slightly then jump, throwing arms and legs out into a star shape.",
    cues:["Dip, then explode", "Land feet together, soft"], role:'cond', pat:['cond'], lvl:3, eq:[], m:'reps', reps:[6,15], tempo:2.6, stress:['impact'], mus:['full']},
  bearCrawl:{name:"Bear Crawl", type:"bearcrawl", cue:"Knees hovering, crawl forward moving opposite hand and foot together.",
    cues:["Knees low", "Opposite hand and foot", "Back flat"], role:'cond', pat:['cond','coreS'], lvl:2, eq:[], m:'time', sec:[20,40], stress:['wrists'], mus:['full']},

  // ---- mobility / cool-down ----
  worldsGreatest:{name:"World's Greatest Stretch", type:"kneelrotate", cue:"Lunge forward, drop the back knee, plant both hands inside the front foot, rotate one arm to the sky.",
    cues:["Back knee down", "Rotate and reach", "Eyes follow the hand"], role:'cool', pat:['mob','warm'], warm:['lower','spine'], stretch:['lower','spine'], m:'time', sec:[30,45], uni:true, lvl:1, eq:[], stress:['knees','wrists']},
  thoracicRotation:{name:"Thoracic Rotation", type:"quadreach", cue:"All fours, one hand behind your head, rotate your elbow down then up toward the ceiling.",
    cues:["Hips stay still", "Follow the elbow"], role:'cool', pat:['mob','warm'], warm:['spine','upper'], stretch:['spine','upper'], m:'time', sec:[25,40], uni:true, lvl:1, eq:[], stress:['wrists']},
  standingFold:{name:"Standing Forward Fold", type:"fold", cue:"Feet hip-width, hinge at the hips and let your head hang heavy, soft knees.",
    cues:["Soft knees", "Head heavy"], role:'cool', pat:['mob'], stretch:['lower'], m:'time', sec:[30,45], lvl:1, eq:[], stress:[]},
  childsPose:{name:"Child's Pose", type:"childspose", cue:"Kneel, sit hips to heels, walk hands forward and let your chest sink toward the floor.",
    cues:["Hips to heels", "Long arms", "Slow breaths"], role:'cool', pat:['mob'], stretch:['spine','upper'], m:'time', sec:[30,60], lvl:1, eq:[], stress:['knees']},
  hamstringStretch:{name:"Hamstring Stretch", type:"hamstring", cue:"Seated or standing, straighten one leg, hinge forward from the hips, chest toward the shin.",
    cues:["Hinge from the hips", "Back flat"], role:'cool', pat:['mob'], stretch:['lower'], m:'time', sec:[30,45], uni:true, lvl:1, eq:[], stress:[]},
  hipFlexorStretch:{name:"Hip Flexor Stretch", type:"kneelunge", cue:"Kneeling lunge, tuck your tailbone under and gently shift your hips forward.",
    cues:["Tuck the tailbone", "Shift forward gently"], role:'cool', pat:['mob'], stretch:['lower'], m:'time', sec:[30,45], uni:true, lvl:1, eq:[], stress:['knees']},
  chestOpener:{name:"Chest Opener Stretch", type:"chestopener", cue:"Clasp hands behind your back, lift your chest, gently pull shoulders down and back.",
    cues:["Chest lifts", "Shoulders down and back"], role:'cool', pat:['mob'], stretch:['upper'], m:'time', sec:[30,45], lvl:1, eq:[], stress:[]},
  threadNeedle:{name:"Thread the Needle", type:"quadthread", cue:"All fours, thread one arm under the other, rest your shoulder and ear on the floor.",
    cues:["Hips over knees", "Relax into it"], role:'cool', pat:['mob'], stretch:['upper','spine'], m:'time', sec:[30,45], uni:true, lvl:1, eq:[], stress:['wrists']},
  quadStretch:{name:"Quad Stretch", type:"quadhold", cue:"Standing, hold one ankle behind you, knees together, hips pushed slightly forward.",
    cues:["Knees together", "Hips slightly forward"], role:'cool', pat:['mob'], stretch:['lower'], m:'time', sec:[30,45], uni:true, lvl:1, eq:[], stress:['knees']}
};

/* Movement patterns: label, which recovery region they load, and a colour token. */
const PATTERNS = {
  hpush:{label:"Horizontal push", short:"Push", region:'push', color:'--push'},
  vpush:{label:"Vertical push", short:"Press", region:'push', color:'--push'},
  hpull:{label:"Horizontal pull", short:"Row", region:'pull', color:'--pull'},
  vpull:{label:"Vertical pull", short:"Pull-up", region:'pull', color:'--pull'},
  scap:{label:"Upper back & shoulder health", short:"Upper back", region:'pull', color:'--pull'},
  squat:{label:"Squat", short:"Squat", region:'legs', color:'--legs'},
  single:{label:"Single leg", short:"Single leg", region:'legs', color:'--legs'},
  hinge:{label:"Hinge & posterior chain", short:"Hinge", region:'legs', color:'--legs'},
  calf:{label:"Calves", short:"Calves", region:'legs', color:'--legs'},
  coreS:{label:"Core stability", short:"Core", region:'core', color:'--core'},
  coreD:{label:"Dynamic core", short:"Core", region:'core', color:'--core'},
  cond:{label:"Conditioning", short:"Conditioning", region:'cond', color:'--full'},
  warm:{label:"Warm-up", short:"Warm-up", region:null, color:'--chalk'},
  mob:{label:"Mobility", short:"Mobility", region:null, color:'--mob'}
};

/* Optional equipment. Everything else is bodyweight only. */
const EQUIPMENT = {
  bar:{label:"Pull-up bar", hint:"Pull-ups, chin-ups, hangs, knee raises"},
  table:{label:"Sturdy table or low bar", hint:"Body rows"},
  towel:{label:"Towel + sturdy post or railing", hint:"Towel rows"},
  bench:{label:"Chair, bench or step", hint:"Dips, split squats"},
  dip:{label:"Dip bars or parallel bars", hint:"Full dips"}
};

/* Areas a user can ask us to go easy on. Exercises tagged with the same
   stress key are left out. This is load management, not diagnosis. */
const RESTRICTIONS = {
  wrists:{label:"Wrists", hint:"No hands-on-floor work"},
  shoulders:{label:"Shoulders", hint:"No hanging, dips or overhead pressing"},
  knees:{label:"Knees", hint:"No squats, lunges or kneeling"},
  lowerBack:{label:"Lower back", hint:"No back extensions or leg-lever core work"},
  impact:{label:"Jumping / impact", hint:"No jumps or hopping"}
};

/* Classic program category colours (program.html). */
const CAT = {
  PUSH:{label:"Push", css:"--push"},
  LEGS:{label:"Legs", css:"--legs"},
  CORE:{label:"Core", css:"--core"},
  PULL:{label:"Pull", css:"--pull"},
  FULL:{label:"Full Body", css:"--full"},
  MOB:{label:"Mobility", css:"--mob"},
  REST:{label:"Recovery", css:"--rest"}
};

if (typeof module === 'object' && module.exports) module.exports = {EX, PATTERNS, EQUIPMENT, RESTRICTIONS, CAT};
