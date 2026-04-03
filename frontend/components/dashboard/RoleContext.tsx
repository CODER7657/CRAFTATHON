'use client';
import { createContext, useContext, ReactNode } from 'react';

type RoleContextType = {
  role: string;
  jurisdiction: string;
  name: string;
};

const RoleContext = createContext<RoleContextType | null>(null);

export function RoleProvider({ children, authority }: { children: ReactNode, authority: RoleContextType }) {
  return <RoleContext.Provider value={authority}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) throw new Error('useRole must be used within a RoleProvider');
  return context;
}
