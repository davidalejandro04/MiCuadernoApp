// Model is selected at runtime via settings.ggufModel (see electron/main.cjs).

export const TOKEN_BUDGETS = {
  router: { maxTokens: 60 },
  scaffoldingPlanner: { maxTokens: 600 },
  turn: { maxTokens: 150 },
  progress: { maxTokens: 120 }
};
