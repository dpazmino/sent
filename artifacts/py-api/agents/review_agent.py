"""
Payment Review Agent — LangGraph with ConversationBufferMemory (MemorySaver).

This is the Training Agent specialised for per-payment, per-user review sessions.
It has full context about a specific duplicate payment record and the 5 detector
agent opinions. Users chat with it to decide if a payment is a duplicate.

The agent can update the payment status by including a special directive in its
response that the backend detects and acts upon.
"""
import re
from typing import Optional
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.checkpoint.memory import MemorySaver
from agents.base_langgraph import AgentState, get_llm, build_agent_graph

# In-process ConversationBufferMemory — keyed by review_id (= user_review UUID)
_review_memory = MemorySaver()

# ── Status update directive pattern ──────────────────────────────────────────
STATUS_PATTERN = re.compile(
    r"\[\[STATUS_UPDATE:\s*(confirmed_duplicate|dismissed|pending|under_review)\]\]",
    re.IGNORECASE,
)

VALID_STATUSES = {
    "confirmed_duplicate", "dismissed", "pending", "under_review"
}


def _build_system_prompt(payment_data: dict, detector_opinions: list) -> str:
    p = payment_data

    # Format detector opinions
    opinions_text = ""
    for op in detector_opinions:
        name = op.get("agentName", "Unknown")
        conf = round(op.get("confidence", 0) * 100, 1)
        is_dup = op.get("isDuplicate", True)
        verdict = "IS a duplicate" if is_dup else "is NOT a duplicate"
        reasoning = op.get("reasoning", "")
        opinions_text += f"\n• **{name}** ({conf}% confidence): {verdict}\n  {reasoning}\n"

    matched = ", ".join(p.get("matchedFields") or []) or "none recorded"

    return f"""You are the Sentinel Review Agent — a specialist payment analyst embedded in a duplicate payment review session. You are helping an analyst named {p.get("_reviewer_name", "the analyst")} review a specific flagged payment pair and decide on its status.

## PAYMENT RECORD UNDER REVIEW

- **Record ID**: {p.get("id", "unknown")}
- **Payments**: {p.get("payment1Id", "?")} ↔ {p.get("payment2Id", "?")}
- **Payment System**: {p.get("paymentSystem", "?")}
- **Duplicate Type**: {p.get("duplicateType", "?")}
- **Amount**: {p.get("currency", "?")} {p.get("amount", 0):,.2f}
- **Sender BIC**: {p.get("senderBIC", "?")} | **Receiver BIC**: {p.get("receiverBIC", "?")}
- **Payment Dates**: {p.get("paymentDate1", "?")} / {p.get("paymentDate2", "?")}
- **Matched Fields**: {matched}
- **Detection Probability**: {round((p.get("probability", 0)) * 100, 1)}%
- **Current Status**: {p.get("status", "pending")}

## DETECTOR AGENT OPINIONS (INDEPENDENT — DID NOT CONSULT EACH OTHER)
{opinions_text if opinions_text else "No detector opinions available."}

## YOUR ROLE

You help the analyst understand the evidence, weigh the detector opinions, and make a final determination. You:
1. Present the evidence clearly and objectively
2. Point out any conflicting opinions between detectors and explain why they might differ
3. Apply your own expert banking knowledge to give a synthesised view
4. Help the analyst think through edge cases (standing orders, recurring payments, system retries)
5. Accept and act on the analyst's final decision

## STATUS UPDATE COMMANDS

When the analyst asks you to update the status — whether by saying "confirm this", "dismiss this", "mark as under review", or any similar instruction — you MUST include this exact directive at the END of your response (on its own line):

[[STATUS_UPDATE: confirmed_duplicate]]  ← when confirming as a duplicate
[[STATUS_UPDATE: dismissed]]             ← when dismissing (not a duplicate)
[[STATUS_UPDATE: under_review]]          ← when flagging for further review
[[STATUS_UPDATE: pending]]               ← when resetting to pending

Only include the directive when the analyst explicitly asks you to update the status. After including it, confirm in natural language what you did, e.g.: "I've marked this payment as **confirmed duplicate** in the system."

## GUARDRAILS

- NEVER invent payment data not shown above
- NEVER say you've updated the status without including the [[STATUS_UPDATE:...]] directive
- If the analyst gives conflicting instructions, ask for clarification before acting
- Cite specific detector opinions by name when supporting your argument
- Keep responses focused and concise — analysts are reviewing many payments
"""


async def run_review_agent(
    user_message: str,
    review_id: str,
    payment_data: dict,
    detector_opinions: list,
    db_history: Optional[list] = None,
) -> dict:
    """
    Run the Payment Review Agent for a specific user review session.

    Uses LangGraph MemorySaver (ConversationBufferMemory) keyed by review_id.
    If the in-process state is empty after a restart, DB history is re-synced.

    Returns: {response, statusUpdate (if triggered), memoryRestored}
    """
    system_prompt = _build_system_prompt(payment_data, detector_opinions)
    llm = get_llm(temperature=0.2, max_tokens=1000)

    from langgraph.graph import StateGraph, END
    from langgraph.graph.message import add_messages
    from typing import Annotated

    def call_model(state: AgentState):
        msgs = [SystemMessage(content=system_prompt)] + state["messages"]
        response = llm.invoke(msgs)
        return {"messages": [response]}

    from langgraph.graph import StateGraph, END
    g = StateGraph(AgentState)
    g.add_node("agent", call_model)
    g.set_entry_point("agent")
    g.add_edge("agent", END)
    compiled = g.compile(checkpointer=_review_memory)

    config = {"configurable": {"thread_id": review_id}}

    # Restart recovery: re-sync DB history into LangGraph if state is empty
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

    # Detect status update directive
    match = STATUS_PATTERN.search(response_text)
    status_update = None
    if match:
        candidate = match.group(1).lower()
        if candidate in VALID_STATUSES:
            status_update = candidate
        # Strip the directive from the visible response
        response_text = STATUS_PATTERN.sub("", response_text).strip()

    return {
        "response": response_text,
        "statusUpdate": status_update,
    }
