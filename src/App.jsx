import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

import firebaseAppInstance from './firebaseConfig'; // Importa a instância do app configurada

// Próximo ao topo do App.jsx, depois de importar firebaseAppInstance
const appId = firebaseAppInstance.options.projectId || 'default-app-id';

const firebaseApp = firebaseAppInstance; // Usa a instância importada
// O authGlobal e db serão definidos como já estão no seu código:
// const authGlobal = getAuth(firebaseApp); 
// const db = getFirestore(firebaseApp);
// A constante 'appId' que tínhamos para o Canvas não é mais necessária dessa forma.
// Se precisar do ID do projeto em algum lugar, ele está em firebaseConfig.projectId.
// Para o basePath do Firestore, você pode construir diretamente:
// const appIdForPath = firebaseConfig.projectId || 'default-app-id'; // Ou use uma string fixa se preferir
// const basePath = `/artifacts/${appIdForPath}/public/data`; 
// Ou, mais simples, se o appId no Canvas era o ID do projeto:
const appIdForPath = firebaseConfig.projectId; 



function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.jsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  )
}

export default App
