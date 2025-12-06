import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '@/lib/api-typed';
import type * as API from '@/types';

interface AuthContextType {
  user: API.User | null;
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
  const [user, setUser] = useState<API.User | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    // Check for existing token
    const token = localStorage.getItem('token');
    if (token) {
      console.log('[AuthContext] Found token in localStorage, verifying...');
      // Verify token and get user info
      auth.getCurrentUser()
        .then((userData) => {
          console.log('[AuthContext] User verified:', { email: userData.email, role: userData.role });
          setUser(userData);
          setSession(token);
          setUserRole(userData.role || null);
        })
        .catch((error) => {
          console.error('[AuthContext] Token verification failed:', error);
          localStorage.removeItem('token');
          setUser(null);
          setSession(null);
          setUserRole(null);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      console.log('[AuthContext] No token found in localStorage');
      setLoading(false);
    }
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const authData = await auth.login({ email, password });
      localStorage.setItem('token', authData.access_token);
      setUser(authData.user);
      setSession(authData.access_token);
      setUserRole(authData.user.role || null);
      return { error: null };
    } catch (error: any) {
      return { error: error.response?.data?.error || 'Login failed' };
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      const authData = await auth.signup({ email, password });
      localStorage.setItem('token', authData.access_token);
      setUser(authData.user);
      setSession(authData.access_token);
      setUserRole(authData.user.role || null);
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
