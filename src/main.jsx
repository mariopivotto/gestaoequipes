import React from 'react'
import ReactDOM from 'react-dom/client'
import WrappedApp from './App.jsx' // O nome aqui pode ser App ou WrappedApp
import './index.css' // <--- GARANTA QUE ESTA LINHA EXISTA!

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WrappedApp />
  </React.StrictMode>,
)