import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/contexts/UserContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProbabilityBadge } from "@/components/ui/ProbabilityBadge";
import { formatCurrency } from "@/lib/utils";
import {
  Download, Search, Eye, Bot, Send, X, User,
  Brain, Shield, GitBranch, Network, Blend, Activity,
  Loader2, Sparkles, CheckCircle2, XCircle, Clock,
  AlertTriangle, LogOut, RefreshCw, ChevronRight, ChevronDown,
  MessageSquare, BarChart3, ArrowLeftRight, CheckCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────────

type Payment = {
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
  senderBIC?: string;
  receiverBIC?: string;
  originatorCountry?: string;
  beneficiaryCountry?: string;
  matchedFields?: string[];
  status: string;
  notes?: string;
};

type UserReview = {
  id: string;
  userId: string;
  duplicatePaymentId: string;
  status: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  payment: Payment;
};

type DetectorOpinion = {
  agentName: string;
  isDuplicate: boolean;
  confidence: number;
  reasoning: string;
  duplicateType?: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  statusUpdate?: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending:              { bg: "bg-yellow-400/15 border-yellow-400/30",  text: "text-yellow-300",  label: "Pending" },
  under_review:         { bg: "bg-blue-400/15 border-blue-400/30",      text: "text-blue-300",    label: "Under Review" },
  confirmed_duplicate:  { bg: "bg-red-400/15 border-red-400/30",        text: "text-red-300",     label: "Confirmed" },
  dismissed:            { bg: "bg-green-400/15 border-green-400/30",    text: "text-green-300",   label: "Dismissed" },
};

const DETECTOR_META: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  SWIFT_Specialist:      { icon: Shield,   color: "text-blue-400" },
  ACH_Specialist:        { icon: GitBranch, color: "text-purple-400" },
  MultiSource_Detector:  { icon: Network,  color: "text-cyan-400" },
  FuzzyMatch_Engine:     { icon: Blend,    color: "text-orange-400" },
  PatternAnalysis_Agent: { icon: Activity, color: "text-pink-400" },
};

const STATUS_TAB_FILTERS = [
  { key: "", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "under_review", label: "Under Review" },
  { key: "confirmed_duplicate", label: "Confirmed" },
  { key: "dismissed", label: "Dismissed" },
];

const DUP_TYPE_DESC: Record<string, string> = {
  exact_match:    "All identifying fields are identical — this is likely the same transaction submitted twice",
  near_match:     "Most fields match with only minor differences — high likelihood of a duplicate",
  time_window:    "Same payment submitted more than once within a short time window",
  cross_system:   "Duplicate detected across different payment networks (e.g. SWIFT re-sent via ACH)",
  same_reference: "Same payment reference number used for two distinct records",
  same_day:       "Same amount and counterparties appear on the same calendar day",
  fuzzy_match:    "Fields are highly similar but not identical — possible duplicate with minor edits",
};

const FIELD_LABELS: Record<string, string> = {
  amount:              "Amount",
  currency:            "Currency",
  sender_bic:          "Sender BIC",
  receiver_bic:        "Receiver BIC",
  originator_country:  "Origin Country",
  beneficiary_country: "Beneficiary Country",
  value_date:          "Value Date",
  payment_date:        "Payment Date",
  reference:           "Reference",
  transaction_id:      "Transaction ID",
};

// ─── Payment Comparison Accordion ────────────────────────────────────────────

