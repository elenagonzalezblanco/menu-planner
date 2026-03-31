import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import NotFound from "@/pages/not-found";
import { UserProvider, useUser } from "@/contexts/UserContext";
import { UserSelector } from "@/components/UserSelector";

// Pages
import RecipesPage from "@/pages/Recipes";
import MenuPage from "@/pages/Menu";
import ShoppingPage from "@/pages/Shopping";
import MercadonaPage from "@/pages/Mercadona";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={RecipesPage} />
        <Route path="/menu" component={MenuPage} />
        <Route path="/shopping" component={ShoppingPage} />
        <Route path="/mercadona" component={MercadonaPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function AppShell() {
  const { currentUser, isLoading } = useUser();

  if (isLoading) return null;

  if (!currentUser) {
    return <UserSelector mode="splash" />;
  }

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Router />
    </WouterRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <UserProvider>
          <AppShell />
          <Toaster />
        </UserProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
