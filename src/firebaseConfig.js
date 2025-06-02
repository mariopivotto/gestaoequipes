// src/firebaseConfig.js
import { initializeApp } from "firebase/app";

// COLE AQUI O SEU firebaseConfig COPIADO DO CONSOLE DO FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyC88aEV9Y66KGeow1QyfgxBeYYcF0TXC6k",
  authDomain: "gestaodeprojetos-b9a1d.firebaseapp.com",
  projectId: "gestaodeprojetos-b9a1d",
  storageBucket: "gestaodeprojetos-b9a1d.firebasestorage.app",
  messagingSenderId: "227626878746",
  appId: "1:227626878746:web:055c136e421c53b8558ea3"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

export default app; // Exporta a instância do app inicializada