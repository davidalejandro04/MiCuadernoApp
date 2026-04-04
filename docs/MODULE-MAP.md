# TutorMate Module Map

## File Tree (Runtime Only)

```
PFM-UI-qt/
├── package.json                          # Entry: main → electron/main.cjs
├── electron/
│   ├── main.cjs                          # Main process: IPC, LLM proxy, persistence, RAG
│   └── preload.cjs                       # Bridge: contextBridge → window.bridge
├── src/
│   ├── index.html                        # App shell (single div + KaTeX)
│   ├── styles.css                        # Notebook-themed design system
│   ├── renderer.mjs                      # UI: views, navigation, chat, exercises
│   ├── rag/                              # Retrieval-Augmented Generation
│   │   ├── index.mjs                     # Public API
│   │   ├── config.mjs                    # BM25 params, stopwords, limits
│   │   ├── chunker.mjs                   # HTML→text chunks (max 300 chars)
│   │   ├── indexer.mjs                   # BM25 inverted index builder
│   │   ├── retriever.mjs                 # Query→top-K results
│   │   ├── prompt-augmenter.mjs          # Inject context into prompts
│   │   └── schemas.mjs                   # JSDoc type definitions
│   └── utils/
│       ├── profile.mjs                   # Profile CRUD, XP, concepts, struggles
│       ├── lessons.mjs                   # Lesson lookup, progress helpers
│       ├── lesson-catalog.mjs            # Catalog loader & validator
│       ├── content.mjs                   # HTML wrapping for lesson stages
│       ├── prompts.mjs                   # All LLM prompt builders
│       └── agents/
│           ├── agent-utils.mjs           # JSON parsing (Gemma4 envelope handling)
│           ├── model-config.mjs          # Model selection & token budgets
│           ├── tutor-state.mjs           # Session state machine
│           ├── pipeline.mjs              # Orchestrator: tutor/turn/progress pipelines
│           ├── router-agent.mjs          # Intent classification
│           ├── learner-model-agent.mjs   # Student state estimation
│           ├── scaffolding-planner-agent.mjs  # Problem decomposition
│           ├── pedagogical-decision-agent.mjs # Answer evaluation
│           ├── tutor-response-agent.mjs  # Message generation
│           ├── verification-agent.mjs    # Quality gate
│           └── progress-agent.mjs        # Session summary
├── data/
│   └── lesson-catalog/
│       ├── catalog.json                  # Catalog manifest (19 units)
│       └── units/                        # 19 unit directories
│           └── {unit-slug}/
│               ├── unit.json             # Unit metadata + lesson references
│               └── lessons/
│                   └── {lesson}.json     # Lesson content (stages + formulas)
├── bin/
│   └── llama-server.exe                  # Local LLM inference binary
├── models/
│   └── gemma3-4b.gguf                    # Model weights (GGUF format)
├── assets/
│   ├── katex/                            # KaTeX math rendering library
│   │   ├── katex.min.js
│   │   ├── katex.min.css
│   │   ├── contrib/                      # auto-render, copy-tex, etc.
│   │   └── fonts/                        # 30+ font files
│   └── svg/                              # 9 math-themed icons
├── tests-node/
│   └── app.test.mjs                      # Node.js smoke tests (assert/strict)
└── scripts/
    └── migrate-lessons-to-catalog.mjs    # Legacy → catalog format migration
```

---

## Dependency Graph

