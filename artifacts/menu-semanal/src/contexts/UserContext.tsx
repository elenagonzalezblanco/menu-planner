import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import type { ReactNode } from "react";
import { setBaseUrl, setUserIdGetter } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

// Configure API client base URL once
setBaseUrl(API_URL);

export interface User {
  id: number;
  name: string;
  avatar: string;
  email?: string | null;
  mercadonaEmail?: string | null;
  azureEndpoint?: string | null;
  azureDeployment?: string | null;
  azureApiKey?: string | null;
  createdAt: string;
}

interface UserContextValue {
  currentUser: User | null;
  allUsers: User[];
  setCurrentUser: (id: number) => void;
  createUser: (name: string, avatar: string, password: string, email?: string) => Promise<User>;
  loginUser: (email: string, password: string) => Promise<User>;
  updateUser: (id: number, updates: Partial<Omit<User, 'id' | 'createdAt'>>) => Promise<User | null>;
  deleteUser: (id: number) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

export const UserContext = createContext<UserContextValue>({
  currentUser: null,
  allUsers: [],
  setCurrentUser: () => {},
  createUser: () => {
    throw new Error("UserProvider not mounted");
  },
  loginUser: () => {
    throw new Error("UserProvider not mounted");
  },
  updateUser: async () => null,
  deleteUser: async () => {},
  logout: () => {},
  isLoading: true,
});

const CURRENT_USER_KEY = "current_user_id";

const CACHED_USER_KEY = "cached_user";

function getCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function setCachedUser(user: User | null) {
  try {
    if (user) localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(CACHED_USER_KEY);
  } catch { /* ignore */ }
}

export function UserProvider({ children }: { children: ReactNode }): React.ReactElement {
  const queryClient = useQueryClient();
  // Restore cached user instantly — no network wait
  const cachedUser = getCachedUser();
  const savedId = localStorage.getItem(CURRENT_USER_KEY);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUserState] = useState<User | null>(cachedUser);
  // If we have a cached user, skip loading screen entirely
  const [isLoading, setIsLoading] = useState(!cachedUser && !!savedId);
  const prevUserIdRef = useRef<number | null>(null);

  // Set up the user ID getter for the API client + clear cache on user switch
  useEffect(() => {
    setUserIdGetter(() => currentUser?.id ?? null);
    if (currentUser && prevUserIdRef.current !== null && prevUserIdRef.current !== currentUser.id) {
      queryClient.clear();
    }
    prevUserIdRef.current = currentUser?.id ?? null;
    // Keep localStorage cache in sync
    setCachedUser(currentUser);
  }, [currentUser, queryClient]);

  // Fetch users from API in the background (non-blocking)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/users`);
        if (res.ok) {
          const users: User[] = await res.json();
          setAllUsers(users);

          const sid = localStorage.getItem(CURRENT_USER_KEY);
          if (sid) {
            const user = users.find((u) => u.id === Number(sid));
            if (user) {
              setCurrentUserState(user);
              setCachedUser(user);
            }
          }
        }
      } catch {
        // API not available — will show user selection
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const setCurrentUser = useCallback((id: number) => {
    const user = allUsers.find((u) => u.id === id);
    if (user) {
      localStorage.setItem(CURRENT_USER_KEY, String(id));
      setCurrentUserState(user);
    }
  }, [allUsers]);

  const createUser = useCallback(async (name: string, avatar: string, password: string, email?: string): Promise<User> => {
    const res = await fetch(`${API_URL}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), avatar, password, email: email?.trim() || undefined }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Error creating user" }));
      throw new Error(err.error || "Error creating user");
    }
    const user: User = await res.json();
    setAllUsers((prev) => [...prev, user]);
    return user;
  }, []);

  const loginUser = useCallback(async (email: string, password: string): Promise<User> => {
    const res = await fetch(`${API_URL}/api/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Login failed" }));
      throw new Error(err.error || "Login failed");
    }
    const user: User = await res.json();
    // Add to allUsers if not already there
    setAllUsers((prev) => {
      if (prev.find((u) => u.id === user.id)) return prev;
      return [...prev, user];
    });
    localStorage.setItem(CURRENT_USER_KEY, String(user.id));
    setCurrentUserState(user);
    return user;
  }, []);

  const deleteUser = useCallback(
    async (id: number) => {
      await fetch(`${API_URL}/api/users/${id}`, { method: "DELETE" });
      setAllUsers((prev) => prev.filter((u) => u.id !== id));
      if (currentUser?.id === id) {
        localStorage.removeItem(CURRENT_USER_KEY);
        setCurrentUserState(null);
      }
    },
    [currentUser],
  );

  const updateUser = useCallback(
    async (id: number, updates: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User | null> => {
      const res = await fetch(`${API_URL}/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) return null;
      const updated: User = await res.json();
      setAllUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...updated } : u)));
      if (currentUser?.id === id) {
        setCurrentUserState((prev) => prev ? { ...prev, ...updated } : prev);
      }
      return updated;
    },
    [currentUser],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(CURRENT_USER_KEY);
    setCachedUser(null);
    setCurrentUserState(null);
    queryClient.clear();
  }, [queryClient]);

  return (
    <UserContext.Provider
      value={{ currentUser, allUsers, setCurrentUser, createUser, loginUser, updateUser, deleteUser, logout, isLoading }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  return useContext(UserContext);
}
