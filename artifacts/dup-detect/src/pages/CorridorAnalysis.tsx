import { useState } from "react";
import { useGetCorridorAnalysis } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/utils";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell 
} from 'recharts';
import { Globe2, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function CorridorAnalysis() {
  const [timeframe, setTimeframe] = useState("30d");
  const { data, isLoading } = useGetCorridorAnalysis({ topN: 15 });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!data) return <div>No corridor data available.</div>;

  // Prepare data for bar chart
  const chartData = data.corridors.slice(0, 10).map(c => ({
    name: c.corridor,
    count: c.duplicateCount,
    amount: c.totalAmount,
    risk: c.avgProbability
  }));

  // Heatmap rendering logic (simplified visual grid)
  const renderHeatmap = () => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.corridors.map((c, i) => {
          // Color intensity based on probability
          const intensity = c.avgProbability > 0.8 ? 'bg-destructive/20 border-destructive/30' : 
                            c.avgProbability > 0.5 ? 'bg-warning/20 border-warning/30' : 
                            'bg-primary/10 border-primary/20';
          
          const textClass = c.avgProbability > 0.8 ? 'text-destructive' : 
                            c.avgProbability > 0.5 ? 'text-warning' : 
                            'text-primary';

          return (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              key={c.corridor} 
              className={`p-4 rounded-xl border backdrop-blur-sm ${intensity} flex flex-col justify-between`}
            >
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2 text-foreground font-mono text-sm font-semibold">
                  <span>{c.originCountry}</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <span>{c.destCountry}</span>
                </div>
                <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${textClass} bg-background/50`}>
                  {(c.avgProbability * 100).toFixed(0)}% Risk
                </div>
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Total Value</div>
                  <div className="text-lg font-bold text-foreground">{formatCurrency(c.totalAmount)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Incidents</div>
                  <div className="text-sm font-medium text-foreground">{c.duplicateCount}</div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
            <Globe2 className="w-8 h-8 text-primary" />
            Corridor Analysis
          </h1>
          <p className="text-muted-foreground mt-1">Cross-border duplicate payment risks by country pairs.</p>
        </div>
        <select 
          value={timeframe}
          onChange={(e) => setTimeframe(e.target.value)}
          className="bg-secondary border border-border text-foreground text-sm rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
          <option value="ytd">Year to Date</option>
        </select>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Top Risky Corridors (Volume)</CardTitle>
          <CardDescription>Highest concentration of duplicate payment attempts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[350px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="name" 
                  stroke="hsl(var(--muted-foreground))" 
                  tick={{fontSize: 11}} 
                  angle={-45} 
                  textAnchor="end"
                  height={60}
                />
                <YAxis stroke="hsl(var(--muted-foreground))" tick={{fontSize: 12}} />
                <RechartsTooltip 
                  cursor={{ fill: 'hsl(var(--secondary))' }}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.risk > 0.8 ? 'hsl(var(--destructive))' : entry.risk > 0.5 ? 'hsl(var(--warning))' : 'hsl(var(--primary))'} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="mt-8">
        <h3 className="text-xl font-display font-semibold mb-4 text-foreground">Risk Heatmap View</h3>
        {renderHeatmap()}
      </div>
    </div>
  );
}