```
                    electron/main.cjs
                    ┌───────┼──────────────────┐
                    │       │                  │
                    ▼       ▼                  ▼
          src/utils/    src/rag/         src/utils/
        lesson-catalog  index.mjs        profile.mjs
             .mjs          │
                    ┌──────┴──────┐
                    ▼      ▼      ▼
                chunker indexer retriever
                   .mjs   .mjs    .mjs
                    │      │      │
                    └──────┼──────┘
                           ▼
                      config.mjs


                   src/renderer.mjs
            ┌──────────┼───────────┐
            │          │           │
            ▼          ▼           ▼
      src/utils/  src/utils/  src/utils/agents/
      ┌────┴────┐    │       ┌────┴──────────┐
      │         │    │       │               │
      ▼         ▼    ▼       ▼               ▼
  profile   lessons prompts pipeline.mjs  agent-utils
    .mjs     .mjs    .mjs      │              .mjs
      │                  ┌─────┼─────┐
      │                  ▼     ▼     ▼
      │              router learner scaffolding
      │              agent  model   planner
      │               .mjs  agent   agent.mjs
      │                      .mjs
      │                  ┌─────┼─────┐
      │                  ▼     ▼     ▼
      │            pedagogical tutor  verification
      │            decision   response agent.mjs
      │            agent.mjs  agent.mjs
      │                              │
      │                              ▼
      │                        progress-agent.mjs
      │
      ▼
  content.mjs ←── lesson-catalog.mjs
```

---

## Module Exports Reference

### `src/utils/profile.mjs`

| Export | Type | Purpose |
|--------|------|---------|
| `defaultProfile` | object | Profile template with all default fields |
| `migrateProfile(input)` | fn | Validate & normalize raw profile |
| `setupProfile(profile, payload)` | fn | Apply onboarding data |
| `addPracticeXp(profile, amount)` | fn | Add XP + activity record |
| `recordLessonCompletion(profile, unit, title, xpGain)` | fn | Mark lesson done (idempotent) |
| `resetProgress(profile)` | fn | Clear all progress |
| `completedPairs(profile)` | fn | Set of `"unit::title"` strings |
| `trackConceptStudy(profile, payload)` | fn | Track concept learning |
| `trackStruggleSignal(profile, payload)` | fn | Record failure signals |
| `trackLessonFlashcards(profile, payload)` | fn | Accumulate flashcards |
| `conceptProgress(profile)` | fn | All concept entries |
| `knownConcepts(profile)` | fn | Concepts with status >= introduced |
| `struggleSignals(profile)` | fn | All signals sorted by recency |
| `lessonFlashcards(profile)` | fn | Flashcard groups sorted |
| `recentActivity(profile, limit)` | fn | Last N activities |
| `streakDays(profile)` | fn | Consecutive days with activity |
| `dailyGoalProgress(profile)` | fn | Today's XP (capped at goal) |
| `profileSummary(profile)` | fn | Computed fields: level, streak, etc. |
| `hasStudiedConcept(profile, topic)` | fn | Boolean check by key |
| `findConceptRecord(profile, topic)` | fn | Lookup by key or relatedTopics |

### `src/utils/lessons.mjs`

| Export | Type | Purpose |
|--------|------|---------|
| `completionRatio(lessons, completedSet)` | fn | `{done, total}` |
| `unitProgress(lessons, unit, completedSet)` | fn | Per-unit `{done, total}` |
| `firstUnseen(lessons, completedSet)` | fn | Next uncompleted lesson |
| `flattenLessons(lessons)` | fn | Flatten to `[{unit, title, description, stageCount}]` |
| `getLesson(lessons, unit, title)` | fn | Lookup specific lesson |

### `src/utils/lesson-catalog.mjs`

| Export | Type | Purpose |
|--------|------|---------|
| `loadLessonCatalogFromDirectory(rootDir)` | async fn | Load & validate catalog |
| `slugifyCatalogId(value)` | fn | Normalize to slug |
| `inferStageTitleFromHtml(html, fallback)` | fn | Extract title from HTML |
| `extractFormulaEntriesFromHtml(html)` | fn | Extract LaTeX formulas |
| `extractAssetEntriesFromHtml(html)` | fn | Extract CSS/JS/SVG refs |

### `src/utils/content.mjs`

