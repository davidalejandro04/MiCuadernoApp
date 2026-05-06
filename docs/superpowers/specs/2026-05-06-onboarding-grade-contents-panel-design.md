# Onboarding step 1 — drop daily-XP chips, add grade-contents preview panel

**Date:** 2026-05-06
**Area:** Renderer / onboarding wizard

## Problem

The new-profile wizard currently has three steps:

1. Name + animal avatar
2. Grade dropdown + daily-XP goal chips (10 / 20 / 30 XP)
3. Focus area + response mode

Two issues with step 1:

- The daily-XP chip selector ("experience goal") adds friction without giving the new user enough context to choose well.
- After picking a grade, the user has no preview of what content the app actually covers for that grade. The catalog only ships content for grades 3 and 5, but the dropdown offers 3.º / 4.º / 5.º / 6.º / Secundaria, three of which yield zero content.

## Goal

In step 1 of onboarding:

- Remove the daily-XP chip row.
- Restrict the grade dropdown to the grades the catalog actually supports (3.o and 5.o, matching the existing dropdown's `o`-not-`º` convention).
- Below the dropdown, render a panel that lists every unit and its lessons for the currently-selected grade, so the user can see what they will be studying before saving the profile.

## Non-goals

- No change to step 0 (name + avatar) or step 2 (focus area + response mode).
- No change to the profile schema in [src/utils/profile.mjs](src/utils/profile.mjs). `dailyGoal` stays on the profile and continues to default to `20`.
- No new tests in `tests-node/` — the change is render-only and contains no logic worth unit-testing.
- No changes to the lesson catalog data or its loader.

## Design

### Files touched

- [src/renderer.mjs](src/renderer.mjs) — `renderOnboarding()` and a new `renderGradeContentsPanel()` helper.
- [src/styles.css](src/styles.css) — styles for the new panel.

### `renderOnboarding()` — step 1 markup

Replace the current step-1 block (around [src/renderer.mjs:2297-2308](src/renderer.mjs#L2297-L2308)) with:

- A `<select data-draft-field="grade">` whose options are exactly `["3.o", "5.o"]` (matching the existing convention in the file).
- A call to `renderGradeContentsPanel(draft.grade)` immediately below the select.

The 3-dot stepper at the top of the wizard stays at three dots — only the body of step 1 changes.

### Default grade on first render

If `draft.grade` is empty when step 1 first renders (which is the case for a brand-new profile, since `defaultProfile.grade === ""`), default it to `"3.o"` so the contents panel always has something to show. Implement by treating an empty `draft.grade` as `"3.o"` inside `renderOnboarding()` for both the `<option selected>` and the call to `renderGradeContentsPanel()`. Do **not** mutate `state.profileDraft` on render — the value is only normalized for display. The actual `state.profileDraft.grade` gets set when the user changes the dropdown (existing handler at [src/renderer.mjs:3430](src/renderer.mjs#L3430)) or, failing that, on save (handler at [src/renderer.mjs:3760](src/renderer.mjs#L3760), which already falls back to `"5.o"` — see "Profile save fallback" below).

### `renderGradeContentsPanel(grade)` — new helper

Pure function in [src/renderer.mjs](src/renderer.mjs) that returns an HTML string for the lower panel.

1. Map the display grade to a band string: `"3.o" → "3"`, `"5.o" → "5"`. Anything else → `null`.
2. If band is `null`, render a small muted empty-state ("Aún no hay contenido para este curso."). This branch should be unreachable given the dropdown is restricted, but keep it as a defensive fallback.
3. Filter `state.lessons` (an array of normalized units already loaded at bootstrap) by `unit.metadata?.gradeBands?.includes(band)`. Order is preserved from the catalog loader (sorted by `metadata.lineIndex`).
4. Compute totals: `unitCount = matches.length`, `lessonCount = sum of matches[i].lessons.length`.
5. Emit:

   ```html
   <div class="grade-contents-panel stack">
     <div class="grade-contents-header">
       <strong>Contenidos de <grade></strong>
       <span class="muted">N unidades · M lecciones</span>
     </div>
     <ul class="grade-contents-list">
       <!-- one <li class="grade-contents-unit"> per unit -->
       <li class="grade-contents-unit">
         <div class="grade-contents-unit-title">Unit title</div>
         <ul class="grade-contents-lesson-list">
           <li>Lesson title 1</li>
           <li>Lesson title 2</li>
         </ul>
       </li>
       ...
     </ul>
   </div>
   ```

   All interpolated text must go through the existing `escapeHtml()` helper.

### Re-render wiring

The dropdown already has `data-draft-field="grade"`. The existing change handler at [src/renderer.mjs:3430](src/renderer.mjs#L3430) writes the new value into `state.profileDraft` and triggers a re-render via the standard render loop. The contents panel updates for free — no new event wiring.

### Profile save fallback

[src/renderer.mjs:3760](src/renderer.mjs#L3760) (`save-profile` handler):

- `dailyGoal: state.profileDraft.dailyGoal || 20` — already correct, no change.
- `grade: state.profileDraft.grade || "5.o"` — leave as is. The fallback only fires if someone clicks Save with grade still empty, which should not happen because step 1 always defaults the displayed grade and the dropdown commits a value on change.

### Styling — [src/styles.css](src/styles.css)

Add a small block:

- `.grade-contents-panel` — same border-radius and background as existing `.card`, modest padding, `max-height: 320px; overflow-y: auto;` so a long list does not push the navigation buttons off-screen on small windows.
- `.grade-contents-header` — flex row, title left, count right, muted color for the count.
- `.grade-contents-list` — reset list styles, gap between unit blocks.
- `.grade-contents-unit-title` — slightly larger / bolder than lesson titles.
- `.grade-contents-lesson-list` — indented bulleted list, smaller font size, muted color.

Match the existing visual language of the onboarding `.hero-card` and `.card` rules. No new colors.

## Data flow

1. Bootstrap (`app:bootstrap` IPC in [electron/main.cjs](electron/main.cjs)) loads the lesson catalog and returns `lessons` to the renderer.
2. The renderer stores it as `state.lessons` (an array of units with `metadata.gradeBands` and `lessons[]`).
3. `renderOnboarding()` reads `state.profileDraft.grade` and `state.lessons`, calls `renderGradeContentsPanel(draft.grade)`, which filters and emits the markup.

No new IPC, no new state, no new persistence.

## Edge cases

- **Empty `state.lessons`**: if the catalog failed to load, `state.lessons` is `[]`. The panel renders the header with `"0 unidades · 0 lecciones"` and an empty list. Acceptable — the rest of the app already degrades the same way.
- **Unit with zero lessons**: render the unit header with an empty lesson list. Should not happen for the shipped catalog but the loader does not forbid it.
- **Selected grade not in `["3.o", "5.o"]`**: only reachable if a saved draft from a prior session carried `"4.o"` etc. into onboarding (it cannot, because onboarding only renders for `!onboardingCompleted`). The defensive empty-state branch handles it.

## Acceptance

- Step 1 of onboarding shows: dropdown with two grades, a grade-contents panel, and the wizard navigation row. No XP chips.
- Selecting `3.o` shows units tagged with band `"3"`, including shared `3-y-5` units.
- Selecting `5.o` shows units tagged with band `"5"`, including shared `3-y-5` units.
- Saving the profile produces a profile with `dailyGoal: 20`, the chosen grade, and the rest of the wizard fields as before.
- The 3-dot stepper still shows three dots; step 2 (focus + response mode) is unchanged.
