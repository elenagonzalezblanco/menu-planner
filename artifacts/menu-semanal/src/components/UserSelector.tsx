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
  onGoToLogin?: () => void;
}

function CreateForm({ onCreated, onCancel, showCancel, onGoToLogin }: CreateFormProps) {
  const { createUser, setCurrentUser } = useUser();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [avatar, setAvatar] = useState(EMOJI_OPTIONS[0]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [createdUser, setCreatedUser] = useState<User | null>(null);

  async function handleSubmit() {
    if (!name.trim() || !password) return;
    setError("");
    setLoading(true);
    try {
      const user = await createUser(name.trim(), avatar, password, email.trim() || undefined);
      setCreatedUser(user);
    } catch (err: any) {
      setError(err.message || "Error al crear la cuenta");
    } finally {
      setLoading(false);
    }
  }

  // Confirmation screen after successful registration
  if (createdUser) {
    return (
      <div className="flex flex-col gap-5 items-center text-center">
        <div className="text-6xl">{createdUser.avatar || "🎉"}</div>
        <h2 className="font-display font-bold text-2xl">¡Cuenta creada!</h2>
        <p className="text-muted-foreground">
          Bienvenido/a, <span className="font-semibold text-foreground">{createdUser.name}</span>.
          {email && " Te hemos enviado un email de bienvenida."}
        </p>
        <div className="bg-green-50 dark:bg-green-950/30 rounded-xl p-4 w-full">
          <p className="text-sm text-green-700 dark:text-green-400">
            Tu cuenta está lista. Inicia sesión para empezar a planificar tus menús.
          </p>
        </div>
        <Button
          className="w-full rounded-xl h-12 text-base font-semibold mt-2"
          onClick={() => {
            if (onGoToLogin) {
              onGoToLogin();
            } else {
              setCurrentUser(createdUser.id);
              onCreated(createdUser);
            }
          }}
        >
          Iniciar sesión
        </Button>
      </div>
    );
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
  onForgotPassword: () => void;
  showCancel?: boolean;
}

function LoginForm({ onLoggedIn, onCancel, onRegister, onForgotPassword, showCancel }: LoginFormProps) {
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
        <div className="text-right -mt-1">
          <button
            type="button"
            className="text-sm text-primary/80 hover:text-primary hover:underline"
            onClick={onForgotPassword}
          >
            ¿Olvidaste tu contraseña?
          </button>
        </div>
        <div className="flex gap-3 pt-1">
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
  /** If a reset token is present in the URL, pass it here to show the reset form */
  resetToken?: string | null;
  onResetComplete?: () => void;
}

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!email.trim()) return;
    setError("");
    setLoading(true);
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
      const res = await fetch(`${API_URL}/api/users/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al enviar");
      }
      setSent(true);
    } catch (err: any) {
      setError(err.message || "Error al enviar");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <>
        <div className="text-center flex flex-col gap-1">
          <div className="text-5xl mb-2">📧</div>
          <h1 className="font-display font-bold text-3xl">Revisa tu email</h1>
          <p className="text-muted-foreground">
            Si existe una cuenta con <strong>{email}</strong>, recibirás un enlace para restablecer tu contraseña.
          </p>
        </div>
        <Button onClick={onBack} variant="outline" className="w-full rounded-xl h-12">
          Volver al inicio de sesión
        </Button>
      </>
    );
  }

  return (
    <>
      <div className="text-center flex flex-col gap-1">
        <div className="text-5xl mb-2">🔑</div>
        <h1 className="font-display font-bold text-3xl">¿Olvidaste tu contraseña?</h1>
        <p className="text-muted-foreground">Introduce tu email y te enviaremos un enlace para restablecerla.</p>
      </div>
      <div className="flex flex-col gap-5">
        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-2">{error}</div>
        )}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-muted-foreground">Email</label>
          <Input
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            autoFocus
            className="text-base h-12 rounded-xl"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onBack} className="flex-1 rounded-xl h-12">
            Volver
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!email.trim() || loading}
            className="flex-1 rounded-xl h-12 text-base font-semibold"
          >
            {loading ? "Enviando..." : "Enviar enlace"}
          </Button>
        </div>
      </div>
    </>
  );
}

function ResetPasswordForm({ token, onSuccess, onBack }: { token: string; onSuccess: () => void; onBack: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (password.length < 4) { setError("La contraseña debe tener al menos 4 caracteres"); return; }
    if (password !== confirm) { setError("Las contraseñas no coinciden"); return; }
    setError("");
    setLoading(true);
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
      const res = await fetch(`${API_URL}/api/users/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Error al restablecer");
      setDone(true);
    } catch (err: any) {
      setError(err.message || "Error al restablecer");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <>
        <div className="text-center flex flex-col gap-1">
          <div className="text-5xl mb-2">✅</div>
          <h1 className="font-display font-bold text-3xl">¡Contraseña cambiada!</h1>
          <p className="text-muted-foreground">Ya puedes iniciar sesión con tu nueva contraseña.</p>
        </div>
        <Button onClick={onSuccess} className="w-full rounded-xl h-12 text-base font-semibold">
          Iniciar sesión
        </Button>
      </>
    );
  }

  return (
    <>
      <div className="text-center flex flex-col gap-1">
        <div className="text-5xl mb-2">🔐</div>
        <h1 className="font-display font-bold text-3xl">Nueva contraseña</h1>
        <p className="text-muted-foreground">Elige tu nueva contraseña.</p>
      </div>
      <div className="flex flex-col gap-5">
        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-2">{error}</div>
        )}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-muted-foreground">Nueva contraseña</label>
          <Input
            type="password"
            placeholder="Mínimo 4 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="text-base h-12 rounded-xl"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-muted-foreground">Repetir contraseña</label>
          <Input
            type="password"
            placeholder="Repite tu contraseña"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="text-base h-12 rounded-xl"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onBack} className="flex-1 rounded-xl h-12">
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={password.length < 4 || !confirm || loading}
            className="flex-1 rounded-xl h-12 text-base font-semibold"
          >
            {loading ? "Guardando..." : "Cambiar contraseña"}
          </Button>
        </div>
      </div>
    </>
  );
}

export function UserSelector({ mode = "splash", onClose, resetToken, onResetComplete }: UserSelectorProps) {
  const { allUsers, setCurrentUser } = useUser();
  const [view, setView] = useState<"welcome" | "login" | "register" | "forgot" | "reset">(
    resetToken ? "reset" : "welcome"
  );

  function handleUserCreated() {
    onClose?.();
  }

  const isFirstLaunch = allUsers.length === 0;

  // In switcher mode, skip welcome screen but honour explicit navigation (forgot/reset)
  const effectiveView =
    mode === "switcher"
      ? (view === "forgot" || view === "reset") ? view : (isFirstLaunch ? "register" : "login")
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
          onForgotPassword={() => setView("forgot")}
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
            onGoToLogin={() => setView("login")}
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

      {/* ── Forgot Password ── */}
      {effectiveView === "forgot" && (
        <ForgotPasswordForm onBack={() => setView("login")} />
      )}

      {/* ── Reset Password (from email link) ── */}
      {effectiveView === "reset" && resetToken && (
        <ResetPasswordForm
          token={resetToken}
          onSuccess={() => {
            setView("login");
            onResetComplete?.();
          }}
          onBack={() => {
            setView("login");
            onResetComplete?.();
          }}
        />
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
