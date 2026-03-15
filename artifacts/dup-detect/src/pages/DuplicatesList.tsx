import { useState, Fragment } from "react";
import { useGetDuplicatePayments, useExportDuplicates } from "@workspace/api-client-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProbabilityBadge } from "@/components/ui/ProbabilityBadge";
import { formatCurrency } from "@/lib/utils";
import { Download, Search, SlidersHorizontal, Eye, ChevronDown, ChevronUp, ArrowRight, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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

function FieldRow({ label, val1, val2, matched }: { label: string; val1: string; val2: string; matched: boolean }) {
  return (
    <div className={`grid grid-cols-[140px_1fr_1fr] gap-3 px-4 py-2 rounded-lg text-sm ${matched ? "bg-primary/10 border border-primary/20" : "bg-secondary/10"}`}>
      <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
        {matched && <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
        <span className={matched ? "text-primary" : ""}>{label}</span>
      </div>
      <div className={`font-mono text-xs break-all ${matched ? "text-primary font-semibold" : "text-foreground"}`}>{val1 || "—"}</div>
      <div className={`font-mono text-xs break-all ${matched ? "text-primary font-semibold" : "text-foreground"}`}>{val2 || "—"}</div>
    </div>
  );
}

function DetailPanel({ item }: { item: DuplicateItem }) {
  const matched = new Set((item.matchedFields ?? []).map((f) => f.toLowerCase()));

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }); }
    catch { return d; }
  };

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
          {/* Header */}
          <div className="grid grid-cols-[140px_1fr_1fr] gap-3 px-4 py-3 bg-secondary/30 border-b border-border/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <div>Field</div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-400"></span>
              {item.payment1Id}
              <span className="text-[10px] normal-case text-muted-foreground font-normal">(original)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-orange-400"></span>
              {item.payment2Id}
              <span className="text-[10px] normal-case text-muted-foreground font-normal">(suspected dup)</span>
            </div>
          </div>

          {/* Rows */}
          <div className="p-3 space-y-1.5">
            <FieldRow
              label="Payment Date"
              val1={formatDate(item.paymentDate1)}
              val2={formatDate(item.paymentDate2)}
              matched={matched.has("value_date") || matched.has("payment_date")}
            />
            <FieldRow
              label="Amount"
              val1={formatCurrency(item.amount, item.currency)}
              val2={formatCurrency(item.amount, item.currency)}
              matched={matched.has("amount")}
            />
            <FieldRow
              label="Currency"
              val1={item.currency}
              val2={item.currency}
              matched={matched.has("currency")}
            />
            <FieldRow
              label="Sender BIC"
              val1={item.senderBIC ?? "—"}
              val2={item.senderBIC ?? "—"}
              matched={matched.has("sender_bic")}
            />
            <FieldRow
              label="Receiver BIC"
              val1={item.receiverBIC ?? "—"}
              val2={item.receiverBIC ?? "—"}
              matched={matched.has("receiver_bic")}
            />
            <FieldRow
              label="Originator"
              val1={item.originatorCountry ?? "—"}
              val2={item.originatorCountry ?? "—"}
              matched={matched.has("originator_country")}
            />
            <FieldRow
              label="Beneficiary"
              val1={item.beneficiaryCountry ?? "—"}
              val2={item.beneficiaryCountry ?? "—"}
              matched={matched.has("beneficiary_country")}
            />
          </div>

          {/* Footer: why flagged */}
          <div className="px-4 py-3 border-t border-border/50 bg-secondary/10 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Matched on:</span>
            {(item.matchedFields ?? []).map((f) => (
              <span key={f} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary border border-primary/25 uppercase tracking-wide">
                {f.replace(/_/g, " ")}
              </span>
            ))}
            <span className="ml-auto text-xs text-muted-foreground">
              Detection type: <span className="text-foreground font-medium capitalize">{item.duplicateType.replace(/_/g, " ")}</span>
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function DuplicatesList() {
  const [page, setPage] = useState(1);
  const [systemFilter, setSystemFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useGetDuplicatePayments({
    page,
    limit: 15,
    paymentSystem: systemFilter || undefined,
  });

  const exportMutation = useExportDuplicates({
    mutation: {
      onSuccess: (res) => {
        alert(`Exported ${res.recordCount} records. File: ${res.filename}`);
      },
    },
  });

  const handleExport = () => {
    exportMutation.mutate({ data: { format: "csv" } });
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Duplicate Findings</h1>
          <p className="text-muted-foreground mt-1">Review and action potential duplicate payments.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2">
            <SlidersHorizontal className="w-4 h-4" />
            Filters
          </Button>
          <Button onClick={handleExport} disabled={exportMutation.isPending} className="gap-2">
            <Download className="w-4 h-4" />
            {exportMutation.isPending ? "Exporting..." : "Export CSV"}
          </Button>
        </div>
      </div>

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
            onChange={(e) => setSystemFilter(e.target.value)}
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
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
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
                data?.items.map((item) => {
                  const isExpanded = expandedId === item.id;
                  return (
                    <Fragment key={item.id}>
                      <tr
                        onClick={() => toggleExpand(item.id)}
                        className={`border-b border-border/30 hover:bg-secondary/20 transition-colors cursor-pointer group ${isExpanded ? "bg-secondary/20 border-primary/20" : ""}`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="inline-block w-2 h-2 rounded-full bg-blue-400 flex-shrink-0"></span>
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
                            {(item.matchedFields ?? []).slice(0, 3).map((f) => (
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
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider bg-secondary text-secondary-foreground">
                            {item.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                            <Eye className="w-3.5 h-3.5" />
                            {isExpanded ? (
                              <><span>Hide</span><ChevronUp className="w-3.5 h-3.5" /></>
                            ) : (
                              <><span>Compare</span><ChevronDown className="w-3.5 h-3.5" /></>
                            )}
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
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= data.totalPages}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
