import { useState, lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import NotFound from "@/pages/not-found";
import { UserProvider, useUser } from "@/contexts/UserContext";
import { UserSelector } from "@/components/UserSelector";

// Lazy-loaded pages for faster initial load
const RecipesPage = lazy(() => import("@/pages/Recipes"));
const MenuPage = lazy(() => import("@/pages/Menu"));
const ShoppingPage = lazy(() => import("@/pages/Shopping"));
const MercadonaPage = lazy(() => import("@/pages/Mercadona"));

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
      <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>}>
        <Switch>
          <Route path="/" component={RecipesPage} />
          <Route path="/menu" component={MenuPage} />
          <Route path="/shopping" component={ShoppingPage} />
          <Route path="/mercadona" component={MercadonaPage} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </Layout>
  );
}

function AppShell() {
  const { currentUser, isLoading } = useUser();
  const [resetToken, setResetToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("reset");
  });

  if (isLoading) return null;

  // Show reset password form if token is present (even if logged in)
  if (resetToken) {
    return (
      <UserSelector
        mode="splash"
        resetToken={resetToken}
        onResetComplete={() => {
          setResetToken(null);
          // Clean the URL
          const url = new URL(window.location.href);
          url.searchParams.delete("reset");
          window.history.replaceState({}, "", url.pathname + url.hash);
        }}
      />
    );
  }

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
