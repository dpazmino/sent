import { useState, Fragment, useRef, useEffect } from "react";
import {
  useGetDuplicatePayments,
  useExportDuplicates,
  useChatWithAgent,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProbabilityBadge } from "@/components/ui/ProbabilityBadge";
import { formatCurrency } from "@/lib/utils";
import {
  Download, Search, SlidersHorizontal, Eye,
  ChevronDown, ChevronUp, ArrowRight, CheckCircle2,
  Bot, Send, X, MessageSquare, User, Brain,
  Shield, GitBranch, Network, Blend, Activity,
  ThumbsUp, ThumbsDown, BookOpen, Loader2, Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ───────────────────────────────────────────────────────────────────

type DuplicateItem = {
  id: string;
  payment1Id: string;
  payment2Id: string;
  paymentDate1: string;
  paymentDate2: string;
  paymentSystem: string;
  duplicateType: string;
  amount: number;
  currency: string;
  probability: number;
  status: string;
  senderBIC?: string;
  receiverBIC?: string;
  originatorCountry?: string;
  beneficiaryCountry?: string;
  matchedFields?: string[];
  notes?: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  memorySaved?: boolean;
};

type DetectorOpinion = {
  agentName: string;
  isDuplicate: boolean;
  confidence: number;
  reasoning: string;
  duplicateType?: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  pending:              "bg-yellow-400/15 text-yellow-300 border-yellow-400/30 hover:bg-yellow-400/25",
  under_review:         "bg-blue-400/15 text-blue-300 border-blue-400/30 hover:bg-blue-400/25",
  confirmed_duplicate:  "bg-red-400/15 text-red-300 border-red-400/30 hover:bg-red-400/25",
  dismissed:            "bg-green-400/15 text-green-300 border-green-400/30 hover:bg-green-400/25",
};

const DETECTOR_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  SWIFT_Specialist:          Shield,
  ACH_Specialist:            GitBranch,
  MultiSource_Detector:      Network,
  FuzzyMatch_Engine:         Blend,
  PatternAnalysis_Agent:     Activity,
};

const SUGGESTIONS = [
  "Which duplicate type is most common?",
  "What's the highest risk payment pair?",
  "Summarise the ACH duplicates",
  "Which BICs appear most often?",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderContent(text: string) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith("```")) {
      const code = part.replace(/^```[^\n]*\n?/, "").replace(/```$/, "");
      return (
        <pre key={i} className="bg-background/60 border border-border/50 rounded-lg p-3 text-xs font-mono overflow-x-auto my-2 text-foreground">
          {code}
        </pre>
      );
    }
    return (
      <span key={i} className="whitespace-pre-wrap">
        {part.split(/(\*\*[^*]+\*\*)/g).map((chunk, j) =>
          chunk.startsWith("**") && chunk.endsWith("**")
            ? <strong key={j} className="font-semibold text-foreground">{chunk.slice(2, -2)}</strong>
            : chunk
        )}
      </span>
    );
  });
}

function formatDate(d: string) {
  try { return new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return d || "—"; }
}

// ─── FieldRow (compare panel) ─────────────────────────────────────────────────

function FieldRow({ label, val1, val2, matched }: { label: string; val1: string; val2: string; matched: boolean }) {
  return (
    <div className={`grid grid-cols-[120px_1fr_1fr] gap-2 px-3 py-2 rounded-lg text-sm ${matched ? "bg-primary/10 border border-primary/20" : "bg-secondary/10"}`}>
      <div className="flex items-center gap-1 text-muted-foreground font-medium text-xs">
        {matched && <CheckCircle2 className="w-3 h-3 text-primary flex-shrink-0" />}
        <span className={matched ? "text-primary" : ""}>{label}</span>
      </div>
      <div className={`font-mono text-xs break-all ${matched ? "text-primary font-semibold" : "text-foreground"}`}>{val1 || "—"}</div>
      <div className={`font-mono text-xs break-all ${matched ? "text-primary font-semibold" : "text-foreground"}`}>{val2 || "—"}</div>
    </div>
  );
}

// ─── ReviewModal ──────────────────────────────────────────────────────────────

