# TutorMate Runtime Flows

## 1. Application Startup

```
User runs: npm run dev (electron .)
    │
    ▼
Electron loads electron/main.cjs
    │
    ├── Sets userData path → %APPDATA%/.TutorMate/
    ├── Creates BrowserWindow (1500x960, contextIsolation: true)
    ├── Loads src/index.html
    │
    ▼
Renderer calls window.bridge.bootstrap()
    │
    ▼
Main process (app:bootstrap handler):
    ├── 1. Read/create machine-id
    ├── 2. Spawn bin/llama-server.exe (port 8080, gemma3-4b.gguf)
    ├── 3. Poll GET http://127.0.0.1:8080/health (45s timeout, 500ms interval)
    ├── 4. import('src/utils/lesson-catalog.mjs').loadLessonCatalogFromDirectory()
    ├── 5. import('src/rag/index.mjs') → chunkLessons() → buildIndex()
    ├── 6. readJson('profile.json') + readJson('settings.json')
    └── 7. Return { lessons, profile, settings, availableModels, llm, machineId }
         │
         ▼
Renderer:
    ├── Initialize state object with returned data
    ├── If !profile.onboardingCompleted → show profile page (onboarding)
    └── Else → render home page (closed notebook)
```

---

## 2. Study Question Flow (Agent Mode)

```
Student types question in practice chat → clicks "Vamos!"
    │
    ▼
handleSubmit() → validateQuestion()
    │
    ▼
state.isThinking = true → show loading panel
    │
    ▼
handleStudyQuestion(question, {requestId})
    │
    ├── settings.agentMode === true
    │
    ▼
handleStudyQuestionAgentMode()
    │
    ▼
runTutorPipeline(question, sessionId, {profile, askFn, models})
    │
    ├── 1. Router Agent ─────────────────► {route, intent, confidence}
    │      │                                    │
    │      │ if route === "off_topic" ──────────┼──► non_math session → return
    │      │                                    │
    │      ▼                                    │
    ├── 2. Learner Model Agent ──────────► {mastery, frustration, support_level}
    │      │
    │      ▼
    ├── 3. Scaffolding Planner Agent ────► {learning_objective, subproblems[]}
    │      │
    │      ▼
    ├── 4. createTutorState() ───────────► TutorState object
    │      │
    │      ▼
    └── 5. tutorStateToSolution() ───────► Solution for UI
         │
         ▼
Create practiceSession { kind: "exercise", solution, tutorState, agentMode: true }
    │
    ▼
Open exercise overlay → show first subproblem step
```

---

## 3. Study Question Flow (Standard Mode)

```
Student types question → clicks "Vamos!"
    │
    ▼
handleStudyQuestion(question)
    │
    ├── settings.agentMode === false
    │
    ▼
Step 1: Kid Math Gate
    │
    ├── askWithLlm(kidMathGatePrompt, buildKidMathGateUserPrompt(question))
    ├── Response: "kid_math" or "not_kid_math"
    │
    ├── not_kid_math → create non_math session → redirect card → return
    │
    ▼
Step 2: Classifier
    │
    ├── askWithLlm(studyClassifierPrompt, buildClassifierUserPrompt(question, knownConcepts))
    ├── Response: { kind, topic, conceptTopic, relatedTopics }
    │
    ├── kind === "concept" ──────────────────────┐
    │                                            ▼
    │                              generateStudyDeck(question, classification)
    │                                            │
    │                                            ▼
    │                              { cards: [concept, example, game] }
    │                                            │
    │                                            ▼
    │                              Open flashcards modal
    │                              persistConceptStudy()
    │
    └── kind === "exercise" ─────────────────────┐
                                                 ▼
                                  generateStudyDeck() (if new concept)
                                                 │
                                                 ▼
                                  generateExercisePlan(question, classification)
                                  → { steps: [{title, prompt, acceptedAnswers, hint}] }
                                                 │
                                                 ▼
                                  generateExerciseTrace(question)
                                  → [{ Student, Thoughts, Decision, Tutorbot }]
                                                 │
                                                 ▼
                                  Open exercise overlay
```

---

## 4. Step-by-Step Exercise Interaction

```
Exercise overlay showing step N
    │
    ▼
Student types answer → clicks "Comprobar"
    │
    ├── Agent mode? ─── yes ──► runTurnPipeline(tutorState, {step, answer})
    │       │                       │
    │       │                       ├── Learner Model → update estimates
    │       │                       ├── Pedagogical Decision → evaluate
    │       │                       ├── Tutor Response → generate message
    │       │                       ├── Verification → quality check
    │       │                       │
    │       │                       ▼
    │       │                   { result, message, decisions }
    │       │
    │       └── no ──► evaluateStepAnswer(step, answer)
    │                       │
    │                       ├── Normalize: strip accents, lowercase, remove punctuation
    │                       ├── Check accepted answers (exact match)
    │                       ├── Token overlap similarity check
    │                       │
    │                       ▼
    │                   { result: correct|incorrect|ambiguous, confidence }
    │
    ▼
Update stepResults[stepId] = { correct, result, attempts, message }
    │
    ├── result === "correct"
    │       │
    │       ├── currentStepIndex++
    │       ├── Log "step-complete" event
    │       ├── All steps done? → maybeMarkCurrentConceptKnown()
    │       │                      → concept status = "known"
    │       │                      → session status = "completed"
    │       └── Show next step or completion screen
    │
    ├── result === "incorrect"
    │       │
    │       ├── stepFailureCounts[stepId]++
    │       ├── failures >= 2? → recordStepStruggle(step, failures)
    │       │                     → Add to profile.struggleSignals
    │       └── Show feedback message
    │
    └── result === "ambiguous"
            │
            └── Show clarification feedback

---

Hint request flow:

Student clicks "Pedir pista"
    │
    ▼
hintLevels[stepId]++
    │
    ├── level < step.hintLadder.length → show hint[level]
    │
    └── level === max → auto-unlock answer
                         mark step correct
                         advance to next
```

