import { useState } from "react";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Mail, Store } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProfileSettingsModalProps {
  onClose: () => void;
}

export function ProfileSettingsModal({ onClose }: ProfileSettingsModalProps) {
  const { currentUser, updateUser } = useUser();
  const { toast } = useToast();

  const [email, setEmail] = useState(currentUser?.email ?? "");
  const [mercadonaEmail, setMercadonaEmail] = useState(currentUser?.mercadonaEmail ?? "");

  async function handleSave() {
    if (!currentUser) return;
    await updateUser(currentUser.id, {
      email: email.trim() || undefined,
      mercadonaEmail: mercadonaEmail.trim() || undefined,
    });
    toast({ title: "Perfil actualizado", description: "Tus datos se han guardado correctamente." });
    onClose();
  }

  return (
    
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          className="bg-card rounded-2xl p-6 w-full max-w-md shadow-xl border border-border/50 space-y-5 animate-scale-in"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-3xl">
                {currentUser?.avatar}
              </div>
              <div>
                <h2 className="font-semibold text-foreground text-lg">Configurar perfil</h2>
                <p className="text-sm text-muted-foreground">{currentUser?.name}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="rounded-xl" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Email personal */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
              <Mail className="w-3.5 h-3.5" />
              Email personal
              <span className="font-normal">(para recibir menús y listas)</span>
            </label>
            <Input
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Email Mercadona */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
              <Store className="w-3.5 h-3.5" />
              Email de tu cuenta Mercadona
            </label>
            <Input
              type="email"
              placeholder="tu@email.com (cuenta de Mercadona)"
              value={mercadonaEmail}
              onChange={(e) => setMercadonaEmail(e.target.value)}
              className="rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              Se usará para identificar tu cuenta al abrir Mercadona online.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
              Cancelar
            </Button>
            <Button className="flex-1 rounded-xl" onClick={handleSave}>
              Guardar cambios
            </Button>
          </div>
        </div>
      </div>
    
  );
}
