import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUser } from "@/contexts/UserContext";
import type { User } from "@/contexts/UserContext";

const EMOJI_OPTIONS = [
  "👩‍🍳", "👨‍🍳", "🍽️", "🥘", "🍲", "🥗",
  "🧑‍🍳", "👩", "👨", "🧑", "🌮", "🍷",
];

interface CreateFormProps {
  onCreated: (user: User) => void;
  onCancel?: () => void;
  showCancel?: boolean;
}

function CreateForm({ onCreated, onCancel, showCancel }: CreateFormProps) {
  const { createUser, setCurrentUser } = useUser();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [avatar, setAvatar] = useState(EMOJI_OPTIONS[0]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!name.trim() || !password) return;
    setError("");
    setLoading(true);
    try {
      const user = await createUser(name.trim(), avatar, password, email.trim() || undefined);
      setCurrentUser(user.id);
      onCreated(user);
    } catch (err: any) {
      setError(err.message || "Error al crear la cuenta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-2">{error}</div>
      )}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-muted-foreground">Tu nombre</label>
        <Input
          placeholder="Tu nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="text-base h-12 rounded-xl"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-muted-foreground">Email <span className="text-muted-foreground/60 font-normal">(para iniciar sesión)</span></label>
        <Input
          type="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="text-base h-12 rounded-xl"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-muted-foreground">Contraseña</label>
        <Input
          type="password"
          placeholder="Mínimo 4 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          className="text-base h-12 rounded-xl"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-muted-foreground">Tu avatar</label>
        <div className="grid grid-cols-6 gap-2">
          {EMOJI_OPTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => setAvatar(emoji)}
              className={`text-2xl h-12 w-full rounded-xl border-2 transition-all duration-150 flex items-center justify-center ${
                avatar === emoji
                  ? "border-primary bg-primary/10 scale-105"
                  : "border-border hover:border-primary/50 hover:bg-muted"
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        {showCancel && onCancel && (
          <Button variant="outline" onClick={onCancel} className="flex-1 rounded-xl h-12">
            Cancelar
          </Button>
        )}
        <Button
          onClick={handleSubmit}
          disabled={!name.trim() || password.length < 4 || loading}
          className="flex-1 rounded-xl h-12 text-base font-semibold"
        >
          {loading ? "Creando..." : `${avatar} Crear cuenta`}
        </Button>
      </div>
    </div>
  );
}

interface LoginFormProps {
  onLoggedIn: () => void;
  onCancel?: () => void;
  onRegister: () => void;
  showCancel?: boolean;
}

function LoginForm({ onLoggedIn, onCancel, onRegister, showCancel }: LoginFormProps) {
  const { loginUser, setCurrentUser } = useUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password) return;
    setError("");
    setLoading(true);
    try {
      const user = await loginUser(email.trim(), password);
      setCurrentUser(user.id);
      onLoggedIn();
    } catch (err: any) {
      setError(err.message || "Email o contraseña incorrectos");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="text-center flex flex-col gap-1">
        <div className="text-5xl mb-2">👋</div>
        <h1 className="font-display font-bold text-3xl">¡Hola de nuevo!</h1>
        <p className="text-muted-foreground">Inicia sesión con tu cuenta</p>
      </div>
      <div className="flex flex-col gap-5">
        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-2">{error}</div>
        )}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-muted-foreground">Email o nombre</label>
          <Input
            type="text"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            className="text-base h-12 rounded-xl"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-muted-foreground">Contraseña</label>
          <Input
            type="password"
            placeholder="Tu contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="text-base h-12 rounded-xl"
          />
        </div>
        <div className="flex gap-3 pt-2">
          {showCancel && onCancel && (
            <Button variant="outline" onClick={onCancel} className="flex-1 rounded-xl h-12">
              Cancelar
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={!email.trim() || !password || loading}
            className="flex-1 rounded-xl h-12 text-base font-semibold"
          >
            {loading ? "Entrando..." : "Iniciar sesión"}
          </Button>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          ¿No tienes cuenta?{" "}
          <button
            className="text-primary font-medium hover:underline"
            onClick={onRegister}
          >
            Crear cuenta
          </button>
        </p>
      </div>
    </>
  );
}

interface UserSelectorProps {
  /** When true, renders as a modal overlay (for profile switching). When false/undefined, renders as full-screen splash. */
  mode?: "splash" | "switcher";
  onClose?: () => void;
}

export function UserSelector({ mode = "splash", onClose }: UserSelectorProps) {
  const { allUsers, setCurrentUser } = useUser();
  const [view, setView] = useState<"welcome" | "login" | "register">("welcome");

  function handleUserCreated() {
    onClose?.();
  }

  const isFirstLaunch = allUsers.length === 0;

  // In switcher mode, skip welcome screen
  const effectiveView =
    mode === "switcher"
      ? isFirstLaunch ? "register" : "login"
      : view;

  const content = (
    <div className="w-full max-w-sm mx-auto flex flex-col gap-6">
      {/* ── Welcome Screen ── */}
      {effectiveView === "welcome" && (
        <>
          <div className="text-center flex flex-col gap-2">
            <div className="text-6xl mb-2">🍽️</div>
            <h1 className="font-display font-bold text-3xl">Los Menús de Elena</h1>
            <p className="text-muted-foreground text-base">
              Tu planificador de menú semanal con IA
            </p>
          </div>
          <div className="flex flex-col gap-3 pt-2">
            <Button
              className="w-full rounded-xl h-12 text-base font-semibold"
              onClick={() => setView("login")}
            >
              Iniciar sesión
            </Button>
            <Button
              variant="outline"
              className="w-full rounded-xl h-12 text-base font-semibold"
              onClick={() => setView("register")}
            >
              Crear cuenta
            </Button>
          </div>
        </>
      )}

      {/* ── Login: Email + Password ── */}
      {effectiveView === "login" && (
        <LoginForm
          onLoggedIn={() => onClose?.()}
          onCancel={
            mode === "switcher" && onClose ? onClose : undefined
          }
          onRegister={() => setView("register")}
          showCancel={mode === "switcher"}
        />
      )}

      {/* ── Register: Create new account ── */}
      {effectiveView === "register" && (
        <>
          <div className="text-center flex flex-col gap-1">
            <div className="text-5xl mb-2">✨</div>
            <h1 className="font-display font-bold text-3xl">Crear cuenta</h1>
            <p className="text-muted-foreground">Configura tu perfil para empezar</p>
          </div>
          <CreateForm
            onCreated={handleUserCreated}
            onCancel={
              (allUsers.length > 0 || mode === "switcher")
                ? () => setView(allUsers.length > 0 ? "login" : "welcome")
                : undefined
            }
            showCancel={allUsers.length > 0 || mode === "switcher"}
          />
          {mode === "splash" && allUsers.length > 0 && (
            <p className="text-center text-sm text-muted-foreground">
              ¿Ya tienes cuenta?{" "}
              <button
                className="text-primary font-medium hover:underline"
                onClick={() => setView("login")}
              >
                Iniciar sesión
              </button>
            </p>
          )}
        </>
      )}
    </div>
  );

  if (mode === "splash") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        {content}
      </div>
    );
  }

  // Switcher mode: overlay
  return (
    <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-6">
      {content}
    </div>
  );
}
