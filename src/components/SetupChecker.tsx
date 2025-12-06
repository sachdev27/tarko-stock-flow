import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

export const SetupChecker = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);

  useEffect(() => {
    const checkSetup = async () => {
      // Don't check if already on setup page
      if (location.pathname === '/setup') {
        setChecking(false);
        return;
      }

      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5500/api';
        const response = await axios.get(`${API_BASE_URL}/setup/check`);

        if (response.data?.setup_required) {
          setSetupRequired(true);
          navigate('/setup');
        }
      } catch (error) {
        console.error('Error checking setup status:', error);
        // If we can't check, assume setup might be needed
        // but don't force navigation to avoid breaking existing setups
      } finally {
        setChecking(false);
      }
    };

    checkSetup();
  }, [location.pathname, navigate]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Initializing system...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
