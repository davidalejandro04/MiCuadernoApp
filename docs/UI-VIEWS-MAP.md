# TutorMate UI Views & Navigation Map

## View Structure

```
┌──────────────────────────────────────────────────┐
│                  Navigation Bar                   │
│  [Inicio] [Lecciones] [Practicar] [Progreso] [Perfil] [⚙]  │
├──────────────────────────────────────────────────┤
│                                                  │
│              Active View Content                 │
│                                                  │
└──────────────────────────────────────────────────┘
```

## Pages (`state.page`)

### 1. HOME (`"home"`)

Closed notebook cover displaying:
- Student avatar (animal) with gradient background
- "Mi Cuaderno de Mates" title
- Name, level, XP, lesson completion ratio
- Click to open → navigates to lessons

### 2. LESSONS (`"lessons"`)

Two sub-views:

**Trail View** (no active lesson):
- Lessons displayed as nodes on a zigzag trail path
- 6 lessons per "spread" (paginated)
- SVG dashed path connecting nodes (Bezier curves)
- Node states: `locked` | `current` | `done` (star)
- Animal mascot indicator on current lesson
- Pagination dots at bottom

**Reader View** (`state.currentLesson` set):
- Two-page book spread:
  - **Left page**: Lesson metadata, stage progress checklist, back button
  - **Right page**: Lesson content in iframe, stage navigation (prev/next/finish)
- Overlay tools:
  - Text selection → right-click → "Explica la seleccion" (context flashcards)
  - Crop tool (scissors icon) → drag region → "Que es esto?" (vision analysis)

### 3. PRACTICE (`"practice"`)

- Chat input form with "Vamos!" submit button
- Quick prompt buttons (fractions, equations, geometry examples)
- Known concepts chips
- Session display (varies by `practiceSession.kind`):
  - **concept**: Study deck cards → flashcards modal
  - **exercise**: Guided steps → exercise overlay modal
  - **non_math**: Redirect message

### 4. TRACKING (`"tracking"`)

Analytics dashboard:
- Stats row: 10 metric cards (help sessions, concepts, exercises, correct/incorrect/ambiguous, alerts, steps, actions, interactions)
- Expandable sections:
  - Pedagogical actions bar chart (a1-h codes)
  - Concept progress grid
  - Struggle alerts list
  - Saved flashcard groups
  - Recent tutor sessions

### 5. PROFILE (`"profile"`)

**Onboarding** (if `!onboardingCompleted`):
- Step 0: Name + animal avatar (8 choices: bear, fox, cat, frog, panda, lion, rabbit, koala)
- Step 1: Grade + daily XP goal (10/20/30)
- Step 2: Focus area + response mode

**Profile View** (after onboarding):
- Avatar, name, grade, focus area, edit button
- Daily goal progress bar
- Stats: Level, streak, lessons completed, total XP, concepts
- Learning path card (all lessons with state)
- Activity card (recent activity, known concepts, reset/delete)

### 6. SETTINGS (Modal overlay)

- LLM Base URL
- Active model dropdown
- Response mode (coach/steps/challenge)
- Agent mode toggle
- Agent-specific model selectors (router, tutor, function)
- Theme selector

---

## Modals & Overlays

### Flashcards Modal (`state.flashcards.open`)

Sources: study deck, context explanation, vision explanation

Card types:
- **Concept card**: Title + body + check prompt
- **Example card**: Title + body + example box
- **Game card**: Match-pairs drag-and-drop
- **Context card**: 3-section (Concepto general, Ejemplo guiado, Respuesta concreta)

Navigation: arrow buttons, X/Y counter, close

### Exercise Overlay (`state.exerciseOverlay.open`)

Step-by-step guided problem solving:
- Step prompt display
- Answer input field
- "Comprobar" (check) button
- "Pedir pista" (request hint) button
- Step result feedback (correct/incorrect/ambiguous)
- Progress through steps → completion

### Loading Panel (`state.loadingPanel.open`)

- Title + detail message
- Optional cancel button
- Shown during LLM calls

### Student Analysis Modal (`state.studentAnalysis.open`)

- LLM-generated analysis of student progress
- Busy spinner while generating

---

## Navigation Flow

```
Home ──click──► Lessons (trail)
                    │
                    ├── click lesson node ──► Lessons (reader)
                    │                           │
                    │                           ├── select text ──► Context Flashcards Modal
                    │                           ├── crop image ──► Vision Flashcards Modal
                    │                           └── finish lesson ──► Lessons (trail) + XP
                    │
Practice ──submit question──► Loading Panel
                                  │
                    ┌─────────────┴──────────────┐
                    ▼                            ▼
              concept session              exercise session
                    │                            │
                    ▼                            ▼
           Flashcards Modal            Exercise Overlay
                    │                            │
                    │                    ┌───────┴────────┐
                    │                    ▼                ▼
                    │              check answer     request hint
                    │                    │                │
                    │                    ▼                ▼
                    │              feedback msg     hint ladder
                    │                    │
                    ▼                    ▼
              concept known        all steps done
                    │                    │
                    └────────┬───────────┘
                             ▼
                    Profile updated (XP, concepts, activity)
```

---

## State Shape

```javascript
state = {
  // Data
  lessons: [],                    // Lesson catalog (units → lessons)
  profile: { ... },               // Student profile (see PROFILE-SCHEMA.md)
  settings: { ... },              // App settings
  availableModels: [],            // LLM models

  // Navigation
  page: "home"|"lessons"|"practice"|"tracking"|"profile",
  currentLesson: null | lesson,
  stageIndex: 0,

  // Practice session
  practiceSession: {
    kind: "concept"|"exercise"|"non_math",
    topic, conceptTopic, relatedTopics,
    deck,                         // Study card deck
    solution,                     // Exercise step plan
    sessionId,
    stepInputs: {},               // stepId → answer
    stepResults: {},              // stepId → {correct, result, attempts, message}
    hintLevels: {},               // stepId → hint level
    currentStepIndex: 0,
    tutorState: {},               // Agent mode state
    agentMode: boolean
  },

  // Modals
  flashcards: { open, source, title, subtitle, cards, index, sessionId },
  exerciseOverlay: { open, index },
  loadingPanel: { open, title, detail, cancelable, requestId },
  settingsOpen: boolean,
  settingsDraft: { ... },
  studentAnalysis: { open, busy, text },

  // Lesson UI
  lessonUi: {
    cropMode, cropRect, dragStart,
    contextMenu: { open, x, y },
    cropAction: { open, x, y, visionModel },
    hint: "", scroll: { x, y }
  },

  // Profile
  onboardingStep: 0,
  trackingSections: { actions, concepts, alerts, flashcards, sessions },
  trackingDetail: { open, actionCode }
}
```

---

## Event Handlers

| Handler | Triggers | Key Actions |
|---------|----------|-------------|
| `handleClick(e)` | All button `data-action` clicks | Navigation, lesson open, step check, hints, modals |
| `handleInput(e)` | Form `data-field` inputs | Profile draft, settings draft, step answers |
| `handleSubmit(e)` | Chat form submit | Study question pipeline |
| `handleDragStart/Over/Drop` | Game card interactions | Match-pairs drag-and-drop |
| `wireLessonFrame()` | Lesson iframe load | Text selection, crop tool, context menu listeners |
