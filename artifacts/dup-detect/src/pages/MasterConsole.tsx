import { useState, useEffect } from "react";
import { useRunMasterScan, useGetScanStatus, useGetDetectorOpinions } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Play, Shield, CheckCircle2, AlertCircle, RefreshCw, Activity } from "lucide-react";
import { motion } from "framer-motion";

export default function MasterConsole() {
  const [maxPayments, setMaxPayments] = useState(100000);
  const [useAllDetectors, setUseAllDetectors] = useState(false);
  const [scanId, setScanId] = useState<string | null>(null);

  const scanMutation = useRunMasterScan({
    mutation: {
      onSuccess: (data) => setScanId(data.scanId)
    }
  });

  const { data: statusData, refetch } = useGetScanStatus({
    query: {
      enabled: !!scanId,
      refetchInterval: (query) => {
        // Using query.state.data to access the current data in v5 refetchInterval
        return query.state.data?.status === 'running' ? 2000 : false;
      }
    }
  });

  const isRunning = scanMutation.isPending || statusData?.status === 'running';

  const handleRunScan = () => {
    scanMutation.mutate({
      data: {
        maxPayments,
        useAllDetectors,
        paymentSystems: ["SWIFT_MT", "SWIFT_MX", "ACH"]
      }
    });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Master Console</h1>
        <p className="text-muted-foreground mt-1">Configure and launch the multi-agent detection engine.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 border-primary/20 bg-gradient-to-b from-card to-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Scan Configuration
            </CardTitle>
            <CardDescription>Set parameters for the master agent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <label className="text-sm font-medium flex justify-between">
                Payments to Scan
                <span className="text-primary">{maxPayments.toLocaleString()}</span>
              </label>
              <input 
                type="range" 
                min="10000" 
                max="1000000" 
                step="10000"
                value={maxPayments}
                onChange={(e) => setMaxPayments(Number(e.target.value))}
                className="w-full accent-primary h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                disabled={isRunning}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>10k</span>
                <span>1M</span>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium">Agent Strategy</label>
              <label className="flex items-start gap-3 p-3 rounded-xl border border-border/50 bg-secondary/20 cursor-pointer hover:bg-secondary/40 transition-colors">
                <input 
                  type="checkbox" 
                  checked={useAllDetectors}
                  onChange={(e) => setUseAllDetectors(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-border text-primary focus:ring-primary"
                  disabled={isRunning}
                />
                <div>
                  <div className="text-sm font-medium text-foreground">Consult All Detectors</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Slower, but uses consensus from multiple trained agents for higher accuracy.</div>
                </div>
              </label>
            </div>

            <Button 
              className="w-full h-12 text-base gap-2 font-bold" 
              onClick={handleRunScan}
              disabled={isRunning}
            >
              {isRunning ? (
                <><RefreshCw className="w-5 h-5 animate-spin" /> Scanning...</>
              ) : (
                <><Play className="w-5 h-5 fill-current" /> Initialize Scan</>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader>
            <CardTitle>Execution Status</CardTitle>
            <CardDescription>Real-time telemetry from the detection agents.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center min-h-[300px]">
            {!scanId && !statusData ? (
              <div className="text-center space-y-4 text-muted-foreground">
                <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mx-auto mb-4 border border-border/50">
                  <Activity className="w-8 h-8 opacity-50" />
                </div>
                <p>System idle. Ready to initialize multi-agent scan.</p>
              </div>
            ) : (
              <div className="space-y-8 w-full max-w-lg mx-auto">
                <div className="flex justify-between items-end mb-2">
                  <div>
                    <h4 className="font-semibold text-foreground text-lg uppercase tracking-wide">
                      {statusData?.currentPhase || 'Initializing...'}
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      {statusData?.status === 'running' ? 'Agents actively processing payment graphs.' : 'Scan complete.'}
                    </p>
                  </div>
                  <div className="text-3xl font-display font-bold text-primary">
                    {Math.round((statusData?.progress ?? 0) * 100)}%
                  </div>
                </div>

                <div className="h-4 w-full bg-secondary rounded-full overflow-hidden border border-border/50">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-primary to-accent relative"
                    initial={{ width: 0 }}
                    animate={{ width: `${(statusData?.progress ?? 0) * 100}%` }}
                    transition={{ ease: "linear", duration: 0.5 }}
                  >
                    <div className="absolute inset-0 bg-white/20 animate-[pulse_2s_ease-in-out_infinite]" />
                  </motion.div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/50">
                  <div className="bg-secondary/20 p-4 rounded-xl border border-border/30">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Processed</div>
                    <div className="text-2xl font-mono font-semibold text-foreground">
                      {statusData?.paymentsScanned.toLocaleString() ?? 0}
                    </div>
                  </div>
                  <div className="bg-destructive/5 p-4 rounded-xl border border-destructive/20">
                    <div className="text-xs text-destructive uppercase tracking-wider mb-1">Findings</div>
                    <div className="text-2xl font-mono font-semibold text-destructive">
                      {statusData?.duplicatesFound.toLocaleString() ?? 0}
                    </div>
                  </div>
                </div>
                
                {statusData?.status === 'completed' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-success/10 border border-success/20 rounded-xl flex items-start gap-3"
                  >
                    <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
                    <div>
                      <h5 className="font-medium text-success">Scan Successfully Completed</h5>
                      <p className="text-sm text-success/80 mt-1">The master agent has finished analyzing the dataset. View findings in the Duplicates List.</p>
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
