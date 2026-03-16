"""
Shared LangGraph utilities used by all Sentinel agents.
"""
import os
from typing import TypedDict, Annotated
from langchain_core.messages import BaseMessage, SystemMessage, AIMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]


def get_llm(temperature: float = 0.1, max_tokens: int = 1500) -> ChatOpenAI:
    base_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL")
    api_key = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if base_url and api_key:
        return ChatOpenAI(model="gpt-4o-mini", temperature=temperature, max_tokens=max_tokens,
                          base_url=base_url, api_key=api_key)
    if api_key:
        return ChatOpenAI(model="gpt-4o-mini", temperature=temperature, max_tokens=max_tokens, api_key=api_key)
    raise RuntimeError("No OpenAI API key configured.")


def build_agent_graph(system_prompt: str, llm: ChatOpenAI, checkpointer=None):
    """
    Build a single-node LangGraph agent that responds to messages using the given system prompt.
    If checkpointer is provided (e.g., MemorySaver), the graph persists state across calls.
    """
    def call_model(state: AgentState) -> AgentState:
        messages = [SystemMessage(content=system_prompt)] + state["messages"]
        response = llm.invoke(messages)
        return {"messages": [response]}

    graph = StateGraph(AgentState)
    graph.add_node("agent", call_model)
    graph.set_entry_point("agent")
    graph.add_edge("agent", END)

    if checkpointer:
        return graph.compile(checkpointer=checkpointer)
    return graph.compile()
