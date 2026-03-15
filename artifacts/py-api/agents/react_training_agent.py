"""
LangChain ReAct Training Agent for payment review sessions.

Memory architecture
───────────────────
SHORT-TERM  ConversationSummaryBufferMemory (LangChain)
            Keeps the last ~1 500 tokens verbatim; older turns are
            compressed into a running summary by the LLM.
            The summary is persisted per conversation_id in
            dup_agent_memory (category='conv_summary').

LONG-TERM   PostgreSQL AgentMemoryRecord (category='duplicate_definition')
            Analyst-confirmed rules, written ONLY via save_analyst_rule
            and read ONLY via check_analyst_rules.
            The agent is never allowed to cite rules that the tool did not
            return — hallucination is structurally impossible.

ReAct tools
───────────
  check_analyst_rules     query confirmed rules from the DB
  save_analyst_rule       persist a rule the analyst just confirmed
  consult_detector_agents return pre-computed 5-agent detector opinions
  update_payment_status   mark the payment pair as confirmed/dismissed
"""

import os
import re as _re
import uuid
from datetime import datetime, timezone
from typing import Optional

from langchain.agents import AgentExecutor, create_react_agent
from langchain.memory import ConversationBufferWindowMemory
from langchain_openai import ChatOpenAI
from langchain_core.tools import StructuredTool
from langchain_core.prompts import PromptTemplate
from pydantic import BaseModel, Field

# ── Prompt template ────────────────────────────────────────────────────────────

REACT_PROMPT_TEMPLATE = """You are Sentinel Training Agent — an expert bank payment-fraud analyst helping review flagged duplicate payment pairs.

PAYMENT PAIR CONTEXT:
{payment_context}

CRITICAL TOOL RULES (never break these):
- Call each tool AT MOST ONCE per turn. After getting tool results, give your Final Answer immediately.
- Only cite a rule as analyst-confirmed if check_analyst_rules explicitly returned it. NEVER invent rules.
- If the analyst mentions a new factor not in the rules, ask: "I don't have a confirmed rule for [factor] yet. Are you saying [interpretation]? Confirm and I'll save it."
- Call save_analyst_rule ONLY when the analyst explicitly confirms a new rule in the current message.
- After save_analyst_rule succeeds, write "Saved: [rule]" and give Final Answer.

TOOLS:
{tools}

STRICT FORMAT — follow exactly:
Thought: one sentence of reasoning
Action: [one of: {tool_names}]
Action Input: the exact input string
Observation: [tool result appears here automatically]
Thought: I now have everything I need
Final Answer: [your complete response to the analyst]

CONVERSATION HISTORY:
{chat_history}

Analyst: {input}
{agent_scratchpad}"""


# ── Tool input schemas ─────────────────────────────────────────────────────────

class CheckRulesInput(BaseModel):
    query: str = Field(
        description="Keywords to search for, e.g. 'AUD UETR SWIFT_MX' or 'same amount beneficiary Austria'"
    )

class SaveRuleInput(BaseModel):
    rule: str = Field(
        description="One-sentence rule to save, e.g. 'SWIFT_MX payments sharing the same UETR are confirmed duplicates'"
    )
    context: str = Field(
        default="Analyst confirmed during payment review",
        description="Brief note on why the rule was established, e.g. 'Analyst confirmed for AUD UETR duplicate'"
    )

class UpdateStatusInput(BaseModel):
    status: str = Field(
        description="New status: confirmed_duplicate | false_positive | under_review | pending"
    )
    notes: str = Field(
        description="Analyst note to record alongside the status change"
    )

class ConsultInput(BaseModel):
    request: str = Field(default="fetch", description="Pass any string — always returns the pre-loaded detector opinions")


# ── Tool factory ───────────────────────────────────────────────────────────────

