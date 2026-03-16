import { createContext, useContext, useState, type ReactNode } from "react";

export type SentinelUser = {
  id: string;
  username: string;
  displayName: string;
};

type UserContextType = {
  user: SentinelUser | null;
  login: (user: SentinelUser) => void;
  logout: () => void;
};

const UserContext = createContext<UserContextType | null>(null);

const USER_STORAGE_KEY = "sentinel_current_user";

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SentinelUser | null>(() => {
    try {
      const stored = localStorage.getItem(USER_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const login = (u: SentinelUser) => {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(u));
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem(USER_STORAGE_KEY);
    setUser(null);
  };

  return (
    <UserContext.Provider value={{ user, login, logout }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used inside UserProvider");
  return ctx;
}
