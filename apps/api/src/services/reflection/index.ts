/**
 * Reflection Service - Main Export
 * 
 * Reflection, timeline, and improvement analysis.
 * Read-only — does NOT modify NOEMA's state.
 */

export {
  generateReflection,
  generateQAReport,
  type RunReflection,
  type QAReport,
} from "./reflection_engine.js";

export {
  buildRunTimeline,
  type RunTimeline,
  type TimelineEntry,
  type TimelineEntryType,
} from "./timeline_builder.js";

export {
  recordRunMetrics,
  getAllRunMetrics,
  getMetricsByTaskType,
  analyzeImprovement,
  type RunMetrics,
  type ImprovementReport,
  type ImprovementSignal,
} from "./improvement_analyzer.js";
