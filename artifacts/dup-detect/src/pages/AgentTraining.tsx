import { useState, useRef, useEffect } from "react";
import { useGetTrainingSessions, useCreateTrainingSession, useSendTrainingMessage } from "@workspace/api-client-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { BrainCircuit, Database, MessageSquare, Send, Plus, Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export default function AgentTraining() {
  const { data: sessionsData, refetch: refetchSessions } = useGetTrainingSessions();
  const createSession = useCreateTrainingSession();
  const sendMessage = useSendTrainingMessage();

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  
  // Dummy local state for chat UI to feel immediate before backend integration complexity
  const [messages, setMessages] = useState<{role: 'user'|'assistant', content: string}[]>([
    { role: 'assistant', content: 'Hello. I am the intelligence agent. How would you like to train my detection parameters today?' }
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCreateSession = (type: "database_schema" | "duplicate_definition") => {
    createSession.mutate({
      data: {
        trainingType: type,
        title: `Training: ${type === 'database_schema' ? 'Schema' : 'Rules'} - ${new Date().toLocaleDateString()}`
      }
    }, {
      onSuccess: (data) => {
        setActiveSessionId(data.id);
        refetchSessions();
        setMessages([{ role: 'assistant', content: `Session started for ${type}. Please provide the training context.` }]);
      }
    });
  };

  const handleSend = () => {
    if (!input.trim() || !activeSessionId) return;
    
    const userMsg = input;
    setInput("");
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);

    sendMessage.mutate({
      id: activeSessionId,
      data: { message: userMsg }
    }, {
      onSuccess: (data) => {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      },
      onError: () => {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Error communicating with agent.' }]);
      }
    });
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="mb-6 flex justify-between items-end shrink-0">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Agent Training</h1>
          <p className="text-muted-foreground mt-1">Teach agents custom duplicate definitions and schema mappings.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2 text-sm" onClick={() => handleCreateSession('database_schema')}>
            <Database className="w-4 h-4 text-primary" />
            Train DB Schema
          </Button>
          <Button className="gap-2 text-sm" onClick={() => handleCreateSession('duplicate_definition')}>
            <BrainCircuit className="w-4 h-4 text-accent" />
            Train Logic Rules
          </Button>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Sessions Sidebar */}
        <Card className="w-80 flex flex-col shrink-0 border-border/50">
          <div className="p-4 border-b border-border/50 bg-secondary/10 shrink-0">
            <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Active Sessions</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
            {sessionsData?.sessions.map(session => (
              <div 
                key={session.id}
                onClick={() => setActiveSessionId(session.id)}
                className={cn(
                  "p-3 rounded-xl cursor-pointer border transition-all duration-200",
                  activeSessionId === session.id 
                    ? "bg-primary/10 border-primary/30 shadow-[0_0_15px_rgba(33,150,243,0.1)]" 
                    : "bg-background border-border/50 hover:border-border hover:bg-secondary/30"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  {session.trainingType === 'database_schema' ? (
                    <Database className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <BrainCircuit className="w-3.5 h-3.5 text-accent" />
                  )}
                  <span className="text-xs font-medium text-foreground truncate">{session.title}</span>
                </div>
                <div className="text-[10px] text-muted-foreground flex justify-between">
                  <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                  <span>{session.messageCount} msgs</span>
                </div>
              </div>
            ))}
            {(!sessionsData || sessionsData.sessions.length === 0) && (
              <div className="text-center p-6 text-sm text-muted-foreground">
                No training sessions found. Create one to begin.
              </div>
            )}
          </div>
        </Card>

        {/* Chat Interface */}
        <Card className="flex-1 flex flex-col border-border/50 overflow-hidden relative">
          {!activeSessionId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center bg-gradient-to-b from-transparent to-secondary/5">
              <div className="w-20 h-20 bg-secondary/30 rounded-full flex items-center justify-center mb-6 shadow-inner">
                <MessageSquare className="w-10 h-10 opacity-50" />
              </div>
              <h3 className="text-xl font-display font-medium text-foreground mb-2">Select or Start a Session</h3>
              <p className="max-w-md">Agents learn through interactive dialogue. You can teach them specific SQL dialects, table structures, or nuanced definitions of what constitutes a duplicate payment in your specific jurisdiction.</p>
            </div>
          ) : (
            <>
              {/* Chat Area */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-gradient-to-b from-transparent to-secondary/5">
                <AnimatePresence initial={false}>
                  {messages.map((msg, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className={cn(
                        "flex gap-4 max-w-[85%]",
                        msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm",
                        msg.role === 'user' 
                          ? "bg-secondary border-border text-muted-foreground" 
                          : "bg-primary/20 border-primary/30 text-primary"
                      )}>
                        {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                      </div>
                      <div className={cn(
                        "p-4 rounded-2xl text-sm leading-relaxed shadow-sm",
                        msg.role === 'user'
                          ? "bg-secondary/80 text-secondary-foreground border border-border/50 rounded-tr-sm"
                          : "bg-card border border-border/60 text-card-foreground rounded-tl-sm shadow-md"
                      )}>
                        {msg.content}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {sendMessage.isPending && (
                  <div className="flex gap-4">
                     <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
                        <Bot className="w-4 h-4 text-primary" />
                      </div>
                      <div className="p-4 rounded-2xl bg-card border border-border/60 rounded-tl-sm flex items-center gap-2">
                        <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input Area */}
              <div className="p-4 bg-card border-t border-border/50 shrink-0">
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                  className="flex gap-3"
                >
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type your instructions here..."
                    className="flex-1 bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                    disabled={sendMessage.isPending}
                  />
                  <Button 
                    type="submit" 
                    disabled={!input.trim() || sendMessage.isPending}
                    className="w-12 h-auto rounded-xl p-0 aspect-square shrink-0"
                  >
                    <Send className="w-5 h-5" />
                  </Button>
                </form>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
