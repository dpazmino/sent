import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

// Context
import { UserProvider, useUser } from "@/contexts/UserContext";

// Layout
import { AppLayout } from "@/components/layout/AppLayout";

// Pages
import Dashboard from "@/pages/Dashboard";
import DuplicatesList from "@/pages/DuplicatesList";
import PaymentDatabase from "@/pages/PaymentDatabase";
import CorridorAnalysis from "@/pages/CorridorAnalysis";
import MasterConsole from "@/pages/MasterConsole";
import AgentTraining from "@/pages/AgentTraining";
import DataSchema from "@/pages/DataSchema";
import GraphChat from "@/pages/GraphChat";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/LoginPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  if (!user) return <LoginPage />;
  return <>{children}</>;
}

function Router() {
  return (
    <AuthGuard>
      <AppLayout>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/duplicates" component={DuplicatesList} />
          <Route path="/payments" component={PaymentDatabase} />
          <Route path="/corridor" component={CorridorAnalysis} />
          <Route path="/console" component={MasterConsole} />
          <Route path="/training" component={AgentTraining} />
          <Route path="/schema" component={DataSchema} />
          <Route path="/chat" component={GraphChat} />
          <Route component={NotFound} />
        </Switch>
      </AppLayout>
    </AuthGuard>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <UserProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </UserProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
