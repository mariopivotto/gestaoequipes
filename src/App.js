import React, { useState } from 'react';
import { useGlobalContext, GlobalProvider } from './context/GlobalContext';
import AuthComponent from './components/Auth/AuthComponent';
import DashboardComponent from './components/Dashboard/DashboardComponent'; // Placeholder - needs creation
import MapaAtividadesComponent from './components/MapaAtividades/MapaAtividadesComponent'; // Placeholder
import ProgramacaoSemanalComponent from './components/Programacao/ProgramacaoSemanalComponent'; // Placeholder
import AnotacoesPatioComponent from './components/Anotacoes/AnotacoesPatioComponent'; // Placeholder
import TarefasPendentesComponent from './components/TarefasPendentes/TarefasPendentesComponent'; // Placeholder
import ConfiguracoesComponent from './components/Configuracoes/ConfiguracoesComponent'; // Placeholder
import RelatoriosComponent from './components/Relatorios/RelatoriosComponent'; // Placeholder
import Sidebar from './components/Layout/Sidebar'; // Placeholder
import LoadingSpinner from './components/common/LoadingSpinner'; // Placeholder for a global loader

// Main application component
function App() {
    const [currentPage, setCurrentPage] = useState('dashboard');
    const { currentUser, loadingAuth, loadingConfig, auth } = useGlobalContext();

    // Show loading indicator while auth or initial config is loading
    if (loadingAuth || loadingConfig) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-100">
                <LoadingSpinner />
                <p className="ml-4 text-lg text-gray-600">Carregando aplicação...</p>
            </div>
        );
    }

    // Show Auth component if user is not logged in
    if (!currentUser) {
        return <AuthComponent />;
    }

    // Render the appropriate page content based on the current page state
    const PageContent = () => {
        switch (currentPage) {
            case 'dashboard': return <DashboardComponent />;
            case 'mapa': return <MapaAtividadesComponent />;
            case 'programacao': return <ProgramacaoSemanalComponent />;
            case 'anotacoes': return <AnotacoesPatioComponent />;
            case 'tarefasPendentes': return <TarefasPendentesComponent />;
            case 'config': return <ConfiguracoesComponent />;
            case 'relatorios': return <RelatoriosComponent />;
            default: return <DashboardComponent />;
        }
    };

    // Render the main layout with Sidebar and Page Content
    return (
        <div className="flex h-screen bg-gray-100 font-sans">
            <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} user={currentUser} signOut={() => auth.signOut()} />
            <main className="flex-1 overflow-y-auto">
                <PageContent />
            </main>
        </div>
    );
}

// Wrapper component that includes the GlobalProvider
export default function WrappedApp() {
    return (
        <GlobalProvider>
            <App />
        </GlobalProvider>
    );
}

