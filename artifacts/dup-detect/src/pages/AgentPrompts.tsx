import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  Brain, ChevronDown, ChevronRight, Zap, MemoryStick, Database, BarChart2,
  Shield, Search, Link2, Waves, Clock, Terminal, Loader2,
} from "lucide-react";

interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  icon: string;
  model: string;
  capabilities: string[];
  focus?: string;
  agentInstruction?: string;
  systemPrompt?: string;
}

const ICON_MAP: Record<string, React.ElementType> = {
  master: Brain,
  swift_specialist: Zap,
  ach_specialist: Database,
  multisource: Link2,
  fuzzymatch: Search,
  pattern_analysis: Waves,
  text_to_sql: Terminal,
  graph_agent: BarChart2,
  training_agent: MemoryStick,
};

const COLOR_MAP: Record<string, { card: string; badge: string; icon: string; pill: string }> = {
  master:           { card: "border-violet-500/30 bg-violet-500/5",  badge: "bg-violet-500/15 text-violet-300 border-violet-500/30", icon: "text-violet-400", pill: "bg-violet-500/10 text-violet-300 border-violet-500/20" },
  swift_specialist: { card: "border-blue-500/30 bg-blue-500/5",      badge: "bg-blue-500/15 text-blue-300 border-blue-500/30",       icon: "text-blue-400",   pill: "bg-blue-500/10 text-blue-300 border-blue-500/20" },
  ach_specialist:   { card: "border-cyan-500/30 bg-cyan-500/5",      badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",       icon: "text-cyan-400",   pill: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20" },
  multisource:      { card: "border-emerald-500/30 bg-emerald-500/5",badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",icon:"text-emerald-400",pill: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" },
  fuzzymatch:       { card: "border-amber-500/30 bg-amber-500/5",    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",    icon: "text-amber-400",  pill: "bg-amber-500/10 text-amber-300 border-amber-500/20" },
  pattern_analysis: { card: "border-orange-500/30 bg-orange-500/5",  badge: "bg-orange-500/15 text-orange-300 border-orange-500/30", icon: "text-orange-400", pill: "bg-orange-500/10 text-orange-300 border-orange-500/20" },
  text_to_sql:      { card: "border-pink-500/30 bg-pink-500/5",      badge: "bg-pink-500/15 text-pink-300 border-pink-500/30",       icon: "text-pink-400",   pill: "bg-pink-500/10 text-pink-300 border-pink-500/20" },
  graph_agent:      { card: "border-rose-500/30 bg-rose-500/5",      badge: "bg-rose-500/15 text-rose-300 border-rose-500/30",       icon: "text-rose-400",   pill: "bg-rose-500/10 text-rose-300 border-rose-500/20" },
  training_agent:   { card: "border-teal-500/30 bg-teal-500/5",      badge: "bg-teal-500/15 text-teal-300 border-teal-500/30",       icon: "text-teal-400",   pill: "bg-teal-500/10 text-teal-300 border-teal-500/20" },
};

const GROUP_LABELS: Record<string, { label: string; color: string }> = {
  master:           { label: "Orchestrator", color: "text-violet-400" },
  swift_specialist: { label: "Detector — SWIFT", color: "text-blue-400" },
  ach_specialist:   { label: "Detector — ACH", color: "text-cyan-400" },
  multisource:      { label: "Detector — Multi-Source", color: "text-emerald-400" },
  fuzzymatch:       { label: "Detector — Fuzzy Match", color: "text-amber-400" },
  pattern_analysis: { label: "Detector — Pattern", color: "text-orange-400" },
  text_to_sql:      { label: "Utility — SQL", color: "text-pink-400" },
  graph_agent:      { label: "Utility — Charts", color: "text-rose-400" },
  training_agent:   { label: "Utility — Memory", color: "text-teal-400" },
};

function AgentCard({ agent, defaultOpen = false }: { agent: Agent; defaultOpen?: boolean }) {
  const [promptOpen, setPromptOpen] = useState(false);
  const [instructionOpen, setInstructionOpen] = useState(defaultOpen);
  const colors = COLOR_MAP[agent.id] ?? COLOR_MAP.master;
  const Icon = ICON_MAP[agent.id] ?? Brain;
  const group = GROUP_LABELS[agent.id];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border p-5 space-y-4 ${colors.card}`}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 p-2 rounded-lg border ${colors.badge}`}>
          <Icon className={`w-5 h-5 ${colors.icon}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-foreground">{agent.name}</h3>
            {group && <span className={`text-[10px] font-bold uppercase tracking-widest ${group.color}`}>{group.label}</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{agent.description}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className="text-[10px] font-mono text-muted-foreground/60 bg-secondary/30 px-2 py-0.5 rounded border border-border/40">{agent.model}</span>
        </div>
      </div>

      {/* Focus + capabilities */}
      <div className="space-y-2">
        {agent.focus && (
          <div className="flex items-center gap-2 text-xs">
            <Shield className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
            <span className="text-muted-foreground/60 font-medium">Focus:</span>
            <span className="text-muted-foreground">{agent.focus}</span>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {agent.capabilities.map((cap) => (
            <span key={cap} className={`text-[10px] px-1.5 py-0.5 rounded font-mono border ${colors.pill}`}>{cap}</span>
          ))}
        </div>
      </div>

      {/* Agent Instruction accordion */}
      {agent.agentInstruction && (
        <div className="border border-border/30 rounded-lg overflow-hidden">
          <button
            onClick={() => setInstructionOpen(!instructionOpen)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/20 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              Agent Instruction (per-call framing)
            </div>
            {instructionOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          <AnimatePresence>
            {instructionOpen && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: "auto" }}
                exit={{ height: 0 }}
                className="overflow-hidden"
              >
                <p className="px-3 py-2.5 text-xs text-muted-foreground leading-relaxed bg-black/20 border-t border-border/20">
                  {agent.agentInstruction}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* System Prompt accordion */}
      {agent.systemPrompt && (
        <div className="border border-border/30 rounded-lg overflow-hidden">
          <button
            onClick={() => setPromptOpen(!promptOpen)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/20 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5" />
              Full System Prompt ({agent.systemPrompt.length.toLocaleString()} chars)
            </div>
            {promptOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          <AnimatePresence>
            {promptOpen && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: "auto" }}
                exit={{ height: 0 }}
                className="overflow-hidden"
              >
                <pre className="px-3 py-3 text-[11px] font-mono text-emerald-300/80 leading-relaxed bg-black/30 border-t border-border/20 whitespace-pre-wrap overflow-x-auto max-h-[28rem] overflow-y-auto custom-scrollbar">
                  {agent.systemPrompt}
                </pre>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

export default function AgentPrompts() {
  const { data, isLoading, isError } = useQuery<{ agents: Agent[] }>({
    queryKey: ["/api/agents/list"],
    queryFn: async () => {
      const r = await fetch("/api/agents/list");
      if (!r.ok) throw new Error("Failed to fetch agents");
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const agents = data?.agents ?? [];

  const orchestrators = agents.filter((a) => a.id === "master");
  const detectors = agents.filter((a) => ["swift_specialist","ach_specialist","multisource","fuzzymatch","pattern_analysis"].includes(a.id));
  const utilities = agents.filter((a) => ["text_to_sql","graph_agent","training_agent"].includes(a.id));

  return (
    <div className="space-y-10 pb-16">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
            <Brain className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Agent Prompts</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Live system prompts and per-call instructions powering all 9 Sentinel agents</p>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-3 py-12 justify-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-sm">Loading agents from API…</span>
        </div>
      )}

      {isError && (
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-sm text-red-300">
          Failed to load agents from the API server. Make sure the API server is running.
        </div>
      )}

      {!isLoading && !isError && (
        <>
          {/* Orchestrator */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex-1 h-px bg-border/30" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-violet-400 px-3">Orchestrator · 1 agent</span>
              <div className="flex-1 h-px bg-border/30" />
            </div>
            {orchestrators.map((a) => <AgentCard key={a.id} agent={a} defaultOpen />)}
          </section>

          {/* Detectors */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex-1 h-px bg-border/30" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-blue-400 px-3">Specialist Detectors · {detectors.length} agents</span>
              <div className="flex-1 h-px bg-border/30" />
            </div>
            <div className="grid grid-cols-1 gap-4">
              {detectors.map((a) => <AgentCard key={a.id} agent={a} />)}
            </div>
          </section>

          {/* Utilities */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex-1 h-px bg-border/30" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-teal-400 px-3">Utility Agents · {utilities.length} agents</span>
              <div className="flex-1 h-px bg-border/30" />
            </div>
            <div className="grid grid-cols-1 gap-4">
              {utilities.map((a) => <AgentCard key={a.id} agent={a} />)}
            </div>
          </section>

          <div className="text-center text-xs text-muted-foreground/50 pt-4">
            {agents.length} agents loaded from <code className="text-emerald-400/70">/api/agents/list</code> · All prompts are live from the running TypeScript agent modules
          </div>
        </>
      )}
    </div>
  );
}
