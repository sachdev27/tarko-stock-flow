import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '@/lib/api';

interface User {
  id: string;
  email: string;
  role?: string;
}

interface AuthContextType {
  user: User | null;
  session: string | null;
  token: string | null; // Alias for session
  loading: boolean;
  userRole: string | null;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isUser: boolean;
  isReader: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    // Check for existing token
    const token = localStorage.getItem('token');
    if (token) {
      // Verify token and get user info
      auth.getCurrentUser()
        .then(({ data }) => {
          setUser(data.user);
          setSession(token);
          setUserRole(data.user.role || null);
        })
        .catch(() => {
          localStorage.removeItem('token');
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { data } = await auth.login(email, password);
      localStorage.setItem('token', data.access_token);
      setUser(data.user);
      setSession(data.access_token);
      setUserRole(data.user.role || null);
      return { error: null };
    } catch (error: any) {
      return { error: error.response?.data?.error || 'Login failed' };
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      const { data } = await auth.signup(email, password);
      localStorage.setItem('token', data.access_token);
      setUser(data.user);
      setSession(data.access_token);
      setUserRole(data.user.role || null);
      return { error: null };
    } catch (error: any) {
      return { error: error.response?.data?.error || 'Signup failed' };
    }
  };

  const signOut = async () => {
    localStorage.removeItem('token');
    setUser(null);
    setSession(null);
    setUserRole(null);
  };

  const isAdmin = userRole === 'admin';
  const isUser = userRole === 'user';
  const isReader = userRole === 'reader';

  return (
    <AuthContext.Provider value={{
      user,
      session,
      token: session, // Alias for session
      loading,
      userRole,
      signIn,
      signUp,
      signOut,
      isAdmin,
      isUser,
      isReader
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
