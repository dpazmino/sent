import { cn } from "@/lib/utils";
import { AlertTriangle, Info, AlertCircle } from "lucide-react";

export function ProbabilityBadge({ probability, className }: { probability: number; className?: string }) {
  let colorClass = "bg-success/10 text-success border-success/20";
  let Icon = Info;
  let label = "Low Risk";

  if (probability >= 0.8) {
    colorClass = "bg-destructive/10 text-destructive border-destructive/20";
    Icon = AlertTriangle;
    label = "High Risk";
  } else if (probability >= 0.5) {
    colorClass = "bg-warning/10 text-warning border-warning/20";
    Icon = AlertCircle;
    label = "Medium Risk";
  }

  return (
    <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-semibold backdrop-blur-sm", colorClass, className)}>
      <Icon className="w-3.5 h-3.5" />
      <span>{(probability * 100).toFixed(1)}%</span>
    </div>
  );
}
