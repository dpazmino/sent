import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCreateTrainingSession, useSendTrainingMessage } from "@workspace/api-client-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  BrainCircuit, Database, MessageSquare, Send, Bot, User,
  Copy, Check, ChevronRight, Zap, GitBranch, BarChart2, Brain,
  Shield, Network, Blend, Activity, BookOpen
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface AgentDef {
  id: string;
  name: string;
  category: "orchestrator" | "detector" | "utility" | "memory";
  description: string;
  focus: string;
  systemPrompt: string;
  isTrainable: boolean;
}

const CATEGORY_META: Record<string, { label: string; color: string; bg: string }> = {
  orchestrator: { label: "Orchestrator", color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/30" },
  detector:     { label: "Detector",     color: "text-blue-400",   bg: "bg-blue-400/10 border-blue-400/30"   },
  utility:      { label: "Utility",      color: "text-purple-400", bg: "bg-purple-400/10 border-purple-400/30" },
  memory:       { label: "Memory",       color: "text-green-400",  bg: "bg-green-400/10 border-green-400/30"  },
};

const AGENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  master:                        Zap,
  text_to_sql:                   Database,
  graph_chart:                   BarChart2,
  training:                      Brain,
  detector_swift_specialist:     Shield,
  detector_ach_specialist:       GitBranch,
  detector_multisource_detector: Network,
  detector_fuzzymatch_engine:    Blend,
  detector_patternanalysis_agent:Activity,
};

const CATEGORY_ORDER = ["orchestrator", "memory", "utility", "detector"];

async function fetchAgents(): Promise<AgentDef[]> {
  const res = await fetch("/api/agents/list");
  if (!res.ok) throw new Error("Failed to load agents");
  const data = await res.json();
  return data.agents;
}

