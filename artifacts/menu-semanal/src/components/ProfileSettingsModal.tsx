import { useState } from "react";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { X, User, Mail, Key, Store } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProfileSettingsModalProps {
  onClose: () => void;
}

export function ProfileSettingsModal({ onClose }: ProfileSettingsModalProps) {
  const { currentUser, updateUser } = useUser();
  const { toast } = useToast();

  const [email, setEmail] = useState(currentUser?.email ?? "");
  const [mercadonaEmail, setMercadonaEmail] = useState(currentUser?.mercadonaEmail ?? "");
  const [azureEndpoint, setAzureEndpoint] = useState(currentUser?.azureEndpoint ?? "");
  const [azureDeployment, setAzureDeployment] = useState(currentUser?.azureDeployment ?? "gpt-4o");
  const [azureApiKey, setAzureApiKey] = useState(currentUser?.azureApiKey ?? "");

  function handleSave() {
    if (!currentUser) return;
    updateUser(currentUser.id, {
      email: email.trim() || undefined,
      mercadonaEmail: mercadonaEmail.trim() || undefined,
      azureEndpoint: azureEndpoint.trim() || undefined,
      azureDeployment: azureDeployment.trim() || undefined,
      azureApiKey: azureApiKey.trim() || undefined,
    });
    toast({ title: "Perfil actualizado", description: "Tus datos se han guardado correctamente." });
    onClose();
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-card rounded-2xl p-6 w-full max-w-md shadow-xl border border-border/50 space-y-5"
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

          {/* Azure OpenAI */}
          <div className="space-y-3">
            <label className="text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
              <Key className="w-3.5 h-3.5" />
              Azure OpenAI
              <span className="font-normal">(para el asistente IA)</span>
            </label>
            <div className="space-y-2">
              <Input
                type="text"
                placeholder="https://mi-recurso.openai.azure.com"
                value={azureEndpoint}
                onChange={(e) => setAzureEndpoint(e.target.value)}
                className="rounded-xl font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">Endpoint del recurso Azure OpenAI</p>
              <Input
                type="text"
                placeholder="gpt-4o"
                value={azureDeployment}
                onChange={(e) => setAzureDeployment(e.target.value)}
                className="rounded-xl font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">Nombre del deployment (ej. gpt-4o, gpt-4-turbo)</p>
              <Input
                type="password"
                placeholder="API Key de Azure OpenAI..."
                value={azureApiKey}
                onChange={(e) => setAzureApiKey(e.target.value)}
                className="rounded-xl font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Encuéntrala en{" "}
                <a
                  href="https://portal.azure.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  Azure Portal
                </a>{" "}
                → tu recurso OpenAI → Claves y punto de conexión. Se guarda solo en este dispositivo.
              </p>
            </div>
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
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
