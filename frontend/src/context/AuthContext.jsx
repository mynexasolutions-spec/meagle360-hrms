import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMe } from '../api/auth';
import { getMySubscription } from '../api/company';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState(null);
  const [isPlanExpired, setIsPlanExpired] = useState(false);

  const fetchSubscription = useCallback(async () => {
    try {
      const res = await getMySubscription();
      setSubscription(res.data);
      setIsPlanExpired(Boolean(res.data?.is_expired));
      return res.data;
    } catch (err) {
      if (err.response?.status === 402) {
        setIsPlanExpired(true);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    const handlePlanExpired = () => {
      setIsPlanExpired(true);
    };
    window.addEventListener('plan_expired', handlePlanExpired);
    return () => window.removeEventListener('plan_expired', handlePlanExpired);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('hrms_token');
    if (token) {
      getMe()
        .then(async (res) => {
          const userData = res.data;
          setUser(userData);
          // Check subscription proactively if user is Admin
          if (userData?.role?.name === 'Admin' || userData?.permissions?.['settings:write']) {
            await fetchSubscription();
          }
        })
        .catch(() => {
          localStorage.removeItem('hrms_token');
          setUser(null);
          setSubscription(null);
          setIsPlanExpired(false);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [fetchSubscription]);

  const loginUser = (token, userData, subData = null) => {
    localStorage.setItem('hrms_token', token);
    setUser(userData);
    if (subData) {
      setSubscription(subData);
      setIsPlanExpired(Boolean(subData?.is_expired));
    }
  };

  const logout = () => {
    localStorage.removeItem('hrms_token');
    setUser(null);
    setSubscription(null);
    setIsPlanExpired(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        subscription,
        isPlanExpired,
        setIsPlanExpired,
        fetchSubscription,
        loginUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
