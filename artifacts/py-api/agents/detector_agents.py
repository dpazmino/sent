"""
Duplicate Payment Detector Agents.
Multiple specialized agents with different detection strategies.
Each can be asked for an opinion on a set of payments.
"""
import os
import json
from openai import OpenAI
from typing import List, Dict

DETECTOR_AGENTS = [
    {
        "name": "SWIFT_Specialist",
        "description": "Expert in SWIFT MT and MX payment duplicate detection. Specializes in UETR matching, field 20/32A analysis.",
        "focus": "SWIFT_MT, SWIFT_MX",
        "system_prompt": """You are a SWIFT payment duplicate detection specialist.
You focus on SWIFT MT and ISO 20022 MX messages.
For each payment pair provided, assess if it is a duplicate based on:
- UETR (Unique End-to-end Transaction Reference) - if same, definitive duplicate
- EndToEndId - same E2E ID with same amount = high probability duplicate
- Field 20 (MT) / InstrId (MX) - transaction reference number matching
- Amount + currency + value date combination
- Sender/receiver BIC pair
- MT to MX migration duplicates (same payment submitted in both formats)

Respond with JSON array of assessments."""
    },
    {
        "name": "ACH_Specialist",
        "description": "Expert in ACH transaction duplicate detection. Focuses on trace numbers, batch processing, and routing numbers.",
        "focus": "ACH",
        "system_prompt": """You are an ACH payment duplicate detection specialist.
For each payment pair, assess duplication based on:
- ACH Trace Number - if identical = definitive duplicate
- Batch Number + sequence combination
- Routing number + account number + amount + effective date
- SEC code context (CCD, PPD, CTX have different risk profiles)
- Return and re-presentment patterns

Respond with JSON array of assessments."""
    },
    {
        "name": "MultiSource_Detector",
        "description": "Specializes in detecting payments submitted from multiple source systems (core banking + treasury + correspondent).",
        "focus": "INTERNAL, multi-source",
        "system_prompt": """You are a multi-source payment duplicate detection specialist.
Banks often have multiple source systems (Core Banking, Treasury, Trade Finance, Correspondent Banking).
The same payment obligation can be submitted by multiple systems.

For each payment pair, assess:
- Same underlying payment from different source systems
- Same amount + beneficiary + value date from different source_system values
- Cross-system reference linkage
- Time proximity (same payment shouldn't come from two systems within minutes)
- Partial payment aggregation that recreates the full amount

Respond with JSON array of assessments."""
    },
    {
        "name": "FuzzyMatch_Engine",
        "description": "Uses fuzzy logic to detect near-duplicate payments with slight variations in amount, date, or reference.",
        "focus": "All systems, fuzzy matching",
        "system_prompt": """You are a fuzzy matching duplicate payment detection engine.
You look for near-duplicates that aren't exact matches due to:
- Amount differences within 0.1% (rounding, FX conversion artifacts)
- Date differences of 1-3 business days (settlement day adjustments)
- Reference number variations (INV001 vs Invoice-001 vs INV-001)
- Vendor name variations (Acme Corp vs ACME CORPORATION)
- Partial amounts that are components of a larger duplicate

Respond with JSON array of assessments."""
    },
    {
        "name": "PatternAnalysis_Agent",
        "description": "Analyzes temporal and behavioral patterns to identify systematic duplicate payment issues.",
        "focus": "Pattern analysis across all systems",
        "system_prompt": """You are a payment pattern analysis agent for duplicate detection.
You look at patterns rather than individual field matches:
- Same sender repeatedly paying same beneficiary in short windows
- Batch retry patterns (system retries at regular intervals)
- Calendar-based duplicates (end-of-month, quarter-end rushes)
- Network timeout patterns (payments submitted during known outage windows)
- Human error patterns (Monday morning re-processing of Friday batches)

Respond with JSON array of assessments."""
    }
]


def get_openai_client():
    base_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL")
    api_key = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY")
    
    if base_url and api_key:
        return OpenAI(base_url=base_url, api_key=api_key)
    
    api_key_direct = os.environ.get("OPENAI_API_KEY")
    if api_key_direct:
        return OpenAI(api_key=api_key_direct)
    
    raise RuntimeError("No OpenAI API key configured.")


async def get_detector_opinion(agent_config: dict, payments_data: List[dict], memory_context: str = "") -> List[dict]:
    client = get_openai_client()
    
    system = agent_config["system_prompt"]
    if memory_context:
        system += f"\n\n## Custom Duplicate Definition (from training):\n{memory_context}"
    
    payments_json = json.dumps(payments_data[:20], indent=2)
    
    prompt = f"""Review these suspected duplicate payment pairs and assess each one.

Payment pairs to review:
{payments_json}

For each pair, return a JSON object:
{{
  "paymentId": "the duplicate record ID",
  "isDuplicate": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "duplicateType": "the type of duplicate if applicable"
}}

Return a JSON array of these objects."""
    
    try:
        response = client.chat.completions.create(
            model="gpt-5.2",
            max_completion_tokens=3000,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
        )
        
        content = response.choices[0].message.content or "[]"
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()
        
        opinions = json.loads(content)
        if not isinstance(opinions, list):
            opinions = [opinions]
        return opinions
    except Exception as e:
        return [{"paymentId": p.get("id", "unknown"), "isDuplicate": True, "confidence": 0.5, 
                 "reasoning": f"Analysis error: {str(e)}", "duplicateType": "unknown"} 
                for p in payments_data[:5]]


async def get_all_detector_opinions(payments: List[dict], memory_context: str = "") -> Dict:
    all_opinions = []
    consensus = {}
    
    for agent_config in DETECTOR_AGENTS:
        try:
            opinions = await get_detector_opinion(agent_config, payments, memory_context)
            for opinion in opinions:
                all_opinions.append({
                    "paymentId": opinion.get("paymentId", ""),
                    "agentName": agent_config["name"],
                    "isDuplicate": opinion.get("isDuplicate", True),
                    "confidence": opinion.get("confidence", 0.5),
                    "reasoning": opinion.get("reasoning", ""),
                    "duplicateType": opinion.get("duplicateType", ""),
                })
        except Exception as e:
            print(f"Error getting opinion from {agent_config['name']}: {e}")
    
    payment_ids = set(p.get("id", "") for p in payments)
    for pid in payment_ids:
        pid_opinions = [o for o in all_opinions if o["paymentId"] == pid]
        if pid_opinions:
            avg_conf = sum(o["confidence"] for o in pid_opinions) / len(pid_opinions)
            consensus[pid] = round(avg_conf, 4)
    
    return {"opinions": all_opinions, "consensus": consensus}
