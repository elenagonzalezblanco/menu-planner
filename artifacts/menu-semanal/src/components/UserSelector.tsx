import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  const [avatar, setAvatar] = useState(EMOJI_OPTIONS[0]);

  async function handleSubmit() {
    if (!name.trim()) return;
    const user = await createUser(name.trim(), avatar, email.trim() || undefined);
    setCurrentUser(user.id);
    onCreated(user);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-muted-foreground">Tu nombre</label>
        <Input
          placeholder="Tu nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          autoFocus
          className="text-base h-12 rounded-xl"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-muted-foreground">Tu email <span className="text-muted-foreground/60 font-normal">(opcional, para recibir menús y listas)</span></label>
        <Input
          type="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
          disabled={!name.trim()}
          className="flex-1 rounded-xl h-12 text-base font-semibold"
        >
          {avatar} Crear perfil
        </Button>
      </div>
    </div>
  );
}

interface UserSelectorProps {
  /** When true, renders as a modal overlay (for profile switching). When false/undefined, renders as full-screen splash. */
  mode?: "splash" | "switcher";
  onClose?: () => void;
}

export function UserSelector({ mode = "splash", onClose }: UserSelectorProps) {
  const { allUsers, setCurrentUser, deleteUser } = useUser();
  const [showCreateForm, setShowCreateForm] = useState(false);

  function handleSelectUser(id: number) {
    setCurrentUser(id);
    onClose?.();
  }

  function handleUserCreated() {
    onClose?.();
  }

  const isFirstLaunch = allUsers.length === 0;
  const title = isFirstLaunch ? "¡Bienvenido!" : "¿Quién cocina hoy?";
  const subtitle = isFirstLaunch
    ? "Crea tu perfil para empezar"
    : "Selecciona tu perfil";

  const content = (
    <div className="w-full max-w-sm mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="text-center flex flex-col gap-1">
        <div className="text-5xl mb-2">🍽️</div>
        <h1 className="font-display font-bold text-3xl">{title}</h1>
        <p className="text-muted-foreground">{subtitle}</p>
      </div>

      {/* Existing users */}
      {!isFirstLaunch && !showCreateForm && (
        <div className="flex flex-col gap-3">
          {allUsers.map((user) => (
            <div key={user.id} className="flex items-center gap-2">
              <Card
                className="flex-1 cursor-pointer hover:border-primary/50 hover:shadow-md transition-all duration-200 rounded-2xl"
                onClick={() => handleSelectUser(user.id)}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <span className="text-3xl">{user.avatar}</span>
                  <span className="font-semibold text-lg">{user.name}</span>
                </CardContent>
              </Card>
              {allUsers.length >= 2 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                      title="Eliminar perfil"
                    >
                      ✕
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar perfil?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Se eliminará el perfil de <strong>{user.name}</strong>. Esta acción no se puede deshacer.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteUser(user.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          ))}

          <Button
            variant="outline"
            className="w-full rounded-xl h-12 text-base border-dashed"
            onClick={() => setShowCreateForm(true)}
          >
            + Añadir perfil
          </Button>

          {mode === "switcher" && onClose && (
            <Button variant="ghost" onClick={onClose} className="w-full rounded-xl">
              Cancelar
            </Button>
          )}
        </div>
      )}

      {/* Create form — shown on first launch or when adding new user */}
      {(isFirstLaunch || showCreateForm) && (
        <CreateForm
          onCreated={handleUserCreated}
          onCancel={showCreateForm ? () => setShowCreateForm(false) : undefined}
          showCancel={showCreateForm}
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
