import { useState } from "react";
import { useGetDuplicatePayments, useExportDuplicates } from "@workspace/api-client-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProbabilityBadge } from "@/components/ui/ProbabilityBadge";
import { formatCurrency } from "@/lib/utils";
import { Download, Search, SlidersHorizontal, Eye } from "lucide-react";

export default function DuplicatesList() {
  const [page, setPage] = useState(1);
  const [systemFilter, setSystemFilter] = useState("");
  
  const { data, isLoading } = useGetDuplicatePayments({ 
    page, 
    limit: 15,
    paymentSystem: systemFilter || undefined
  });

  const exportMutation = useExportDuplicates({
    mutation: {
      onSuccess: (res) => {
        // In a real app, this might trigger a download via URL
        alert(`Exported ${res.recordCount} records. File: ${res.filename}`);
      }
    }
  });

  const handleExport = () => {
    exportMutation.mutate({ data: { format: "csv" } });
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
          <Button 
            onClick={handleExport} 
            disabled={exportMutation.isPending}
            className="gap-2"
          >
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
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/10 border-b border-border/50">
              <tr>
                <th className="px-6 py-4 font-semibold tracking-wider">Payment IDs</th>
                <th className="px-6 py-4 font-semibold tracking-wider">System & Type</th>
                <th className="px-6 py-4 font-semibold tracking-wider">Amount</th>
                <th className="px-6 py-4 font-semibold tracking-wider">Probability</th>
                <th className="px-6 py-4 font-semibold tracking-wider">Status</th>
                <th className="px-6 py-4 font-semibold tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex justify-center mb-2">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    Loading payments...
                  </td>
                </tr>
              ) : data?.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    No duplicate payments found matching criteria.
                  </td>
                </tr>
              ) : (
                data?.items.map((item) => (
                  <tr key={item.id} className="hover:bg-secondary/20 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-mono text-xs text-foreground mb-1">{item.payment1Id}</div>
                      <div className="font-mono text-xs text-muted-foreground">{item.payment2Id}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">{item.paymentSystem}</div>
                      <div className="text-xs text-muted-foreground capitalize">{item.duplicateType.replace('_', ' ')}</div>
                    </td>
                    <td className="px-6 py-4 font-medium text-foreground">
                      {formatCurrency(item.amount, item.currency)}
                    </td>
                    <td className="px-6 py-4">
                      <ProbabilityBadge probability={item.probability} />
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider bg-secondary text-secondary-foreground">
                        {item.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Eye className="w-4 h-4 mr-1.5" />
                        Review
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {data && (
          <div className="p-4 border-t border-border/50 flex items-center justify-between text-sm text-muted-foreground bg-secondary/10">
            <div>
              Showing <span className="font-medium text-foreground">{(page - 1) * data.limit + 1}</span> to <span className="font-medium text-foreground">{Math.min(page * data.limit, data.total)}</span> of <span className="font-medium text-foreground">{data.total}</span> results
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={page >= data.totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
