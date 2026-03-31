import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import {
  type User,
  getAllUsers,
  getUser,
  createUser as storageCreateUser,
  deleteUser as storageDeleteUser,
  getCurrentUserId,
  setCurrentUserId,
  clearCurrentUser,
} from "@/lib/users-storage";

interface UserContextValue {
  currentUser: User | null;
  allUsers: User[];
  setCurrentUser: (id: string) => void;
  createUser: (name: string, avatar: string) => User;
  deleteUser: (id: string) => void;
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
  deleteUser: () => {},
  logout: () => {},
  isLoading: true,
});

export function UserProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUserState] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const users = getAllUsers();
    setAllUsers(users);

    const savedId = getCurrentUserId();
    if (savedId) {
      const user = getUser(savedId);
      setCurrentUserState(user);
    }

    setIsLoading(false);
  }, []);

  const setCurrentUser = useCallback((id: string) => {
    const user = getUser(id);
    if (user) {
      setCurrentUserId(id);
      setCurrentUserState(user);
    }
  }, []);

  const createUser = useCallback((name: string, avatar: string): User => {
    const user = storageCreateUser(name, avatar);
    setAllUsers(getAllUsers());
    return user;
  }, []);

  const deleteUser = useCallback(
    (id: string) => {
      storageDeleteUser(id);
      const updated = getAllUsers();
      setAllUsers(updated);
      if (currentUser?.id === id) {
        clearCurrentUser();
        setCurrentUserState(null);
      }
    },
    [currentUser]
  );

  const logout = useCallback(() => {
    clearCurrentUser();
    setCurrentUserState(null);
  }, []);

  return (
    <UserContext.Provider
      value={{ currentUser, allUsers, setCurrentUser, createUser, deleteUser, logout, isLoading }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  return useContext(UserContext);
}