function ReviewModal({ item, onClose }: { item: DuplicateItem; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [opinions, setOpinions] = useState<DetectorOpinion[]>([]);
  const [convId, setConvId] = useState<string | undefined>(undefined);
  const [input, setInput] = useState("");
  const [mobileTab, setMobileTab] = useState<"details" | "chat">("chat");
  const [loading, setLoading] = useState(false);
  const [initialising, setInitialising] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const matched = new Set((item.matchedFields ?? []).map(f => f.toLowerCase()));

  // Auto-load analysis on open
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setInitialising(true);
      try {
        const res = await fetch("/api/agents/payment-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ duplicateId: item.id }),
        });
        const data = await res.json();
        if (cancelled) return;
        setConvId(data.conversationId);
        setOpinions(data.detectorOpinions ?? []);
        setMessages([{ role: "assistant", content: data.response }]);
      } catch {
        if (!cancelled) setMessages([{ role: "assistant", content: "Error loading analysis. Please try again." }]);
      } finally {
        if (!cancelled) setInitialising(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [item.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setLoading(true);
    try {
      const res = await fetch("/api/agents/payment-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duplicateId: item.id, message: msg, conversationId: convId }),
      });
      const data = await res.json();
      setConvId(data.conversationId);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.response,
        memorySaved: data.memorySaved,
      }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Error communicating with agent. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 16, opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="bg-card border border-border/60 rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Modal Header ── */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-border/50 bg-secondary/20 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-display font-bold text-foreground">
                Payment Review
              </h2>
              <span className="font-mono text-sm text-muted-foreground">
                {item.payment1Id} ↔ {item.payment2Id}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-secondary text-muted-foreground border border-border/50">
                {item.paymentSystem}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${STATUS_STYLES[item.status] ?? "bg-secondary text-muted-foreground border-border/50"}`}>
                {item.status.replace(/_/g, " ")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatCurrency(item.amount, item.currency)} · {item.duplicateType.replace(/_/g, " ")} · {Math.round(item.probability * 100)}% probability
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Mobile tab switcher (hidden on lg+) ── */}
        <div className="flex lg:hidden border-b border-border/50 shrink-0">
          <button
            onClick={() => setMobileTab("details")}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${mobileTab === "details" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}
          >
            Payment Details
          </button>
          <button
            onClick={() => setMobileTab("chat")}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${mobileTab === "chat" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}
          >
            AI Review
          </button>
        </div>

        {/* ── Body: responsive panels ── */}
        <div className="flex flex-col lg:flex-row flex-1 min-h-0 lg:divide-x lg:divide-border/50 overflow-hidden">

          {/* ── LEFT: Payment data panel ── */}
          <div className={`lg:w-[42%] flex flex-col min-h-0 flex-shrink-0 ${mobileTab === "chat" ? "hidden lg:flex" : "flex"}`}>
            <div className="px-4 py-2.5 bg-secondary/10 border-b border-border/30 flex-shrink-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment Details</p>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {/* Column headers */}
              <div className="grid grid-cols-[120px_1fr_1fr] gap-2 px-3 py-2.5 bg-secondary/20 border-b border-border/30 text-[10px] font-bold uppercase tracking-wider text-muted-foreground sticky top-0">
                <div>Field</div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                  <span className="truncate">{item.payment1Id}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
                  <span className="truncate">{item.payment2Id}</span>
                </div>
              </div>

              {/* Field rows */}
              <div className="p-3 space-y-1.5">
                <FieldRow label="Date"        val1={formatDate(item.paymentDate1)} val2={formatDate(item.paymentDate2)} matched={matched.has("value_date") || matched.has("payment_date")} />
                <FieldRow label="Amount"      val1={formatCurrency(item.amount, item.currency)} val2={formatCurrency(item.amount, item.currency)} matched={matched.has("amount")} />
                <FieldRow label="Currency"    val1={item.currency}                 val2={item.currency}                matched={matched.has("currency")} />
                <FieldRow label="Sender BIC"  val1={item.senderBIC ?? "—"}         val2={item.senderBIC ?? "—"}        matched={matched.has("sender_bic")} />
                <FieldRow label="Receiver BIC" val1={item.receiverBIC ?? "—"}      val2={item.receiverBIC ?? "—"}      matched={matched.has("receiver_bic")} />
                <FieldRow label="Originator"  val1={item.originatorCountry ?? "—"} val2={item.originatorCountry ?? "—"} matched={matched.has("originator_country")} />
                <FieldRow label="Beneficiary" val1={item.beneficiaryCountry ?? "—"} val2={item.beneficiaryCountry ?? "—"} matched={matched.has("beneficiary_country")} />
                <FieldRow label="System"      val1={item.paymentSystem}            val2={item.paymentSystem}           matched={false} />
                <FieldRow label="Type"        val1={item.duplicateType.replace(/_/g, " ")} val2={item.duplicateType.replace(/_/g, " ")} matched={false} />
              </div>

              {/* Matched fields */}
              {(item.matchedFields ?? []).length > 0 && (
                <div className="mx-3 mb-3 p-3 rounded-xl border border-primary/20 bg-primary/5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-2">Matched Fields</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(item.matchedFields ?? []).map(f => (
                      <span key={f} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary border border-primary/25 uppercase tracking-wide">
                        {f.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Detector opinions */}
              {opinions.length > 0 && (
                <div className="mx-3 mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Detector Agent Verdicts</p>
                  <div className="space-y-1.5">
                    {opinions.map((op, idx) => {
                      const Icon = DETECTOR_ICONS[op.agentName] ?? Brain;
                      return (
                        <div key={`${op.agentName}-${op.paymentId ?? idx}`} className={`flex items-start gap-2 p-2 rounded-lg border text-xs ${op.isDuplicate ? "bg-red-400/8 border-red-400/20" : "bg-green-400/8 border-green-400/20"}`}>
                          <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${op.isDuplicate ? "text-red-400" : "text-green-400"}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="font-semibold text-foreground">{op.agentName.replace(/_/g, " ")}</span>
                              <span className={`text-[10px] font-bold ${op.isDuplicate ? "text-red-400" : "text-green-400"}`}>
                                {Math.round(op.confidence * 100)}%
                              </span>
                            </div>
                            <p className="text-muted-foreground leading-snug line-clamp-2">{op.reasoning}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: Training Agent chat ── */}
          <div className={`flex-1 flex flex-col min-h-0 ${mobileTab === "details" ? "hidden lg:flex" : "flex"}`}>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-2.5 bg-secondary/10 border-b border-border/30 flex-shrink-0">
              <div className="w-7 h-7 rounded-full bg-green-400/20 border border-green-400/30 flex items-center justify-center">
                <Brain className="w-3.5 h-3.5 text-green-400" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">Training Agent</p>
                <p className="text-[10px] text-green-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                  Consulting 5 detector agents · Memory enabled
                </p>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Feedback is saved to agent memory</span>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {initialising ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="flex justify-center mb-3">
                      <div className="w-8 h-8 rounded-full bg-green-400/20 border border-green-400/30 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 text-green-400 animate-spin" />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">Consulting 5 detector agents…</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">SWIFT Specialist · ACH Specialist · FuzzyMatch · MultiSource · PatternAnalysis</p>
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border ${
                        msg.role === "assistant"
                          ? "bg-green-400/20 border-green-400/30"
                          : "bg-secondary border-border"
                      }`}>
                        {msg.role === "assistant"
                          ? <Brain className="w-3.5 h-3.5 text-green-400" />
                          : <User className="w-3.5 h-3.5 text-muted-foreground" />
                        }
                      </div>
                      <div className={`max-w-[84%] flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                        <div className={`rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : "bg-secondary/50 border border-border/50 text-foreground rounded-tl-sm"
                        }`}>
                          {msg.role === "assistant" ? renderContent(msg.content) : msg.content}
                        </div>
                        {msg.memorySaved && (
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-400/10 border border-green-400/20">
                            <BookOpen className="w-3 h-3 text-green-400" />
                            <span className="text-[10px] text-green-400 font-medium">Saved to agent memory</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {loading && (
                    <div className="flex gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-green-400/20 border border-green-400/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Brain className="w-3.5 h-3.5 text-green-400" />
                      </div>
                      <div className="bg-secondary/50 border border-border/50 rounded-xl rounded-tl-sm px-4 py-3">
                        <div className="flex gap-1 items-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </>
              )}
            </div>

            {/* Quick response buttons */}
            {!initialising && messages.length === 1 && !loading && (
              <div className="px-4 pb-2 flex flex-wrap gap-2">
                {[
                  { icon: ThumbsUp, label: "I agree — this is a duplicate", color: "border-red-400/30 bg-red-400/10 text-red-300 hover:bg-red-400/20" },
                  { icon: ThumbsDown, label: "I disagree — explain why", color: "border-green-400/30 bg-green-400/10 text-green-300 hover:bg-green-400/20" },
                  { icon: Sparkles, label: "What's the strongest evidence?", color: "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20" },
                  { icon: Brain, label: "Which agent is most confident?", color: "border-purple-400/30 bg-purple-400/10 text-purple-300 hover:bg-purple-400/20" },
                ].map(({ icon: Icon, label, color }) => (
                  <button
                    key={label}
                    onClick={() => send(label)}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${color}`}
                  >
                    <Icon className="w-3 h-3" />
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            {!initialising && (
              <div className="px-4 pb-4 pt-2 border-t border-border/50 flex-shrink-0">
                <div className="flex gap-2 items-end bg-secondary/30 border border-border rounded-xl px-3 py-2 focus-within:border-green-400/50 focus-within:ring-1 focus-within:ring-green-400/20 transition-all">
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Agree, disagree, or ask for more detail — your feedback is saved…"
                    rows={1}
                    className="flex-1 bg-transparent outline-none text-sm resize-none text-foreground placeholder:text-muted-foreground leading-relaxed max-h-28"
                  />
                  <button
                    onClick={() => send()}
                    disabled={!input.trim() || loading}
                    className="w-7 h-7 rounded-lg bg-green-500 flex items-center justify-center text-white hover:bg-green-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                  Feedback containing "agree", "disagree", "because", "rule" etc. is automatically saved to agent memory
                </p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Agent Chat Panel (existing slide-in) ────────────────────────────────────

function AgentChatPanel({ onClose, pageContext }: { onClose: () => void; pageContext: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hello! I'm the **Master Detection Agent**. I have full context of the duplicate payments currently loaded on this page.\n\nAsk me anything — which pairs have the highest risk, what patterns I see, or why a specific payment was flagged." },
  ]);
  const [input, setInput] = useState("");
  const [convId, setConvId] = useState<string | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);

  const chatMutation = useChatWithAgent({
    mutation: {
      onSuccess: (res) => {
        setConvId(res.conversationId);
        setMessages(prev => [...prev, { role: "assistant", content: res.response }]);
      },
      onError: () => {
        setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I encountered an error. Please try again." }]);
      },
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatMutation.isPending]);

  const send = (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || chatMutation.isPending) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    chatMutation.mutate({
      data: { message: `[PAGE CONTEXT]\n${pageContext}\n\n[USER QUESTION]\n${msg}`, agentType: "master", conversationId: convId },
    });
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <motion.div
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "spring", damping: 28, stiffness: 260 }}
      className="fixed top-0 right-0 h-full w-[420px] z-50 flex flex-col bg-card border-l border-border shadow-2xl"
    >
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-secondary/20 flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
          <Bot className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground">Master Detection Agent</div>
          <div className="text-[11px] text-primary flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
            Online · Duplicate Findings context loaded
          </div>
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${msg.role === "assistant" ? "bg-primary/20 border border-primary/30" : "bg-secondary border border-border"}`}>
              {msg.role === "assistant" ? <Bot className="w-3.5 h-3.5 text-primary" /> : <User className="w-3.5 h-3.5 text-muted-foreground" />}
            </div>
            <div className={`max-w-[82%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-secondary/50 border border-border/50 text-foreground rounded-tl-sm"}`}>
              {msg.role === "assistant" ? renderContent(msg.content) : msg.content}
            </div>
          </div>
        ))}
        {chatMutation.isPending && (
          <div className="flex gap-2.5">
            <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Bot className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="bg-secondary/50 border border-border/50 rounded-xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1 items-center">
                {[0, 150, 300].map(d => <span key={d} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {messages.length === 1 && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map(s => (
            <button key={s} onClick={() => send(s)} className="text-xs px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="px-4 pb-4 pt-2 border-t border-border/50 flex-shrink-0">
        <div className="flex gap-2 items-end bg-secondary/30 border border-border rounded-xl px-3 py-2 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about these duplicate payments…"
            rows={1}
            className="flex-1 bg-transparent outline-none text-sm resize-none text-foreground placeholder:text-muted-foreground leading-relaxed max-h-32"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || chatMutation.isPending}
            className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
          Agent has access to all <span className="text-foreground font-medium">500</span> duplicate records
        </p>
      </div>
    </motion.div>
  );
}

// ─── Inline compare panel (existing expand row) ───────────────────────────────

function DetailPanel({ item }: { item: DuplicateItem }) {
  const matched = new Set((item.matchedFields ?? []).map(f => f.toLowerCase()));
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="px-6 pb-6 pt-2">
        <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
          <div className="grid grid-cols-[140px_1fr_1fr] gap-3 px-4 py-3 bg-secondary/30 border-b border-border/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <div>Field</div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-400" />{item.payment1Id}
              <span className="text-[10px] normal-case text-muted-foreground font-normal">(original)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-orange-400" />{item.payment2Id}
              <span className="text-[10px] normal-case text-muted-foreground font-normal">(suspected dup)</span>
            </div>
          </div>
          <div className="p-3 space-y-1.5">
            <FieldRow label="Payment Date" val1={formatDate(item.paymentDate1)} val2={formatDate(item.paymentDate2)} matched={matched.has("value_date") || matched.has("payment_date")} />
            <FieldRow label="Amount"       val1={formatCurrency(item.amount, item.currency)} val2={formatCurrency(item.amount, item.currency)} matched={matched.has("amount")} />
            <FieldRow label="Currency"     val1={item.currency}       val2={item.currency}       matched={matched.has("currency")} />
            <FieldRow label="Sender BIC"   val1={item.senderBIC ?? "—"}  val2={item.senderBIC ?? "—"}  matched={matched.has("sender_bic")} />
            <FieldRow label="Receiver BIC" val1={item.receiverBIC ?? "—"} val2={item.receiverBIC ?? "—"} matched={matched.has("receiver_bic")} />
            <FieldRow label="Originator"   val1={item.originatorCountry ?? "—"} val2={item.originatorCountry ?? "—"} matched={matched.has("originator_country")} />
            <FieldRow label="Beneficiary"  val1={item.beneficiaryCountry ?? "—"} val2={item.beneficiaryCountry ?? "—"} matched={matched.has("beneficiary_country")} />
          </div>
          <div className="px-4 py-3 border-t border-border/50 bg-secondary/10 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Matched on:</span>
            {(item.matchedFields ?? []).map(f => (
              <span key={f} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary border border-primary/25 uppercase tracking-wide">
                {f.replace(/_/g, " ")}
              </span>
            ))}
            <span className="ml-auto text-xs text-muted-foreground">
              Type: <span className="text-foreground font-medium capitalize">{item.duplicateType.replace(/_/g, " ")}</span>
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DuplicatesList() {
  const [page, setPage] = useState(1);
  const [systemFilter, setSystemFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [reviewItem, setReviewItem] = useState<DuplicateItem | null>(null);

  const { data, isLoading } = useGetDuplicatePayments({
    page,
    limit: 15,
    paymentSystem: systemFilter || undefined,
  });

  const exportMutation = useExportDuplicates({
    mutation: {
      onSuccess: (res) => { alert(`Exported ${res.recordCount} records. File: ${res.filename}`); },
    },
  });

  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);

  const pageContext = data
    ? [
        `Total duplicate payments in system: ${data.total}`,
        `Currently viewing page ${page} of ${data.totalPages} (${data.items.length} records)`,
        systemFilter ? `Filter active: payment system = ${systemFilter}` : "Filter: All payment systems",
        "",
        "Current page records summary:",
        ...data.items.slice(0, 8).map(it =>
          `- ${it.payment1Id} ↔ ${it.payment2Id} | ${it.paymentSystem} | ${it.duplicateType} | ${formatCurrency(it.amount, it.currency)} | prob=${(it.probability * 100).toFixed(1)}% | status=${it.status} | matched=${(it.matchedFields ?? []).join(",")}`
        ),
      ].join("\n")
    : "Data is still loading.";

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Duplicate Findings</h1>
          <p className="text-muted-foreground mt-1">Review and action potential duplicate payments.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant={chatOpen ? "default" : "outline"} className="gap-2" onClick={() => setChatOpen(o => !o)}>
            <MessageSquare className="w-4 h-4" />
            Ask Agent
            {chatOpen && <X className="w-3.5 h-3.5 ml-0.5 opacity-60" />}
          </Button>
          <Button variant="outline" className="gap-2">
            <SlidersHorizontal className="w-4 h-4" />
            Filters
          </Button>
          <Button onClick={() => exportMutation.mutate({ data: { format: "csv" } })} disabled={exportMutation.isPending} className="gap-2">
            <Download className="w-4 h-4" />
            {exportMutation.isPending ? "Exporting..." : "Export CSV"}
          </Button>
        </div>
      </div>

      {/* ── Table ── */}
      <Card className="overflow-hidden border-border/50">
        <div className="p-4 border-b border-border/50 bg-secondary/20 flex gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search IDs or BICs..."
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-background border border-border focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm outline-none"
            />
          </div>
          <select
            className="px-4 py-2 rounded-lg bg-background border border-border focus:ring-2 focus:ring-primary/50 outline-none text-sm appearance-none min-w-[150px]"
            value={systemFilter}
            onChange={e => { setSystemFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Systems</option>
            <option value="SWIFT_MT">SWIFT MT</option>
            <option value="SWIFT_MX">SWIFT MX (ISO 20022)</option>
            <option value="ACH">ACH</option>
            <option value="INTERNAL">Internal</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/10 border-b border-border/50">
              <tr>
                <th className="px-6 py-4 font-semibold tracking-wider">Payment IDs</th>
                <th className="px-6 py-4 font-semibold tracking-wider">System & Type</th>
                <th className="px-6 py-4 font-semibold tracking-wider">Amount</th>
                <th className="px-6 py-4 font-semibold tracking-wider">Matched On</th>
                <th className="px-6 py-4 font-semibold tracking-wider">Probability</th>
                <th className="px-6 py-4 font-semibold tracking-wider">Status</th>
                <th className="px-6 py-4 font-semibold tracking-wider text-right">Compare</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex justify-center mb-2">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                    Loading payments...
                  </td>
                </tr>
              ) : data?.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                    No duplicate payments found matching criteria.
                  </td>
                </tr>
              ) : (
                data?.items.map(item => {
                  const isExpanded = expandedId === item.id;
                  return (
                    <Fragment key={item.id}>
                      <tr
                        onClick={() => toggleExpand(item.id)}
                        className={`border-b border-border/30 hover:bg-secondary/20 transition-colors cursor-pointer group ${isExpanded ? "bg-secondary/20 border-primary/20" : ""}`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="inline-block w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                            <span className="font-mono text-xs text-foreground">{item.payment1Id}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <ArrowRight className="w-2 h-2 text-muted-foreground flex-shrink-0" />
                            <span className="font-mono text-xs text-muted-foreground">{item.payment2Id}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-foreground">{item.paymentSystem}</div>
                          <div className="text-xs text-muted-foreground capitalize">{item.duplicateType.replace(/_/g, " ")}</div>
                        </td>
                        <td className="px-6 py-4 font-medium text-foreground">
                          {formatCurrency(item.amount, item.currency)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1 max-w-[180px]">
                            {(item.matchedFields ?? []).slice(0, 3).map(f => (
                              <span key={f} className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/15 text-primary uppercase tracking-wide">
                                {f.replace(/_/g, " ")}
                              </span>
                            ))}
                            {(item.matchedFields ?? []).length > 3 && (
                              <span className="text-[10px] text-muted-foreground">+{item.matchedFields!.length - 3}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <ProbabilityBadge probability={item.probability} />
                        </td>
                        <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                          {/* Clickable status badge opens ReviewModal */}
                          <button
                            onClick={() => setReviewItem(item as DuplicateItem)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors cursor-pointer ${STATUS_STYLES[item.status] ?? "bg-secondary text-muted-foreground border-border/50 hover:bg-secondary/80"}`}
                            title="Click to review with Training Agent"
                          >
                            <Brain className="w-3 h-3" />
                            {item.status.replace(/_/g, " ")}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                            <Eye className="w-3.5 h-3.5" />
                            {isExpanded
                              ? <><span>Hide</span><ChevronUp className="w-3.5 h-3.5" /></>
                              : <><span>Compare</span><ChevronDown className="w-3.5 h-3.5" /></>}
                          </Button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} className="p-0 bg-secondary/5 border-b border-primary/20">
                            <AnimatePresence>
                              <DetailPanel item={item as DuplicateItem} />
                            </AnimatePresence>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {data && (
          <div className="p-4 border-t border-border/50 flex items-center justify-between text-sm text-muted-foreground bg-secondary/10">
            <div>
              Showing{" "}
              <span className="font-medium text-foreground">{(page - 1) * data.limit + 1}</span> to{" "}
              <span className="font-medium text-foreground">{Math.min(page * data.limit, data.total)}</span> of{" "}
              <span className="font-medium text-foreground">{data.total}</span> results
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
              <span className="px-3 py-1 text-xs bg-secondary/50 rounded-md border border-border/50">
                {page} / {data.totalPages}
              </span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Portals ── */}
      <AnimatePresence>
        {chatOpen && <AgentChatPanel key="chat" onClose={() => setChatOpen(false)} pageContext={pageContext} />}
      </AnimatePresence>

      <AnimatePresence>
        {reviewItem && <ReviewModal key={reviewItem.id} item={reviewItem} onClose={() => setReviewItem(null)} />}
      </AnimatePresence>
    </div>
  );
}