function PaymentAccordion({ payment }: { payment: Payment }) {
  const matched = new Set((payment.matchedFields ?? []).map(f => f.toLowerCase()));

  const dupTypeKey = payment.duplicateType?.toLowerCase().replace(/\s+/g, "_") ?? "";
  const dupDesc = DUP_TYPE_DESC[dupTypeKey] ?? "Flagged as a likely duplicate payment";
  const pct = Math.round(payment.probability * 100);

  const sharedRows: { label: string; value: string; fieldKey: string }[] = [
    { label: "Amount",       value: formatCurrency(payment.amount, payment.currency), fieldKey: "amount" },
    { label: "Currency",     value: payment.currency,                                  fieldKey: "currency" },
    { label: "Sender BIC",   value: payment.senderBIC ?? "—",                          fieldKey: "sender_bic" },
    { label: "Receiver BIC", value: payment.receiverBIC ?? "—",                        fieldKey: "receiver_bic" },
    { label: "Origin",       value: payment.originatorCountry ?? "—",                  fieldKey: "originator_country" },
    { label: "Beneficiary",  value: payment.beneficiaryCountry ?? "—",                 fieldKey: "beneficiary_country" },
    { label: "System",       value: payment.paymentSystem,                             fieldKey: "payment_system" },
  ].filter(r => r.value && r.value !== "—");

  const isMatchedField = (key: string) =>
    matched.has(key) || matched.has(key.replace(/_/g, ""));

  const date1Str = payment.paymentDate1 ? new Date(payment.paymentDate1).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
  const date2Str = payment.paymentDate2 ? new Date(payment.paymentDate2).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
  const datesMatch = date1Str === date2Str && date1Str !== "—";

  return (
    <div className="bg-[#090d14] border-t border-b border-white/6 px-4 py-4">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">

        {/* ── Payment A ── */}
        <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Payment A</span>
          </div>
          <div>
            <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-0.5">Payment ID</p>
            <p className="font-mono text-sm text-white font-bold">{payment.payment1Id}</p>
          </div>
          <div className={`rounded-lg px-3 py-2 ${datesMatch ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-white/3 border border-white/8"}`}>
            <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-0.5">Date</p>
            <p className={`text-xs font-medium ${datesMatch ? "text-emerald-300" : "text-slate-300"}`}>{date1Str}</p>
          </div>
          {sharedRows.map(row => (
            <div
              key={row.fieldKey}
              className={`rounded-lg px-3 py-2 ${isMatchedField(row.fieldKey) ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-white/3 border border-white/8"}`}
            >
              <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-0.5">{row.label}</p>
              <p className={`text-xs font-medium ${isMatchedField(row.fieldKey) ? "text-emerald-300" : "text-slate-300"}`}>
                {row.value}
                {isMatchedField(row.fieldKey) && <CheckCheck className="inline w-3 h-3 ml-1 text-emerald-400" />}
              </p>
            </div>
          ))}
        </div>

        {/* ── Middle: Evidence ── */}
        <div className="flex flex-col items-center gap-3 pt-6 w-32">
          <ArrowLeftRight className="w-5 h-5 text-slate-600" />
          <div className="text-center">
            <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">Probability</p>
            <p className={`text-2xl font-bold ${pct >= 80 ? "text-red-400" : pct >= 50 ? "text-yellow-400" : "text-green-400"}`}>{pct}%</p>
          </div>
          {/* Prob bar */}
          <div className="w-full h-1.5 bg-white/8 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct >= 80 ? "bg-red-400" : pct >= 50 ? "bg-yellow-400" : "bg-green-400"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-400/20 text-center leading-tight">
            {payment.duplicateType.replace(/_/g, " ")}
          </span>
          {/* Matched count */}
          <div className="text-center mt-1">
            <p className="text-[10px] text-slate-600 uppercase tracking-wider">Matched</p>
            <p className="text-lg font-bold text-emerald-400">{payment.matchedFields?.length ?? 0}</p>
            <p className="text-[10px] text-slate-600">fields</p>
          </div>
        </div>

        {/* ── Payment B ── */}
        <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Payment B</span>
          </div>
          <div>
            <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-0.5">Payment ID</p>
            <p className="font-mono text-sm text-white font-bold">{payment.payment2Id}</p>
          </div>
          <div className={`rounded-lg px-3 py-2 ${datesMatch ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-white/3 border border-white/8"}`}>
            <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-0.5">Date</p>
            <p className={`text-xs font-medium ${datesMatch ? "text-emerald-300" : "text-slate-300"}`}>{date2Str}</p>
          </div>
          {sharedRows.map(row => (
            <div
              key={row.fieldKey}
              className={`rounded-lg px-3 py-2 ${isMatchedField(row.fieldKey) ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-white/3 border border-white/8"}`}
            >
              <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-0.5">{row.label}</p>
              <p className={`text-xs font-medium ${isMatchedField(row.fieldKey) ? "text-emerald-300" : "text-slate-300"}`}>
                {row.value}
                {isMatchedField(row.fieldKey) && <CheckCheck className="inline w-3 h-3 ml-1 text-emerald-400" />}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Why duplicate */}
      <div className="mt-4 bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3 flex gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider mb-0.5">Why flagged as duplicate</p>
          <p className="text-xs text-slate-300 leading-relaxed">{dupDesc}</p>
          {payment.matchedFields && payment.matchedFields.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {payment.matchedFields.map(f => (
                <span key={f} className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-400/20 px-1.5 py-0.5 rounded font-mono">
                  {FIELD_LABELS[f.toLowerCase()] ?? f.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(err || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

// ─── Detector Opinion Card ────────────────────────────────────────────────────

function OpinionCard({ op }: { op: DetectorOpinion }) {
  const meta = DETECTOR_META[op.agentName] ?? { icon: Brain, color: "text-slate-400" };
  const Icon = meta.icon;
  const pct = Math.round(op.confidence * 100);

  return (
    <div className="bg-white/4 border border-white/8 rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${meta.color} flex-shrink-0`} />
          <span className="text-xs font-semibold text-white">
            {op.agentName.replace(/_/g, " ")}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`text-[11px] font-bold ${op.isDuplicate ? "text-red-400" : "text-green-400"}`}>
            {op.isDuplicate ? "DUPLICATE" : "NOT DUP"}
          </span>
          <span className="text-[11px] text-slate-400">{pct}%</span>
        </div>
      </div>
      {/* Confidence bar */}
      <div className="h-1 rounded-full bg-white/8 overflow-hidden">
        <div
          className={`h-full rounded-full ${op.isDuplicate ? "bg-red-400" : "bg-green-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">{op.reasoning}</p>
    </div>
  );
}

// ─── Payment Detail Row ───────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between items-start gap-4 py-1.5 border-b border-white/5 last:border-0">
      <span className="text-[11px] text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-[11px] text-slate-300 text-right break-all">{String(value)}</span>
    </div>
  );
}

// ─── Review Modal ─────────────────────────────────────────────────────────────

function ReviewModal({
  review,
  userId,
  userDisplayName,
  onClose,
  onStatusChange,
}: {
  review: UserReview;
  userId: string;
  userDisplayName: string;
  onClose: () => void;
  onStatusChange: (reviewId: string, status: string) => void;
}) {
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(review.status);
  const [detectorOpinions, setDetectorOpinions] = useState<DetectorOpinion[]>([]);
  const [opinionsLoading, setOpinionsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load existing chat messages
  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<{ messages: ChatMessage[]; currentStatus: string }>(
          `/api/user-reviews/${userId}/${review.id}/messages`
        );
        setMessages(data.messages);
        setCurrentStatus(data.currentStatus);
      } catch { /* no messages yet */ }
    })();
  }, [review.id, userId]);

  // Load detector opinions
  useEffect(() => {
    setOpinionsLoading(true);
    (async () => {
      try {
        const data = await apiFetch<{ opinions: DetectorOpinion[] }>(
          `/api/user-reviews/${userId}/${review.id}/opinions`
        );
        setDetectorOpinions(data.opinions);
      } catch { /* failed silently */ } finally {
        setOpinionsLoading(false);
      }
    })();
  }, [review.id, userId]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const content = (text ?? chatInput).trim();
    if (!content || isSending) return;
    setChatInput("");
    setIsSending(true);

    const userMsg: ChatMessage = { role: "user", content };
    setMessages(prev => [...prev, userMsg]);

    try {
      const data = await apiFetch<{ response: string; statusUpdate?: string | null; currentStatus: string }>(
        `/api/user-reviews/${userId}/${review.id}/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: content, detectorOpinions }),
        }
      );
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.response,
        statusUpdate: data.statusUpdate,
      };
      setMessages(prev => [...prev, assistantMsg]);
      if (data.currentStatus) {
        setCurrentStatus(data.currentStatus);
        onStatusChange(review.id, data.currentStatus);
      }
    } catch {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "Sorry, I couldn't process that request. Please try again." },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const updateStatus = async (newStatus: string) => {
    try {
      await apiFetch(`/api/user-reviews/${userId}/${review.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      setCurrentStatus(newStatus);
      onStatusChange(review.id, newStatus);
    } catch { /* ignore */ }
  };

  const p = review.payment;

  const modalContent = (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        className="bg-[#0b0f1a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-[1400px] h-[90vh] flex flex-col overflow-hidden"
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0">
              <Eye className="w-4 h-4 text-violet-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white font-mono">
                {p.payment1Id} <span className="text-slate-500">↔</span> {p.payment2Id}
              </p>
              <p className="text-[11px] text-slate-500">{p.paymentSystem} · {p.duplicateType.replace(/_/g, " ")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ProbabilityBadge probability={p.probability} />
            <StatusBadge status={currentStatus} />
            <button
              onClick={onClose}
              className="ml-2 p-1.5 rounded-lg hover:bg-white/8 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Status Actions bar ────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 px-5 py-2 border-b border-white/5 bg-white/2 flex-shrink-0 flex-wrap">
          <span className="text-[10px] text-slate-600 mr-1 uppercase tracking-wider">Set status:</span>
          {[
            { key: "confirmed_duplicate", label: "Confirm Duplicate", icon: CheckCircle2, cls: "text-red-400 border-red-400/30 hover:bg-red-400/10" },
            { key: "dismissed",           label: "Dismiss (Not Dup)", icon: XCircle,       cls: "text-green-400 border-green-400/30 hover:bg-green-400/10" },
            { key: "under_review",        label: "Under Review",      icon: AlertTriangle, cls: "text-blue-400 border-blue-400/30 hover:bg-blue-400/10" },
            { key: "pending",             label: "Reset Pending",     icon: Clock,         cls: "text-yellow-400 border-yellow-400/30 hover:bg-yellow-400/10" },
          ].map(({ key, label, icon: Icon, cls }) => (
            <button
              key={key}
              disabled={currentStatus === key}
              onClick={() => updateStatus(key)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all disabled:opacity-35 disabled:cursor-default bg-transparent ${cls}`}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Three-Column Body ─────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0 divide-x divide-white/6">

          {/* ── Col 1: Payment Details (fixed width) ─────────────────── */}
          <div className="w-56 flex-shrink-0 flex flex-col overflow-y-auto p-4 space-y-3">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Payment Details</p>
            <div>
              <DetailRow label="Amount"       value={formatCurrency(p.amount, p.currency)} />
              <DetailRow label="System"       value={p.paymentSystem} />
              <DetailRow label="Type"         value={p.duplicateType?.replace(/_/g, " ")} />
              <DetailRow label="Sender BIC"   value={p.senderBIC} />
              <DetailRow label="Receiver BIC" value={p.receiverBIC} />
              <DetailRow label="Date 1"       value={p.paymentDate1 ? new Date(p.paymentDate1).toLocaleDateString() : undefined} />
              <DetailRow label="Date 2"       value={p.paymentDate2 ? new Date(p.paymentDate2).toLocaleDateString() : undefined} />
              <DetailRow label="Originator"   value={p.originatorCountry} />
              <DetailRow label="Beneficiary"  value={p.beneficiaryCountry} />
            </div>
            {p.matchedFields && p.matchedFields.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Matched Fields</p>
                <div className="flex flex-wrap gap-1">
                  {p.matchedFields.map(f => (
                    <span key={f} className="text-[10px] bg-violet-500/15 text-violet-300 border border-violet-400/20 px-1.5 py-0.5 rounded">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Col 2: Detector Opinions ──────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/6 flex-shrink-0">
              <BarChart3 className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Detector Opinions</span>
              {detectorOpinions.length > 0 && (() => {
                const dups = detectorOpinions.filter(o => o.isDuplicate).length;
                return (
                  <span className={`ml-auto text-[11px] font-semibold ${dups >= 3 ? "text-red-400" : "text-green-400"}`}>
                    {dups}/5 say duplicate
                  </span>
                );
              })()}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {opinionsLoading ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <p className="text-xs">Consulting 5 detector agents…</p>
                </div>
              ) : detectorOpinions.length > 0 ? (
                detectorOpinions.map((op, i) => <OpinionCard key={i} op={op} />)
              ) : (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-500">
                  <Brain className="w-6 h-6" />
                  <p className="text-xs">No opinions available</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Col 3: Training Agent Chat ────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {/* Chat header with memory badge */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/6 flex-shrink-0">
              <Brain className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Training Agent</span>
              <span className="ml-auto flex items-center gap-1 text-[10px] bg-violet-500/15 text-violet-300 border border-violet-400/20 px-2 py-0.5 rounded-full">
                <Sparkles className="w-2.5 h-2.5" />
                {userDisplayName}'s Memory
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-32 gap-3 text-slate-500 pt-4">
                  <Bot className="w-7 h-7" />
                  <p className="text-xs text-center leading-relaxed text-slate-500 max-w-[220px]">
                    Your training agent remembers every rule you teach it across all payment reviews.
                  </p>
                  <div className="flex flex-wrap justify-center gap-1.5 mt-1">
                    {[
                      "Analyze this payment",
                      "This is not a duplicate",
                      "Confirm as duplicate",
                      "What do you remember?",
                      "Is this a standing order?",
                    ].map(s => (
                      <button
                        key={s}
                        onClick={() => sendMessage(s)}
                        className="text-[10px] bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 px-2 py-1 rounded-full transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`flex gap-2 max-w-[90%] ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      msg.role === "user" ? "bg-violet-600" : "bg-violet-900/60"
                    }`}>
                      {msg.role === "user"
                        ? <User className="w-3 h-3 text-white" />
                        : <Brain className="w-3 h-3 text-violet-300" />}
                    </div>
                    <div>
                      <div className={`rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                        msg.role === "user"
                          ? "bg-violet-600/80 text-white"
                          : "bg-white/6 border border-white/8 text-slate-200"
                      }`}>
                        {msg.content}
                      </div>
                      {msg.statusUpdate && (
                        <div className="mt-1 text-[10px] text-violet-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Status updated → {msg.statusUpdate.replace(/_/g, " ")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {isSending && (
                <div className="flex justify-start">
                  <div className="flex gap-2 items-center">
                    <div className="w-6 h-6 rounded-full bg-violet-900/60 flex items-center justify-center">
                      <Brain className="w-3 h-3 text-violet-300" />
                    </div>
                    <div className="bg-white/6 border border-white/8 rounded-xl px-3 py-2 flex gap-1">
                      <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-white/8 flex-shrink-0">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  disabled={isSending}
                  placeholder={`Teach ${userDisplayName}'s agent or ask about this payment…`}
                  className="flex-1 bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50 disabled:opacity-60"
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!chatInput.trim() || isSending}
                  className="w-8 h-8 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
                >
                  {isSending
                    ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                    : <Send className="w-3.5 h-3.5 text-white" />}
                </button>
              </div>
            </div>
          </div>

        </div>
      </motion.div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DuplicatesList() {
  const { user, logout } = useUser();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedReview, setSelectedReview] = useState<UserReview | null>(null);
  const [page, setPage] = useState(1);
  const [fetchSummary, setFetchSummary] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleAccordion = (reviewId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(reviewId)) next.delete(reviewId);
      else next.add(reviewId);
      return next;
    });
  };

  // Load user's review queue
  const { data: reviewData, isLoading, refetch } = useQuery({
    queryKey: ["user-reviews", user?.id, statusFilter, page],
    queryFn: () =>
      apiFetch<{
        reviews: UserReview[];
        total: number;
        totalPages: number;
        user: { id: string; username: string; displayName: string };
      }>(`/api/user-reviews/${user!.id}?status=${statusFilter}&page=${page}&page_size=25`),
    enabled: !!user,
  });

  // Fetch duplicates mutation
  const fetchMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ totalFetched: number; newlyAssigned: number; totalAssigned: number; summary: string }>(
        "/api/user-reviews/fetch",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user!.id }),
        }
      ),
    onSuccess: (data) => {
      setFetchSummary(data.summary);
      queryClient.invalidateQueries({ queryKey: ["user-reviews", user?.id] });
    },
  });

  const handleStatusChange = useCallback((reviewId: string, newStatus: string) => {
    // Optimistically update the local list
    queryClient.setQueryData(
      ["user-reviews", user?.id, statusFilter, page],
      (old: typeof reviewData) => {
        if (!old) return old;
        return {
          ...old,
          reviews: old.reviews.map(r =>
            r.id === reviewId ? { ...r, status: newStatus } : r
          ),
        };
      }
    );
    // Also update selected review state
    setSelectedReview(prev =>
      prev && prev.id === reviewId ? { ...prev, status: newStatus } : prev
    );
  }, [queryClient, user?.id, statusFilter, page]);

  const reviews = reviewData?.reviews ?? [];
  const total = reviewData?.total ?? 0;
  const totalPages = reviewData?.totalPages ?? 1;
  const hasReviews = total > 0 || isLoading;

  // Filter by search (client-side on current page)
  const filtered = searchTerm
    ? reviews.filter(r =>
        r.payment.payment1Id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.payment.payment2Id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.payment.paymentSystem.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.payment.duplicateType.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : reviews;

  // Status counts from the current data
  const statusCounts = reviews.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (!user) return null;

  return (
    <div className="flex flex-col gap-5 p-6 min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Duplicate Payment Review</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Reviewing as <span className="text-violet-300 font-medium">{user.displayName}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => fetchMutation.mutate()}
            disabled={fetchMutation.isPending}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-60"
          >
            {fetchMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Fetching…</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Fetch Duplicate Payments</>
            )}
          </Button>
          <button
            onClick={logout}
            className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
            title="Switch user"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Master Agent summary after fetch */}
      <AnimatePresence>
        {fetchSummary && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4 flex gap-3"
          >
            <Brain className="w-5 h-5 text-violet-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-violet-300 mb-1">Master Agent</p>
              <p className="text-xs text-slate-300 leading-relaxed">{fetchSummary}</p>
            </div>
            <button onClick={() => setFetchSummary(null)} className="ml-auto text-slate-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Assigned", value: total, color: "text-white" },
          { label: "Pending",   value: statusCounts.pending ?? 0,             color: "text-yellow-400" },
          { label: "Confirmed", value: statusCounts.confirmed_duplicate ?? 0,  color: "text-red-400" },
          { label: "Dismissed", value: statusCounts.dismissed ?? 0,            color: "text-green-400" },
        ].map(({ label, value, color }) => (
          <Card key={label} className="bg-white/4 border border-white/8 px-4 py-3">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
          </Card>
        ))}
      </div>

      {/* Empty state */}
      {!isLoading && total === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center">
            <Eye className="w-8 h-8 text-slate-600" />
          </div>
          <div className="text-center">
            <p className="text-white font-medium">No payments assigned yet</p>
            <p className="text-sm text-slate-500 mt-1">
              Click "Fetch Duplicate Payments" to load your review queue
            </p>
          </div>
          <Button
            onClick={() => fetchMutation.mutate()}
            disabled={fetchMutation.isPending}
            className="mt-2 flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-6 py-2.5 rounded-xl"
          >
            {fetchMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Fetching…</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Fetch Duplicate Payments</>
            )}
          </Button>
        </div>
      )}

      {/* Table area */}
      {(isLoading || total > 0) && (
        <Card className="bg-white/4 border border-white/8 rounded-xl overflow-hidden flex flex-col">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border-b border-white/8">
            <div className="flex gap-1">
              {STATUS_TAB_FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => { setStatusFilter(f.key); setPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    statusFilter === f.key
                      ? "bg-violet-600 text-white"
                      : "text-slate-400 hover:text-white hover:bg-white/8"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search payments…"
                className="pl-8 pr-3 py-1.5 text-xs bg-white/6 border border-white/10 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50 w-52"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/8">
                  {["Payment IDs", "System", "Amount", "Probability", "Status", "Date", ""].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-white/5">
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-white/6 rounded animate-pulse w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500 text-xs">
                      No payments match your filters
                    </td>
                  </tr>
                ) : (
                  filtered.map(rev => {
                    const p = rev.payment;
                    const isOpen = expandedRows.has(rev.id);
                    return (
                      <React.Fragment key={rev.id}>
                        <tr
                          onClick={() => setSelectedReview(rev)}
                          className={`border-b border-white/5 hover:bg-white/4 cursor-pointer transition-colors ${isOpen ? "bg-white/3" : ""}`}
                        >
                          {/* Payment IDs cell — click to toggle accordion */}
                          <td
                            className="px-4 py-3 group"
                            onClick={e => toggleAccordion(rev.id, e)}
                            title="Click to compare payments side by side"
                          >
                            <div className="flex items-center gap-1.5">
                              <div>
                                <div className="font-mono text-violet-300 text-[11px] group-hover:text-violet-200 transition-colors underline-offset-2 group-hover:underline">{p.payment1Id}</div>
                                <div className="font-mono text-slate-500 text-[10px] group-hover:text-slate-400 transition-colors">↔ {p.payment2Id}</div>
                              </div>
                              {isOpen
                                ? <ChevronDown className="w-3 h-3 text-violet-400 flex-shrink-0" />
                                : <ChevronRight className="w-3 h-3 text-slate-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                              }
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-slate-300">{p.paymentSystem}</div>
                            <div className="text-slate-600 text-[10px]">{p.duplicateType.replace(/_/g, " ")}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                            {formatCurrency(p.amount, p.currency)}
                          </td>
                          <td className="px-4 py-3">
                            <ProbabilityBadge probability={p.probability} />
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={rev.status} />
                          </td>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                            {p.paymentDate1 ? new Date(p.paymentDate1).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <ChevronRight className="w-4 h-4 text-slate-600" />
                          </td>
                        </tr>
                        {/* Accordion row */}
                        <AnimatePresence>
                          {isOpen && (
                            <motion.tr
                              key={`${rev.id}-acc`}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.15 }}
                            >
                              <td colSpan={7} className="p-0 border-b border-white/5">
                                <PaymentAccordion payment={p} />
                              </td>
                            </motion.tr>
                          )}
                        </AnimatePresence>
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/8">
              <p className="text-xs text-slate-500">
                Page {page} of {totalPages} · {total} total
              </p>
              <div className="flex gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-2.5 py-1 text-xs rounded-lg border border-white/10 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="px-2.5 py-1 text-xs rounded-lg border border-white/10 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Review Modal */}
      <AnimatePresence>
        {selectedReview && (
          <ReviewModal
            review={selectedReview}
            userId={user.id}
            userDisplayName={user.displayName}
            onClose={() => setSelectedReview(null)}
            onStatusChange={handleStatusChange}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