| Export | Type | Purpose |
|--------|------|---------|
| `wrapStageHtml(rawHtml, lessonTitle, stageIndex, stageCount)` | fn | Complete HTML doc with KaTeX |

### `src/utils/prompts.mjs`

| Export | Type | Purpose |
|--------|------|---------|
| `buildSystemPrompt(mode)` | fn | Mode-specific system prompt |
| `buildExplainUserPrompt(selection)` | fn | Explain text selection |
| `buildExplainImageUserPrompt()` | fn | Analyze image crop |
| `buildContextFlashcardUserPrompt(selection)` | fn | 3 flashcards from text |
| `buildVisualFlashcardUserPrompt()` | fn | 3 flashcards from image |
| `buildKidMathGateUserPrompt(question)` | fn | Kid math scope check |
| `buildClassifierUserPrompt(question, concepts)` | fn | Classify question |
| `buildStudyDeckUserPrompt(params)` | fn | Generate study cards |
| `buildExerciseTutorUserPrompt(params)` | fn | Step-by-step solution |
| `buildExerciseTraceUserPrompt(problem, stepLimit)` | fn | Hidden trace |
| `kidMathGatePrompt` | string | System prompt for gate |
| `studyClassifierPrompt` | string | System prompt for classifier |
| `studyDeckPrompt` | string | System prompt for deck gen |
| `exerciseTutorPrompt` | string | System prompt for exercise |
| `exerciseTracePrompt` | string | System prompt for trace |
| `contextFlashcardPrompt` | string | System prompt for context cards |
| `visualFlashcardPrompt` | string | System prompt for vision cards |

### `src/utils/agents/agent-utils.mjs`

| Export | Type | Purpose |
|--------|------|---------|
| `parseAgentJson(raw)` | fn | Extract JSON from LLM response |
| `safeParseAgentJson(raw, fallback)` | fn | Safe parse with fallback |

### `src/utils/agents/model-config.mjs`

| Export | Type | Purpose |
|--------|------|---------|
| `resolveAgentModels(settings)` | fn | Get `{router, tutor, function}` models |
| `TOKEN_BUDGETS` | object | Per-agent max token limits |

### `src/utils/agents/tutor-state.mjs`

| Export | Type | Purpose |
|--------|------|---------|
| `createTutorState(config)` | fn | Initialize session state |
| `getCurrentSubproblem(state)` | fn | Active subproblem |
| `advanceSubproblem(state)` | fn | Mark done, move next |
| `tutorStateToSolution(state)` | fn | Convert to UI format |

### `src/utils/agents/pipeline.mjs`

| Export | Type | Purpose |
|--------|------|---------|
| `runTutorPipeline(question, sessionId, ctx)` | async fn | Full init pipeline |
| `runTurnPipeline(state, stepData, ctx)` | async fn | Per-turn evaluation |
| `runProgressPipeline(state, events, ctx)` | async fn | Session summary |

### `src/utils/agents/*.mjs` (individual agents)

Each agent module exports a single `run*Agent(messages, askFn)` function that takes conversation messages and a chat function, returns parsed JSON output.

---

## RAG Module (`src/rag/`)

| File | Export | Purpose |
|------|--------|---------|
| `config.mjs` | `RAG_CONFIG` | BM25 params, stopwords, limits |
| `chunker.mjs` | `chunkLessons(lessons)` | Lessons → text chunks (HTML-stripped) |
| `indexer.mjs` | `buildIndex(chunks)` | Chunks → BM25 inverted index |
| `retriever.mjs` | `retrieve(query, index, config)` | Query → top-K results |
| `prompt-augmenter.mjs` | `augmentPrompt(prompt, context)` | Inject context into prompt |
| `schemas.mjs` | Type definitions | JSDoc types for Chunk, Index, etc. |
| `index.mjs` | Re-exports all above | Public API |

**Pipeline:** `chunkLessons()` → `buildIndex()` → `retrieve(query)` → `augmentPrompt()`
