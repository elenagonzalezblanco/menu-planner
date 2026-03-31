export interface User {
  id: string;
  name: string;
  avatar: string;
  createdAt: string;
}

const USERS_KEY = "menu_planner_users";
const CURRENT_USER_KEY = "current_user_id";

export function getAllUsers(): User[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as User[];
  } catch {
    return [];
  }
}

export function getUser(id: string): User | null {
  return getAllUsers().find((u) => u.id === id) ?? null;
}

export function createUser(name: string, avatar: string): User {
  const user: User = {
    id: crypto.randomUUID(),
    name: name.trim(),
    avatar,
    createdAt: new Date().toISOString(),
  };
  const users = getAllUsers();
  users.push(user);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  return user;
}

export function deleteUser(id: string): void {
  const users = getAllUsers().filter((u) => u.id !== id);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function getCurrentUserId(): string | null {
  return sessionStorage.getItem(CURRENT_USER_KEY);
}

export function setCurrentUserId(id: string): void {
  sessionStorage.setItem(CURRENT_USER_KEY, id);
}

export function clearCurrentUser(): void {
  sessionStorage.removeItem(CURRENT_USER_KEY);
}
