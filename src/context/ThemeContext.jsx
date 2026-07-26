import React, { createContext, useContext, useEffect } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};

export const ThemeProvider = ({ children }) => {
  const theme = 'green';

  useEffect(() => {
    const root = window.document.documentElement;
    root.setAttribute('data-theme', 'green');
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  }, []);

  return (
    <ThemeContext.Provider value={{ theme }}>
      {children}
    </ThemeContext.Provider>
  );
};
