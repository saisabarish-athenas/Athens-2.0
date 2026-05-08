import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import "@/styles/sap/enable-sap.css";
import "./styles/compact-kpi.css";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import { AppRouter } from "./lib/router";
import { Toaster } from "sonner";
import { useAuthStore } from "./store/authStore";
import NotificationsContext from "./common/contexts/NotificationsContext";
import api from "./lib/api";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Optional rollback to Athens styles
if (import.meta.env.VITE_USE_ATHENS_STYLES === 'true') {
  import('./index.css');
}

async function sendNotification(
  userId: number,
  payload: { title: string; message: string; type: string; data?: Record<string, any> }
): Promise<void> {
  await api.post('/api/notifications/create/', {
    user_id: userId,
    title: payload.title,
    message: payload.message,
    type: payload.type,
    data: payload.data || {},
  });
}

function AppWrapper() {
  const { initializeAuth } = useAuthStore();

  useEffect(() => {
    initializeAuth();
  }, []);

  return (
    <NotificationsContext.Provider value={{ sendNotification }}>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: '#1890ff',
            borderRadius: 8,
            fontSize: 14,
          },
        }}
      >
        <AppRouter />
        <Toaster position="top-right" richColors />
      </ConfigProvider>
    </NotificationsContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppWrapper />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
