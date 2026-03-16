import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, END, MessagesAnnotation } from "@langchain/langgraph";
import { SystemMessage } from "@langchain/core/messages";

export function getLLM(temperature = 0.1, maxTokens = 1500): ChatOpenAI {
  const baseUrl = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  const apiKey =
    process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] ||
    process.env["OPENAI_API_KEY"] ||
    "_DUMMY_API_KEY_";
  return new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature,
    maxTokens,
    configuration: baseUrl ? { baseURL: baseUrl, apiKey } : { apiKey },
  });
}

export function buildAgentGraph(systemPrompt: string, llm: ChatOpenAI, checkpointer?: unknown) {
  const graph = new StateGraph(MessagesAnnotation).addNode("agent", async (state) => {
    const messages = [new SystemMessage(systemPrompt), ...state.messages];
    const response = await llm.invoke(messages);
    return { messages: [response] };
  });
  graph.addEdge("__start__", "agent");
  graph.addEdge("agent", END);
  if (checkpointer) {
    return (graph as any).compile({ checkpointer });
  }
  return graph.compile();
}

export function stripJsonFences(content: string): string {
  let s = content.trim();
  if (s.startsWith("```json")) s = s.slice(7);
  else if (s.startsWith("```")) s = s.slice(3);
  if (s.endsWith("```")) s = s.slice(0, -3);
  return s.trim();
}
