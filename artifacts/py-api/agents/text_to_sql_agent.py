"""
Text-to-SQL Agent.
Reads the data source schema definition and converts natural language queries to SQL.
"""
import os
import json
from openai import AsyncOpenAI

TEXT_TO_SQL_SYSTEM_PROMPT = """You are a Text-to-SQL agent for a banking duplicate payment detection system.
You convert natural language questions into SQL queries based on the provided database schema.

Rules:
- Only generate SELECT queries (read-only)
- Use proper SQL syntax for PostgreSQL
- When querying for duplicates, use the dup_duplicate_payments table by default
- Always include appropriate WHERE clauses to limit result sets
- For aggregate queries, always include GROUP BY
- Return ONLY the SQL query, nothing else. No markdown, no explanation.
- If the question cannot be answered with SQL, return: SELECT 'Cannot generate SQL for this query' as error

The dup_duplicate_payments table has these columns:
- id (VARCHAR): unique record ID
- payment1_id, payment2_id (VARCHAR): the two payment IDs being compared
- probability (FLOAT): 0.0-1.0 duplicate probability
- duplicate_type (VARCHAR): type of duplicate detection
- payment_system (VARCHAR): SWIFT_MT, SWIFT_MX, ACH, INTERNAL
- amount (FLOAT): payment amount
- currency (VARCHAR): currency code
- sender_bic, receiver_bic (VARCHAR): BIC codes
- originator_country, beneficiary_country (VARCHAR): ISO country codes
- payment_date1, payment_date2 (VARCHAR): payment dates
- status (VARCHAR): pending, confirmed_duplicate, dismissed, under_review
- matched_fields (JSON): array of field names that matched
- detected_at (TIMESTAMP): when detected
- notes (TEXT)
- scan_id (VARCHAR): which scan found this

Additionally, the user may define their own payment source tables in the data source schema.
"""

GRAPH_SYSTEM_PROMPT = """You are an AI that generates graph specifications for financial data visualization.
You are given REAL query results from a PostgreSQL database. Use ONLY the provided data — do not invent or estimate numbers.

You must return a valid JSON object with this structure:
{
  "chartType": "bar"|"line"|"pie"|"scatter",
  "title": "Chart Title",
  "labels": ["label1", "label2", ...],
  "datasets": [
    {
      "label": "Dataset Name",
      "data": [number, number, ...],
      "backgroundColor": ["#color1", ...],
      "borderColor": ["#color1", ...]
    }
  ],
  "xAxisLabel": "optional x axis label",
  "yAxisLabel": "optional y axis label",
  "explanation": "brief explanation of what this chart shows and what the data means"
}

Chart type guidance:
- Corridors / categories / systems → bar chart
- Trends over time → line chart
- Share / breakdown of a whole → pie chart
- Correlation between two numbers → scatter chart

Colour palette (use in order, cycling if needed):
#3b82f6, #f59e0b, #ef4444, #10b981, #8b5cf6, #06b6d4, #f97316, #84cc16

IMPORTANT: Build the chart entirely from the REAL DATA provided. Do not fabricate data points.
"""


def get_openai_client():
    base_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL")
    api_key = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY")
    
    if base_url and api_key:
        return AsyncOpenAI(base_url=base_url, api_key=api_key)
    
    api_key_direct = os.environ.get("OPENAI_API_KEY")
    if api_key_direct:
        return AsyncOpenAI(api_key=api_key_direct)
    
    raise RuntimeError("No OpenAI API key configured.")


async def generate_sql(natural_language_query: str, schema_context: str = "") -> str:
    client = get_openai_client()
    
    system = TEXT_TO_SQL_SYSTEM_PROMPT
    if schema_context:
        system += f"\n\n## Additional Schema Context (User-Defined)\n{schema_context}"
    
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=1024,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": natural_language_query},
        ],
    )
    return response.choices[0].message.content or ""


async def generate_graph_spec(query: str, sql_used: str = "", real_data: list = None, memory_context: str = "") -> dict:
    client = get_openai_client()

    system = GRAPH_SYSTEM_PROMPT
    if memory_context:
        system += f"\n\n## Agent Memory Context\n{memory_context}"

    data_section = ""
    if real_data:
        data_section = f"\nReal query results ({len(real_data)} rows):\n{json.dumps(real_data[:200], indent=2)}"
    else:
        data_section = "\nNo data returned by the query."

    prompt = f"""User request: "{query}"

SQL executed: {sql_used or "N/A"}
{data_section}

Build a chart from the real data above. Return ONLY valid JSON with the structure specified."""

    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=2048,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    )

    content = response.choices[0].message.content or "{}"
    if content.startswith("```json"):
        content = content[7:]
    if content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {
            "chartType": "bar",
            "title": "Analysis Result",
            "labels": ["No Data"],
            "datasets": [{"label": "Count", "data": [0], "backgroundColor": ["#3b82f6"], "borderColor": ["#2563eb"]}],
            "explanation": "Could not parse AI response",
        }
