import { createContext, useContext, useState, useEffect } from 'react';
import { getPlatformMe } from '../api/platform';

const PlatformAuthContext = createContext(null);

export function PlatformAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('hrms_platform_token');
    if (token) {
      getPlatformMe()
        .then((res) => setAdmin(res.data))
        .catch(() => {
          localStorage.removeItem('hrms_platform_token');
          setAdmin(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const loginAdmin = (token, adminData) => {
    localStorage.setItem('hrms_platform_token', token);
    setAdmin(adminData);
  };

  const logout = () => {
    localStorage.removeItem('hrms_platform_token');
    setAdmin(null);
  };

  return (
    <PlatformAuthContext.Provider value={{ admin, loading, loginAdmin, logout }}>
      {children}
    </PlatformAuthContext.Provider>
  );
}

export function usePlatformAuth() {
  const context = useContext(PlatformAuthContext);
  if (!context) throw new Error('usePlatformAuth must be used within PlatformAuthProvider');
  return context;
}