export default function AgentTraining() {
  const { data: agents = [], isLoading } = useQuery<AgentDef[]>({
    queryKey: ["agents-list"],
    queryFn: fetchAgents,
  });

  const createSession = useCreateTrainingSession();
  const sendMessage = useSendTrainingMessage();

  const [selectedAgent, setSelectedAgent] = useState<AgentDef | null>(null);
  const [activeTab, setActiveTab] = useState<"prompt" | "train">("prompt");
  const [copied, setCopied] = useState(false);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const grouped = CATEGORY_ORDER.reduce<Record<string, AgentDef[]>>((acc, cat) => {
    acc[cat] = agents.filter(a => a.category === cat);
    return acc;
  }, {});

  const handleSelectAgent = (agent: AgentDef) => {
    setSelectedAgent(agent);
    setActiveTab("prompt");
    setActiveSessionId(null);
    setMessages([]);
    setInput("");
  };

  const handleCopy = () => {
    if (!selectedAgent) return;
    navigator.clipboard.writeText(selectedAgent.systemPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartSession = () => {
    if (!selectedAgent) return;
    createSession.mutate(
      {
        data: {
          trainingType: "duplicate_definition",
          title: `Training: ${selectedAgent.name} — ${new Date().toLocaleDateString()}`,
        },
      },
      {
        onSuccess: (data) => {
          setActiveSessionId(data.id);
          setMessages([
            {
              role: "assistant",
              content: `Training session started for **${selectedAgent.name}**. What would you like to teach this agent? You can define custom duplicate rules, schema details, thresholds, or special-case logic.`,
            },
          ]);
        },
      }
    );
  };

  const handleSend = () => {
    if (!input.trim() || !activeSessionId) return;
    const userMsg = input;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    sendMessage.mutate(
      { id: activeSessionId, data: { message: userMsg } },
      {
        onSuccess: (data) => {
          setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
        },
        onError: () => {
          setMessages(prev => [
            ...prev,
            { role: "assistant", content: "Error communicating with the training agent." },
          ]);
        },
      }
    );
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="mb-6 shrink-0">
        <h1 className="text-3xl font-display font-bold text-foreground">Agent Training</h1>
        <p className="text-muted-foreground mt-1">
          Inspect system prompts for every agent and start training sessions to customise their behaviour.
        </p>
      </div>

      <div className="flex gap-5 flex-1 min-h-0">
        {/* ── LEFT: Agent roster ── */}
        <div className="w-72 shrink-0 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-1">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              Loading agents…
            </div>
          ) : (
            CATEGORY_ORDER.map(cat => {
              const items = grouped[cat];
              if (!items?.length) return null;
              const meta = CATEGORY_META[cat];
              return (
                <div key={cat}>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">
                    {meta.label}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {items.map(agent => {
                      const Icon = AGENT_ICONS[agent.id] ?? BrainCircuit;
                      const isSelected = selectedAgent?.id === agent.id;
                      return (
                        <button
                          key={agent.id}
                          onClick={() => handleSelectAgent(agent)}
                          className={cn(
                            "w-full text-left p-3 rounded-xl border transition-all duration-200 group",
                            isSelected
                              ? "bg-primary/10 border-primary/40 shadow-[0_0_16px_rgba(33,150,243,0.12)]"
                              : "bg-card border-border/50 hover:border-border hover:bg-secondary/30"
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={cn(
                              "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border",
                              isSelected ? "bg-primary/20 border-primary/30" : `${meta.bg}`
                            )}>
                              <Icon className={cn("w-3.5 h-3.5", isSelected ? "text-primary" : meta.color)} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold text-foreground truncate leading-tight">
                                {agent.name}
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                                {agent.focus}
                              </div>
                            </div>
                            <ChevronRight className={cn(
                              "w-3.5 h-3.5 shrink-0 transition-transform",
                              isSelected ? "text-primary rotate-90" : "text-muted-foreground/40 group-hover:translate-x-0.5"
                            )} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── RIGHT: Detail panel ── */}
        {!selectedAgent ? (
          <Card className="flex-1 flex flex-col items-center justify-center text-center border-border/50 bg-gradient-to-b from-transparent to-secondary/5 p-10">
            <div className="w-20 h-20 rounded-full bg-secondary/30 flex items-center justify-center mb-5 shadow-inner">
              <BookOpen className="w-10 h-10 opacity-40" />
            </div>
            <h3 className="text-xl font-display font-medium text-foreground mb-2">Select an Agent</h3>
            <p className="text-muted-foreground max-w-sm text-sm">
              Choose any agent from the list to inspect its system prompt and optionally start a training session.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {agents.slice(0, 4).map(a => (
                <button
                  key={a.id}
                  onClick={() => handleSelectAgent(a)}
                  className="px-3 py-1.5 rounded-lg bg-secondary/50 border border-border/50 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                >
                  {a.name}
                </button>
              ))}
            </div>
          </Card>
        ) : (
          <Card className="flex-1 flex flex-col border-border/50 overflow-hidden">
            {/* Agent header */}
            <div className="p-5 border-b border-border/50 bg-secondary/10 shrink-0">
              <div className="flex items-start gap-3">
                {(() => {
                  const Icon = AGENT_ICONS[selectedAgent.id] ?? BrainCircuit;
                  const meta = CATEGORY_META[selectedAgent.category];
                  return (
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center border shrink-0", meta.bg)}>
                      <Icon className={cn("w-5 h-5", meta.color)} />
                    </div>
                  );
                })()}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-display font-bold text-foreground">{selectedAgent.name}</h2>
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
                      CATEGORY_META[selectedAgent.category].bg,
                      CATEGORY_META[selectedAgent.category].color
                    )}>
                      {CATEGORY_META[selectedAgent.category].label}
                    </span>
                    {selectedAgent.isTrainable && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-green-400/10 border-green-400/30 text-green-400">
                        Trainable
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{selectedAgent.description}</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Focus: <span className="text-muted-foreground">{selectedAgent.focus}</span>
                  </p>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mt-4">
                <button
                  onClick={() => setActiveTab("prompt")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    activeTab === "prompt"
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  )}
                >
                  System Prompt
                </button>
                {selectedAgent.isTrainable && (
                  <button
                    onClick={() => setActiveTab("train")}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      activeTab === "train"
                        ? "bg-primary/20 text-primary border border-primary/30"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    )}
                  >
                    Train
                  </button>
                )}
              </div>
            </div>

            {/* Tab content */}
            <AnimatePresence mode="wait">
              {activeTab === "prompt" && (
                <motion.div
                  key="prompt"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="flex-1 flex flex-col overflow-hidden"
                >
                  <div className="flex items-center justify-between px-5 py-2.5 border-b border-border/30 bg-secondary/5 shrink-0">
                    <span className="text-xs text-muted-foreground font-mono">system_prompt.txt</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopy}
                      className="gap-1.5 h-7 text-xs"
                    >
                      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
                    <pre className="text-sm text-foreground/90 font-mono leading-relaxed whitespace-pre-wrap break-words bg-secondary/10 rounded-xl p-4 border border-border/30">
                      {selectedAgent.systemPrompt}
                    </pre>
                  </div>
                  {selectedAgent.isTrainable && (
                    <div className="p-4 border-t border-border/30 bg-secondary/5 shrink-0">
                      <button
                        onClick={() => setActiveTab("train")}
                        className="w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        Want to customise this agent's behaviour? →{" "}
                        <span className="text-primary underline underline-offset-2">Open training session</span>
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === "train" && selectedAgent.isTrainable && (
                <motion.div
                  key="train"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="flex-1 flex flex-col overflow-hidden"
                >
                  {!activeSessionId ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
                      <div className="w-16 h-16 rounded-full bg-secondary/30 flex items-center justify-center mb-5">
                        <MessageSquare className="w-8 h-8 opacity-40" />
                      </div>
                      <h3 className="text-lg font-display font-medium mb-2">Ready to Train</h3>
                      <p className="text-sm text-muted-foreground max-w-sm mb-6">
                        Start an interactive session to teach{" "}
                        <span className="text-foreground font-medium">{selectedAgent.name}</span> custom
                        logic, schema details, or institution-specific rules.
                      </p>
                      <Button
                        onClick={handleStartSession}
                        disabled={createSession.isPending}
                        className="gap-2"
                      >
                        <BrainCircuit className="w-4 h-4" />
                        {createSession.isPending ? "Starting…" : "Start Training Session"}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar bg-gradient-to-b from-transparent to-secondary/5">
                        <AnimatePresence initial={false}>
                          {messages.map((msg, i) => (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, y: 8, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              className={cn(
                                "flex gap-3 max-w-[88%]",
                                msg.role === "user" ? "ml-auto flex-row-reverse" : ""
                              )}
                            >
                              <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm",
                                msg.role === "user"
                                  ? "bg-secondary border-border text-muted-foreground"
                                  : "bg-primary/20 border-primary/30 text-primary"
                              )}>
                                {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                              </div>
                              <div className={cn(
                                "p-4 rounded-2xl text-sm leading-relaxed shadow-sm",
                                msg.role === "user"
                                  ? "bg-secondary/80 text-secondary-foreground border border-border/50 rounded-tr-sm"
                                  : "bg-card border border-border/60 text-card-foreground rounded-tl-sm"
                              )}>
                                {msg.content}
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                        {sendMessage.isPending && (
                          <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
                              <Bot className="w-4 h-4 text-primary" />
                            </div>
                            <div className="p-4 rounded-2xl bg-card border border-border/60 rounded-tl-sm flex items-center gap-1.5">
                              <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" />
                              <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:0.2s]" />
                              <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:0.4s]" />
                            </div>
                          </div>
                        )}
                        <div ref={bottomRef} />
                      </div>

                      <div className="p-4 border-t border-border/50 bg-card shrink-0">
                        <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex gap-3">
                          <input
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder={`Teach ${selectedAgent.name} something new…`}
                            className="flex-1 bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                            disabled={sendMessage.isPending}
                          />
                          <Button
                            type="submit"
                            disabled={!input.trim() || sendMessage.isPending}
                            className="w-12 h-auto rounded-xl p-0 aspect-square shrink-0"
                          >
                            <Send className="w-5 h-5" />
                          </Button>
                        </form>
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        )}
      </div>
    </div>
  );
}