---

## 5. Lesson Reading Flow

```
Lessons trail → click lesson node
    │
    ▼
state.currentLesson = lesson
state.stageIndex = 0
    │
    ▼
Render book spread:
    Left: lesson metadata + stage checklist
    Right: iframe with wrapStageHtml(stage.html)
    │
    ├── Click "lesson-next" → stageIndex++, load next stage HTML
    ├── Click "lesson-prev" → stageIndex--, load previous stage
    │
    └── Click "lesson-finish" (last stage)
            │
            ▼
        recordLessonCompletion(profile, unit, title, 5)
            │
            ├── Add to profile.completed
            ├── profile.xp += 5
            ├── profile.lessonsCompleted++
            ├── Add activity record
            │
            ▼
        saveProfile() → return to trail view
```

---

## 6. Text Selection Explanation

```
Student reads lesson in iframe
    │
    ▼
Selects text → right-click → context menu appears
    │
    ▼
Click "Explica la seleccion"
    │
    ▼
runTextExplanation()
    │
    ├── selectionNeedsMoreContext(text)?
    │       │
    │       ├── yes (too short) → show error/hint flashcard
    │       │
    │       └── no → continue
    │
    ▼
askWithLlm(contextFlashcardPrompt, buildContextFlashcardUserPrompt(selection, ...))
    │
    ▼
normalizeContextFlashcards(response)
    │
    ▼
{ needsMoreContext, cards: [{title, body}] }
    │
    ├── needsMoreContext === true → show "select more text" card
    │
    └── Open flashcards modal with 3 cards:
        Card 1: "Concepto general"
        Card 2: "Ejemplo guiado"
        Card 3: "Respuesta concreta"
        │
        ▼
    Log interaction + trackLessonFlashcards()
```

---

## 7. Image Crop (Vision) Explanation

```
Student reading lesson → clicks crop tool (scissors icon)
    │
    ▼
state.lessonUi.cropMode = true
    │
    ▼
Student drags rectangle over lesson content
    │
    ▼
Crop action menu appears → click "Que es esto?"
    │
    ▼
runImageExplanation()
    │
    ▼
window.bridge.captureRegion({x, y, width, height})
    │
    ▼ (main process captures BrowserWindow screenshot, crops to rect)
    │
    ▼
base64 PNG image
    │
    ▼
askWithLlm(visualFlashcardPrompt, buildVisualFlashcardUserPrompt(), { images: [base64] })
    │
    ▼
normalizeContextFlashcards(response)
    │
    ▼
Open flashcards modal with explanation cards
    │
    ▼
trackConceptStudy() + trackLessonFlashcards()
```

---

## 8. RAG-Augmented Chat

```
Any chat call with useRAG: true
    │
    ▼
Main process (llm:chat handler):
    │
    ├── Extract last user message text
    ├── rag.retrieve(query, index, config)
    │       │
    │       ├── Tokenize query (accent-strip, stopword filter)
    │       ├── Score against BM25 inverted index
    │       ├── Filter: score >= 0.15
    │       ├── Sort by score descending
    │       ├── Take top-2 results
    │       └── Truncate to ~100 token budget
    │
    ▼
    ├── Format context: "[LessonTitle] chunk text\n..."
    ├── Inject into system prompt via augmentPrompt()
    │
    ▼
    └── POST to llama.cpp with augmented messages
```

---

## 9. Profile Persistence Cycle

```
Any action that modifies profile:
    │
    ├── addPracticeXp()
    ├── recordLessonCompletion()
    ├── trackConceptStudy()
    ├── trackStruggleSignal()
    ├── trackLessonFlashcards()
    ├── setupProfile()
    ├── resetProgress()
    │
    ▼
state.profile = updatedProfile  (in renderer state)
    │
    ▼
window.bridge.saveProfile(state.profile)
    │
    ▼
Main process: writeJson(profilePath, data)
    │
    ▼
JSON.stringify(data, null, 2) → fs.writeFileSync()
```

---

## 10. LLM Request Lifecycle

```
renderer: window.bridge.chat({messages, model, maxTokens, temperature, forceJson, useRAG, requestId})
    │
    ▼
main process: llm:chat handler
    │
    ├── If useRAG → augment system prompt with RAG context
    ├── Create AbortController → store in activeChatControllers.set(requestId, controller)
    │
    ▼
POST http://127.0.0.1:8080/v1/chat/completions
    Body: { model: "gemma4:e2b", messages, stream: true, max_tokens, temperature }
    Signal: controller.signal
    │
    ▼
SSE stream begins
    │
    ├── For each "data: {...}" line:
    │       ├── Parse JSON
    │       ├── Extract delta.content token
    │       ├── Accumulate to fullContent
    │       └── mainWindow.webContents.send("llm:chat-token", {requestId, token})
    │
    ├── "data: [DONE]" → stream complete
    │
    ▼
activeChatControllers.delete(requestId)
    │
    ▼
Return { content: fullContent } to renderer

---

Cancellation:

renderer: window.bridge.cancelChat(requestId)
    │
    ▼
main: activeChatControllers.get(requestId).abort()
    │
    ▼
Fetch throws AbortError → "Solicitud cancelada."
```
