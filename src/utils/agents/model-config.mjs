// Model is selected at runtime via settings.ggufModel (see electron/main.cjs).

export const TOKEN_BUDGETS = {
  router: { maxTokens: 40 },
  scaffoldingPlanner: { maxTokens: 450 },
  turn: { maxTokens: 100 },
  progress: { maxTokens: 80 }
};
