# TutorMate Agent Pipeline (CLASS-A)

## Overview

The agent pipeline implements the CLASS-A (Conversational Learning with Adaptive Scaffolding Strategy — Agentic) tutoring methodology. It decomposes a student's math question into guided sub-problems and manages turn-by-turn interaction.

The pipeline has two modes controlled by `settings.agentMode`:
- **Agent mode** (`true`): Full multi-agent pipeline via `runTutorPipeline()` + `runTurnPipeline()`
- **Standard mode** (`false`): Direct LLM calls with prompt builders from `prompts.mjs`

---

## Agent Architecture

```
Student Question
      │
      ▼
┌─────────────┐     ┌──────────────┐     ┌──────────────────────┐
│   Router     │────►│ Learner Model│────►│ Scaffolding Planner  │
│  (120 tok)   │     │  (220 tok)   │     │     (900 tok)        │
└─────────────┘     └──────────────┘     └──────────────────────┘
      │                    │                        │
      │ route: pedagogical │ mastery estimate       │ subproblems[]
      │                    │ frustration risk        │ learning objective
      ▼                    ▼                        ▼
                    ┌─────────────────────┐
                    │  TutorState created  │
                    │  (session tracker)   │
                    └────────┬────────────┘
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
    Student answers step              Student requests hint
            │                                 │
            ▼                                 ▼
┌──────────────────────┐         Hint ladder level++
│ Pedagogical Decision │
│     (180 tok)        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│   Tutor Response     │
│     (220 tok)        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│   Verification       │
│     (150 tok)        │
└──────────┬───────────┘
           │
           ▼
    Display to student
           │
    (when session ends)
           │
           ▼
┌──────────────────────┐
│   Progress Agent     │
│     (180 tok)        │
└──────────────────────┘
```

---

## Pipeline Functions

### `runTutorPipeline(question, sessionId, {profile, askFn, models})`

Full initialization pipeline. Called once per new question.

**Sequence:**
1. **Router Agent** → classify intent (`pedagogical|direct_answer|off_topic|chitchat`)
2. If off-topic → return `{ isOffTopic: true }`
3. **Learner Model Agent** → estimate mastery, frustration, misconceptions
4. **Scaffolding Planner Agent** → decompose into 2-5 subproblems with hint ladders
5. Create `TutorState` with subproblems
6. Convert to `solution` format for UI
7. Return `{ tutorState, solution, routerResult, learnerResult, plannerResult }`

### `runTurnPipeline(tutorState, {step, answer, retryCount}, {profile, askFn, models})`

Per-turn evaluation. Called each time student submits an answer.

**Sequence:**
1. **Learner Model Agent** → update mastery/frustration estimates
2. **Pedagogical Decision Agent** → evaluate answer, choose action
3. **Tutor Response Agent** → generate student-facing message
4. **Verification Agent** → quality gate (approved? issues?)
5. If `needs_next_subproblem` → advance subproblem
6. Return `{ result, message, decisions, updatedTutorState }`

### `runProgressPipeline(tutorState, sessionEvents, {askFn, models})`

Session summary. Called when session ends.

**Returns:** `{ memory_update: { concept, status, misconceptions }, session_summary }`

---

## Agent Details

### Router Agent (`router-agent.mjs`)

**Token budget:** 120
**Purpose:** Fast intent gate — is this kid math (K-6)?

**Output:**
```json
{
  "route": "pedagogical|direct_answer|off_topic|chitchat",
  "intent": "hint_request|answer_check|new_question|recap|example|off_topic|other",
  "confidence": 0.85,
  "requires_planner": true,
  "rejection_reason": null
}
```

Accepted topics: arithmetic, algebra, geometry, fractions, decimals, measurement, data/statistics, proportionality, problem-solving.

### Learner Model Agent (`learner-model-agent.mjs`)

**Token budget:** 220
**Purpose:** Estimate student cognitive state from profile data

**Inputs:** Known concepts count, open struggle signals, recent failures, subproblem status
**Output:**
```json
{
  "mastery_estimate": 0.4,
  "misconceptions": ["confuses numerator/denominator"],
  "frustration_risk": 0.3,
  "recommended_support_level": "medium",
  "notes": "..."
}
```

### Scaffolding Planner Agent (`scaffolding-planner-agent.mjs`)

**Token budget:** 900 (highest — most complex task)
**Purpose:** Decompose question into 2-5 guided subproblems

**Output:**
```json
{
  "learning_objective": "Understand equivalent fractions",
  "main_problem": "original question",
  "subproblems": [
    {
      "id": "sp1",
      "prompt": "Indirect conceptual question",
      "expected_answer": "Short direct answer",
      "hint_ladder": ["hint 1", "hint 2", "La respuesta es: X"],
      "common_misconceptions": ["..."]
    }
  ]
}
```

**Mandatory strategy:**
- SP1: Indirect question about core concept
- SP2: Ultra-simple example
- SP3+: Full question using accumulated knowledge
- Always exactly 3 hints per subproblem; hint 3 always reveals the answer

### Pedagogical Decision Agent (`pedagogical-decision-agent.mjs`)

**Token budget:** 180
**Purpose:** Semantic evaluation of student answer

**Output:**
```json
{
  "student_turn_type": "correct|incorrect|partial|unclear|student_inquiry",
  "pedagogical_action": "confirm_and_advance|give_hint_1|give_hint_2|give_hint_3|corrective_feedback|clarify_request|give_solution|motivate",
  "stay_on_subproblem": false,
  "next_sub_problem_id": "sp2",
  "reason": "..."
}
```

