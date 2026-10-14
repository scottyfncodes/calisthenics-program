# Exercise animation audit

Scope: all 69 exercises in `EX` (`js/exercises.js`); the rig lives in `js/figure.js` and their demo animations.
Method: each old animation was rendered frame by frame in Chromium and inspected,
then rebuilt and re-inspected the same way. Every new frame of every animation is also
checked automatically by `npm run check` (CI runs it before each deploy).

This is a technique-based review against standard coaching cues and basic joint
mechanics. It is **not** a professional or medical validation.

## Root cause (shared by almost every exercise)

The old demos were 13 hand-drawn SVG rigs animated by ~166 CSS keyframe sets that
rotated nested groups. Nothing tied a hand or foot to the floor, and every rig had its
own limb lengths. As a result:

- planted hands and feet slid, lifted or sank into the floor (push-ups, squats, bridge, pike);
- whole figures rotated about arbitrary points instead of moving at the joints (bridge, crunch);
- limb proportions differed from one exercise to the next, and some segments came apart
  (the forward fold's head separated from the body);
- many moves used the wrong rig (lunges with both legs vertical, hip-flexor stretch and
  World's Greatest Stretch drawn standing, high plank shown for forearm-plank cues);
- variations shared one animation (all four push-up variants, three burpees, both bear
  crawls, the fold and the hamstring stretch, jumping jacks and star jumps).

## The new rig

- **One skeleton** with fixed bone lengths (torso 25, upper arm 14, forearm and hand 16,
  thigh 19, shin 19, foot 6, head r 6.5). Proportions are roughly human, so reaches such as
  hand-to-ankle in the quad stretch are physically possible.
- **Key poses per exercise**, interpolated with easing. Planted hands and feet are fixed
  targets, and the elbow or knee is solved with two-bone IK, so contacts can't slide.
  Rigid bodies (planks, rows) pivot on their real contact point.
- **Exercise-specific builders** for movements that differ: push-ups pivot on the toes,
  knee push-ups on the knees, the pike solves the hip from fixed hands and feet, the towel
  row keeps a fixed towel length, and the walking lunge and bear crawl travel along a
  scrolling floor.
- **Holds stay holds.** Plank, side plank, hollow body, bear hold, child's pose and the quad
  stretch show the position with only a slight breathing movement.
- **Side views dim the far arm and leg**, so near and far limbs can be told apart.
  Out-of-plane motion (arm circles behind the body, thoracic rotation, threading the
  needle, the archer row's straight arm, Y-raise) is drawn foreshortened, not stretched.
- **Reduced motion:** the figure is drawn still at its key position (bottom of the
  rep, top of the bridge, and so on), and the animation loop doesn't run.
- Only figures in open rows animate, each restarting from the start of a rep when its row
  opens. No libraries and no build step.
- **Automated checks** (`scripts/check.js`, 240 frames per animation): bone lengths stay
  constant; contacts stay within 0.75 units of their targets, and declared contact points
  drift less than 0.6; nothing passes more than 1.5 units through the floor (lines are 5
  units wide); the head stays above the floor and below props; knees and elbows never bend
  backwards (≤3° hyperextension); hip, shoulder, ankle and neck stay in plausible ranges;
  no joint moves faster than 700 units/s (no snapping); every exercise has an animation.

## Per-exercise findings

| Exercise | Issue found | Correction | Remaining uncertainty |
|---|---|---|---|
| Arm Circles | Two arms spun through 360° in the frontal plane, crossing through the head. | Side view: straight arms circle forward, and the circle's rear half is foreshortened because the arm passes out to the side. | Arm circles are also done laterally with small circles. This shows big forward circles; the cue covers reversing. |
| Shoulder Rolls | Folded arms spun a full circle, reading as flapping. | The shoulder girdle traces a small up, back and down circle while the arms hang. | Small motion; subtle at phone size. |
| March in Place | Front-view figure with knees lifting sideways. | Side view: alternating knee lift to ~40° below horizontal, opposite arm swing, stance foot flat. | — |
| High Knees (easy) / High Knees | Front view; the thigh never reached hip height; the stance foot slid. | Side view on the balls of the feet; thighs to ~20° below horizontal (easy) and horizontal (fast); elbows bent, arms pumping. | No flight phase is shown for the fast version. |
| Cat–Cow | The spine stayed straight and the figure rocked. | Hands and knees fixed; the spine curves up (cat, head drops) and dips (cow, head lifts) with holds. | — |
| Bird Dog (slow) / Bird Dog | The extended limbs went past horizontal and the planted hand moved. | Opposite arm and leg reach to level with the back while the other two limbs stay planted; then the pairs alternate. | Hip "squareness" can't be seen from the side. |
| Incline Push-up | The arm detached from the bench edge. | Rigid plank pivots on the toes, hands fixed on the edge, arms square to the body at the top, chest to the edge at the bottom. | — |
| Knee Push-up | Rotated about the wrong point. | Pivots on the knees, shins raised, straight line from knee to head. | — |
| Push-up | Hands lifted, and the hips stayed put while the chest dropped (a sagging plank). | Rigid plank from the toes, hands under the shoulders, elbows tracking back toward the feet, chest ~1 hand above the floor. | Elbow flare (about 45°) can't be shown from the side. |
| Diamond Push-up | Same animation as the push-up. | Hands under the lower chest; elbows travel straight back along the ribs. | Hands touching only shows head-on. |
| Archer Push-up | Same animation as the push-up. | Head-on view: wide hands, the body lowers toward one hand while the other arm stays straight; sides alternate. | **Flag for review:** the head-on view is the least legible demo at phone size. |
| Pseudo Planche Push-up | Same animation as the push-up. | Hands down by the hips, shoulders leaned well forward of the hands. **Cue clarified:** "lean your shoulders forward past your hands" (was "past your fingertips"). | — |
| Pike Push-up | Arms swung free and hands left the floor. | Hands and feet fixed; hips stay high while the head lowers to a spot just in front of the hands (a tripod); elbows bend back toward the feet. | The feet are placed closer to the hands than many people can manage with straight legs; real hips sit a little lower. |
| Bodyweight Squat | Front view; the knees crossed (extreme valgus) and the feet left the floor. | Side view, feet flat and fixed; hips sit back and down to thighs about parallel, knees forward over the toes, torso leaning ~40°, arms forward as a counterweight. | Depth and lean vary with anatomy. |
| Jump Squat | No real take-off; the feet stayed glued down. | Counter-movement squat with an arm swing, full extension onto the toes, flight, toe-first landing, absorption back into the squat. | — |
| Calf Raise | The whole figure translated up. | Pivots on the ball of the foot (toe fixed); quick rise, pause, slow lower. | — |
| Reverse Lunge | Both legs stayed nearly vertical; the back knee never dropped. | The front foot never moves; the back foot steps back onto its ball; the back knee drops under the hip toward the floor; the front shin stays roughly vertical. | — |
| Walking Lunge | Shared the reverse lunge. | Its own move: the back foot steps through into the next lunge. The camera follows the hips while the dashed floor scrolls, so the planted feet stay fixed to the ground. | Some may expect the figure to travel across the frame instead. |
| Jump Lunge | Legs never switched. | Lunge, take-off, scissor switch in the air, soft landing in the opposite lunge, and back. | — |
| Bulgarian Split Squat | The chair was drawn under the hips and almost nothing moved. | The rear foot rests laces-down on a chair behind; the hips drop almost straight down and the back knee drops toward the floor. **Cue clarified:** "lower your back knee straight down" (was "front knee"). | — |
| Assisted Pistol Squat | The standing leg kicked backwards. | Deep single-leg sit with the heel down and the free leg held straight forward. The torso leans for balance, one hand slides down a doorframe and the other reaches forward. | The doorframe is drawn beside the body (in depth), so it overlaps the figure. |
| Glute Bridge | The whole figure tilted and the head left the floor. | Shoulders, head and feet stay down; hips rise until shoulders, hips and knees form a line, with the shins about vertical. | — |
| Glute Bridge March | Same tilt problem. | The bridge is held level while each knee lifts to ~90°/90° in turn. | — |
| Dead Bug | Limbs swung while the hips rolled. | The back stays flat; arms start vertical and the legs in a tabletop; the opposite arm and leg lower until they hover, then the pairs alternate. | — |
| Knee Plank / Plank | Shown on straight arms, contradicting the forearm cues. | Forearm planks with elbows under the shoulders and a straight line from knees (or heels) to head. Holds with a breath of movement. | — |
| Bicycle Crunch | The whole figure pivoted off the floor. | Lower back down, shoulders curled up, hands cradling the head, legs pedalling (one knee in, the other leg long). | The torso twist toward the knee is invisible from the side. |
| Mountain Climbers | The knee swung up behind the body. | Shoulders stacked over fixed hands, hips level, each knee driving under the chest in alternation. | — |
| Side Plank | Body almost upright, like a lean. | Forearm under the shoulder, feet stacked, a shallow straight line from feet to head (seen from the front), top arm up. Hold. | The top arm reaching up is a common variant; the cue doesn't specify it. |
| Hollow Body Hold | Static and flat. | Low back down; shoulders, arms and straight legs lifted into a shallow banana shape. Hold. | — |
| V-Up | The hips lifted off the floor. | The hips stay down; legs and torso rise together until the hands reach the shins; controlled lowering. | Hands reach the shins, not the toes; a full toe touch needs above-average flexibility. |
| Superman | The arms pointed the wrong way. | Arms, chest and straight legs lift together off a grounded pelvis; neck neutral; hold, then a slow lower. | — |
| Reverse Snow Angel | The arm pointed up from a lying figure. | Top-down view on a mat: straight arms sweep from the hips out to overhead and back. **Cue clarified:** arms hover off the floor. | The hover itself can't be seen from above. |
| Prone Y-Raise | Same as the superman. | Chest and legs stay down and only the arms lift (slightly foreshortened, since they angle out into the Y). | The Y angle can't be seen from the side. |
| Towel Row | The body stayed still; only the arm bent. | Heels planted, the body a straight line leaning back. The towel's length is fixed, so pulling brings the whole body up toward the post, elbows driving back. | Anchor height is chosen so the pull ends still leaning back. |
| Table Row / Archer Table Row | The whole body rotated, the hands left the edge and the head went through the table. | Heels on the floor, rigid body, hands fixed on the table edge; the chest rises toward the edge with the head below the table. The archer variant keeps the far arm straight (foreshortened, gripping further along). | — |
| Scapular Squeeze Hold | No visible change. | The shoulder blades draw back and slightly down and hold; the chest lifts a little; the arms stay by the sides. | Subtle at phone size. |
| Step-Back Burpee | Front-view figure that never reached a plank. | Squat, hands down just in front of the feet, step back one foot at a time to a high plank, step in one foot at a time, stand. | — |
| Half Burpee | Shared the step-back burpee. | Jump both feet back to a plank, jump them in, stand: no push-up and no jump. | — |
| Burpee | No plank or push-up. | Squat, hands down, weight onto the hands, jump back to a plank, chest to floor, jump in, jump up reaching overhead. | — |
| Burpee Tuck Jump | Shared the burpee. | Same as the burpee, finishing with a tuck jump (knees to chest). | — |
| Bear Crawl Hold | Knees on the floor (it was all fours). | Hands under the shoulders, knees hovering just off the floor, toes tucked, back flat. Hold. | — |
| Bear Crawl | Same, and it never moved forward. | Opposite hand and foot step together while the knees hover; the floor scrolls as the figure travels. | — |
| World's Greatest Stretch | Drawn standing. | Deep lunge, back knee down, hands inside the front foot; one arm rotates up to point at the ceiling (foreshortened mid-turn) while the eyes follow. | — |
| Thoracic Rotation | The arm swung while planted. | On all fours with a hand behind the head, the elbow rotates from under the chest up toward the ceiling (a vertical sweep from the side). | — |
| Standing Forward Fold | The head detached from the body. | Hips hinge back, knees soft, spine and neck relax so the head hangs, hands toward the shins. | — |
| Hamstring Stretch | Shared the fold. | Standing single-leg version: front heel down with toes up and that leg straight, back knee bent, hips back, flat-back hinge. | The cue also allows the seated version. |
| Child's Pose | Roughly right but flat and disconnected. | Hips to heels, chest on the thighs, arms long, forehead down; breathing only. | Low pose; small at phone size. |
| Hip Flexor Stretch | Drawn standing. | Half kneeling, back knee down, front knee over the ankle; the hips ease forward with the torso tall (back hip extension). | The pelvic tuck itself can't be drawn on a stick spine. |
| Chest Opener Stretch | Odd three-quarter shape. | Side view: hands clasped behind, straight arms lift back and away, chest lifts. | — |
| Thread the Needle | The arm just swung. | The threading arm slides under the body (seen end-on, so short) while that shoulder and the side of the head lower to the floor and the hips stay over the knees. | — |
| Quad Stretch | Front-view leg kick; the hand never held the ankle. | Standing tall on one leg, the other heel to the glute with the hand holding the ankle, knees together, hips slightly forward. | — |

## New exercises (on-demand release)

Eleven exercises added for the on-demand app have animations built on the same rig and
pass the same automated checks. Each was rendered at 8 phases in Chromium at ~90 px and
~280 px and inspected. The hanging moves share one builder: both hands are fixed on the
bar (seen end-on as a small ring under its strap) and the body can only move by bending
the elbows or by moving the shoulder girdle. Hanging figures are framed a little smaller
than the others (the frame grows to keep the floor in shot), and the knees are bent with
the feet behind so the feet stay clear of the floor.

| Exercise | What the demo shows | Remaining uncertainty |
|---|---|---|
| Active Dead Hang | Straight arms, shoulders held down away from the ears; only a slight breath and shoulder setting move. Hold. | Subtle at phone size. In a side view the near arm crosses the head. |
| Scapular Pull-up | From a passive hang (shoulders up by the ears), the shoulders pull down and the body rises about 3 units with the elbows straight, then lowers. | Small motion; at phone size it reads mostly as the head and shoulders bobbing. |
| Pull-up | Full hang, shoulders set down first, then the elbows drive down toward the ribs; the shoulders travel slightly back so the head passes behind the bar and the chin clears it; full lowering. The arms are drawn a little short because the grip is wider than the shoulders. | To keep the chin clearly over the bar, the shoulders come up to roughly bar height, a little higher than most people reach. |
| Chin-up | Same hang and rhythm, but the arms work in the side plane: the elbows travel down in front of the body, the torso stays upright and the chest comes higher with the head tipped back. | **Flag for review:** at phone size the difference from the pull-up (torso lean, elbow path) is subtle. |
| Negative Pull-up | Starts with the chin over the bar, lowers smoothly for about 5 s to a full hang, then the feet come down to the floor and the figure jumps back to the top in under a second. | The reset is a floor jump; a step or box isn't drawn. |
| Hanging Knee Raise | Arms straight, shoulders engaged, the hands and shoulders don't move (no swing). The knees draw up past hip height (hip flexion ~120°) while the pelvis curls up (the back rounds), then lower slowly. | Starts with the knees bent and the feet behind, since straight legs would reach the floor in this frame. |
| Bench Dip | Hands on a bench edge behind the hips, legs out with the heels fixed on the floor. The elbows bend straight back to about 90° and the hips drop close to the bench, then press up. | With the heels fixed, the knees bend from about 15° at the top to about 60° at the bottom. Truly straight legs would need the hips to move back into the bench. |
| Parallel Bar Dip | Support on straight arms over a bar on posts, knees bent with the feet behind and off the floor. Lowers with a forward lean until the upper arm is level and the shoulder is just below the elbow (forearm vertical), then presses up. | Both bars overlap in the side view, so they read as one. The lean (~30° at the bottom) is on the larger side of "slight". |
| Lying Leg Raise | Lying on the back, arms by the sides; straight legs rise from a hover to vertical (hip flexion ~90°) and lower slowly. The torso stays flat. | Low-back arching can't be shown on a straight stick spine. |
| Single-Leg Glute Bridge | The far foot is planted (fixed) and the near leg is held straight in line with its thigh; the hips lift until shoulders, hips and knee make one line, pause, lower. Shoulders stay down. | Hips staying level side to side can't be seen from the side. |
| Single-Leg Romanian Deadlift | Standing on the near leg with the foot flat and fixed and the knee soft. The hips hinge back with a flat back until the torso is near level, while the free leg reaches back in line with the torso; the arms hang toward the floor. Then the figure stands back up. | Square hips can't be seen from the side. |

## Remaining limitations and review requests

- **Not verified on a physical iPhone.** Checked in Chromium at an iPhone 13 viewport
  (390×844, 3× scale) and at desktop size, both mid-animation; iOS Safari wasn't available
  here. The rig uses only `requestAnimationFrame` and SVG path updates.
- **Please review:** the head-on Archer Push-up, which is the least legible demo. Subtle
  holds (Shoulder Rolls, Scapular Squeeze, Child's Pose) are also small at phone size.
- 2D stick figures can't show rotation or side-to-side alignment (knee tracking, elbow
  flare, hips square, torso twist). Those points are left to the text cues.
