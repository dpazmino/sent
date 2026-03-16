import { useState, useRef, useEffect } from "react";
import { useGraphQuery } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Sparkles, Send, BarChart3, TrendingUp, PieChart as PieChartIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer 
} from 'recharts';

const CHART_COLORS = ['#3b82f6', '#06b6d4', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981'];

export default function GraphChat() {
  const [input, setInput] = useState("");
  const [conversationId] = useState(() => Math.random().toString(36).substring(7));
  
  const [history, setHistory] = useState<Array<{
    query: string;
    response?: any; // GraphQueryResponse
    loading?: boolean;
    error?: boolean;
  }>>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const queryMutation = useGraphQuery();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || queryMutation.isPending) return;

    const currentQuery = input;
    setInput("");
    
    setHistory(prev => [...prev, { query: currentQuery, loading: true }]);

    queryMutation.mutate({
      data: { query: currentQuery, conversationId }
    }, {
      onSuccess: (data) => {
        setHistory(prev => {
          const newHistory = [...prev];
          newHistory[newHistory.length - 1] = { query: currentQuery, response: data, loading: false };
          return newHistory;
        });
      },
      onError: () => {
        setHistory(prev => {
          const newHistory = [...prev];
          newHistory[newHistory.length - 1] = { query: currentQuery, loading: false, error: true };
          return newHistory;
        });
      }
    });
  };

  const renderChart = (spec: any) => {
    if (!spec || !spec.datasets || spec.datasets.length === 0) return null;
    
    // Transform datasets for recharts format
    const chartData = spec.labels.map((label: string, i: number) => {
      const point: any = { name: label };
      spec.datasets.forEach((ds: any) => {
        point[ds.label] = ds.data[i];
      });
      return point;
    });

    const isDark = true; // Assuming dark theme is enforced

    const commonProps = {
      data: chartData,
      margin: { top: 20, right: 30, left: 20, bottom: 20 }
    };

    const tooltipStyle = {
      backgroundColor: 'hsl(var(--card))',
      borderColor: 'hsl(var(--border))',
      color: 'hsl(var(--foreground))',
      borderRadius: '8px'
    };

    if (spec.chartType === 'bar') {
      return (
        <ResponsiveContainer width="100%" height={350}>
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" tick={{fontSize: 12}} />
            <YAxis stroke="hsl(var(--muted-foreground))" tick={{fontSize: 12}} />
            <RechartsTooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            {spec.datasets.map((ds: any, idx: number) => (
              <Bar key={ds.label} dataKey={ds.label} fill={CHART_COLORS[idx % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (spec.chartType === 'line') {
      return (
        <ResponsiveContainer width="100%" height={350}>
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" tick={{fontSize: 12}} />
            <YAxis stroke="hsl(var(--muted-foreground))" tick={{fontSize: 12}} />
            <RechartsTooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            {spec.datasets.map((ds: any, idx: number) => (
              <Line key={ds.label} type="monotone" dataKey={ds.label} stroke={CHART_COLORS[idx % CHART_COLORS.length]} strokeWidth={3} activeDot={{ r: 8 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );
    }
    
    if (spec.chartType === 'pie') {
      // Recharts pie needs specific data shape per pie, assuming single dataset for pie
      const pieData = spec.labels.map((label: string, i: number) => ({
        name: label,
        value: spec.datasets[0].data[i]
      }));

      return (
        <ResponsiveContainer width="100%" height={350}>
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
              {pieData.map((entry: any, index: number) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <RechartsTooltip contentStyle={tooltipStyle} />
            <Legend verticalAlign="bottom" />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    return <div className="p-4 text-muted-foreground text-center border border-dashed rounded-lg">Unsupported chart type: {spec.chartType}</div>;
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col max-w-4xl mx-auto">
      <div className="text-center mb-8 shrink-0">
        <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-primary/10 border border-primary/20 mb-4 shadow-[0_0_30px_rgba(33,150,243,0.2)]">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-display font-bold text-foreground">AI Intelligence Studio</h1>
        <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
          Query the payment database using natural language. The agent writes SQL and visualizes the results instantly.
        </p>
      </div>

      <Card className="flex-1 flex flex-col border-border/50 shadow-2xl overflow-hidden min-h-0 bg-card/60 backdrop-blur-xl">
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          {history.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-6">
              <div className="grid grid-cols-2 gap-4 max-w-md w-full">
                <div 
                  className="p-4 rounded-xl border border-border/50 bg-secondary/20 hover:bg-secondary/40 cursor-pointer transition-colors text-center text-sm"
                  onClick={() => setInput("Show me duplicate payments by country corridor for the last 30 days")}
                >
                  <BarChart3 className="w-5 h-5 mx-auto mb-2 text-primary" />
                  Duplicates by Corridor
                </div>
                <div 
                  className="p-4 rounded-xl border border-border/50 bg-secondary/20 hover:bg-secondary/40 cursor-pointer transition-colors text-center text-sm"
                  onClick={() => setInput("Trend of SWIFT vs ACH duplicates this year")}
                >
                  <TrendingUp className="w-5 h-5 mx-auto mb-2 text-accent" />
                  SWIFT vs ACH Trend
                </div>
              </div>
            </div>
          ) : (
            history.map((item, i) => (
              <div key={i} className="space-y-4">
                <div className="flex justify-end">
                  <div className="bg-secondary text-secondary-foreground px-5 py-3 rounded-2xl rounded-tr-sm max-w-[80%] text-sm shadow-md">
                    {item.query}
                  </div>
                </div>
                
                <div className="flex justify-start">
                  <div className="max-w-[90%] w-full">
                    {item.loading ? (
                      <div className="flex items-center gap-3 text-muted-foreground text-sm p-4 bg-background/50 rounded-2xl rounded-tl-sm border border-border/50 w-fit">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        Generating intelligence report...
                      </div>
                    ) : item.error ? (
                      <div className="text-destructive text-sm p-4 bg-destructive/10 border border-destructive/20 rounded-2xl rounded-tl-sm">
                        Failed to generate response. Please try rephrasing your query.
                      </div>
                    ) : item.response && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-card border border-border/60 rounded-2xl rounded-tl-sm p-5 shadow-lg space-y-4 w-full"
                      >
                        {item.response.graphSpec?.title && (
                          <h3 className="font-display font-semibold text-lg text-foreground border-b border-border/50 pb-3">
                            {item.response.graphSpec.title}
                          </h3>
                        )}
                        {item.response.graphSpec && (
                          <div className="pt-2">
                            {renderChart(item.response.graphSpec)}
                          </div>
                        )}
                        <div className="bg-secondary/30 p-4 rounded-xl text-sm text-muted-foreground leading-relaxed">
                          <p><span className="text-foreground font-medium mr-1">Insight:</span> {item.response.explanation}</p>
                          {item.response.sqlUsed && (
                            <details className="mt-3 group">
                              <summary className="text-xs font-mono text-primary cursor-pointer hover:underline">View Generated SQL</summary>
                              <pre className="mt-2 p-3 bg-black/50 text-gray-300 rounded-lg text-xs overflow-x-auto border border-white/5">
                                {item.response.sqlUsed}
                              </pre>
                            </details>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <div className="p-4 bg-background border-t border-border/50 shrink-0">
          <form onSubmit={handleSubmit} className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask for any chart, metric, or analysis..."
              className="w-full bg-secondary/30 border border-border rounded-xl pl-5 pr-14 py-4 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm shadow-inner"
              disabled={queryMutation.isPending}
            />
            <Button 
              type="submit" 
              size="icon"
              disabled={!input.trim() || queryMutation.isPending}
              className="absolute right-2 rounded-lg"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
