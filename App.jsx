import MyGoals from './pages/MyGoals';
import CreateGoals from './pages/CreateGoals';
import Approvals from './pages/Approvals';
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store';


import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Layout from './components/Layout';

function App() {
  const { isAuthenticated, fetchUser } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      fetchUser();
    }
  }, [isAuthenticated]);

  return (
    <BrowserRouter>
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#fff',
            color: '#334155',
            padding: '16px',
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
          },
        }}
      />
      
      <Routes>
  <Route
    path="/login"
    element={
      isAuthenticated ? (
        <Navigate to="/dashboard" />
      ) : (
        <Login />
      )
    }
  />

  <Route
    path="/"
    element={
      isAuthenticated ? <Layout /> : <Navigate to="/login" />
    }
  >
    <Route index element={<Navigate to="/dashboard" />} />

    <Route path="dashboard" element={<Dashboard />} />

    <Route path="goals" element={<MyGoals />} />
<Route path="checkins" element={<CreateGoals />} />
<Route path="analytics" element={<Approvals />} />
<Route path="create-goals" element={<CreateGoals />} />
<Route path="settings" element={<h1>Settings Coming Soon</h1>} />
  </Route>
</Routes>
    </BrowserRouter>
  );
}

export default App;