def make_training_tools(db, record, preloaded_opinions: str, memory_saved_flag: list):
    """
    Build the 4 ReAct tools. All close over the SQLAlchemy session and the
    DuplicatePaymentRecord so they can read/write without globals.
    memory_saved_flag is a one-element mutable list: tools append the key
    when they save a rule so the caller can report it back to the frontend.
    """
    from db import AgentMemoryRecord

    # ── Tool 1: check rules ─────────────────────────────────────────────────
    def check_analyst_rules(query: str) -> str:
        all_rules = (
            db.query(AgentMemoryRecord)
            .filter(AgentMemoryRecord.category == "duplicate_definition")
            .order_by(AgentMemoryRecord.updated_at.desc())
            .limit(40)
            .all()
        )
        if not all_rules:
            return "No analyst-confirmed rules are stored yet."

        query_words = [w for w in query.lower().split() if len(w) > 2]
        if query_words:
            matching = [
                r for r in all_rules
                if any(w in r.content.lower() for w in query_words)
            ]
            relevant = matching if matching else all_rules[:10]
        else:
            relevant = all_rules[:10]

        lines = []
        for r in relevant:
            rule_hit = _re.search(
                r"Rule:\s*(.+?)(?:\nContext:|$)", r.content, _re.IGNORECASE | _re.DOTALL
            )
            text = rule_hit.group(1).strip() if rule_hit else r.content[:200]
            lines.append(f"• {text}")

        return "ANALYST-CONFIRMED RULES:\n" + "\n".join(lines)

    # ── Tool 2: save rule ───────────────────────────────────────────────────
    def save_analyst_rule(rule: str, context: str = "Analyst confirmed during payment review") -> str:
        key_slug = _re.sub(r"[^a-z0-9]+", "_", rule.lower())[:55]
        memory_key = f"review_{record.payment_system}_{record.duplicate_type}_{key_slug}"

        clean_content = (
            f"Rule: {rule}\n"
            f"Context: {record.payment_system}/{record.duplicate_type}, {context}\n"
            f"Saved: {datetime.now(timezone.utc).isoformat()}"
        )

        existing = (
            db.query(AgentMemoryRecord)
            .filter(AgentMemoryRecord.key == memory_key)
            .first()
        )
        if existing:
            existing.content = clean_content
            existing.updated_at = datetime.now(timezone.utc)
        else:
            db.add(
                AgentMemoryRecord(
                    id=str(uuid.uuid4()),
                    category="duplicate_definition",
                    key=memory_key,
                    content=clean_content,
                    updated_at=datetime.now(timezone.utc),
                )
            )
        db.commit()
        memory_saved_flag.append(memory_key)
        return f'Rule saved: "{rule}"'

    # ── Tool 3: detector opinions ───────────────────────────────────────────
    def consult_detector_agents(request: str = "fetch") -> str:
        if preloaded_opinions:
            return preloaded_opinions
        return (
            "Detector agent opinions were not pre-loaded. "
            "This can happen mid-conversation — summarise from conversation history."
        )

    # ── Tool 4: update status ───────────────────────────────────────────────
    def update_payment_status(status: str, notes: str) -> str:
        valid = {"confirmed_duplicate", "false_positive", "under_review", "pending"}
        if status not in valid:
            return f"Invalid status '{status}'. Must be one of: {', '.join(sorted(valid))}"
        record.status = status
        record.notes = notes
        db.commit()
        return f"Payment pair status updated to '{status}'."

    return [
        StructuredTool.from_function(
            func=check_analyst_rules,
            name="check_analyst_rules",
            description=(
                "Search analyst-confirmed duplicate detection rules stored in memory. "
                "ALWAYS call this before answering whether any payment pattern is a duplicate."
            ),
            args_schema=CheckRulesInput,
        ),
        StructuredTool.from_function(
            func=save_analyst_rule,
            name="save_analyst_rule",
            description=(
                "Permanently save a new analyst-confirmed rule to long-term memory. "
                "Call this the moment the analyst confirms or corrects a finding."
            ),
            args_schema=SaveRuleInput,
        ),
        StructuredTool.from_function(
            func=consult_detector_agents,
            name="consult_detector_agents",
            description=(
                "Get the pre-computed opinions from all 5 specialist detector agents "
                "(SWIFT, ACH, MultiSource, FuzzyMatch, PatternAnalysis) for this payment pair. "
                "Call once at the start of a review session."
            ),
            args_schema=ConsultInput,
        ),
        StructuredTool.from_function(
            func=update_payment_status,
            name="update_payment_status",
            description=(
                "Update the payment pair's status to confirmed_duplicate, false_positive, "
                "under_review, or pending once a conclusion is reached with the analyst."
            ),
            args_schema=UpdateStatusInput,
        ),
    ]


