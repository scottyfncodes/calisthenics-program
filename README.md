# Calisthenics — your time, your workout

**Live: https://scottyfncodes.github.io/calisthenics-program/** — open it on your phone and use *Add to Home Screen* to install it.

Pick how much time you have today, from 5 to 120 minutes, and get a complete, programmed calisthenics session that fits it. Follow it with animated demos, rep targets and automatic rest timers. The app remembers what you did and progresses you over time, with no fixed weekly schedule.

The original 12-week program is still available at `program.html` (linked from History and Settings), with its saved progress untouched.

## How it works

- **Home:** a time selector (slider plus 5/10/15/20/30/45/60/90/120 presets), an optional focus (Auto, Full body, Upper, Lower, Core, Mobility), and a live preview of the session: structure, time split, main exercises and why it was chosen. Shuffle gives a different but equally valid take.
- **Planner (`js/planner.js`):** deterministic. Inputs are minutes, profile (level, goal, equipment, restrictions), history, time of day and a variant number. Output is an explicit timeline of work and rest steps whose estimated duration never exceeds the budget and lands within 30 s of it. It uses:
  - **Structure by duration and goal:** express circuit (≤7 min), rep circuits, timed intervals, antagonist supersets, strength pairs with full rest, skill practice first, core circuits, and mobility/recovery sessions. Long sessions add technique, core, a finisher, easy cardio and mobility instead of piling on hard sets.
  - **Movement patterns:** horizontal/vertical push and pull, squat, single leg, hinge, calves, core stability and dynamic core, upper back/scapular work, conditioning, mobility. Every exercise in `js/exercises.js` carries pattern, difficulty, equipment, rep/hold range, tempo, per-side flag and joint-stress tags.
  - **Recovery-aware focus:** per-region fatigue decays over about two days. Tired legs lead to an upper-body day; hard days in a row lead to a recovery session. Volume is capped per region and per level.
  - **Equipment and restrictions:** bodyweight-only by default, with honest substitutions (upper-back work stands in for rows when there's no bar or table). Restrictions remove every move that loads the area. This is not medical advice.
- **Progression (`js/progress.js`):** reps or hold targets go up after two solid sessions in a row (or one rated *easy*), hold after *tough*, and step back after two misses. Topping out a range unlocks the next variation, one level at a time. Personal records and milestones are derived from history.
- **Player (`js/runner.js` state machine + `index.html`):**
  - large animated demo, form cues, set and round, big rep target with a reps-done stepper, timed holds with side switching;
  - auto-running rest with −15/+15/skip, an effort check after each exercise, and an up-next preview;
  - pause, skip set or exercise, swap exercise, end early with confirmation;
  - wall-clock timers that catch up after backgrounding without running new moves unattended;
  - resume after a refresh, an accidental-tap guard, Back pauses instead of leaving, and the screen stays awake.
- **Summary:** actual time, sets, reps and hold time, milestones and next-time targets. Ending early is reported as partial, never as complete.
- **Animations (`js/figure.js`):** a kinematic stick-figure rig (fixed bones, IK for planted hands and feet, per-exercise key poses), now covering 68 movements including pull-ups, dips, leg raises and single-leg hinges. See `docs/animation-audit.md`.
- Data stays on the device in `localStorage` (`cal-od-v1`). Unreadable data is set aside rather than deleted.

## Development

No build step: the app is static files (`index.html`, `program.html`, `js/`). Serve the folder, or open `index.html` directly.

```
npm install
npm run check      # scripts parse, exercise taxonomy is complete, every animation frame passes the rig's anatomy checks
npm run test:unit  # planner (every duration 5–120 × levels × goals × equipment), progression, player state machine
npm run test:e2e   # Playwright: onboarding, home, player, summary, history, layout at 320–430px, classic program
```

Every merge to `main` runs `check` and the unit tests, then deploys to GitHub Pages (`.github/workflows/pages.yml`).
