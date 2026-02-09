/**
 * Decision Layer - Main Export
 * 
 * The Decision Layer is where NOEMA acts in the world.
 * 
 * Core Principle:
 * - Beliefs drive actions
 * - Actions produce evidence
 * - Evidence flows back through perception
 * 
 * This layer does NOT:
 * - Update beliefs directly
 * - Plan multiple steps ahead
 * - Extract experiences
 */

// Main engine
export {
  DecisionEngine,
  createDecisionEngine,
  getDecisionEngine,
} from "./decision_engine.js";

// Action execution
export {
  ActionExecutor,
  createActionExecutor,
  getActionExecutor,
} from "./action_executor.js";

// Browser session management
export {
  BrowserSession,
  getOrCreateSession,
  closeSession,
  closeSessionAndGetVideo,
  closeAllSessions,
} from "./browser_session.js";

export type { PageDOMSnapshot } from "./browser_session.js";

// Playwright runner
export { runAction } from "./playwright_runner.js";

// LLM client
export { callDecisionLLM, callMockDecisionLLM } from "./decision_llm.js";

// Types
export type {
  BrowserActionType,
  BrowserAction,
  BrowserActionOutcome,
  BrowserActionInput,
  ActionArtifacts,
  DecisionOutput,
  NavigateToUrlInput,
  ClickElementInput,
  FillInputInput,
  SubmitFormInput,
  CheckElementVisibleInput,
  CaptureScreenshotInput,
  WaitForNetworkIdleInput,
  NoOpInput,
} from "./action_types.js";

// Plan generator
export { generateTestPlan } from "./plan_generator.js";

// Plan cache (persistent memory → reduced LLM usage)
export {
  findCachedPlan,
  savePlanToCache,
  recordPlanReuse,
  getAllCachedPlans,
} from "./plan_cache.js";

export type {
  DecisionEngineConfig,
  DecisionContext,
  DecisionResult,
  ExecutionResult,
  DecisionPromptInput,
  TestCredentials,
  TestPlan,
  TestPlanStep,
} from "./types.js";
