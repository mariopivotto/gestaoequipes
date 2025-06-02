import React from 'react';
import {
    LucideLayoutDashboard,
    LucideClipboardList,
    LucideCalendarDays,
    LucideStickyNote,
    LucideListTodo,
    LucideSettings,
    LucideFileText,
    LucideLogOut
} from 'lucide-react';
import { LOGO_URL } from '../../utils/constants'; // Importa a URL do logo

// Componente para cada link da navegação
const NavLink = ({ page, currentPage, setCurrentPage, children, icon: Icon }) => (
    <button
        onClick={() => setCurrentPage(page)}
        className={`flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-md transition-colors duration-150 ease-in-out
                    ${currentPage === page
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md hover:from-blue-600 hover:to-blue-700'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'}`}
        aria-current={currentPage === page ? 'page' : undefined}
    >
        {Icon && <Icon size={18} className="mr-3 flex-shrink-0" />}
        <span className="truncate">{children}</span>
    </button>
);

// Componente Sidebar
const Sidebar = ({ currentPage, setCurrentPage, user, signOut }) => {
    const userDisplayName = user.isAnonymous ? "Anônimo" : user.email || user.uid;

    return (
        <aside className="w-64 bg-white shadow-lg flex flex-col border-r border-gray-200 print:hidden">
            {/* Logo e Título */}
            <div className="h-16 flex items-center justify-center px-4 border-b border-gray-200 flex-shrink-0">
                <img src={LOGO_URL} alt="Logo Gramoterra" className="h-10 w-auto mr-2" onError={(e) => e.target.style.display = 'none'} />
                <h1 className="text-lg font-semibold text-gray-800 truncate">Gestor Equipes</h1>
            </div>

            {/* Navegação Principal */}
            <nav className="flex-grow p-4 space-y-1 overflow-y-auto">
                <NavLink page="dashboard" currentPage={currentPage} setCurrentPage={setCurrentPage} icon={LucideLayoutDashboard}>Dashboard</NavLink>
                <NavLink page="mapa" currentPage={currentPage} setCurrentPage={setCurrentPage} icon={LucideClipboardList}>Mapa Atividades</NavLink>
                <NavLink page="programacao" currentPage={currentPage} setCurrentPage={setCurrentPage} icon={LucideCalendarDays}>Programação</NavLink>
                <NavLink page="anotacoes" currentPage={currentPage} setCurrentPage={setCurrentPage} icon={LucideStickyNote}>Anotações Pátio</NavLink>
                <NavLink page="tarefasPendentes" currentPage={currentPage} setCurrentPage={setCurrentPage} icon={LucideListTodo}>Tarefas Pendentes</NavLink>
                <NavLink page="config" currentPage={currentPage} setCurrentPage={setCurrentPage} icon={LucideSettings}>Configurações</NavLink>
                <NavLink page="relatorios" currentPage={currentPage} setCurrentPage={setCurrentPage} icon={LucideFileText}>Relatórios</NavLink>
            </nav>

            {/* Rodapé da Sidebar - Informações do Usuário e Logout */}
            <div className="p-4 border-t border-gray-200 flex-shrink-0">
                <div className="mb-3 p-2 bg-gray-50 rounded-md border border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">Logado como:</p>
                    <p className="text-sm font-medium text-gray-800 truncate" title={userDisplayName}>{userDisplayName}</p>
                </div>
                <button
                    onClick={signOut}
                    className="w-full flex items-center justify-center px-3 py-2 text-sm font-medium rounded-md text-red-600 bg-red-50 hover:bg-red-100 hover:text-red-700 transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                >
                    <LucideLogOut size={18} className="mr-2" /> Sair
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;

