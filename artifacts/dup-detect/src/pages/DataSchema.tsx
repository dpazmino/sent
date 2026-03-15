import { useState, useEffect } from "react";
import { useGetDataSourceSchema, useUpdateDataSourceSchema } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Database, Save, Code, Info } from "lucide-react";

export default function DataSchema() {
  const { data: schemaData, isLoading } = useGetDataSourceSchema();
  const updateMutation = useUpdateDataSourceSchema();
  
  const [jsonText, setJsonText] = useState("");

  useEffect(() => {
    if (schemaData) {
      setJsonText(JSON.stringify(schemaData, null, 2));
    }
  }, [schemaData]);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(jsonText);
      updateMutation.mutate({ data: parsed });
    } catch (e) {
      alert("Invalid JSON format");
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex justify-between items-end shrink-0">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Data Schema Layer</h1>
          <p className="text-muted-foreground mt-1">Expose your internal payment data structures to the AI agents.</p>
        </div>
        <Button 
          onClick={handleSave} 
          disabled={updateMutation.isPending || isLoading}
          className="gap-2 shadow-[0_0_20px_rgba(33,150,243,0.3)]"
        >
          <Save className="w-4 h-4" />
          {updateMutation.isPending ? "Saving..." : "Save Schema Map"}
        </Button>
      </div>

      <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex gap-3 text-sm text-primary-foreground/90 shrink-0">
        <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <p>
          The Text-to-SQL Agent uses this mapping to translate natural language inquiries and internal duplicate detection rules into accurate queries against your specific database tables. Define table names, columns, and data types accurately.
        </p>
      </div>

      <Card className="flex-1 flex flex-col border-border/50 overflow-hidden min-h-0">
        <CardHeader className="border-b border-border/50 bg-secondary/10 py-4 shrink-0 flex flex-row items-center gap-3">
          <Code className="w-5 h-5 text-muted-foreground" />
          <div>
            <CardTitle className="text-base">Schema Definition (JSON)</CardTitle>
          </div>
        </CardHeader>
        <div className="flex-1 relative">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              className="absolute inset-0 w-full h-full bg-[#0d1117] text-gray-300 font-mono text-sm p-6 focus:outline-none resize-none custom-scrollbar leading-relaxed"
              spellCheck={false}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
