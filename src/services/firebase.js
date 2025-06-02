import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Carrega a configuração do Firebase a partir das variáveis de ambiente
// É ESSENCIAL configurar estas variáveis no seu ambiente de desenvolvimento (.env.local)
// e nas configurações da plataforma de deploy (Vercel, Netlify, Firebase Hosting)
const firebaseConfig = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// Validação básica para garantir que as variáveis foram carregadas
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error("Erro Crítico: Configuração do Firebase não encontrada nas variáveis de ambiente. Verifique seu arquivo .env.local ou as configurações de ambiente da sua plataforma de deploy. As variáveis devem começar com REACT_APP_ (ex: REACT_APP_FIREBASE_API_KEY).");
  // Você pode querer lançar um erro ou mostrar uma mensagem para o usuário aqui
}

// Inicializa o Firebase App
const firebaseApp = initializeApp(firebaseConfig);

// Obtém instâncias dos serviços do Firebase
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// Exporta as instâncias para serem usadas em outras partes da aplicação
export { auth, db, firebaseApp };

