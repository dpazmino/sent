"""
Trainable AI Agent with persistent memory.
Supports two training modes:
1. Database schema understanding
2. Custom duplicate payment definitions
"""
import os
import json
from openai import OpenAI
from typing import List, Dict

TRAINING_AGENT_SYSTEM_PROMPT = """You are a trainable AI assistant for a banking duplicate payment detection system.
You learn from user input and save knowledge to memory for use by other agents.

You have two specializations:
1. **Database Schema Training**: Learn about the bank's payment database structure so the text-to-SQL agent can write accurate queries
2. **Duplicate Definition Training**: Learn the bank's specific definition of what constitutes a duplicate payment

When the user teaches you something:
1. Acknowledge what you learned
2. Confirm how this knowledge will be used
3. Ask follow-up questions to deepen your understanding
4. Summarize the key points to be saved to memory

Always be collaborative and ask clarifying questions to ensure complete understanding.
Confirm back what you've learned in structured form.
"""

DB_SCHEMA_PROMPT_EXTENSION = """
You are being trained on the database schema. Help the user document:
- Table names and their purpose
- Column names, data types, and business meaning
- Relationships between tables
- Example values and data ranges
- Special fields used for duplicate detection (unique identifiers, reference numbers)
- How payments flow through the system (source systems, processing pipeline)

After each exchange, summarize the schema information learned so far.
"""

DUPLICATE_DEFINITION_PROMPT_EXTENSION = """
You are being trained on what constitutes a duplicate payment at this bank.
Help the user define:
- The specific criteria for declaring two payments as duplicates
- Threshold values (e.g., "within 2 business days and within 0.5% of amount")
- Exceptions and special cases (e.g., "recurring standing orders are NOT duplicates")
- Payment system-specific rules
- Source system-specific rules
- How to handle multi-source payments
- Business process context

After each exchange, summarize the duplicate definition rules learned.
"""


def get_openai_client():
    base_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL")
    api_key = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY")
    
    if base_url and api_key:
        return OpenAI(base_url=base_url, api_key=api_key)
    
    api_key_direct = os.environ.get("OPENAI_API_KEY")
    if api_key_direct:
        return OpenAI(api_key=api_key_direct)
    
    raise RuntimeError("No OpenAI API key configured.")


def build_training_messages(training_type: str, conversation_history: List[dict], user_message: str) -> List[dict]:
    system = TRAINING_AGENT_SYSTEM_PROMPT
    if training_type == "database_schema":
        system += DB_SCHEMA_PROMPT_EXTENSION
    elif training_type == "duplicate_definition":
        system += DUPLICATE_DEFINITION_PROMPT_EXTENSION
    
    messages = [{"role": "system", "content": system}]
    for msg in conversation_history[-30:]:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": user_message})
    return messages


def extract_memory_key(training_type: str, message: str) -> str:
    keywords = message.lower().split()[:5]
    slug = "_".join(w for w in keywords if len(w) > 2)[:40]
    return f"{training_type}_{slug}"


async def run_training_agent(
    user_message: str,
    training_type: str,
    conversation_history: List[dict],
) -> Dict:
    client = get_openai_client()
    messages = build_training_messages(training_type, conversation_history, user_message)
    
    response = client.chat.completions.create(
        model="gpt-5.2",
        max_completion_tokens=2048,
        messages=messages,
    )
    
    assistant_response = response.choices[0].message.content or ""
    
    should_save = any(phrase in user_message.lower() for phrase in [
        "my database", "our table", "the column", "we define", "duplicate means",
        "is a duplicate", "are duplicates", "threshold", "criteria", "rule",
        "table name", "field name", "schema", "structure", "we use", "our system"
    ])
    
    memory_key = extract_memory_key(training_type, user_message)
    
    return {
        "response": assistant_response,
        "memorySaved": should_save,
        "memoryKey": memory_key if should_save else None,
        "memoryContent": f"User said: {user_message}\n\nAgent learned: {assistant_response[:500]}" if should_save else None,
    }
