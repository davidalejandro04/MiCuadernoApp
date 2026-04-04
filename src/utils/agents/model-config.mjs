export const MODEL_NAME = "gemma4:e2b";

export const TOKEN_BUDGETS = {
  router: { maxTokens: 60 },
  learnerModel: { maxTokens: 120 },
  scaffoldingPlanner: { maxTokens: 600 },
  turn: { maxTokens: 150 },
  progress: { maxTokens: 120 }
};
