import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { StateGraph, END, MessagesAnnotation, MemorySaver } from "@langchain/langgraph";
import { getLLM } from "./base.js";

const STATUS_PATTERN = /\[\[STATUS_UPDATE:\s*(confirmed_duplicate|dismissed|pending|under_review)\]\]/i;
const VALID_STATUSES = new Set(["confirmed_duplicate", "dismissed", "pending", "under_review"]);

const _analystMemory = new MemorySaver();
let _compiledGraph: ReturnType<typeof buildGraph> | null = null;
const _ctx = { systemPrompt: "" };

function buildGraph() {
  const llm = getLLM(0.3, 1200);
  const graph = new StateGraph(MessagesAnnotation).addNode("agent", async (state: any) => {
    const messages = [new SystemMessage(_ctx.systemPrompt), ...state.messages];
    const response = await llm.invoke(messages);
    return { messages: [response] };
  });
  graph.addEdge("__start__", "agent");
  graph.addEdge("agent", END);
  return graph.compile({ checkpointer: _analystMemory });
}

function getGraph() {
  if (!_compiledGraph) _compiledGraph = buildGraph();
  return _compiledGraph;
}

function buildSystemPrompt(
  paymentData: Record<string, unknown>,
  reviewerName: string,
  detectorOpinions: Record<string, unknown>[] = []
): string {
  const p = paymentData;
  const matched = (Array.isArray(p["matchedFields"]) ? p["matchedFields"] : []).join(", ") || "none recorded";
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  let opinionsText = "";
  for (const op of detectorOpinions) {
    const name = op["agentName"] || "Unknown";
    const conf = Math.round(Number(op["confidence"] || 0) * 1000) / 10;
    const verdict = op["isDuplicate"] ? "IS a duplicate" : "is NOT a duplicate";
    opinionsText += `\n• **${name}** (${conf}%): ${verdict} — ${op["reasoning"]}\n`;
  }

  return `You are the Sentinel Training Agent — ${reviewerName}'s personal AI payment analyst with PERSISTENT MEMORY across ALL their payment review sessions.

Today's date: ${today}

## YOUR IDENTITY

You are ${reviewerName}'s dedicated analyst. You build a lasting relationship with them. Every rule they teach you, every decision they explain, every preference they express — you remember it ALL and apply it to every future payment you review together.

When ${reviewerName} says "this is not a duplicate because [reason]", you store that rule and proactively apply it later. When you see a future payment that matches a past rule, you SAY SO: "Based on our conversation on [date], you told me that [reason]. Applying that rule to this payment, I believe this is also NOT a duplicate."

## CURRENT PAYMENT UNDER REVIEW

- **Payment Pair**: ${p["payment1Id"] || "?"} ↔ ${p["payment2Id"] || "?"}
- **System**: ${p["paymentSystem"] || "?"}
- **Duplicate Type**: ${p["duplicateType"] || "?"}
- **Amount**: ${p["currency"] || "?"} ${Number(p["amount"] || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
- **Sender BIC**: ${p["senderBIC"] || "?"} | **Receiver BIC**: ${p["receiverBIC"] || "?"}
- **Payment Dates**: ${p["paymentDate1"] || "?"} / ${p["paymentDate2"] || "?"}
- **Matched Fields**: ${matched}
- **Detection Probability**: ${Math.round(Number(p["probability"] || 0) * 1000) / 10}%
- **Current Status**: ${p["status"] || "pending"}

## DETECTOR AGENT OPINIONS (5 independent agents, did not consult each other)
${opinionsText || "No detector opinions loaded yet — they will appear in the UI panel."}

## HOW TO USE YOUR MEMORY

1. **Teach you**: When ${reviewerName} explains a rule or decision, acknowledge it explicitly: "Understood — I'll remember that for future reviews."
2. **Apply remembered rules**: When reviewing this payment, search your memory for any rules from past conversations. If one applies, cite it: "Based on our conversation on [date], you told me that [rule]. This payment matches that pattern."
3. **Conflict detection**: If this payment *should* be a duplicate per the detectors but a past rule suggests otherwise, flag it.
4. **Forget on request**: If ${reviewerName} says "forget that rule", acknowledge it and stop applying that rule.
5. **Memory summary**: If asked "what have you learned?", summarise all rules and decisions you've accumulated.

## STATUS UPDATE COMMANDS

When the analyst explicitly asks to update the status, include ONE of these at the END of your response on its own line:

[[STATUS_UPDATE: confirmed_duplicate]]
[[STATUS_UPDATE: dismissed]]
[[STATUS_UPDATE: under_review]]
[[STATUS_UPDATE: pending]]

## GUARDRAILS

- NEVER invent payment data not shown above
- NEVER say you've updated the status without including the [[STATUS_UPDATE:...]] directive
- Always cite past conversations by date when applying learned rules
- Keep responses concise — analysts review many payments
- If this is the first payment you've reviewed together, acknowledge it warmly
`;
}

export async function runReviewAgent(params: {
  userMessage: string;
  userId: string;
  reviewerName: string;
  paymentData: Record<string, unknown>;
  detectorOpinions?: Record<string, unknown>[];
  dbHistory?: Array<{ role: string; content: string }>;
}): Promise<{ response: string; statusUpdate: string | null }> {
  const { userMessage, userId, reviewerName, paymentData, detectorOpinions = [], dbHistory = [] } = params;

  const compiled = getGraph();
  _ctx.systemPrompt = buildSystemPrompt(paymentData, reviewerName, detectorOpinions);

  const config = { configurable: { thread_id: userId } };

  // Restart recovery: re-sync full user history if LangGraph state is empty
  const currentState = await compiled.getState(config);
  const lgMsgs = currentState.values?.messages ?? [];

  if (lgMsgs.length === 0 && dbHistory.length > 0) {
    const restoreMsgs = dbHistory.map((m) =>
      m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
    );
    await compiled.updateState(config, { messages: restoreMsgs });
  }

  const result = await compiled.invoke(
    { messages: [new HumanMessage(userMessage)] },
    config
  );

  let responseText = result.messages[result.messages.length - 1].content as string;

  // Detect and strip status directive
  const match = STATUS_PATTERN.exec(responseText);
  let statusUpdate: string | null = null;
  if (match) {
    const candidate = match[1].toLowerCase();
    if (VALID_STATUSES.has(candidate)) statusUpdate = candidate;
    responseText = responseText.replace(STATUS_PATTERN, "").trim();
  }

  return { response: responseText, statusUpdate };
}