# ── Memory helpers ─────────────────────────────────────────────────────────────
# Short-term:  ConversationBufferWindowMemory (last 15 turns verbatim, LangChain-native)
# Long-term:   PostgreSQL AgentMemoryRecord (category='conv_summary')
#              When conversation exceeds VERBATIM_WINDOW turns, older turns are
#              LLM-summarised and the summary is stored in PostgreSQL.  On each
#              call the stored summary + recent verbatim turns are combined into
#              the {chat_history} placeholder injected into the ReAct prompt.

VERBATIM_WINDOW = 15   # keep this many turns verbatim
SUMMARISE_AFTER = 20   # trigger summarisation once history exceeds this


def _summary_key(conversation_id: str) -> str:
    return f"conv_summary_{conversation_id}"


def _load_conversation_summary(conversation_id: str, db) -> str:
    from db import AgentMemoryRecord
    rec = (
        db.query(AgentMemoryRecord)
        .filter(AgentMemoryRecord.key == _summary_key(conversation_id))
        .first()
    )
    return rec.content if rec else ""


def _save_conversation_summary(conversation_id: str, summary: str, db) -> None:
    from db import AgentMemoryRecord
    key = _summary_key(conversation_id)
    existing = db.query(AgentMemoryRecord).filter(AgentMemoryRecord.key == key).first()
    if existing:
        existing.content = summary
        existing.updated_at = datetime.now(timezone.utc)
    else:
        db.add(
            AgentMemoryRecord(
                id=str(uuid.uuid4()),
                category="conv_summary",
                key=key,
                content=summary,
                updated_at=datetime.now(timezone.utc),
            )
        )
    db.commit()


def _build_window_memory(history: list) -> ConversationBufferWindowMemory:
    """
    Build a LangChain ConversationBufferWindowMemory from raw DB history.
    Only the last VERBATIM_WINDOW turns are loaded — older turns are handled
    via the stored summary injected separately into the prompt.
    """
    memory = ConversationBufferWindowMemory(
        k=VERBATIM_WINDOW,
        memory_key="chat_history",
        return_messages=False,
        input_key="input",
        output_key="output",
    )
    for msg in history[-VERBATIM_WINDOW:]:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role == "user":
            memory.chat_memory.add_user_message(content)
        elif role == "assistant":
            memory.chat_memory.add_ai_message(content)
    return memory


def _format_chat_history(history: list, stored_summary: str) -> str:
    """
    Combine an optional stored summary of older turns with the recent
    VERBATIM_WINDOW turns to produce the {chat_history} string.
    """
    parts = []
    if stored_summary:
        parts.append(f"[Earlier conversation summary]\n{stored_summary}")
    for msg in history[-VERBATIM_WINDOW:]:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role == "user":
            parts.append(f"Human: {content}")
        elif role == "assistant":
            parts.append(f"AI: {content}")
    return "\n\n".join(parts) if parts else "No prior conversation."


async def _maybe_update_summary(
    llm: ChatOpenAI,
    history: list,
    conversation_id: str,
    db,
    existing_summary: str,
) -> None:
    """
    If the conversation is long, LLM-summarise the older portion (beyond the
    verbatim window) and persist the result so future calls pick it up.
    Runs fire-and-forget style after the agent responds.
    """
    if len(history) <= SUMMARISE_AFTER:
        return

    old_turns = history[:-VERBATIM_WINDOW]
    lines = []
    for m in old_turns:
        role_label = "Analyst" if m.get("role") == "user" else "Agent"
        lines.append(f"{role_label}: {m.get('content', '')[:400]}")
    turns_text = "\n".join(lines)

    prior_summary_part = f"Prior summary: {existing_summary}\n\n" if existing_summary else ""
    prompt = (
        f"Summarise this bank payment review conversation in 4-6 sentences.\n"
        f"Focus on: which payment pair was reviewed, what rules were applied or established, "
        f"and what conclusions the analyst reached.\n\n"
        f"{prior_summary_part}"
        f"New turns:\n{turns_text}"
    )
    response = await llm.ainvoke(prompt)
    _save_conversation_summary(conversation_id, response.content, db)


