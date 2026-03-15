import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCreateTrainingSession, useSendTrainingMessage } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import {
  BrainCircuit, Database, MessageSquare, Send, Bot, User,
  Copy, Check, Zap, GitBranch, BarChart2, Brain,
  Shield, Network, Blend, Activity, ChevronRight,
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

const CATEGORY_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  orchestrator: { label: "Orchestrator", color: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/30" },
  detector:     { label: "Detector",     color: "text-blue-400",   bg: "bg-blue-400/10",   border: "border-blue-400/30"   },
  utility:      { label: "Utility",      color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/30" },
  memory:       { label: "Memory",       color: "text-green-400",  bg: "bg-green-400/10",  border: "border-green-400/30"  },
};

const AGENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  master:                         Zap,
  text_to_sql:                    Database,
  graph_chart:                    BarChart2,
  training:                       Brain,
  detector_swift_specialist:      Shield,
  detector_ach_specialist:        GitBranch,
  detector_multisource_detector:  Network,
  detector_fuzzymatch_engine:     Blend,
  detector_patternanalysis_agent: Activity,
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
  const sendMessage  = useSendTrainingMessage();

  const [openAgent, setOpenAgent]         = useState<AgentDef | null>(null);
  const [activeTab, setActiveTab]         = useState<"prompt" | "train">("prompt");
  const [copied, setCopied]               = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages]           = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput]                 = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleOpen = (agent: AgentDef) => {
    setOpenAgent(agent);
    setActiveTab("prompt");
    setCopied(false);
    setActiveSessionId(null);
    setMessages([]);
    setInput("");
  };

  const handleClose = () => {
    setOpenAgent(null);
  };

  const handleCopy = () => {
    if (!openAgent) return;
    navigator.clipboard.writeText(openAgent.systemPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartSession = () => {
    if (!openAgent) return;
    createSession.mutate(
      {
        data: {
          trainingType: "duplicate_definition",
          title: `Training: ${openAgent.name} — ${new Date().toLocaleDateString()}`,
        },
      },
      {
        onSuccess: (data) => {
          setActiveSessionId(data.id);
          setMessages([{
            role: "assistant",
            content: `Training session started for **${openAgent.name}**. What would you like to teach this agent? You can define custom duplicate rules, schema details, thresholds, or special-case logic.`,
          }]);
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
          setMessages(prev => [...prev, { role: "assistant", content: "Error communicating with the training agent." }]);
        },
      }
    );
  };

  const grouped = CATEGORY_ORDER.reduce<Record<string, AgentDef[]>>((acc, cat) => {
    acc[cat] = agents.filter(a => a.category === cat);
    return acc;
  }, {});

  const meta = openAgent ? CATEGORY_META[openAgent.category] : null;
  const Icon = openAgent ? (AGENT_ICONS[openAgent.id] ?? BrainCircuit) : BrainCircuit;

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Agent Training</h1>
        <p className="text-muted-foreground mt-1">
          Inspect system prompts for every agent and start training sessions to customise their behaviour.
        </p>
      </div>

      {/* Agent grid — one section per category */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          Loading agents…
        </div>
      ) : (
        CATEGORY_ORDER.map(cat => {
          const items = grouped[cat];
          if (!items?.length) return null;
          const m = CATEGORY_META[cat];
          return (
            <section key={cat}>
              <div className="flex items-center gap-2 mb-3">
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border",
                  m.bg, m.border, m.color
                )}>
                  {m.label}
                </span>
                <div className="flex-1 h-px bg-border/40" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {items.map(agent => {
                  const AgentIcon = AGENT_ICONS[agent.id] ?? BrainCircuit;
                  return (
                    <motion.button
                      key={agent.id}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleOpen(agent)}
                      className="text-left p-4 rounded-xl border border-border/50 bg-card hover:border-border hover:bg-secondary/30 transition-colors group relative overflow-hidden"
                    >
                      <div className={cn(
                        "absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-20 pointer-events-none -translate-y-1/2 translate-x-1/2",
                        m.bg
                      )} />

                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center border mb-3 shadow-sm",
                        m.bg, m.border
                      )}>
                        <AgentIcon className={cn("w-5 h-5", m.color)} />
                      </div>

                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground leading-tight">{agent.name}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                            {agent.description}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 mt-0.5 transition-colors" />
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground/60">
                          {agent.focus}
                        </span>
                        {agent.isTrainable && (
                          <span className="ml-auto text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-green-400/10 border border-green-400/20 text-green-400">
                            Trainable
                          </span>
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </section>
          );
        })
      )}

      {/* ── Agent detail modal ── */}
      <Dialog open={!!openAgent} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <DialogContent className="max-w-3xl w-full h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          {openAgent && meta && (
            <>
              {/* Modal header */}
              <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50 bg-secondary/10 shrink-0">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "w-11 h-11 rounded-xl flex items-center justify-center border shrink-0",
                    meta.bg, meta.border
                  )}>
                    <Icon className={cn("w-5 h-5", meta.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <DialogTitle className="text-lg font-display font-bold text-foreground">
                        {openAgent.name}
                      </DialogTitle>
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
                        meta.bg, meta.border, meta.color
                      )}>
                        {meta.label}
                      </span>
                      {openAgent.isTrainable && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-green-400/10 border-green-400/30 text-green-400">
                          Trainable
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{openAgent.description}</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">
                      Focus: <span className="text-muted-foreground">{openAgent.focus}</span>
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
                  {openAgent.isTrainable && (
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
              </DialogHeader>

              {/* Tab content */}
              <AnimatePresence mode="wait">
                {activeTab === "prompt" && (
                  <motion.div
                    key="prompt"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                    className="flex-1 flex flex-col overflow-hidden min-h-0"
                  >
                    <div className="flex items-center justify-between px-6 py-2.5 border-b border-border/30 bg-secondary/5 shrink-0">
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
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                      <pre className="text-sm text-foreground/90 font-mono leading-relaxed whitespace-pre-wrap break-words bg-secondary/10 rounded-xl p-4 border border-border/30">
                        {openAgent.systemPrompt}
                      </pre>
                    </div>
                    {openAgent.isTrainable && (
                      <div className="px-6 py-3 border-t border-border/30 bg-secondary/5 shrink-0">
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

                {activeTab === "train" && openAgent.isTrainable && (
                  <motion.div
                    key="train"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                    className="flex-1 flex flex-col overflow-hidden min-h-0"
                  >
                    {!activeSessionId ? (
                      <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
                        <div className="w-16 h-16 rounded-full bg-secondary/30 flex items-center justify-center mb-5">
                          <MessageSquare className="w-8 h-8 opacity-40" />
                        </div>
                        <h3 className="text-lg font-display font-medium mb-2">Ready to Train</h3>
                        <p className="text-sm text-muted-foreground max-w-sm mb-6">
                          Start an interactive session to teach{" "}
                          <span className="text-foreground font-medium">{openAgent.name}</span> custom
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
                        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar bg-gradient-to-b from-transparent to-secondary/5 min-h-0">
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
                                  "p-3.5 rounded-2xl text-sm leading-relaxed shadow-sm",
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
                              <div className="p-3.5 rounded-2xl bg-card border border-border/60 rounded-tl-sm flex items-center gap-1.5">
                                <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" />
                                <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:0.2s]" />
                                <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:0.4s]" />
                              </div>
                            </div>
                          )}
                          <div ref={bottomRef} />
                        </div>

                        <div className="p-4 border-t border-border/50 bg-card shrink-0">
                          <form
                            onSubmit={e => { e.preventDefault(); handleSend(); }}
                            className="flex gap-3"
                          >
                            <input
                              type="text"
                              value={input}
                              onChange={e => setInput(e.target.value)}
                              placeholder={`Teach ${openAgent.name} something new…`}
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
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
