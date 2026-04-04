import { routerAgent } from "./router-agent.mjs";
import { scaffoldingPlannerAgent } from "./scaffolding-planner-agent.mjs";
import { turnAgent } from "./turn-agent.mjs";
import { progressAgent } from "./progress-agent.mjs";
import { createTutorState, advanceSubproblem, tutorStateToSolution } from "./tutor-state.mjs";
import { TOKEN_BUDGETS } from "./model-config.mjs";

export { createTutorState, tutorStateToSolution };

const TURN_TYPE_TO_RESULT = {
  correct: "correct",
  needs_next_subproblem: "correct",
  incorrect: "incorrect",
  off_topic: "incorrect",
  partial: "ambiguous",
  unclear: "ambiguous",
  student_inquiry: "ambiguous",
  continue: "ambiguous"
};

const ACTION_TO_DECISIONS = {
  confirm_and_advance: ["b1", "b2", "g2"],
  give_hint_1: ["a3", "d1"],
  give_hint_2: ["a3", "c1"],
  give_hint_3: ["a3", "c2"],
  corrective_feedback: ["a1", "a2"],
  give_solution: ["a2", "c2", "g1"],
  ask_subquestion: ["b2", "c3"],
  clarify_request: ["d1", "d2"],
  redirect: ["h"],
  motivate: ["b2"]
};

export async function runTutorPipeline(question, sessionId, { profile, askFn }) {
  // 1. Router Agent — fast intent classification
  const routerResult = await routerAgent(
    { message: question },
    { askFn, ...TOKEN_BUDGETS.router }
  );

  if (routerResult.route === "off_topic" || routerResult.route === "chitchat") {
    return { isOffTopic: true, route: routerResult.route, routerResult };
  }

  // 2. Learner state from profile — no LLM needed.
  const learnerResult = computeLearnerState(profile, 0);

  // 3. Scaffolding Planner Agent — decompose question into CLASS-style plan
  const plannerResult = await scaffoldingPlannerAgent(
    { question, learnerModel: learnerResult },
    { askFn, ...TOKEN_BUDGETS.scaffoldingPlanner }
  );

  // 4. Create TutorState
  const tutorState = createTutorState({
    sessionId,
    topic: plannerResult.learning_objective,
    learningObjective: plannerResult.learning_objective,
    mainProblem: plannerResult.main_problem,
    subproblems: plannerResult.subproblems,
    studentMasteryEstimate: learnerResult.mastery_estimate,
    frustrationRisk: learnerResult.frustration_risk
  });

  return {
    isOffTopic: false,
    tutorState,
    solution: tutorStateToSolution(tutorState),
    routerResult,
    learnerResult,
    plannerResult
  };
}

// Compute learner state from profile data — no LLM call needed for simple counts.
function computeLearnerState(profile, retryCount) {
  const openStruggles = profile?.struggleSignals?.filter((s) => s.status === "open").length || 0;
  const knownCount = profile?.conceptProgress?.filter((c) => c.status === "known").length || 0;
  const frustration_risk = Math.min(1.0, retryCount * 0.3 + openStruggles * 0.1);
  const mastery_estimate = Math.max(0.0, Math.min(1.0, 0.4 + knownCount * 0.05 - openStruggles * 0.05));
  return {
    mastery_estimate,
    frustration_risk,
    misconceptions: [],
    recommended_support_level: openStruggles > 2 || retryCount > 1 ? "high" : openStruggles > 0 ? "medium" : "low",
    notes: ""
  };
}

export async function runTurnPipeline(tutorState, { step, answer, retryCount = 0 }, { profile, askFn }) {
  // Reconstruct subproblem from step (step may come from existing solution.steps format)
  const currentSubproblem = tutorState.subproblems.find((sp) => sp.id === step.id) || {
    id: step.id,
    prompt: step.prompt || step.title || "",
    expected_answer: (step.acceptedAnswers || [])[0] || "",
    hint_ladder: step.hintLadder || [],
    common_misconceptions: step.misconceptions || []
  };

  // Learner state computed in JS — no LLM call.
  const learnerResult = computeLearnerState(profile, retryCount);

  // Single LLM call: evaluate answer + decide action + generate response.
  const turnResult = await turnAgent(
    { studentMessage: answer, currentSubproblem, retryCount, frustrationRisk: learnerResult.frustration_risk },
    { askFn, ...TOKEN_BUDGETS.turn }
  );

  const finalMessage = turnResult.response;
  let result = TURN_TYPE_TO_RESULT[turnResult.student_turn_type] || "ambiguous";
  const decisions = ACTION_TO_DECISIONS[turnResult.pedagogical_action] || ["d1"];

  // When give_solution is chosen, treat it as "correct" to auto-advance
  if (turnResult.pedagogical_action === "give_solution") {
    result = "correct";
  }

  const decision = {
    student_turn_type: turnResult.student_turn_type,
    pedagogical_action: turnResult.pedagogical_action,
    stay_on_subproblem: result !== "correct",
    next_subproblem_id: null,
    reason: turnResult.reason
  };

  // Advance subproblem in TutorState if correct
  let updatedTutorState = {
    ...tutorState,
    student_turn_type: decision.student_turn_type,
    pedagogical_action: decision.pedagogical_action,
    student_mastery_estimate: learnerResult.mastery_estimate,
    frustration_risk: learnerResult.frustration_risk,
    final_response: finalMessage
  };

  if (result === "correct") {
    updatedTutorState = advanceSubproblem(updatedTutorState);
  }

  return {
    result,
    message: finalMessage,
    decisions,
    decision,
    learnerResult,
    verification: { approved: true, issues: [], required_rewrite: false },
    updatedTutorState
  };
}

export async function runProgressPipeline(tutorState, sessionEvents, { askFn }) {
  return progressAgent(
    { tutorState, sessionEvents },
    { askFn, ...TOKEN_BUDGETS.progress }
  );
}
