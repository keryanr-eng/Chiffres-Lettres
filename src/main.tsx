import React from 'react';
import ReactDOM from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import './styles.css';
import { HomePage } from './pages/HomePage';
import { GamePage } from './pages/GamePage';

registerSW({ immediate: true });

const router = createHashRouter([
  { path: '/', element: <HomePage /> },
  { path: '/game/:gameId', element: <GamePage /> },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
