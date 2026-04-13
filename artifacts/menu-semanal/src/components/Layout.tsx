import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Utensils, CalendarDays, ShoppingBasket, ShoppingBag, Menu as MenuIcon, Settings, LogOut } from "lucide-react";
import { useState, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useUser } from "@/contexts/UserContext";
import { UserSelector } from "@/components/UserSelector";

const ProfileSettingsModal = lazy(() => import("@/components/ProfileSettingsModal").then(m => ({ default: m.ProfileSettingsModal })));

const NAV_ITEMS = [
  { href: "/", label: "Recetas", icon: Utensils },
  { href: "/menu", label: "Menú Semanal", icon: CalendarDays },
  { href: "/shopping", label: "Lista de Compra", icon: ShoppingBasket },
  { href: "/mercadona", label: "Mercadona", icon: ShoppingBag },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { currentUser, logout } = useUser();

  const NavLinks = () => (
    <>
      {NAV_ITEMS.map((item) => {
        const isActive = location === item.href;
        return (
          <Link 
            key={item.href} 
            href={item.href}
            onClick={() => setIsOpen(false)}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 group font-medium",
              isActive 
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" 
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className={cn(
              "w-5 h-5 transition-transform duration-200",
              isActive ? "scale-110" : "group-hover:scale-110"
            )} />
            {item.label}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-background flex w-full">
      {showSwitcher && (
        <UserSelector mode="switcher" onClose={() => setShowSwitcher(false)} />
      )}
      {showSettings && (
        <Suspense fallback={null}>
          <ProfileSettingsModal onClose={() => setShowSettings(false)} />
        </Suspense>
      )}
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-72 border-r border-border/50 bg-card/50 backdrop-blur-xl fixed inset-y-0 z-10 p-6">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20 text-white">
            <Utensils className="w-5 h-5" />
          </div>
          <h1 className="font-display font-bold text-2xl bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">Los Menús de Elena</h1>
        </div>
        <nav className="flex flex-col gap-2 flex-1">
          <NavLinks />
        </nav>
        {currentUser && (
          <div className="flex items-center gap-1 mt-4">
            <button
              onClick={() => setShowSwitcher(true)}
              className="flex items-center gap-3 px-3 py-2 rounded-2xl hover:bg-muted transition-colors flex-1 min-w-0"
              title="Cambiar perfil"
            >
              <span className="text-2xl shrink-0">{currentUser.avatar}</span>
              <span className="font-medium text-sm text-foreground/80 truncate">{currentUser.name}</span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => setShowSettings(true)}
              title="Configurar perfil"
            >
              <Settings className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl text-muted-foreground hover:text-destructive shrink-0"
              onClick={logout}
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        )}
      </aside>
      {/* Mobile Header & Content */}
      <div className="flex-1 flex flex-col md:pl-72 w-full max-w-[100vw]">
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border/50 bg-background/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white shadow-sm">
              <Utensils className="w-4 h-4" />
            </div>
            <h1 className="font-display font-bold text-xl">La Cocina</h1>
          </div>
          <div className="flex items-center gap-1">
            {currentUser && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-xl text-xl"
                  onClick={() => setShowSwitcher(true)}
                  title="Cambiar perfil"
                >
                  {currentUser.avatar}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-xl"
                  onClick={() => setShowSettings(true)}
                  title="Configurar perfil"
                >
                  <Settings className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-xl text-muted-foreground hover:text-destructive"
                  onClick={logout}
                  title="Cerrar sesión"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </>
            )}
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-xl">
                <MenuIcon className="w-6 h-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-6 border-r-0">
              <div className="flex items-center gap-3 mb-10">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white">
                  <Utensils className="w-5 h-5" />
                </div>
                <h1 className="font-display font-bold text-2xl">La Cocina</h1>
              </div>
              <nav className="flex flex-col gap-2">
                <NavLinks />
              </nav>
            </SheetContent>
          </Sheet>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 lg:p-10 mx-auto w-full max-w-7xl overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
