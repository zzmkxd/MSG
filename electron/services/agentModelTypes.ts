/**
 * Minimal model-config types for createAgentModel.
 * Kept separate so insight/adapter do not import the full agentService tree.
 */

export type AgentModelConfig = {
  provider?: string
  apiKey?: string
  model?: string
  baseURL?: string
  protocol?: 'openai-responses' | 'openai-compatible' | 'anthropic' | 'google'
  maxOutputTokens?: number
  contextWindow?: number
}
