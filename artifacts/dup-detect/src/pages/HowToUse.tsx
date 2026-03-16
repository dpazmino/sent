import { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Files, Globe2, Terminal, BrainCircuit, Database,
  MessageSquareText, Landmark, LogIn, Search, Eye, Brain, CheckCircle2,
  XCircle, AlertTriangle, BarChart3, Zap, ShieldAlert, BookOpen, ChevronRight,
  Lightbulb, Users, ScanLine, GitBranch,
} from "lucide-react";

function Section({ id, icon: Icon, title, color, children }: {
  id: string; icon: React.ElementType; title: string; color: string; children: ReactNode;
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.4 }}
      className="scroll-mt-8"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
        <h2 className="text-xl font-bold text-white">{title}</h2>
      </div>
      <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
        {children}
      </div>
    </motion.section>
  );
}

function Step({ num, title, children }: { num: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-violet-500/20 border border-violet-400/30 flex items-center justify-center text-xs font-bold text-violet-300 mt-0.5">
        {num}
      </div>
      <div>
        <p className="font-semibold text-white mb-1">{title}</p>
        <p className="text-slate-400">{children}</p>
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, title, desc, color }: {
  icon: React.ElementType; title: string; desc: string; color: string;
}) {
  return (
    <div className={`flex gap-3 p-4 rounded-xl border bg-white/3 ${color}`}>
      <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold text-white text-sm mb-0.5">{title}</p>
        <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function Tag({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${color}`}>
      {children}
    </span>
  );
}

const TOC = [
  { id: "overview",   label: "Overview",              icon: ShieldAlert },
  { id: "login",      label: "Getting Started",        icon: LogIn },
  { id: "dashboard",  label: "Dashboard",              icon: LayoutDashboard },
  { id: "duplicates", label: "Duplicates List",        icon: Files },
  { id: "modal",      label: "Review Modal",           icon: Eye },
  { id: "training",   label: "Training the Agent",     icon: Brain },
  { id: "console",    label: "Master Console",         icon: Terminal },
  { id: "corridor",   label: "Corridor Analysis",      icon: Globe2 },
  { id: "schema",     label: "Data Schema",            icon: Database },
  { id: "chat",       label: "AI Graph Chat",          icon: MessageSquareText },
];

export default function HowToUse() {
  return (
    <div className="flex gap-10 max-w-6xl mx-auto">

      {/* ── Sticky Table of Contents ───────────────────────────── */}
      <aside className="hidden xl:block w-56 flex-shrink-0">
        <div className="sticky top-0 pt-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 px-1">On this page</p>
          <nav className="space-y-0.5">
            {TOC.map(({ id, label, icon: Icon }) => (
              <a
                key={id}
                href={`#${id}`}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-colors group"
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0 group-hover:text-violet-400 transition-colors" />
                {label}
              </a>
            ))}
          </nav>
        </div>
      </aside>

      {/* ── Main Content ───────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-14 pb-16">

        {/* Page header */}
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
            <BookOpen className="w-3.5 h-3.5" />
            <span>User Guide</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-slate-300">Sentinel Intelligence Platform</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">How to Use Sentinel</h1>
          <p className="text-slate-400 text-base leading-relaxed max-w-2xl">
            Sentinel is a bank-grade duplicate payment detection platform powered by a multi-agent AI system.
            This guide walks through every feature from first login to advanced agent training.
          </p>
        </div>

        {/* ── Overview ──────────────────────────────────────────── */}
        <Section id="overview" icon={ShieldAlert} title="Overview" color="bg-violet-500/15 border border-violet-400/20 text-violet-400">
          <p>
            Sentinel connects to your payment database, continuously scans for duplicate transactions, and
            routes suspicious pairs to analyst review queues. Nine specialised AI agents work in parallel —
            five detectors assess each payment pair independently, a master agent synthesises the findings,
            a training agent builds and applies analyst-taught rules, and a Text-to-SQL agent answers
            natural language questions about your data.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            <InfoCard icon={ScanLine}  color="border-blue-400/20 text-blue-400"   title="Automated Detection"       desc="The scanner compares payment pairs across SWIFT MT/MX, ACH, and internal systems using 10 duplicate-type classifiers." />
            <InfoCard icon={Users}     color="border-green-400/20 text-green-400"  title="10 Analyst Profiles"       desc="Each analyst has a private review queue, personal training agent memory, and independent decision history." />
            <InfoCard icon={Brain}     color="border-violet-400/20 text-violet-400" title="Persistent Agent Memory"   desc="Rules you teach the Training Agent are remembered across every future payment review, not just the current session." />
            <InfoCard icon={GitBranch} color="border-orange-400/20 text-orange-400" title="LangGraph Architecture"    desc="All agents run as LangGraph StateGraph nodes. The Training Agent uses MemorySaver to persist memory across server restarts." />
          </div>
        </Section>

        {/* ── Getting Started ───────────────────────────────────── */}
        <Section id="login" icon={LogIn} title="Getting Started" color="bg-green-500/15 border border-green-400/20 text-green-400">
          <p>Sentinel uses internal analyst profiles — no passwords required.</p>
          <div className="space-y-4 mt-2">
            <Step num={1} title="Select your analyst profile">
              On the login screen you will see 10 analyst cards (Alice Chen through James Taylor).
              Click your card to enter the platform. Your session is tied to your profile for the duration of your browser session.
            </Step>
            <Step num={2} title="You land on the Dashboard">
              The dashboard shows live stats drawn from the duplicate payments database —
              total detections, amount at risk, high-probability flags, confirmed duplicates, and more.
            </Step>
            <Step num={3} title="Navigate using the left sidebar">
              The sidebar contains all eight sections of the platform.
              On mobile, use the menu button (top-right) to open the navigation drawer.
            </Step>
          </div>
        </Section>

        {/* ── Dashboard ─────────────────────────────────────────── */}
        <Section id="dashboard" icon={LayoutDashboard} title="Dashboard" color="bg-blue-500/15 border border-blue-400/20 text-blue-400">
          <p>
            The dashboard is a real-time view of everything the scanner has found.
            All numbers are read directly from the duplicate payments database — they update automatically
            as analysts confirm or dismiss payments from their review queues.
          </p>
          <div className="mt-3 space-y-2">
            {[
              ["Total Amount at Risk",        "Sum of amounts for all active (non-dismissed) detected duplicate pairs."],
              ["High Probability Detections", "Payments where the AI confidence score is ≥ 80%."],
              ["Pending Review",              "Duplicate records not yet actioned by any analyst."],
              ["Confirmed Duplicates",        "Records that at least one analyst has confirmed as genuine duplicates."],
            ].map(([label, desc]) => (
              <div key={label} className="flex gap-3 items-start">
                <ChevronRight className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 mt-0.5" />
                <p><span className="text-white font-medium">{label}:</span> <span className="text-slate-400">{desc}</span></p>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-lg bg-blue-500/8 border border-blue-400/15 flex gap-2">
            <Lightbulb className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400">
              Dismissed payments are excluded from the risk totals. Once you clear a false positive
              in your review queue, the dashboard numbers automatically decrease.
            </p>
          </div>
        </Section>

        {/* ── Duplicates List ───────────────────────────────────── */}
        <Section id="duplicates" icon={Files} title="Duplicates List" color="bg-yellow-500/15 border border-yellow-400/20 text-yellow-400">
          <p>
            This is your personal review queue — the set of duplicate payment pairs assigned to you.
            Each analyst sees only their own queue; assignments happen when you click
            <span className="text-white font-medium"> Fetch New Payments</span> in the Master Console.
          </p>
          <div className="space-y-4 mt-2">
            <Step num={1} title="Filter and search">
              Use the status filter (All / Pending / Under Review / Confirmed / Dismissed) and the search
              bar to find specific payments by ID, payment system, or duplicate type.
            </Step>
            <Step num={2} title="Inline accordion comparison">
              Click the payment ID pill to expand an inline side-by-side comparison row directly in the
              table. Matched fields are highlighted green. The probability bar and duplicate type label
              give you a quick read before opening the full modal.
            </Step>
            <Step num={3} title="Open the Review Modal">
              Click anywhere on a row (outside the ID pill) to open the full three-column review modal.
            </Step>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Tag color="border-yellow-400/30 text-yellow-300 bg-yellow-400/10">pending</Tag>
            <Tag color="border-blue-400/30 text-blue-300 bg-blue-400/10">under_review</Tag>
            <Tag color="border-red-400/30 text-red-300 bg-red-400/10">confirmed_duplicate</Tag>
            <Tag color="border-green-400/30 text-green-300 bg-green-400/10">dismissed</Tag>
          </div>
        </Section>

        {/* ── Review Modal ──────────────────────────────────────── */}
        <Section id="modal" icon={Eye} title="Review Modal" color="bg-purple-500/15 border border-purple-400/20 text-purple-400">
          <p>
            The review modal opens as a full-screen overlay with three always-visible columns.
            You can act on the payment, read detector opinions, and chat with your Training Agent all at once.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <div className="p-4 rounded-xl bg-white/3 border border-white/8 space-y-2">
              <div className="flex items-center gap-2 text-white font-semibold text-sm">
                <Landmark className="w-4 h-4 text-slate-400" />
                Column 1 — Payment Details
              </div>
              <p className="text-xs text-slate-400">
                All fields for both payments: amount, system, sender/receiver BIC, dates, originator, beneficiary.
                Matched fields shown as tags below.
              </p>
              <p className="text-xs text-slate-400">
                The <span className="text-white">Set Status</span> bar at the top of the modal lets you
                immediately confirm, dismiss, mark under review, or reset to pending.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white/3 border border-white/8 space-y-2">
              <div className="flex items-center gap-2 text-white font-semibold text-sm">
                <BarChart3 className="w-4 h-4 text-violet-400" />
                Column 2 — Detector Opinions
              </div>
              <p className="text-xs text-slate-400">
                Five specialist agents each give an independent verdict: is this a duplicate, at what
                confidence, and why. The header shows the consensus (<span className="text-white">X/5 say duplicate</span>).
              </p>
              <p className="text-xs text-slate-400">
                Opinions are fetched in parallel when you open the modal. Green cards = not a duplicate, red cards = duplicate.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white/3 border border-white/8 space-y-2">
              <div className="flex items-center gap-2 text-white font-semibold text-sm">
                <Brain className="w-4 h-4 text-violet-400" />
                Column 3 — Training Agent
              </div>
              <p className="text-xs text-slate-400">
                Your personal AI assistant with memory. It knows every rule you have taught it across
                <em> all</em> your previous reviews. Chat naturally — it will apply your past decisions
                to the current payment automatically.
              </p>
              <p className="text-xs text-slate-400">
                The agent can also update the payment status on your behalf when you say
                "confirm as duplicate" or "dismiss this".
              </p>
            </div>
          </div>
          <div className="mt-4 p-3 rounded-lg bg-purple-500/8 border border-purple-400/15 flex gap-2">
            <Lightbulb className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400">
              Quick prompts appear when the chat is empty — try <span className="text-white">"What do you remember?"</span> to see
              a summary of every rule your agent has stored from past conversations.
            </p>
          </div>
        </Section>

        {/* ── Training the Agent ────────────────────────────────── */}
        <Section id="training" icon={Brain} title="Training the Agent" color="bg-violet-500/15 border border-violet-400/20 text-violet-400">
          <p>
            The Training Agent is the most powerful feature of Sentinel. Every rule, exception, and
            policy decision you communicate to it is stored permanently in your analyst memory and applied
            to every future payment you review.
          </p>
          <div className="space-y-4 mt-2">
            <Step num={1} title="Teach a rule">
              In the chat column of any Review Modal, write something like:
              <span className="text-white"> "Payments from CHASUS33 to ROYCCAT2 on Fridays are standing orders — never duplicate."</span>
              The agent will confirm the rule and store it.
            </Step>
            <Step num={2} title="Rule is applied to future payments">
              The next time you open a payment in that corridor, the agent will proactively say:
              <span className="text-white"> "Based on your rule from [date], this looks like a standing order."</span>
            </Step>
            <Step num={3} title="Ask what it remembers">
              Type <span className="text-white">"What do you remember?"</span> at any time. The agent will
              give you a structured summary of every rule and decision it has stored for you.
            </Step>
            <Step num={4} title="Correct or override a rule">
              If a rule is wrong, tell the agent. It will update its understanding and note the revision
              with a timestamp so you can see how your policy has evolved.
            </Step>
          </div>
          <div className="mt-4 p-3 rounded-lg bg-violet-500/8 border border-violet-400/15 flex gap-2">
            <Lightbulb className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400">
              Each analyst has completely independent memory. Alice Chen's rules do not affect Bob Martinez's agent.
              Memory persists even if the server restarts — it is rebuilt from the conversation history stored in the database.
            </p>
          </div>
        </Section>

        {/* ── Master Console ────────────────────────────────────── */}
        <Section id="console" icon={Terminal} title="Master Console" color="bg-orange-500/15 border border-orange-400/20 text-orange-400">
          <p>
            The Master Console is the operations control centre. From here you can trigger bulk scans,
            query the duplicate payments database in natural language, and monitor scan history.
          </p>
          <div className="space-y-4 mt-2">
            <Step num={1} title="Fetch New Payments">
              Click <span className="text-white">Fetch New Payments</span> to run a bulk scan. The Master Agent
              orchestrates all five detector agents in parallel against the payment database. Results are
              written to the duplicate payments database and assigned to analyst queues.
            </Step>
            <Step num={2} title="Ask the Master Agent">
              The console includes a chat interface to the Master Detection Agent — use it for high-level
              questions like "What are the highest-risk payment corridors this week?" or
              "Explain what a UETR duplicate is."
            </Step>
            <Step num={3} title="Natural language SQL queries">
              Use the Text-to-SQL panel to ask data questions in plain English.
              For example: <span className="text-white">"Show me all confirmed SWIFT_MX duplicates over $1M in the last 30 days."</span>
              The agent converts this to a PostgreSQL query and runs it safely (SELECT only).
            </Step>
          </div>
        </Section>

        {/* ── Corridor Analysis ─────────────────────────────────── */}
        <Section id="corridor" icon={Globe2} title="Corridor Analysis" color="bg-teal-500/15 border border-teal-400/20 text-teal-400">
          <p>
            The Corridor Analysis page shows which sender → receiver country pairs have the highest
            volume of detected duplicate payments. This is useful for identifying systemic issues with
            specific correspondent banking relationships or regional payment hubs.
          </p>
          <p>
            Each corridor card shows: duplicate count, total amount, and average probability score.
            Corridors with high counts and high average probability are the highest priority for
            human investigation or payment hub rule changes.
          </p>
        </Section>

        {/* ── Data Schema ───────────────────────────────────────── */}
        <Section id="schema" icon={Database} title="Data Schema" color="bg-cyan-500/15 border border-cyan-400/20 text-cyan-400">
          <p>
            The Data Schema page documents the structure of the duplicate payments database —
            the table that the app reads and writes (the main payments table is never modified).
            Use this as a reference when writing natural language queries in the Master Console or
            AI Graph Chat.
          </p>
          <p>
            Each column shows: name, data type, description, and example values. The schema is also
            automatically injected into the Text-to-SQL agent's context so it always generates
            correct column names.
          </p>
        </Section>

        {/* ── AI Graph Chat ─────────────────────────────────────── */}
        <Section id="chat" icon={MessageSquareText} title="AI Graph Chat" color="bg-indigo-500/15 border border-indigo-400/20 text-indigo-400">
          <p>
            The AI Graph Chat is a conversational interface to the full LangGraph agent network.
            Unlike the review modal chat (which is scoped to one payment and one analyst), the
            Graph Chat runs the entire Master Agent with access to all detectors and can answer
            complex questions across the full dataset.
          </p>
          <div className="space-y-4 mt-2">
            <Step num={1} title="Ask data questions">
              "How many duplicate ACH payments were found this month?" — the Text-to-SQL agent
              translates this to a PostgreSQL query and returns the live result.
            </Step>
            <Step num={2} title="Ask methodology questions">
              "What is the difference between a UETR duplicate and a fuzzy amount duplicate?" —
              the Master Agent answers from its built-in domain knowledge.
            </Step>
            <Step num={3} title="Analyse specific payments">
              Paste a payment ID and ask for a full risk assessment. The Master Agent will invoke
              the relevant specialist detectors and return a structured report.
            </Step>
          </div>
          <div className="mt-4 p-3 rounded-lg bg-indigo-500/8 border border-indigo-400/15 flex gap-2">
            <Zap className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400">
              The Graph Chat uses your current analyst session so the Master Agent knows who you are
              and can provide personalised context when you reference your past review decisions.
            </p>
          </div>
        </Section>

      </div>
    </div>
  );
}
