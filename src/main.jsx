// src/main.jsx
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css'; // ESSA LINHA É FUNDAMENTAL
import WrappedApp from './App.jsx'; // Assumindo que seu App.jsx exporta WrappedApp

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WrappedApp />
  </StrictMode>,
);