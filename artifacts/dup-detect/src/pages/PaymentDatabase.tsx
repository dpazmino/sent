import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Database, Filter, Search, ChevronLeft, ChevronRight,
  CreditCard, Banknote, Building2, Wifi, RefreshCw
} from "lucide-react";

const SYSTEM_COLORS: Record<string, string> = {
  SWIFT_MT: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  SWIFT_MX: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  ACH: "bg-green-500/15 text-green-400 border-green-500/30",
  INTERNAL: "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

const SYSTEM_ICONS: Record<string, React.ElementType> = {
  SWIFT_MT: Wifi,
  SWIFT_MX: Wifi,
  ACH: Building2,
  INTERNAL: CreditCard,
};

const STATUS_COLORS: Record<string, string> = {
  settled: "text-green-400",
  processing: "text-yellow-400",
  failed: "text-red-400",
  returned: "text-orange-400",
  cancelled: "text-muted-foreground",
  received: "text-blue-400",
};

function fmt(n: number | null | undefined, ccy?: string) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy || "USD", maximumFractionDigits: 2 }).format(n);
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-card/50 border border-border/50 rounded-xl p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">{label}</p>
      <p className="text-2xl font-bold text-foreground">{typeof value === "number" ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function PaymentDatabase() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterSystem, setFilterSystem] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [selectedPayment, setSelectedPayment] = useState<Record<string, unknown> | null>(null);

  const statsQ = useQuery({
    queryKey: ["payment-stats"],
    queryFn: () => fetch(`/api/payments/stats`).then(r => r.json()),
    staleTime: 30_000,
  });

  const listQ = useQuery({
    queryKey: ["payments", page, search, filterSystem, filterSource, filterCurrency, filterStatus],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), page_size: "50" });
      if (search) params.set("search", search);
      if (filterSystem) params.set("payment_system", filterSystem);
      if (filterSource) params.set("source_system", filterSource);
      if (filterCurrency) params.set("currency", filterCurrency);
      if (filterStatus) params.set("status", filterStatus);
      return fetch(`/api/payments?${params}`).then(r => r.json());
    },
    staleTime: 15_000,
  });

  const stats = statsQ.data;
  const list = listQ.data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary/10 rounded-lg border border-primary/20">
              <Database className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground">Payment Database</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-11">
            Simulated bank payment ledger — SWIFT MT/MX, ACH, and Internal payments from all source systems
          </p>
        </div>
        <button
          onClick={() => { statsQ.refetch(); listQ.refetch(); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary/50 hover:bg-secondary border border-border/50 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Payments" value={stats.total} sub="across all systems" />
          {stats.byPaymentSystem?.slice(0, 3).map((s: { system: string; count: number }) => (
            <StatCard key={s.system} label={s.system.replace("_", " ")} value={s.count} />
          ))}
        </div>
      )}

      {/* System breakdown */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-card/50 border border-border/50 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">By Payment System</h3>
            <div className="space-y-2">
              {stats.byPaymentSystem?.map((s: { system: string; count: number }) => {
                const pct = Math.round((s.count / stats.total) * 100);
                return (
                  <div key={s.system}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${SYSTEM_COLORS[s.system] || "bg-muted text-muted-foreground border-border"}`}>
                        {s.system}
                      </span>
                      <span className="text-muted-foreground">{s.count.toLocaleString()} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bg-card/50 border border-border/50 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">By Source System</h3>
            <div className="space-y-2">
              {stats.bySourceSystem?.slice(0, 6).map((s: { system: string; count: number }) => {
                const pct = Math.round((s.count / stats.total) * 100);
                return (
                  <div key={s.system} className="flex items-center gap-3 text-xs">
                    <span className="w-28 text-muted-foreground truncate">{s.system}</span>
                    <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-10 text-right text-muted-foreground">{s.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-4 py-2 bg-secondary/30 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            placeholder="Search by ID, name, UETR, trace…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="px-3 py-2 bg-secondary/30 border border-border/50 rounded-lg text-sm text-foreground focus:outline-none"
          value={filterSystem}
          onChange={e => { setFilterSystem(e.target.value); setPage(1); }}
        >
          <option value="">All Systems</option>
          <option value="SWIFT_MT">SWIFT MT</option>
          <option value="SWIFT_MX">SWIFT MX</option>
          <option value="ACH">ACH</option>
          <option value="INTERNAL">Internal</option>
        </select>
        <select
          className="px-3 py-2 bg-secondary/30 border border-border/50 rounded-lg text-sm text-foreground focus:outline-none"
          value={filterSource}
          onChange={e => { setFilterSource(e.target.value); setPage(1); }}
        >
          <option value="">All Sources</option>
          <option value="CORE_BANKING">Core Banking</option>
          <option value="TREASURY">Treasury</option>
          <option value="TRADE_FINANCE">Trade Finance</option>
          <option value="CORRESPONDENT">Correspondent</option>
          <option value="RTGS">RTGS</option>
          <option value="SWIFT_GPI">SWIFT GPI</option>
        </select>
        <select
          className="px-3 py-2 bg-secondary/30 border border-border/50 rounded-lg text-sm text-foreground focus:outline-none"
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
        >
          <option value="">All Statuses</option>
          <option value="settled">Settled</option>
          <option value="processing">Processing</option>
          <option value="failed">Failed</option>
          <option value="returned">Returned</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-card/50 border border-border/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-secondary/20">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">System / Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Source</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Originator</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Beneficiary</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Value Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {listQ.isLoading && (
                <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">Loading…</td></tr>
              )}
              {list?.payments?.map((p: Record<string, unknown>) => {
                const system = p.payment_system as string;
                const Icon = SYSTEM_ICONS[system] || Banknote;
                return (
                  <tr
                    key={p.id as string}
                    className="border-b border-border/30 hover:bg-secondary/20 cursor-pointer transition-colors"
                    onClick={() => setSelectedPayment(p)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{(p.id as string).slice(0, 18)}…</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium ${SYSTEM_COLORS[system] || "bg-muted text-muted-foreground border-border"}`}>
                          <Icon className="w-3 h-3" />{system}
                        </span>
                        {p.message_type && <span className="text-xs text-muted-foreground">{p.message_type as string}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{(p.source_system as string) || "—"}</td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-foreground truncate max-w-[140px]">{(p.originator_name as string) || "—"}</p>
                      <p className="text-xs text-muted-foreground">{(p.originator_country as string) || ""}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-foreground truncate max-w-[140px]">{(p.beneficiary_name as string) || "—"}</p>
                      <p className="text-xs text-muted-foreground">{(p.beneficiary_country as string) || ""}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-medium text-foreground whitespace-nowrap">
                      {fmt(p.amount as number, p.currency as string)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{(p.value_date as string) || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium capitalize ${STATUS_COLORS[p.status as string] || "text-muted-foreground"}`}>
                        {p.status as string}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {list && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/30 bg-secondary/10">
            <span className="text-xs text-muted-foreground">
              {list.total.toLocaleString()} payments · page {list.page} of {list.pages}
            </span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="p-1.5 rounded-lg border border-border/50 disabled:opacity-30 hover:bg-secondary transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button disabled={page >= list.pages} onClick={() => setPage(p => p + 1)}
                className="p-1.5 rounded-lg border border-border/50 disabled:opacity-30 hover:bg-secondary transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Payment Detail Modal */}
      {selectedPayment && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedPayment(null)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <span className={`px-2.5 py-1 rounded-full border text-xs font-semibold ${SYSTEM_COLORS[selectedPayment.payment_system as string] || "bg-muted border-border text-muted-foreground"}`}>
                  {selectedPayment.payment_system as string}
                </span>
                <span className="font-mono text-sm text-muted-foreground">{selectedPayment.id as string}</span>
              </div>
              <button onClick={() => setSelectedPayment(null)} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
              {[
                ["Message Type", "message_type"], ["Source System", "source_system"], ["Channel", "channel"],
                ["Amount", null], ["Currency", "currency"], ["Value Date", "value_date"], ["Status", "status"], ["Priority", "priority"],
                ["Originator", "originator_name"], ["Originator Account", "originator_account"], ["Originator Country", "originator_country"],
                ["Sender BIC", "sender_bic"], ["Sender Bank", "sender_bank_name"],
                ["Beneficiary", "beneficiary_name"], ["Beneficiary Account", "beneficiary_account"], ["Beneficiary Country", "beneficiary_country"],
                ["Receiver BIC", "receiver_bic"], ["Receiver Bank", "receiver_bank_name"],
                ["UETR", "uetr"], ["Transaction Ref", "transaction_reference"], ["End-to-End ID", "end_to_end_id"],
                ["Trace Number", "trace_number"], ["Routing Number", "routing_number"], ["SEC Code", "sec_code"],
                ["Company Name", "company_name"], ["Individual Name", "individual_name"],
                ["Internal Ref", "internal_ref"], ["From Account", "from_account"], ["To Account", "to_account"],
                ["GL Code", "gl_code"], ["Department", "department"],
                ["Remittance Info", "remittance_info"], ["Purpose Code", "purpose_code"],
              ].map(([label, key]) => {
                const val = key === null
                  ? fmt(selectedPayment.amount as number, selectedPayment.currency as string)
                  : selectedPayment[key as string];
                if (!val) return null;
                return (
                  <div key={label as string} className="col-span-1">
                    <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                    <p className="text-sm font-medium text-foreground break-all">{String(val)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
