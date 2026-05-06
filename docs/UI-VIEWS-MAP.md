# TutorMate UI Views & Navigation Map

## Shell

The active desktop shell uses a persistent left sidebar with a calm notebook workspace.

```text
+----------------------+----------------------------------------------+
| Sidebar              | Notebook workspace                           |
| - Inicio             |                                              |
| - Lecciones          | Active page content                           |
| - Estudio            |                                              |
| - Progreso           |                                              |
| - Perfil             |                                              |
| - Ajustes            |                                              |
| Student summary      |                                              |
+----------------------+----------------------------------------------+
```

On smaller screens, the sidebar becomes a compact horizontal navigation strip above the notebook.

## Pages (`state.page`)

### 1. HOME (`"home"`)

Closed notebook cover displaying:
- Student avatar
- "Mi Cuaderno de Mates" title
- Name, XP, concepts, and lesson completion ratio
- Click opens the notebook to lessons

### 2. LESSONS (`"lessons"`)

Two modes:

**Trail view** (`!state.currentLesson`)
- Lessons are shown as nodes on a notebook page trail.
- Six lessons are shown per spread.
- Node states are `done`, `current`, and `upcoming`.
- Upcoming lessons remain openable.
- Footer pagination moves between lesson spreads.

**Reader view** (`state.currentLesson`)
- Left page: lesson metadata, stage checklist, and back action.
- Right page: iframe-rendered lesson stage and one primary next/finish action.
- Overlay tools remain available:
  - Text selection plus context menu opens explanation flashcards.
  - Crop tool lets the student ask about a selected image region.

### 3. PRACTICE (`"practice"`)

- Question composer with submit button.
- Quick prompt buttons.
- Known concept chips.
- Session output:
  - `concept`: study cards and flashcards modal.
  - `exercise`: guided exercise overlay.
  - `non_math`: redirect message.

### 4. TRACKING (`"tracking"`)

Analytics dashboard:
- Metric cards for sessions, attempts, hints, actions, and feedback.
- Collapsible sections for pedagogical actions, concepts, struggle alerts, saved flashcards, and recent sessions.
- Student analysis modal can summarize progress when the local model is available.

### 5. PROFILE (`"profile"`)

**Onboarding**
- Step 0: name and avatar.
- Step 1: grade and daily XP goal.
- Step 2: focus area and response mode.

**Profile view**
- Avatar, name, grade, focus area, and edit action.
- Daily goal progress.
- Stats, learning path, recent activity, known concepts, and reset/delete controls.

### 6. SETTINGS

Modal opened from the sidebar:
- Active GGUF model.
- Response mode.
- Agent mode toggle.
- Data wipe action.

## Modals & Overlays

### Flashcards Modal (`state.flashcards.open`)

Sources:
- Practice study deck.
- Lesson text explanation.
- Lesson image explanation.

Card types:
- Concept card.
- Example card.
- Match-pairs game card.
- Context help card.

### Exercise Overlay (`state.exerciseOverlay.open`)

Guided problem solving:
- Step prompt.
- Answer input.
- Check action.
- Hint action.
- Feedback and completion state.

### Loading Panel (`state.loadingPanel.open`)

- Classic startup/model-switch state.
- Thinking state for local model calls.
- Optional cancel action for cancelable requests.

### Student Analysis Modal (`state.studentAnalysis.open`)

- Local-model summary of practice and progress.
- Busy state while generating.

## Navigation Flow

```text
Home -> click notebook -> Lessons trail

Sidebar:
  Inicio -> Home
  Lecciones -> Lessons trail or current reader state
  Estudio -> Practice
  Progreso -> Tracking
  Perfil -> Profile
  Ajustes -> Settings modal

Lessons trail -> open lesson -> Reader
Reader -> select text -> Flashcards modal
Reader -> crop image -> Flashcards modal
Reader -> finish lesson -> Trail + XP

Practice -> submit question -> Loading panel -> concept/exercise/non_math session
Concept session -> Flashcards modal
Exercise session -> Exercise overlay
```

## State Shape

```javascript
state = {
  lessons: [],
  profile: {},
  settings: {},
  ggufModels: [],

  page: "home" | "lessons" | "practice" | "tracking" | "profile",
  currentLesson: null,
  stageIndex: 0,
  bookPage: 0,

  practiceSession: null,
  flashcards: { open: false, cards: [], index: 0 },
  exerciseOverlay: { open: false, index: 0 },
  loadingPanel: { open: false },
  settingsOpen: false,
  studentAnalysis: { open: false, busy: false },

  lessonUi: {
    cropMode: false,
    cropRect: null,
    contextMenu: { open: false },
    cropAction: { open: false },
    scroll: { x: 0, y: 0 }
  },

  trackingSections: {},
  trackingDetail: { open: false }
};
```

## Event Handlers

| Handler | Triggers | Key actions |
| --- | --- | --- |
| `handleClick(e)` | Buttons with `data-action` | Navigation, lesson open, stages, settings, modals, practice actions |
| `handleInput(e)` | Form fields | Profile draft, settings draft, step answers |
| `handleSubmit(e)` | Practice form | Tutor pipeline request |
| `handleDragStart/Over/Drop` | Match game | Drag/drop pair matching |
| `wireLessonFrame()` | Lesson iframe load | Text selection, crop mode, context/crop menus |
