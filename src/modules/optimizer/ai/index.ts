import type { AIProvider } from '../optimizer.types.js'
import { heuristicProvider } from './heuristic.provider.js'

/**
 * Valid provider names accepted by getAIProvider. Only 'heuristic'
 * (aliased as 'heuristic-v1') is implemented today; the rest are reserved,
 * drop-in slots for future LLM backends.
 */
export const VALID_AI_PROVIDERS = [
  'heuristic',
  'heuristic-v1',
  'openai',
  'azure-openai',
  'local',
] as const

export type AIProviderName = (typeof VALID_AI_PROVIDERS)[number]

/**
 * Provider factory — selects the AI backend by name (from the AI_PROVIDER env
 * var, validated in config/env.ts). Defaults to the offline, deterministic
 * heuristic engine.
 *
 * To add a real LLM provider: implement the AIProvider interface
 * (see optimizer.types.ts) in this folder, then return your singleton from the
 * matching case below instead of throwing.
 */
export function getAIProvider(name: string = 'heuristic'): AIProvider {
  switch (name) {
    case 'heuristic':
    case 'heuristic-v1':
      return heuristicProvider

    case 'openai':
      throw new Error(
        "AI provider 'openai' is not configured — implement the AIProvider interface " +
          '(see optimizer.types.ts) with an OpenAI chat-completions client and register it in ai/index.ts.',
      )

    case 'azure-openai':
      throw new Error(
        "AI provider 'azure-openai' is not configured — implement the AIProvider interface " +
          '(see optimizer.types.ts) with an Azure OpenAI deployment client and register it in ai/index.ts.',
      )

    case 'local':
      throw new Error(
        "AI provider 'local' is not configured — implement the AIProvider interface " +
          '(see optimizer.types.ts) against a local LLM runtime (e.g. Ollama/vLLM) and register it in ai/index.ts.',
      )

    default:
      throw new Error(
        `Unknown AI provider '${name}'. Valid options: ${VALID_AI_PROVIDERS.join(', ')}.`,
      )
  }
}