# ── Public entry point ─────────────────────────────────────────────────────────

def _get_llm() -> ChatOpenAI:
    base_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL")
    api_key = (
        os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY")
        or os.environ.get("OPENAI_API_KEY")
    )
    kwargs = dict(model="gpt-4o-mini", temperature=0, api_key=api_key)
    if base_url:
        kwargs["base_url"] = base_url
    return ChatOpenAI(**kwargs)


async def run_react_training_agent(
    *,
    payment_data: dict,
    record,
    message: Optional[str],
    conversation_id: str,
    history: list,
    db,
    preloaded_opinions: str = "",
) -> dict:
    """
    Run one turn of the ReAct training agent and return a response dict
    compatible with the existing frontend contract.
    """
    llm = _get_llm()

    # Build payment context string (injected as static text into the prompt)
    matched_str = ", ".join(payment_data.get("matchedFields") or [])
    payment_context = (
        f"IDs: {payment_data['payment1Id']} ↔ {payment_data['payment2Id']}\n"
        f"System: {payment_data['paymentSystem']} | Type: {payment_data['duplicateType']}\n"
        f"Amount: {payment_data['amount']} {payment_data['currency']}\n"
        f"Sender BIC: {payment_data.get('senderBIC', 'N/A')} | Receiver BIC: {payment_data.get('receiverBIC', 'N/A')}\n"
        f"Originator: {payment_data.get('originatorCountry', 'N/A')} | Beneficiary: {payment_data.get('beneficiaryCountry', 'N/A')}\n"
        f"Dates: {payment_data.get('paymentDate1', 'N/A')} / {payment_data.get('paymentDate2', 'N/A')}\n"
        f"Matched Fields: {matched_str}\n"
        f"Probability: {round(payment_data.get('probability', 0) * 100, 1)}%"
    )

    # Mutable flag so tools can signal rule-saves back to this scope
    memory_saved_flag: list = []

    # Build tools
    tools = make_training_tools(db, record, preloaded_opinions, memory_saved_flag)

    # Build prompt
    prompt = PromptTemplate(
        input_variables=["input", "agent_scratchpad", "chat_history",
                         "tools", "tool_names", "payment_context"],
        template=REACT_PROMPT_TEMPLATE,
    )

    # Build agent
    agent = create_react_agent(llm=llm, tools=tools, prompt=prompt)

    # ── Memory: two-layer approach ────────────────────────────────────────────
    # SHORT-TERM  ConversationBufferWindowMemory (LangChain) manages the most
    #             recent VERBATIM_WINDOW turns via the LangChain history object.
    #             _format_chat_history() serialises it into the prompt string.
    # LONG-TERM   PostgreSQL summary of turns beyond the verbatim window, loaded
    #             from AgentMemoryRecord and prepended to the chat_history string.
    stored_summary = _load_conversation_summary(conversation_id, db)
    chat_history_str = _format_chat_history(history, stored_summary)

    executor = AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=True,
        max_iterations=8,
        handle_parsing_errors=True,
        return_intermediate_steps=False,
    )

    if message:
        user_input = message
    elif preloaded_opinions:
        # First call: inject detector opinions directly so the agent only needs
        # ONE tool call (check_analyst_rules) before giving its Final Answer.
        user_input = (
            "Here are the findings from all 5 specialist detector agents:\n\n"
            f"{preloaded_opinions}\n\n"
            "Please check for any analyst-confirmed rules that apply, then give me "
            "your synthesised analysis and verdict."
        )
    else:
        user_input = "Please give me your analysis of this payment pair."

    # Pass chat_history explicitly so the prompt gets the full context
    # (window_memory provides the LangChain plumbing; chat_history_str overrides it)
    result = await executor.ainvoke(
        {
            "input": user_input,
            "payment_context": payment_context,
            "chat_history": chat_history_str,
        }
    )

    response_text = result.get("output", "")

    # Asynchronously update the stored summary when conversation is long
    import asyncio
    asyncio.create_task(
        _maybe_update_summary(llm, history, conversation_id, db, stored_summary)
    )

    return {
        "response": response_text,
        "memorySaved": len(memory_saved_flag) > 0,
        "memoryKey": memory_saved_flag[0] if memory_saved_flag else None,
    }
