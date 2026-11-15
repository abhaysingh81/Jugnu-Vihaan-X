"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type AccountUser = { id: number; name: string; email: string; phone: string; has_pin: boolean; demo?: boolean };

export async function jugnuRequest<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(`/api/jugnu/${path}`, {
    method, cache: "no-store", headers: data === undefined ? undefined : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "The request could not be completed.");
  return value;
}

const AccountContext = createContext<{
  user: AccountUser | null; loading: boolean; setUser: (value: AccountUser | null) => void;
} | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let current = true;
    jugnuRequest<{user: AccountUser}>("account/me").then(({ user }) => {
      if (current) setUser(user);
    }).catch(() => {}).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);
  return <AccountContext.Provider value={{ user, setUser, loading }}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error("Account provider is missing.");
  return value;
}
