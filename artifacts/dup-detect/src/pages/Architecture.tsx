import { motion } from "framer-motion";
import {
  Server,
  Globe,
  Database,
  Brain,
  Cpu,
  Package,
  Cloud,
  Key,
  ArrowRight,
  CheckCircle,
  Terminal,
  Layers,
  GitBranch,
  Shield,
  Boxes,
  Network,
  HardDrive,
  Zap,
  AlertTriangle,
} from "lucide-react";

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { delay, duration: 0.35 } },
});

function SectionTitle({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="mt-0.5 p-2 rounded-lg bg-primary/10 border border-primary/20">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card/60 border border-border/60 rounded-xl p-6 backdrop-blur-sm ${className}`}>
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-black/40 border border-border/50 rounded-lg p-4 text-xs font-mono text-emerald-300 overflow-x-auto whitespace-pre leading-relaxed">
      {children}
    </pre>
  );
}

function Pill({ label, color = "blue" }: { label: string; color?: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-300 border-blue-500/20",
    violet: "bg-violet-500/10 text-violet-300 border-violet-500/20",
    emerald: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    red: "bg-red-500/10 text-red-300 border-red-500/20",
    cyan: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${colors[color] ?? colors.blue}`}>
      {label}
    </span>
  );
}

function EnvRow({ name, value, required = true }: { name: string; value: string; required?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0">
      <code className="text-xs text-amber-300 font-mono shrink-0 pt-0.5 min-w-[280px]">{name}</code>
      <p className="text-xs text-muted-foreground flex-1">{value}</p>
      {required ? (
        <span className="text-[10px] text-red-400 font-semibold shrink-0">required</span>
      ) : (
        <span className="text-[10px] text-muted-foreground/50 font-semibold shrink-0">optional</span>
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center gap-0 shrink-0">
        <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-sm font-bold text-primary">{n}</div>
        <div className="w-px flex-1 bg-border/30 my-1" />
      </div>
      <div className="pb-6">
        <p className="text-sm font-semibold text-foreground mb-2">{title}</p>
        <div className="text-sm text-muted-foreground space-y-2">{children}</div>
      </div>
    </div>
  );
}

export default function Architecture() {
  return (
    <div className="space-y-10 pb-16 max-w-5xl">
      {/* Header */}
      <motion.div {...fade(0)}>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
            <Layers className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Architecture &amp; Deployment</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Everything you need to self-host Sentinel on AWS and connect it to Amazon Bedrock
            </p>
          </div>
        </div>
      </motion.div>

      {/* System Overview Diagram */}
      <motion.div {...fade(0.05)}>
        <SectionTitle icon={Network} title="System Architecture" subtitle="How all the components connect at runtime" />
        <Card>
          <div className="grid grid-cols-3 gap-4 items-stretch">
            {/* Frontend */}
            <div className="flex flex-col gap-3">
              <div className="text-center">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-300 mb-3">
                  <Globe className="w-3.5 h-3.5" /> Browser / Client
                </div>
              </div>
              <div className="bg-blue-950/30 border border-blue-500/20 rounded-lg p-3 text-center space-y-1.5 flex-1">
                <p className="text-xs font-bold text-blue-200">React 18 + Vite</p>
                <p className="text-[11px] text-muted-foreground">TypeScript · Tailwind CSS</p>
                <p className="text-[11px] text-muted-foreground">TanStack Query · Wouter</p>
                <p className="text-[11px] text-muted-foreground">Framer Motion · Recharts</p>
                <p className="text-[11px] text-muted-foreground">Lucide · shadcn/ui</p>
              </div>
              <div className="text-center">
                <Pill label="Port: $PORT (Vite)" color="blue" />
              </div>
            </div>

            {/* Arrow + API */}
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowRight className="w-4 h-4 text-primary" />
                <span className="font-mono text-[10px]">HTTP /api/*</span>
                <ArrowRight className="w-4 h-4 text-primary" />
              </div>
              <div className="w-full bg-violet-950/30 border border-violet-500/20 rounded-lg p-3 text-center space-y-1.5">
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-[10px] font-semibold text-violet-300">
                  <Server className="w-3 h-3" /> API Server
                </div>
                <p className="text-xs font-bold text-violet-200">Node.js + Express 5</p>
                <p className="text-[11px] text-muted-foreground">TypeScript · tsx</p>
                <p className="text-[11px] text-muted-foreground">LangChain.js</p>
                <p className="text-[11px] text-muted-foreground">LangGraph.js</p>
                <p className="text-[11px] text-muted-foreground">pg (node-postgres)</p>
              </div>
              <Pill label="Port: $PORT (Express)" color="violet" />
              <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                <ArrowRight className="w-4 h-4 text-amber-400 rotate-90" />
                <span className="font-mono text-[10px]">OpenAI-compat API</span>
                <ArrowRight className="w-4 h-4 text-amber-400 rotate-90" />
              </div>
              <div className="w-full bg-amber-950/20 border border-amber-500/20 rounded-lg p-3 text-center space-y-1.5">
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-semibold text-amber-300">
                  <Brain className="w-3 h-3" /> LLM
                </div>
                <p className="text-xs font-bold text-amber-200">gpt-4o-mini</p>
                <p className="text-[11px] text-muted-foreground">→ swap for Bedrock</p>
                <p className="text-[11px] text-muted-foreground">Claude 3.5 Haiku/Sonnet</p>
              </div>
            </div>

            {/* Database */}
            <div className="flex flex-col gap-3">
              <div className="text-center">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-300 mb-3">
                  <Database className="w-3.5 h-3.5" /> Persistence
                </div>
              </div>
              <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-lg p-3 text-center space-y-1.5 flex-1">
                <p className="text-xs font-bold text-emerald-200">PostgreSQL 14+</p>
                <p className="text-[11px] text-muted-foreground">Raw SQL via pg Pool</p>
                <hr className="border-border/30 my-2" />
                <p className="text-[11px] font-mono text-emerald-400/70">dup_duplicate_payments</p>
                <p className="text-[11px] font-mono text-emerald-400/70">dup_payments</p>
                <p className="text-[11px] font-mono text-emerald-400/70">dup_users</p>
                <p className="text-[11px] font-mono text-emerald-400/70">dup_user_reviews</p>
                <p className="text-[11px] font-mono text-emerald-400/70">dup_agent_memory</p>
                <p className="text-[11px] font-mono text-emerald-400/70">+ 7 more tables</p>
              </div>
              <div className="text-center">
                <Pill label="DATABASE_URL (postgres://)" color="emerald" />
              </div>
            </div>
          </div>

          {/* Agent layer */}
          <div className="mt-5 pt-5 border-t border-border/30">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 text-center">AI Agent Layer (9 agents — all inside the API server process)</p>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {[
                { name: "Master Agent", color: "violet" },
                { name: "SWIFT Specialist", color: "blue" },
                { name: "ACH Specialist", color: "blue" },
                { name: "MultiSource Detector", color: "blue" },
                { name: "FuzzyMatch Engine", color: "blue" },
                { name: "Pattern Analysis", color: "blue" },
                { name: "Review Agent", color: "cyan" },
                { name: "Training Agent", color: "cyan" },
                { name: "Text-to-SQL + Graph", color: "amber" },
              ].map((a) => (
                <div key={a.name} className={`rounded-lg px-2 py-1.5 text-center border text-[10px] font-medium
                  ${a.color === "violet" ? "bg-violet-500/10 border-violet-500/20 text-violet-300" :
                    a.color === "cyan" ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-300" :
                    a.color === "amber" ? "bg-amber-500/10 border-amber-500/20 text-amber-300" :
                    "bg-blue-500/10 border-blue-500/20 text-blue-300"}`}
                >
                  {a.name}
                </div>
              ))}
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Technology Stack */}
      <motion.div {...fade(0.08)}>
        <SectionTitle icon={Boxes} title="Technology Stack" subtitle="Full dependency list for both services" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Frontend */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-foreground">Frontend (React)</h3>
              <Pill label="artifacts/dup-detect" color="blue" />
            </div>
            <div className="space-y-1.5">
              {[
                ["react + react-dom", "18.x", "UI framework"],
                ["vite", "6.x", "Dev server + bundler"],
                ["typescript", "5.9", "Type safety"],
                ["tailwindcss", "4.x", "Utility CSS"],
                ["@tanstack/react-query", "5.x", "Data fetching + cache"],
                ["wouter", "3.x", "Client-side routing"],
                ["framer-motion", "12.x", "Animations"],
                ["recharts", "2.x", "Charts and graphs"],
                ["lucide-react", "—", "Icon library"],
                ["@radix-ui/*", "—", "Accessible UI primitives"],
              ].map(([pkg, ver, desc]) => (
                <div key={pkg} className="flex items-baseline gap-2 text-[11px]">
                  <code className="text-blue-300 font-mono shrink-0">{pkg}</code>
                  <span className="text-muted-foreground/50 shrink-0">{ver}</span>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Backend */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Server className="w-4 h-4 text-violet-400" />
              <h3 className="text-sm font-bold text-foreground">Backend (Node.js)</h3>
              <Pill label="artifacts/api-server" color="violet" />
            </div>
            <div className="space-y-1.5">
              {[
                ["express", "5.x", "HTTP framework"],
                ["typescript + tsx", "5.9 / 4.x", "Language + runner"],
                ["@langchain/core", "1.x", "LangChain base layer"],
                ["@langchain/openai", "1.x", "OpenAI / Bedrock adapter"],
                ["@langchain/langgraph", "1.x", "Stateful agent graphs"],
                ["pg", "8.x", "PostgreSQL driver"],
                ["uuid", "11.x", "UUID generation"],
                ["cors", "2.x", "CORS middleware"],
                ["drizzle-orm", "—", "Schema migrations (lib/db)"],
              ].map(([pkg, ver, desc]) => (
                <div key={pkg} className="flex items-baseline gap-2 text-[11px]">
                  <code className="text-violet-300 font-mono shrink-0">{pkg}</code>
                  <span className="text-muted-foreground/50 shrink-0">{ver}</span>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </motion.div>

      {/* Prerequisites */}
      <motion.div {...fade(0.1)}>
        <SectionTitle icon={Package} title="Prerequisites" subtitle="What you need installed before deploying" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <p className="text-sm font-bold text-foreground">Node.js</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              The entire backend runs on Node.js. No Python is required for the production server.
            </p>
            <CodeBlock>{`node --version
# Requires: v20.x or v22.x (LTS)
# Recommended: v22.x

npm install -g pnpm
pnpm --version  # 9.x or 10.x`}</CodeBlock>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Database className="w-4 h-4 text-emerald-400" />
              <p className="text-sm font-bold text-foreground">PostgreSQL</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              All persistence uses PostgreSQL 14+. On AWS, use Amazon RDS for PostgreSQL.
            </p>
            <CodeBlock>{`# Local dev
psql --version  # 14+ required

# AWS RDS (recommended)
# Engine: PostgreSQL 16
# Instance: db.t3.medium+
# Storage: 20 GB gp3 minimum`}</CodeBlock>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-4 h-4 text-amber-400" />
              <p className="text-sm font-bold text-foreground">LLM Access</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              One of the following is required for AI agents to function:
            </p>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="text-muted-foreground"><span className="text-foreground font-medium">Amazon Bedrock</span> — recommended for AWS</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="text-muted-foreground"><span className="text-foreground font-medium">OpenAI API key</span> — quickest to set up</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="text-muted-foreground"><span className="text-foreground font-medium">Any OpenAI-compatible endpoint</span> — Azure, local Ollama, etc.</span>
              </div>
            </div>
          </Card>
        </div>

        <div className="mt-4 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 flex gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-amber-300">No Python required.</span> The original Python FastAPI backend has been fully replaced by TypeScript. The <code className="text-amber-300">artifacts/py-api/</code> directory can be deleted when self-hosting — it is not used at runtime.
          </p>
        </div>
      </motion.div>

      {/* Environment Variables */}
      <motion.div {...fade(0.12)}>
        <SectionTitle icon={Key} title="Environment Variables" subtitle="Set these on your server or in AWS Parameter Store / Secrets Manager" />
        <Card>
          <div className="space-y-0 divide-y divide-border/20">
            <EnvRow
              name="DATABASE_URL"
              value="Full PostgreSQL connection string. Example: postgres://user:pass@host:5432/sentinel"
            />
            <EnvRow
              name="PORT"
              value="Port the Express API server listens on. Use 8080 for the API server, any available port for the frontend (Vite)."
            />
            <EnvRow
              name="OPENAI_API_KEY"
              value="Your OpenAI API key (sk-...). Used if AI_INTEGRATIONS_OPENAI_BASE_URL is not set. Set this for a direct OpenAI connection."
            />
            <EnvRow
              name="AI_INTEGRATIONS_OPENAI_BASE_URL"
              value="Override the OpenAI base URL. Point this at your Amazon Bedrock endpoint (see Bedrock section below) or any other OpenAI-compatible proxy."
              required={false}
            />
            <EnvRow
              name="AI_INTEGRATIONS_OPENAI_API_KEY"
              value="API key for the custom base URL above. When using Bedrock via the LangChain AWS adapter, set this to a placeholder (e.g. BEDROCK) — auth is handled by IAM."
              required={false}
            />
            <EnvRow
              name="NODE_ENV"
              value="Set to 'production' for the deployed build. The Vite frontend reads this to disable dev-only overlays."
              required={false}
            />
            <EnvRow
              name="BASE_PATH"
              value="URL path prefix for the React frontend (e.g. / if serving at root, or /sentinel if behind a reverse proxy sub-path). Required by Vite."
              required={false}
            />
          </div>
        </Card>
      </motion.div>

      {/* Amazon Bedrock */}
      <motion.div {...fade(0.14)}>
        <SectionTitle icon={Cpu} title="Connecting to Amazon Bedrock" subtitle="Swap OpenAI for Claude via the LangChain AWS adapter — no prompt changes needed" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <p className="text-sm font-semibold text-foreground mb-3">Option A — LangChain AWS Adapter (Recommended)</p>
            <p className="text-xs text-muted-foreground mb-3">
              Replace <code className="text-violet-300">@langchain/openai</code> with <code className="text-violet-300">@langchain/aws</code> and swap <code className="text-violet-300">ChatOpenAI</code> for <code className="text-violet-300">BedrockChat</code>. Auth is handled via IAM role on the EC2/ECS task — no API key needed.
            </p>
            <CodeBlock>{`# Install the AWS adapter
pnpm add @langchain/aws

# In artifacts/api-server/src/py-api/agents/base.ts
# Replace:
import { ChatOpenAI } from "@langchain/openai";

# With:
import { BedrockChat } from "@langchain/aws";

export function getLLM(temperature = 0.1) {
  return new BedrockChat({
    model: "anthropic.claude-3-5-haiku-20241022-v1:0",
    region: process.env.AWS_REGION ?? "us-east-1",
    temperature,
  });
}`}</CodeBlock>
            <p className="text-xs text-muted-foreground mt-3">Attach <code className="text-emerald-300">AmazonBedrockFullAccess</code> (or a scoped policy) to your EC2/ECS IAM role. No environment variable changes needed.</p>
          </Card>

          <Card>
            <p className="text-sm font-semibold text-foreground mb-3">Option B — Bedrock via OpenAI-Compatible Endpoint</p>
            <p className="text-xs text-muted-foreground mb-3">
              Bedrock exposes an OpenAI-compatible API endpoint. Set two environment variables and the existing code works as-is with no code changes.
            </p>
            <CodeBlock>{`# Set in AWS Parameter Store or .env:
AI_INTEGRATIONS_OPENAI_BASE_URL=https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.claude-3-5-haiku-20241022-v1:0/converse-stream/v1

# Auth header is set automatically via AWS SDK
# credential chain (IAM role recommended):
AI_INTEGRATIONS_OPENAI_API_KEY=placeholder

# Supported Bedrock models:
# anthropic.claude-3-5-haiku-20241022-v1:0  (fastest, cheapest)
# anthropic.claude-3-5-sonnet-20241022-v2:0 (best quality)
# amazon.nova-lite-v1:0  (AWS-native, very fast)`}</CodeBlock>
            <p className="text-xs text-muted-foreground mt-3">You must enable model access for your chosen models in the <span className="text-emerald-300">Amazon Bedrock console → Model access</span> page for your AWS region.</p>
          </Card>
        </div>
      </motion.div>

      {/* AWS Deployment */}
      <motion.div {...fade(0.16)}>
        <SectionTitle icon={Cloud} title="AWS Deployment Guide" subtitle="Recommended setup for a production bank environment" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="border-violet-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-4 h-4 text-violet-400" />
              <p className="text-xs font-bold text-foreground">Compute</p>
            </div>
            <p className="text-[11px] text-muted-foreground font-semibold mb-1">Recommended</p>
            <p className="text-xs text-violet-300 font-semibold">AWS ECS on Fargate</p>
            <p className="text-[11px] text-muted-foreground mt-1">Task: 1 vCPU · 2 GB RAM per container. Run two containers (api-server + frontend) or serve frontend as static S3 + CloudFront.</p>
            <hr className="my-2 border-border/30" />
            <p className="text-[11px] text-muted-foreground font-semibold mb-1">Simpler alternative</p>
            <p className="text-xs text-blue-300">EC2 t3.medium</p>
            <p className="text-[11px] text-muted-foreground mt-1">Both Node.js services on one instance behind nginx reverse proxy. Simplest option for small teams.</p>
          </Card>

          <Card className="border-emerald-500/20">
            <div className="flex items-center gap-2 mb-2">
              <HardDrive className="w-4 h-4 text-emerald-400" />
              <p className="text-xs font-bold text-foreground">Database</p>
            </div>
            <p className="text-xs text-emerald-300 font-semibold">Amazon RDS for PostgreSQL</p>
            <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              <p>• Engine: PostgreSQL 16</p>
              <p>• Instance: db.t3.medium (dev), db.r6g.large (prod)</p>
              <p>• Storage: 50 GB gp3 (auto-scaling enabled)</p>
              <p>• Multi-AZ: yes (production)</p>
              <p>• Automated backups: 7-day retention</p>
              <p>• VPC: same VPC as your compute, private subnet only</p>
            </div>
          </Card>

          <Card className="border-amber-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <p className="text-xs font-bold text-foreground">Networking</p>
            </div>
            <div className="space-y-1 text-[11px] text-muted-foreground">
              <p className="text-amber-300 font-semibold">Application Load Balancer</p>
              <p>• HTTPS on port 443 (ACM certificate)</p>
              <p>• Forward /api/* → api-server target group</p>
              <p>• Forward /* → frontend target group</p>
              <hr className="my-1.5 border-border/30" />
              <p className="text-cyan-300 font-semibold">Security Groups</p>
              <p>• ALB: 443 open to internet</p>
              <p>• API Server: 8080 from ALB SG only</p>
              <p>• RDS: 5432 from API Server SG only</p>
            </div>
          </Card>
        </div>

        {/* Step-by-step */}
        <Card>
          <p className="text-sm font-bold text-foreground mb-5">Step-by-step deployment</p>
          <div className="space-y-0">
            <Step n={1} title="Clone and install dependencies">
              <CodeBlock>{`git clone <your-repo-url> sentinel
cd sentinel
npm install -g pnpm
pnpm install          # installs all workspace packages`}</CodeBlock>
            </Step>

            <Step n={2} title="Provision PostgreSQL (RDS or local)">
              <p className="mb-2">Create a PostgreSQL 16 database named <code className="text-emerald-300">sentinel</code>. The application auto-creates all 12 tables and seeds sample data on first startup — no manual migrations required.</p>
              <CodeBlock>{`# Set your connection string
export DATABASE_URL="postgres://sentinel_user:strongpassword@rds-endpoint.us-east-1.rds.amazonaws.com:5432/sentinel"

# Tables are created automatically on first server start
# Seed data: 500 duplicate payments + 2,960 payment records`}</CodeBlock>
            </Step>

            <Step n={3} title="Enable Bedrock model access">
              <p className="mb-2">In the AWS Console → Bedrock → Model access, enable at least one Anthropic Claude model in your target region. Attach the <code className="text-emerald-300">AmazonBedrockFullAccess</code> policy to your EC2/ECS IAM role.</p>
              <CodeBlock>{`# IAM policy (minimum scope)
{
  "Effect": "Allow",
  "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
  "Resource": "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-haiku*"
}`}</CodeBlock>
            </Step>

            <Step n={4} title="Build the API server">
              <CodeBlock>{`cd artifacts/api-server

# Development (tsx, hot-reload)
PORT=8080 DATABASE_URL=<url> pnpm dev

# Production build (esbuild CJS bundle)
pnpm build
# Output: dist/index.cjs

# Run production build
NODE_ENV=production PORT=8080 DATABASE_URL=<url> node dist/index.cjs`}</CodeBlock>
            </Step>

            <Step n={5} title="Build the React frontend">
              <CodeBlock>{`cd artifacts/dup-detect

# Production build (output: dist/public/)
BASE_PATH=/ PORT=3000 pnpm build

# Serve with a static server (e.g. serve, nginx, S3+CloudFront)
# Or run in dev mode:
BASE_PATH=/ PORT=3000 pnpm dev`}</CodeBlock>
            </Step>

            <Step n={6} title="Configure nginx reverse proxy (EC2 option)">
              <CodeBlock>{`# /etc/nginx/sites-available/sentinel
server {
  listen 443 ssl;
  server_name sentinel.yourdomain.com;

  # SSL certificate (ACM via ALB, or Let's Encrypt)
  ssl_certificate /etc/ssl/sentinel.crt;
  ssl_certificate_key /etc/ssl/sentinel.key;

  # API traffic → Express (port 8080)
  location /api/ {
    proxy_pass http://localhost:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }

  location /py-api/ {
    proxy_pass http://localhost:8080;
    proxy_set_header Host $host;
  }

  # All other traffic → Vite / static frontend
  location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
  }
}`}</CodeBlock>
            </Step>

            <Step n={7} title="Store secrets in AWS Parameter Store">
              <CodeBlock>{`aws ssm put-parameter \\
  --name "/sentinel/DATABASE_URL" \\
  --value "postgres://..." \\
  --type "SecureString"

aws ssm put-parameter \\
  --name "/sentinel/NODE_ENV" \\
  --value "production" \\
  --type "String"

# Bedrock: no API key needed — uses IAM role credentials
# OpenAI fallback:
aws ssm put-parameter \\
  --name "/sentinel/OPENAI_API_KEY" \\
  --value "sk-..." \\
  --type "SecureString"`}</CodeBlock>
            </Step>
          </div>
        </Card>
      </motion.div>

      {/* Docker / ECS */}
      <motion.div {...fade(0.18)}>
        <SectionTitle icon={GitBranch} title="Docker &amp; ECS" subtitle="Containerise both services for ECS Fargate deployment" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <p className="text-xs font-bold text-foreground mb-3">Dockerfile — API Server</p>
            <CodeBlock>{`FROM node:22-alpine AS base
WORKDIR /app
RUN npm install -g pnpm

# Install workspace dependencies
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/
RUN pnpm install --frozen-lockfile

# Build
RUN pnpm --filter @workspace/api-server run build

EXPOSE 8080
ENV NODE_ENV=production PORT=8080

CMD ["node", "artifacts/api-server/dist/index.cjs"]`}</CodeBlock>
          </Card>

          <Card>
            <p className="text-xs font-bold text-foreground mb-3">Dockerfile — Frontend (static via nginx)</p>
            <CodeBlock>{`FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY artifacts/dup-detect/ ./artifacts/dup-detect/
RUN pnpm install --frozen-lockfile
RUN BASE_PATH=/ pnpm --filter @workspace/dup-detect run build

FROM nginx:alpine
COPY --from=builder /app/artifacts/dup-detect/dist/public /usr/share/nginx/html
# Add nginx config to proxy /api → api-server
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80`}</CodeBlock>
          </Card>
        </div>
      </motion.div>

      {/* Data Flow */}
      <motion.div {...fade(0.2)}>
        <SectionTitle icon={Shield} title="Security Considerations" subtitle="Checklist before going live in a bank environment" />
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <p className="text-xs font-bold text-foreground uppercase tracking-widest mb-3 text-muted-foreground">Network</p>
              {[
                "RDS in private subnet — no public internet access",
                "API server security group: only ALB can reach port 8080",
                "Enable VPC Flow Logs for audit trail",
                "Use AWS WAF on the ALB for rate limiting and SQL injection protection",
                "Enable TLS 1.2+ on all connections (ALB, RDS)",
              ].map((item) => (
                <div key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold text-foreground uppercase tracking-widest mb-3 text-muted-foreground">Application</p>
              {[
                "Replace hardcoded analyst users with your SSO / LDAP integration (replace the users route)",
                "Add session tokens or JWT — current auth is demo-only (no password)",
                "Rotate DATABASE_URL credentials via AWS Secrets Manager rotation",
                "Enable CloudTrail for API call auditing",
                "Set up CloudWatch alarms on API error rate (5xx) and latency",
                "Enable RDS automated backups with 7-day retention minimum",
              ].map((item) => (
                <div key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
