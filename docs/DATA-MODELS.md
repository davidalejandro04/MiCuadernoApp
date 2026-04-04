# TutorMate Data Models & Schemas

## Profile Schema (`profile.json`)

```javascript
{
  // Identity
  name: "",                    // Student display name
  avatar: "",                  // Animal: bear|fox|cat|frog|panda|lion|rabbit|koala
  grade: "",                   // Grade level
  dailyGoal: 20,              // XP target per day (10|20|30)
  focusArea: "",              // Aritmetica|Geometria|Fracciones|Resolucion de problemas
  responseMode: "coach",      // coach|steps|challenge
  onboardingCompleted: false,

  // Progress
  xp: 0,                      // Total XP (40 per level)
  lessonsCompleted: 0,         // Count of completed lessons
  completed: [],               // [{unit, title, ts}]

  // Activity log
  activity: [],                // [{kind, xp, ts, ...}]

  // Concept tracking
  conceptProgress: [],         // See Concept Progress schema below
  tutorSessions: [],           // See Tutor Session schema below
  struggleSignals: [],         // See Struggle Signal schema below
  lessonFlashcards: [],        // See Lesson Flashcard schema below
  interactionLog: []           // Raw interaction events
}
```

### XP & Level System

| Constant | Value | Formula |
|----------|-------|---------|
| XP_PER_LEVEL | 40 | — |
| Level | — | `floor(xp / 40) + 1` |
| XP to next level | — | `40 - (xp % 40)` |
| Practice XP | 1 | Per practice interaction |
| Lesson completion XP | 5 | Per completed lesson |

### Concept Progress Entry

```javascript
{
  key: "normalized-topic-key",     // Slugified topic
  topic: "Fracciones equivalentes", // Display name
  relatedTopics: ["fracciones", "simplificacion"],
  status: "introduced",            // introduced → studying → known
  source: "study-card",           // Origin of concept tracking
  ts: "ISO-8601",                 // First recorded
  lastStudiedAt: "ISO-8601",
  masteredAt: "ISO-8601"          // Set when status = "known"
}
```

Status progression: `introduced` (1) → `studying` (2) → `known` (3)

### Tutor Session Entry

```javascript
{
  id: "session-uuid",
  kind: "concept"|"exercise"|"non_math",
  topic: "string",
  conceptTopic: "string",
  relatedTopics: [],
  ts: "ISO-8601",
  status: "active"|"completed",
  events: [{ type, ts, data }]    // Step completions, decisions, etc.
}
```

### Struggle Signal Entry

```javascript
{
  key: "normalized-key",
  conceptTopic: "string",
  stepId: "string",
  stepTitle: "string",
  failures: 2,                    // Max failures on this step
  occurrences: 1,                 // Times this signal triggered
  status: "open",
  sessionIds: ["uuid"],
  ts: "ISO-8601",
  lastDetectedAt: "ISO-8601"
}
```

Triggered when `stepFailureCounts[stepId] >= 2`. Merged on duplicate key (max failures, summed occurrences).

### Lesson Flashcard Group

```javascript
{
  key: "unit-slug::lesson-title",
  unit: "unit name",
  lessonTitle: "lesson title",
  entries: [{ title, body }],     // Accumulated flashcard content
  ts: "ISO-8601",
  updatedAt: "ISO-8601"
}
```

---

## Lesson Catalog Schema

### Catalog Root (`catalog.json`)

```javascript
{
  schemaVersion: 1,
  validation: {
    uniqueUnitSlotKey: ["metadata.coursework", "metadata.lineIndex"],
    uniqueLessonOrderWithinUnit: true
  },
  units: [
    { id, slug, title, directory }  // References to unit directories
  ]
}
```

### Unit (`unit.json`)

```javascript
{
  schemaVersion: 1,
  id: "unit-{slug}",
  slug: "01-numeros-y-patrones-3",
  title: "Numeros y patrones — 3.o",
  metadata: {
    contentType: "number-sense"|"geometry"|"data-literacy"|...,
    coursework: "mathematics-primary"|"mathematics-extension",
    lineIndex: 1,                 // Unique per coursework
    unitNumber: 1,
    gradeBands: ["3"]|["5"]|[],
    tags: ["numeros", "patrones"]
  },
  lessons: [
    { id, order, file: "./lessons/01-lesson.json" }
  ]
}
```

### Lesson

```javascript
{
  schemaVersion: 1,
  id: "lesson-{unit-slug}-{lesson-slug}",
  slug: "01-tipos-de-triangulos",
  unitId: "unit-06-geometria-1-triangulos",
  order: 1,
  title: "Tipos de triangulos",
  description: "string",
  metadata: {
    contentType: "lesson",
    coursework: "mathematics-primary"|"mathematics-extension",
    lineIndex: 1,
    lessonIndex: 1,
    gradeBands: ["3"]|["5"],
    sourceFormat: "legacy-lessons-json"
  },
  formulas: [
    { latex: "a=b=c", displayMode: false, stageIds: ["stage-01"] }
  ],
  assets: [
    { kind: "stylesheet"|"script"|"svg", source: "external"|"inline", target: "url", stageIds: [] }
  ],
  stages: [
    {
      id: "stage-01",
      order: 1,
      title: "Triangulos por lados",
      html: "<!doctype html>...",
      formulas: [],
      assets: []
    }
  ]
}
```

### Content Types

19 units covering:

| # | Unit | Content Type | Grade |
|---|------|-------------|-------|
| 1 | Geometria — Triangulos | geometry | ext |
| 2 | Numeros y patrones | number-sense | 3 |
| 3 | Relaciones y expresiones | algebra | 5 |
| 4 | Fracciones en la vida diaria | fractions | 3,5 |
| 5 | Datos y graficas | data-literacy | 3,5 |
| 6 | Medicion y estimacion | measurement | 3,5 |
| 7 | Calculo mental | mental-math | 3 |
| 8 | Multiplicacion | multiplication | 3 |
| 9 | Figuras geometricas | geometry | 3 |
| 10 | Numeros grandes y valor posicional | number-sense | 5 |
| 11 | Multiplos, divisores, primos | number-theory | 5 |
| 12 | Fracciones avanzadas | fractions | 5 |
| 13 | Operaciones con fracciones | fractions | 5 |
| 14 | Decimales y porcentajes | decimals | 5 |
| 15 | Geometria — angulos y poligonos | geometry | 5 |
| 16 | Proporcionalidad y areas | proportionality | 5 |
| 17 | Estadistica y medidas | statistics | 5 |
| 18 | Resolucion de problemas | problem-solving | 3,5 |

**Totals**: 19 units, 51 lessons, ~154 stages

---

## Settings Schema (`settings.json`)

```javascript
{
  currentModel: "gemma4:e2b",
  ollamaBaseUrl: "http://127.0.0.1:11434",  // Unused (llama.cpp on :8080)
  responseMode: "coach",                     // coach|steps|challenge
  theme: "light",
  agentMode: true,
  agentRouterModel: "gemma4:e2b",
  agentTutorModel: "gemma4:e2b",
  agentFunctionModel: "gemma4:e2b"
}
```

---

## RAG Chunk Schema

```javascript
{
  id: "unitId/lessonId/stageId",
  text: "Plain text (HTML-stripped, max 300 chars)",
  metadata: {
    lessonId, unitId, stageId,
    title: "Stage title",
    unitTitle, lessonTitle,
    order: 1
  }
}
```

RAG Configuration:
- Top-K: 2 results
- Min BM25 score: 0.15
- Max chunk length: 300 chars
- Context budget: ~100 tokens
- 30+ Spanish stopwords filtered
