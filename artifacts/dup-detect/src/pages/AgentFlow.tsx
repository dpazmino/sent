import { motion } from "framer-motion";
import {
  Brain, Zap, Database, GitBranch, Cpu, Network, MemoryStick,
  ArrowDown, ArrowRight, ChevronRight, Code2, ShieldCheck, Layers,
} from "lucide-react";

/* ─── Tiny building blocks ─────────────────────────────────────────────────── */

function PipeLabel({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <p className={`text-[10px] font-bold uppercase tracking-widest mb-4 flex items-center gap-1.5 ${color}`}>
      {children}
    </p>
  );
}

function Connector({ horizontal }: { horizontal?: boolean }) {
  if (horizontal) {
    return (
      <div className="flex items-center self-center px-1">
        <div className="w-8 h-px bg-gradient-to-r from-white/10 to-white/20" />
        <ArrowRight className="w-3 h-3 text-slate-600 -ml-0.5" />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center py-1">
      <div className="w-px h-6 bg-gradient-to-b from-white/20 to-white/10" />
      <ArrowDown className="w-3 h-3 text-slate-600 -mt-0.5" />
    </div>
  );
}

function AgentCard({
  name, role, file, tags = [], color, accent, desc, badge,
}: {
  name: string; role: string; file: string; tags?: string[]; color: string;
  accent: string; desc: string; badge?: string;
}) {
  return (
    <div className={`relative rounded-xl border p-4 space-y-2 ${color}`}>
      {badge && (
        <span className={`absolute -top-2.5 right-3 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${accent}`}>
          {badge}
        </span>
      )}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-white leading-tight">{name}</p>
          <p className={`text-[11px] font-medium mt-0.5 ${accent.split(" ").find(c => c.startsWith("text-")) ?? "text-slate-400"}`}>{role}</p>
        </div>
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">{desc}</p>
      <div className="flex flex-wrap gap-1 pt-0.5">
        {tags.map(t => (
          <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded font-mono border ${accent}`}>{t}</span>
        ))}
        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono border border-slate-700 text-slate-600">{file}</span>
      </div>
    </div>
  );
}

function DetectorCard({ name, focus, desc }: { name: string; focus: string; desc: string }) {
  return (
    <div className="rounded-lg border border-blue-400/15 bg-blue-500/5 p-3 space-y-1">
      <p className="text-xs font-bold text-blue-300">{name}</p>
      <p className="text-[10px] text-blue-400/70 font-medium">{focus}</p>
      <p className="text-[10px] text-slate-500 leading-relaxed">{desc}</p>
    </div>
  );
}

function SectionBadge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${color}`}>
      {children}
    </span>
  );
}

/* ─── Main page ─────────────────────────────────────────────────────────────── */

export default function AgentFlow() {
  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">

      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Agentic Flow</h1>
        <p className="text-slate-400 text-base max-w-2xl leading-relaxed">
          Visual architecture of the Sentinel multi-agent system — all nine agents built on
          LangGraph StateGraph, running on <span className="text-white font-medium">gpt-4o-mini</span>.
        </p>
      </div>

      {/* ── LangGraph Infrastructure Banner ─────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative rounded-2xl border border-violet-400/25 bg-gradient-to-r from-violet-500/8 via-violet-500/5 to-transparent p-5 overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(139,92,246,0.08),transparent_70%)] pointer-events-none" />
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-violet-500/15 border border-violet-400/25">
            <GitBranch className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">LangGraph Infrastructure</p>
            <p className="text-xs text-slate-400 font-mono">base_langgraph.py</p>
          </div>
          <SectionBadge color="border-violet-400/30 text-violet-300 bg-violet-500/10">Shared by all agents</SectionBadge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              icon: Layers,
              title: "StateGraph(AgentState)",
              desc: "Every agent is a single-node StateGraph. AgentState carries the message list as Annotated[list[BaseMessage], add_messages] — the LangGraph reducer merges new messages in without replacing the full list.",
            },
            {
              icon: Code2,
              title: "build_agent_graph()",
              desc: "Factory function that wires a system prompt + LLM into a StateGraph node, sets the entry point, adds an edge to END, and optionally attaches a checkpointer for persistent memory.",
            },
            {
              icon: Cpu,
              title: "get_llm()",
              desc: "Returns a ChatOpenAI(gpt-4o-mini) client pointing at the Replit AI Integrations proxy — no external API key needed. Temperature and max_tokens configurable per agent.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-3 p-3 rounded-xl bg-white/3 border border-white/6">
              <Icon className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-white font-mono mb-1">{title}</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Three-Column Pipeline ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── COL 1: Detection Pipeline ──────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="space-y-2"
        >
          <PipeLabel color="text-orange-400">
            <Zap className="w-3 h-3" /> Detection Pipeline
          </PipeLabel>

          {/* Entry point */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/3 border border-white/8">
            <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
            <p className="text-[11px] text-slate-400">Triggered by: <span className="text-white">Bulk Scan · Master Console · Duplicates List</span></p>
          </div>
          <Connector />

          {/* Master Agent */}
          <AgentCard
            name="Master Detection Agent"
            role="Orchestrator · Highest Authority"
            file="master_agent.py"
            tags={["gpt-4o-mini", "temp=0.1", "stateless"]}
            color="border-orange-400/25 bg-orange-500/5"
            accent="text-orange-300 border-orange-400/20 bg-orange-400/8"
            badge="Orchestrator"
            desc="20+ years of correspondent banking knowledge. Coordinates all five detectors, synthesises their verdicts into a consensus score, and delivers authoritative executive-level analysis. The single voice across SWIFT, ACH, ISO 20022, SEPA, CHAPS, Fedwire, and CHIPS."
          />
          <Connector />

          {/* Detector agents group */}
          <div className="rounded-xl border border-blue-400/20 bg-blue-500/4 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                <Network className="w-3.5 h-3.5" /> 5 Detector Agents
              </p>
              <SectionBadge color="border-blue-400/20 text-blue-400 bg-blue-500/5">Parallel execution</SectionBadge>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              All five agents run in parallel against each payment pair.
              Each produces an independent verdict (isDuplicate, confidence, reasoning)
              built in <span className="font-mono text-slate-400">detector_agents.py</span> using
              <span className="font-mono text-slate-400"> build_agent_graph()</span>.
            </p>
            <DetectorCard
              name="SWIFT Specialist"
              focus="SWIFT_MT · SWIFT_MX · ISO 20022"
              desc="UETR matching, Field 20 uniqueness (45-day rule), pacs.008/MT103 duplicate detection, MT-to-MX migration double-processing."
            />
            <DetectorCard
              name="ACH Specialist"
              focus="ACH · NACHA"
              desc="Trace number uniqueness, SEC code risk profiles (CCD/PPD/CTX/WEB), batch-level duplicate detection, same-day ACH retry handling."
            />
            <DetectorCard
              name="MultiSource Detector"
              focus="Internal · Multi-source"
              desc="Catches payments submitted from multiple internal systems simultaneously — core banking, treasury (Murex/Calypso), ERP (SAP), and payments hub."
            />
            <DetectorCard
              name="FuzzyMatch Engine"
              focus="All payment systems"
              desc="Near-duplicate detection with slight amount/date/reference variations. Uses fuzzy thresholds (≤0.1% amount drift) to catch real-world typos and FX rounding."
            />
            <DetectorCard
              name="PatternAnalysis Agent"
              focus="Cross-system temporal patterns"
              desc="Identifies systematic patterns — standing orders, regular batch cycles, failover retries — to reduce false positives from recurring legitimate payments."
            />
          </div>

          <Connector />

          {/* Consensus output */}
          <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white/3 border border-white/8">
            <ShieldCheck className="w-4 h-4 text-green-400 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-white">Consensus Output</p>
              <p className="text-[11px] text-slate-400">Majority vote (≥3/5 = duplicate). Stored in <span className="font-mono">dup_duplicate_payments</span>. Surfaced in the Detector Opinions column.</p>
            </div>
          </div>
        </motion.div>

        {/* ── COL 2: Memory & Training Pipeline ─────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.2 }}
          className="space-y-2"
        >
          <PipeLabel color="text-violet-400">
            <Brain className="w-3 h-3" /> Memory &amp; Training
          </PipeLabel>

          {/* Entry point */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/3 border border-white/8">
            <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
            <p className="text-[11px] text-slate-400">Triggered by: <span className="text-white">Review Modal Chat · Agent Training page</span></p>
          </div>
          <Connector />

          {/* Review / Training Agent (per-analyst) */}
          <AgentCard
            name="Review / Training Agent"
            role="Per-Analyst Persistent Memory"
            file="review_agent.py"
            tags={["gpt-4o-mini", "temp=0.3", "MemorySaver"]}
            color="border-violet-400/25 bg-violet-500/5"
            accent="text-violet-300 border-violet-400/20 bg-violet-400/8"
            badge="10 × threads"
            desc="One agent instance, ten independent memory threads — one per analyst. Keyed by user_id. Alice Chen's memory never bleeds into Bob Martinez's. Remembers every rule, decision, and exception taught across all payment reviews — session boundaries don't matter."
          />

          <Connector />

          {/* MemorySaver */}
          <div className="rounded-xl border border-violet-400/20 bg-violet-500/4 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MemoryStick className="w-4 h-4 text-violet-400" />
              <p className="text-xs font-bold text-white">MemorySaver (LangGraph Checkpointer)</p>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Module-level <span className="font-mono text-violet-300">_analyst_memory = MemorySaver()</span> shared
              across all requests. Thread ID = <span className="font-mono text-violet-300">user_id</span>.
              Stores the full message list; LangGraph replays it on every invocation.
            </p>
            <div className="space-y-2">
              {[
                ["Persistence across payments", "Rules taught on payment PMT-001 are available when reviewing PMT-999."],
                ["Server-restart recovery", "On restart, the DB message history is re-injected into LangGraph state, fully restoring the thread."],
                ["Conflict detection", "If a new rule conflicts with a stored one, the agent flags the inconsistency and asks for clarification."],
              ].map(([title, desc]) => (
                <div key={title as string} className="flex gap-2">
                  <ChevronRight className="w-3 h-3 text-violet-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-slate-400"><span className="text-slate-200">{title}:</span> {desc}</p>
                </div>
              ))}
            </div>
          </div>

          <Connector />

          {/* Training Agent (global KB) */}
          <AgentCard
            name="Training Agent"
            role="Global Knowledge Base"
            file="training_agent.py"
            tags={["gpt-4o-mini", "MemorySaver", "KB"]}
            color="border-fuchsia-400/25 bg-fuchsia-500/5"
            accent="text-fuchsia-300 border-fuchsia-400/20 bg-fuchsia-400/8"
            badge="Global"
            desc="Platform-wide knowledge base built via the Agent Training page. Stores institutional policies, regulatory rules, and exception patterns that apply to ALL analysts — distinct from per-analyst memory. Trained by team leads, consumed by other agents as a shared rule set."
          />
        </motion.div>

        {/* ── COL 3: Query Pipeline ──────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, delay: 0.3 }}
          className="space-y-2"
        >
          <PipeLabel color="text-cyan-400">
            <Database className="w-3 h-3" /> Query Pipeline
          </PipeLabel>

          {/* Entry point */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/3 border border-white/8">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <p className="text-[11px] text-slate-400">Triggered by: <span className="text-white">AI Graph Chat · Master Console query panel</span></p>
          </div>
          <Connector />

          {/* Text-to-SQL Agent */}
          <AgentCard
            name="Text-to-SQL Agent"
            role="Natural Language → PostgreSQL"
            file="text_to_sql_agent.py"
            tags={["gpt-4o-mini", "temp=0.0", "SELECT only"]}
            color="border-cyan-400/25 bg-cyan-500/5"
            accent="text-cyan-300 border-cyan-400/20 bg-cyan-400/8"
            desc="Converts plain English questions into safe, efficient PostgreSQL SELECT queries against the duplicate payments schema. Never generates INSERT/UPDATE/DELETE. Schema auto-injected from the Data Schema page definition. Returns raw SQL + result rows."
          />
          <Connector />

          {/* PostgreSQL */}
          <div className="rounded-xl border border-green-400/20 bg-green-500/4 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-green-400" />
              <p className="text-xs font-bold text-white">PostgreSQL — App Database</p>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              The only database the app writes to. Contains four core tables:
            </p>
            <div className="space-y-1.5">
              {[
                ["dup_duplicate_payments", "All detected duplicate payment pairs, confidence scores, status, matched fields."],
                ["dup_user_reviews",       "Per-analyst review queue entries linking an analyst to a duplicate payment."],
                ["dup_review_messages",    "Full conversation history for every analyst × payment chat thread."],
                ["dup_users",              "10 predefined analyst profiles (user_1 through user_10)."],
              ].map(([table, desc]) => (
                <div key={table as string} className="rounded-lg bg-white/3 border border-white/6 px-3 py-2">
                  <p className="text-[11px] font-mono font-bold text-green-300">{table}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          <Connector />

          {/* Read-only: main payments */}
          <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white/3 border border-white/8">
            <div className="w-3 h-3 rounded-full border-2 border-slate-600 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-slate-400">Main Payments DB <span className="text-[10px] text-slate-600 font-normal ml-1">read-only</span></p>
              <p className="text-[11px] text-slate-600">
                The source <span className="font-mono">dup_payments</span> table. The app reads it during scans to find duplicate candidates — it never writes back to it.
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Message Flow Annotations ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="rounded-2xl border border-white/8 bg-white/2 p-6"
      >
        <p className="text-sm font-bold text-white mb-5 flex items-center gap-2">
          <Layers className="w-4 h-4 text-slate-400" />
          Message Flow: How Agents Communicate
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              title: "Scan trigger → Master Agent → Detectors → DB",
              color: "border-orange-400/20 text-orange-300",
              steps: [
                "User clicks Fetch New Payments in Master Console.",
                "Master Agent receives payment pair(s) as a HumanMessage.",
                "Master Agent invokes all 5 Detector Agents in parallel (separate StateGraph invocations).",
                "Each Detector returns a JSON verdict: { isDuplicate, confidence, reasoning, duplicateType }.",
                "Master Agent aggregates verdicts, computes consensus, writes result to dup_duplicate_payments.",
                "Review entries created in dup_user_reviews for each analyst.",
              ],
            },
            {
              title: "Review Modal → Training Agent → Memory",
              color: "border-violet-400/20 text-violet-300",
              steps: [
                "Analyst opens a payment and types in the Training Agent chat.",
                "Message posted to POST /user-reviews/{user_id}/{review_id}/chat.",
                "Backend loads analyst's full message history from dup_review_messages.",
                "History injected into LangGraph thread (user_id as thread_id) via MemorySaver.",
                "Agent invoked with current message; responds with analysis + optional [[STATUS_UPDATE:...]] tag.",
                "Response + status update stored; global dup_duplicate_payments.status synced.",
              ],
            },
            {
              title: "AI Graph Chat → Text-to-SQL → PostgreSQL",
              color: "border-cyan-400/20 text-cyan-300",
              steps: [
                "Analyst types a natural language question in AI Graph Chat.",
                "Master Agent routes to Text-to-SQL Agent when question is data-oriented.",
                "Text-to-SQL Agent receives schema definition + natural language question.",
                "Agent outputs a raw PostgreSQL SELECT query (no markdown, no code fences).",
                "Backend executes query against PostgreSQL, returns rows to Master Agent.",
                "Master Agent formats results into a human-readable response.",
              ],
            },
            {
              title: "Agent Training → Global Knowledge Base",
              color: "border-fuchsia-400/20 text-fuchsia-300",
              steps: [
                "Team lead opens Agent Training page.",
                "Submits institutional rules (e.g., 'All SEPA SCT Inst payments under €25 are standing orders').",
                "Training Agent (training_agent.py) receives rule as a HumanMessage.",
                "Agent acknowledges, formalises, and stores rule in its MemorySaver thread.",
                "Rule is available to Master Agent and Detectors as injected context on future scans.",
                "Rules are version-tracked: date of creation and any subsequent overrides are logged.",
              ],
            },
          ].map(({ title, color, steps }) => (
            <div key={title} className={`rounded-xl border bg-white/2 p-4 space-y-3 ${color.split(" ")[0]}`}>
              <p className={`text-[11px] font-bold uppercase tracking-wider ${color.split(" ")[1]}`}>{title}</p>
              <ol className="space-y-1.5">
                {steps.map((step, i) => (
                  <li key={i} className="flex gap-2.5 text-[11px] text-slate-400">
                    <span className={`flex-shrink-0 font-mono text-[10px] w-4 text-right ${color.split(" ")[1]} opacity-60`}>{i + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Agent Registry Summary ───────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.6 }}
        className="rounded-2xl border border-white/8 bg-white/2 p-6"
      >
        <p className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-slate-400" />
          Agent Registry — All 9 Agents
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-white/8">
                {["#", "Agent", "File", "Memory", "Temperature", "Role"].map(h => (
                  <th key={h} className="text-left text-[10px] text-slate-500 uppercase tracking-wider font-semibold pb-2 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/4">
              {[
                ["1", "Master Detection Agent",  "master_agent.py",      "None (stateless)", "0.1", "Orchestrator, synthesiser, executive analysis"],
                ["2", "SWIFT Specialist",         "detector_agents.py",  "None (stateless)", "0.1", "SWIFT MT/MX, ISO 20022 duplicate detection"],
                ["3", "ACH Specialist",           "detector_agents.py",  "None (stateless)", "0.1", "ACH trace number & NACHA rules"],
                ["4", "MultiSource Detector",     "detector_agents.py",  "None (stateless)", "0.1", "Cross-system (core banking + ERP + treasury) duplicates"],
                ["5", "FuzzyMatch Engine",        "detector_agents.py",  "None (stateless)", "0.1", "Near-duplicate detection via fuzzy thresholds"],
                ["6", "PatternAnalysis Agent",    "detector_agents.py",  "None (stateless)", "0.1", "Standing orders, retries, batch cycle false-positive removal"],
                ["7", "Review / Training Agent",  "review_agent.py",     "MemorySaver (per user_id)", "0.3", "Per-analyst persistent memory, payment-level chat"],
                ["8", "Training Agent",           "training_agent.py",   "MemorySaver (global)", "0.3", "Platform knowledge base, institutional rule storage"],
                ["9", "Text-to-SQL Agent",        "text_to_sql_agent.py","None (stateless)", "0.0", "Natural language → PostgreSQL SELECT"],
              ].map(([num, name, file, memory, temp, role]) => (
                <tr key={num} className="hover:bg-white/2 transition-colors">
                  <td className="py-2 pr-4 text-slate-600 font-mono">{num}</td>
                  <td className="py-2 pr-4 text-white font-medium">{name}</td>
                  <td className="py-2 pr-4 font-mono text-slate-500">{file}</td>
                  <td className="py-2 pr-4">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] border font-mono ${
                      memory.includes("MemorySaver")
                        ? "border-violet-400/25 text-violet-300 bg-violet-500/8"
                        : "border-slate-700 text-slate-600"
                    }`}>{memory}</span>
                  </td>
                  <td className="py-2 pr-4 font-mono text-slate-400">{temp}</td>
                  <td className="py-2 text-slate-400">{role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

    </div>
  );
}
