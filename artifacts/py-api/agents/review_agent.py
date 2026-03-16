"""
Sentinel Training Agent — LangGraph with ConversationBufferMemory (MemorySaver).

Memory is keyed by USER ID, not review/payment ID.
Alice Chen has ONE persistent memory that accumulates across every payment she reviews.
When she teaches the agent a rule, it remembers it and applies it to future payments.
"""
import re
from datetime import datetime, timezone
from typing import Optional
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.checkpoint.memory import MemorySaver
from agents.base_langgraph import AgentState, get_llm

# One MemorySaver instance — keyed by user_id (one thread per analyst)
_analyst_memory = MemorySaver()

# Compiled graph cache (one per analyst user, same structure)
_compiled_graph = None

STATUS_PATTERN = re.compile(
    r"\[\[STATUS_UPDATE:\s*(confirmed_duplicate|dismissed|pending|under_review)\]\]",
    re.IGNORECASE,
)
VALID_STATUSES = {"confirmed_duplicate", "dismissed", "pending", "under_review"}


def _get_graph():
    """Return a compiled LangGraph StateGraph (cached, reused for all analyst threads)."""
    global _compiled_graph
    if _compiled_graph is not None:
        return _compiled_graph

    from langgraph.graph import StateGraph, END

    llm = get_llm(temperature=0.3, max_tokens=1200)

    # system_prompt is injected at call time via a closure per invocation,
    # so we store it in a mutable container that gets set before each call.
    _ctx: dict = {"system_prompt": ""}

    def call_model(state: AgentState):
        msgs = [SystemMessage(content=_ctx["system_prompt"])] + state["messages"]
        response = llm.invoke(msgs)
        return {"messages": [response]}

    g = StateGraph(AgentState)
    g.add_node("agent", call_model)
    g.set_entry_point("agent")
    g.add_edge("agent", END)
    _compiled_graph = g.compile(checkpointer=_analyst_memory)

    # attach context ref so callers can inject the current system prompt
    _compiled_graph._sentinel_ctx = _ctx
    return _compiled_graph


def _build_system_prompt(payment_data: dict, reviewer_name: str, detector_opinions: list = None) -> str:
    p = payment_data
    matched = ", ".join(p.get("matchedFields") or []) or "none recorded"
    today = datetime.now(timezone.utc).strftime("%B %d, %Y")

    opinions_text = ""
    if detector_opinions:
        for op in detector_opinions:
            name = op.get("agentName", "Unknown")
            conf = round(op.get("confidence", 0) * 100, 1)
            verdict = "IS a duplicate" if op.get("isDuplicate", True) else "is NOT a duplicate"
            reasoning = op.get("reasoning", "")
            opinions_text += f"\n• **{name}** ({conf}%): {verdict} — {reasoning}\n"

    return f"""You are the Sentinel Training Agent — {reviewer_name}'s personal AI payment analyst with PERSISTENT MEMORY across ALL their payment review sessions.

Today's date: {today}

## YOUR IDENTITY

You are {reviewer_name}'s dedicated analyst. You build a lasting relationship with them. Every rule they teach you, every decision they explain, every preference they express — you remember it ALL and apply it to every future payment you review together.

When {reviewer_name} says "this is not a duplicate because [reason]", you store that rule and proactively apply it later. When you see a future payment that matches a past rule, you SAY SO: "Based on our conversation on [date], you told me that [reason]. Applying that rule to this payment, I believe this is also NOT a duplicate."

## CURRENT PAYMENT UNDER REVIEW

- **Payment Pair**: {p.get("payment1Id", "?")} ↔ {p.get("payment2Id", "?")}
- **System**: {p.get("paymentSystem", "?")}
- **Duplicate Type**: {p.get("duplicateType", "?")}
- **Amount**: {p.get("currency", "?")} {p.get("amount", 0):,.2f}
- **Sender BIC**: {p.get("senderBIC", "?")} | **Receiver BIC**: {p.get("receiverBIC", "?")}
- **Payment Dates**: {p.get("paymentDate1", "?")} / {p.get("paymentDate2", "?")}
- **Matched Fields**: {matched}
- **Detection Probability**: {round((p.get("probability", 0)) * 100, 1)}%
- **Current Status**: {p.get("status", "pending")}

## DETECTOR AGENT OPINIONS (5 independent agents, did not consult each other)
{opinions_text if opinions_text else "No detector opinions loaded yet — they will appear in the UI panel."}

## HOW TO USE YOUR MEMORY

1. **Teach you**: When {reviewer_name} explains a rule or decision, acknowledge it explicitly: "Understood — I'll remember that for future reviews."
2. **Apply remembered rules**: When reviewing this payment, search your memory for any rules from past conversations. If one applies, cite it: "Based on our conversation on [date], you told me that [rule]. This payment matches that pattern."
3. **Conflict detection**: If this payment *should* be a duplicate per the detectors but a past rule suggests otherwise, flag it: "The detectors say duplicate, but you previously told me on [date] that [rule] — this payment matches that exception."
4. **Forget on request**: If {reviewer_name} says "forget that rule" or "disregard what I said about X", acknowledge it and stop applying that rule.
5. **Memory summary**: If asked "what have you learned?" or "what do you remember?", summarise all rules and decisions you've accumulated.

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
"""


async def run_review_agent(
    user_message: str,
    user_id: str,
    reviewer_name: str,
    payment_data: dict,
    detector_opinions: Optional[list] = None,
    db_history: Optional[list] = None,
) -> dict:
    """
    Run the Sentinel Training Agent for an analyst.

    Thread key = user_id so memory persists across ALL payments for this analyst.
    On restart, DB history (full user history) is re-synced into LangGraph.
    """
    compiled = _get_graph()
    system_prompt = _build_system_prompt(payment_data, reviewer_name, detector_opinions or [])
    compiled._sentinel_ctx["system_prompt"] = system_prompt

    config = {"configurable": {"thread_id": user_id}}

    # Restart recovery: re-sync full user history if LangGraph state is empty
    current_state = compiled.get_state(config)
    lg_msgs = current_state.values.get("messages", []) if current_state.values else []

    if not lg_msgs and db_history:
        restore = []
        for m in db_history:
            if m["role"] == "user":
                restore.append(HumanMessage(content=m["content"]))
            elif m["role"] == "assistant":
                restore.append(AIMessage(content=m["content"]))
        if restore:
            compiled.update_state(config, {"messages": restore})

    result = await compiled.ainvoke(
        {"messages": [HumanMessage(content=user_message)]},
        config=config,
    )

    response_text = result["messages"][-1].content

    # Detect and strip status directive
    match = STATUS_PATTERN.search(response_text)
    status_update = None
    if match:
        candidate = match.group(1).lower()
        if candidate in VALID_STATUSES:
            status_update = candidate
        response_text = STATUS_PATTERN.sub("", response_text).strip()

    return {
        "response": response_text,
        "statusUpdate": status_update,
    }
