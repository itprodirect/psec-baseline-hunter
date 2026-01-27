/**
 * LLM Provider Abstraction
 * Supports Anthropic Claude and OpenAI, with fallback to rule-based summaries
 */

export type LLMProvider = "anthropic" | "openai" | "none";

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string | null;
  model: string;
}

export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LLMResponse {
  success: boolean;
  content?: string;
  error?: string;
  provider: LLMProvider;
  model?: string;
  tokensUsed?: number;
}

/**
 * Get the configured LLM provider
 * Priority: ANTHROPIC_API_KEY > OPENAI_API_KEY > none
 */
export function getActiveProvider(): LLMConfig {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (anthropicKey) {
    return {
      provider: "anthropic",
      apiKey: anthropicKey,
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
    };
  }

  if (openaiKey) {
    return {
      provider: "openai",
      apiKey: openaiKey,
      model: process.env.OPENAI_MODEL || "gpt-4o",
    };
  }

  return {
    provider: "none",
    apiKey: null,
    model: "",
  };
}

/**
 * Check if LLM is available
 */
export function isLLMAvailable(): boolean {
  return getActiveProvider().provider !== "none";
}

/**
 * Call the Anthropic API
 */
async function callAnthropic(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<LLMResponse> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        error: `Anthropic API error: ${response.status} - ${error}`,
        provider: "anthropic",
      };
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || "";

    return {
      success: true,
      content,
      provider: "anthropic",
      model: config.model,
      tokensUsed: data.usage?.input_tokens + data.usage?.output_tokens,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Anthropic API call failed",
      provider: "anthropic",
    };
  }
}

/**
 * Call the OpenAI API
 */
async function callOpenAI(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<LLMResponse> {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 2000,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        error: `OpenAI API error: ${response.status} - ${error}`,
        provider: "openai",
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    return {
      success: true,
      content,
      provider: "openai",
      model: config.model,
      tokensUsed: data.usage?.total_tokens,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "OpenAI API call failed",
      provider: "openai",
    };
  }
}

/**
 * Call the configured LLM provider
 */
export async function callLLM(
  systemPrompt: string,
  userPrompt: string
): Promise<LLMResponse> {
  const config = getActiveProvider();

  if (config.provider === "none") {
    return {
      success: false,
      error: "No LLM provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.",
      provider: "none",
    };
  }

  if (config.provider === "anthropic") {
    return callAnthropic(config, systemPrompt, userPrompt);
  }

  if (config.provider === "openai") {
    return callOpenAI(config, systemPrompt, userPrompt);
  }

  return {
    success: false,
    error: "Unknown LLM provider",
    provider: config.provider,
  };
}
