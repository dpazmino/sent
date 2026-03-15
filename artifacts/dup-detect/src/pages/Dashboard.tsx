import { 
  useGetDashboardStats, 
  useGetTrendData, 
  useGetDuplicatesBySystem 
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/utils";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { AlertTriangle, CheckCircle2, Clock, DollarSign, Activity } from "lucide-react";
import { motion } from "framer-motion";

const COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--warning))', 'hsl(var(--destructive))'];

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: trend, isLoading: trendLoading } = useGetTrendData({ period: "monthly" });
  const { data: systemData, isLoading: systemLoading } = useGetDuplicatesBySystem();

  if (statsLoading || trendLoading || systemLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!stats || !trend || !systemData) return <div>Failed to load dashboard data.</div>;

  const statCards = [
    {
      title: "Total Amount at Risk",
      value: formatCurrency(stats.totalAmountAtRisk),
      icon: DollarSign,
      color: "text-destructive",
      bg: "bg-destructive/10 border-destructive/20",
      description: "Across all active potential duplicates"
    },
    {
      title: "High Probability Detections",
      value: stats.highProbabilityCount.toLocaleString(),
      icon: AlertTriangle,
      color: "text-warning",
      bg: "bg-warning/10 border-warning/20",
      description: "> 80% confidence score"
    },
    {
      title: "Pending Review",
      value: stats.pendingReview.toLocaleString(),
      icon: Clock,
      color: "text-primary",
      bg: "bg-primary/10 border-primary/20",
      description: "Awaiting analyst confirmation"
    },
    {
      title: "Confirmed Duplicates",
      value: stats.confirmedDuplicates.toLocaleString(),
      icon: CheckCircle2,
      color: "text-success",
      bg: "bg-success/10 border-success/20",
      description: "Actioned and prevented"
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Overview Dashboard</h1>
        <p className="text-muted-foreground mt-1 flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Last scan completed at {stats.lastScanAt ? new Date(stats.lastScanAt).toLocaleString() : 'N/A'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card className="relative overflow-hidden group hover:border-border transition-colors">
              <div className={`absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full blur-[40px] pointer-events-none opacity-50 ${stat.bg.split(' ')[0]}`} />
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className={`p-3 rounded-xl ${stat.bg}`}>
                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-muted-foreground">{stat.title}</h3>
                  <p className="text-3xl font-display font-bold mt-1 tracking-tight">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-2">{stat.description}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Detection Trend</CardTitle>
            <CardDescription>Duplicate detection volume over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend.data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={(val) => `${val}`} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="count" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2 }}
                    activeDot={{ r: 8, fill: 'hsl(var(--accent))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By Payment System</CardTitle>
            <CardDescription>Distribution across networks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full flex flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={systemData.data}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="count"
                    nameKey="system"
                    stroke="none"
                  >
                    {systemData.data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