**Hint escalation policy:**
- 0-1 failures → `give_hint_1`
- 2+ failures → `give_solution` (auto-advance, don't let student get stuck)

### Tutor Response Agent (`tutor-response-agent.mjs`)

**Token budget:** 220
**Purpose:** Generate the visible student-facing message (2-3 sentences, Spanish, encouraging)

**Action-specific templates:**
- `confirm_and_advance`: Celebration + transition
- `give_hint_X`: Graduated hints (never reveal answer)
- `give_solution`: Reveal answer + brief explanation
- `corrective_feedback`: Acknowledge correct part + redirect
- `clarify_request`: Ask for specificity
- `motivate`: Concrete encouragement

### Verification Agent (`verification-agent.mjs`)

**Token budget:** 150
**Purpose:** Quality gate before displaying response

**Checks:**
1. Response matches selected pedagogical action
2. Doesn't leak full answer during hint phases
3. Mathematically correct
4. Written in Spanish

**Output:**
```json
{
  "approved": true,
  "issues": [],
  "required_rewrite": false
}
```

### Progress Agent (`progress-agent.mjs`)

**Token budget:** 180
**Purpose:** Generate session summary and concept status update

**Output:**
```json
{
  "memory_update": {
    "concept": "equivalent fractions",
    "status": "introducing|improving|mastered",
    "misconceptions": ["..."]
  },
  "session_summary": "..."
}
```

---

## Pedagogical Decision Mapping

Agent actions map to CLASS taxonomy codes for analytics:

| Action | CLASS Codes | Meaning |
|--------|-------------|---------|
| confirm_and_advance | b1, b2, g2 | Positive feedback + advance |
| give_hint_1 | a3, d1 | Prompt + question |
| give_hint_2 | a3, c1 | Prompt + explain |
| give_hint_3 | a3, c2 | Prompt + demonstrate |
| corrective_feedback | a1, a2 | Evaluate + tell |
| give_solution | a2, c2, g1 | Tell + demonstrate + close |
| ask_subquestion | b2, c3 | Positive + analogy |
| clarify_request | d1, d2 | Question + redirect |
| redirect | h | Off-topic handler |
| motivate | b2 | Positive feedback |

---

## Result Mapping (for UI)

| Agent turn type | UI result |
|-----------------|-----------|
| correct / needs_next_subproblem | `"correct"` |
| incorrect / off_topic | `"incorrect"` |
| partial / unclear / student_inquiry / continue | `"ambiguous"` |

---

## TutorState Schema

```javascript
{
  session_id: "uuid",
  subject: "matematicas",
  topic: "fractions",
  learning_objective: "...",
  main_problem: "original question",
  subproblems: [{
    id: "sp1",
    prompt: "...",
    expected_answer: "...",
    hint_ladder: ["hint1", "hint2", "answer"],
    common_misconceptions: [],
    status: "pending"|"active"|"done"
  }],
  current_subproblem_id: "sp1",
  student_turn_type: "continue",
  student_mastery_estimate: 0.4,
  frustration_risk: 0.2,
  engagement_level: 0.8,
  pedagogical_action: "",
  final_response: "",
  memory_updates: []
}
```

---

## Standard Mode Pipeline (Non-Agent)

When `agentMode: false`, the renderer uses direct LLM calls:

```
Question
    │
    ▼
Kid Math Gate ──no──► non_math session (redirect)
    │ yes
    ▼
Classifier ──► { kind, topic, conceptTopic, relatedTopics }
    │
    ├── kind: concept ──► generateStudyDeck() ──► Flashcards Modal
    │
    └── kind: exercise ──► generateStudyDeck() (if new concept)
                           generateExercisePlan()
                           generateExerciseTrace()
                           ──► Exercise Overlay
```

### Prompt Templates (from `prompts.mjs`)

| Prompt | Output Format | Purpose |
|--------|--------------|---------|
| `kidMathGatePrompt` | `"kid_math"` or `"not_kid_math"` | Scope filter |
| `studyClassifierPrompt` | `{kind, topic, conceptTopic, relatedTopics, reason}` | Question classification |
| `studyDeckPrompt` | `{topic, focusTrail, relatedTopics, cards[]}` | Concept/example/game cards |
| `exerciseTutorPrompt` | `{topic, exercise, steps[], finalReflection}` | Step-by-step solution |
| `exerciseTracePrompt` | `[{Student, Thoughts, Decision, Subproblem, Tutorbot}]` | Hidden alternative trace |
| `contextFlashcardPrompt` | `{needsMoreContext, cards[{title, body}]}` | Text selection explanation |
| `visualFlashcardPrompt` | `{cards[{title, body}]}` | Image crop explanation |

All prompts enforce: Spanish language, JSON output, no markdown/code blocks.

---

## Model Configuration (`model-config.mjs`)

| Agent | Token Budget | Purpose |
|-------|-------------|---------|
| Router | 120 | Fast intent classification |
| Learner Model | 220 | Student state estimation |
| Scaffolding Planner | 900 | Problem decomposition |
| Pedagogical Decision | 180 | Answer evaluation |
| Tutor Response | 220 | Message generation |
| Verification | 150 | Quality gate |
| Progress | 180 | Session summary |

`resolveAgentModels(settings)` reads from settings: `agentRouterModel`, `agentTutorModel`, `agentFunctionModel` — all default to `gemma4:e2b`.
