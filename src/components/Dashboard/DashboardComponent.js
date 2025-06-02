import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, where, Timestamp } from 'firebase/firestore';
import { useGlobalContext } from '../../context/GlobalContext';
import { formatDate, getStatusColorTextClass, getPrioridadeColorClass } from '../../utils/helpers';
import LoadingSpinner from '../common/LoadingSpinner';
import { LucideClock, LucideAlertOctagon } from 'lucide-react';
import { STATUS_TAREFA } from '../../utils/constants'; // Import status constants

const DashboardComponent = () => {
    const { db, basePath, listasAuxiliares, loadingConfig } = useGlobalContext();
    const [stats, setStats] = useState({ porStatus: {}, porPrioridade: {}, proximoPrazo: [], atrasadas: [] });
    const [loadingDashboard, setLoadingDashboard] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Don't fetch data until the global config (including status/priorities) is loaded
        if (loadingConfig || !db || !basePath) {
            // If config is still loading, keep the dashboard loading state true
            setLoadingDashboard(loadingConfig);
            return;
        }

        const fetchDashboardData = async () => {
            setLoadingDashboard(true);
            setError(null);
            try {
                const tarefasCollectionRef = collection(db, `${basePath}/tarefas_mapa`);
                // Consider adding filters if needed, e.g., only active tasks
                const q = query(tarefasCollectionRef);
                const snapshot = await getDocs(q);
                const todasTarefas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                // Initialize counters based on available status and priorities from global context
                const porStatus = listasAuxiliares.status.reduce((acc, status) => ({ ...acc, [status]: 0 }), {});
                const porPrioridade = listasAuxiliares.prioridades.reduce((acc, prioridade) => ({ ...acc, [prioridade]: 0 }), {});

                const hoje = new Date();
                hoje.setUTCHours(0, 0, 0, 0); // Use UTC for comparison
                const daqui7Dias = new Date(hoje);
                daqui7Dias.setUTCDate(hoje.getUTCDate() + 7);

                const proximoPrazo = [];
                const atrasadas = [];

                todasTarefas.forEach(tarefa => {
                    // Increment status count if status exists in our known list
                    if (tarefa.status && porStatus.hasOwnProperty(tarefa.status)) {
                        porStatus[tarefa.status]++;
                    } else if (tarefa.status) {
                        // Handle unexpected status if necessary
                        console.warn(`Status desconhecido encontrado: ${tarefa.status}`);
                        porStatus[tarefa.status] = (porStatus[tarefa.status] || 0) + 1; // Count it anyway
                    }

                    // Increment priority count
                    if (tarefa.prioridade && porPrioridade.hasOwnProperty(tarefa.prioridade)) {
                        porPrioridade[tarefa.prioridade]++;
                    } else if (tarefa.prioridade) {
                        console.warn(`Prioridade desconhecida encontrada: ${tarefa.prioridade}`);
                        porPrioridade[tarefa.prioridade] = (porPrioridade[tarefa.prioridade] || 0) + 1;
                    }

                    // Check deadlines for non-completed/non-cancelled tasks
                    if (tarefa.dataProvavelTermino &&
                        tarefa.status !== STATUS_TAREFA.CONCLUIDA &&
                        tarefa.status !== STATUS_TAREFA.CANCELADA) {

                        try {
                            let dataTermino;
                            if (tarefa.dataProvavelTermino instanceof Timestamp) {
                                dataTermino = tarefa.dataProvavelTermino.toDate();
                            } else if (tarefa.dataProvavelTermino.seconds) { // Handle serialized Timestamp
                                dataTermino = new Date(tarefa.dataProvavelTermino.seconds * 1000);
                            } else {
                                throw new Error('Formato de dataProvavelTermino inválido');
                            }
                            dataTermino.setUTCHours(0, 0, 0, 0); // Compare dates only (UTC)

                            if (dataTermino < hoje) {
                                atrasadas.push(tarefa);
                            } else if (dataTermino >= hoje && dataTermino < daqui7Dias) { // Use < daqui7Dias
                                proximoPrazo.push(tarefa);
                            }
                        } catch (dateError) {
                            console.error(`Erro ao processar data de término para tarefa ${tarefa.id}:`, dateError, tarefa.dataProvavelTermino);
                        }
                    }
                });

                // Sort tasks by deadline
                proximoPrazo.sort((a, b) => a.dataProvavelTermino.toMillis() - b.dataProvavelTermino.toMillis());
                atrasadas.sort((a, b) => a.dataProvavelTermino.toMillis() - b.dataProvavelTermino.toMillis());

                setStats({ porStatus, porPrioridade, proximoPrazo, atrasadas });
            } catch (err) {
                console.error("[Dashboard] Erro ao buscar dados:", err);
                setError("Falha ao carregar os dados do dashboard. Tente recarregar a página.");
                setStats({ porStatus: {}, porPrioridade: {}, proximoPrazo: [], atrasadas: [] }); // Reset stats on error
            } finally {
                setLoadingDashboard(false);
            }
        };

        fetchDashboardData();

        // No cleanup needed for getDocs, but good practice if using onSnapshot

    }, [db, basePath, listasAuxiliares, loadingConfig]); // Rerun if these change

    if (loadingDashboard) {
        return (
            <div className="p-6 text-center">
                <LoadingSpinner />
                <p className="mt-2 text-gray-600">Carregando dados do Dashboard...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 text-center text-red-600 bg-red-100 border border-red-300 rounded-md">
                <p>{error}</p>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 lg:p-8 bg-gray-50 min-h-full">
            <h2 className="text-2xl md:text-3xl font-semibold text-gray-800 mb-6 md:mb-8">Dashboard</h2>

            {/* Cards de Status e Prioridade */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
                {/* Card Tarefas por Status */}
                <div className="bg-white p-4 md:p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300">
                    <h3 className="text-lg md:text-xl font-semibold text-gray-700 mb-4">Tarefas por Status</h3>
                    {Object.keys(stats.porStatus).length > 0 ? (
                        <ul className="space-y-2">
                            {Object.entries(stats.porStatus)
                                .sort(([statusA], [statusB]) => statusA.localeCompare(statusB)) // Sort alphabetically by status
                                .map(([status, count]) => (
                                <li key={status} className="flex justify-between items-center text-sm">
                                    <span className={`font-medium ${getStatusColorTextClass(status)}`}>{status}</span>
                                    <span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded-full text-xs font-semibold">{count}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-gray-500">Nenhum status para exibir.</p>
                    )}
                </div>

                {/* Card Tarefas por Prioridade */}
                <div className="bg-white p-4 md:p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300">
                    <h3 className="text-lg md:text-xl font-semibold text-gray-700 mb-4">Tarefas por Prioridade</h3>
                    {Object.keys(stats.porPrioridade).length > 0 ? (
                        <ul className="space-y-2">
                            {Object.entries(stats.porPrioridade)
                                .sort(([prioA], [prioB]) => prioA.localeCompare(prioB)) // Sort alphabetically
                                .map(([prioridade, count]) => (
                                <li key={prioridade} className="flex justify-between items-center text-sm">
                                    <span className={`font-medium px-2 py-0.5 rounded-full text-xs ${getPrioridadeColorClass(prioridade)}`}>{prioridade}</span>
                                    <span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded-full text-xs font-semibold">{count}</span>
                                </li>
                            ))}
                        </ul>
                     ) : (
                        <p className="text-sm text-gray-500">Nenhuma prioridade para exibir.</p>
                    )}
                </div>
            </div>

            {/* Cards de Prazos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {/* Card Tarefas com Prazo Próximo */}
                <div className="bg-white p-4 md:p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300">
                    <h3 className="text-lg md:text-xl font-semibold text-yellow-600 mb-4 flex items-center">
                        <LucideClock size={20} className="mr-2 flex-shrink-0" /> Prazo Próximo (7 dias)
                    </h3>
                    {stats.proximoPrazo.length > 0 ? (
                        <ul className="space-y-3 max-h-80 overflow-y-auto pr-2">
                            {stats.proximoPrazo.map(tarefa => (
                                <li key={tarefa.id} className="p-3 border rounded-md bg-yellow-50 border-yellow-200 hover:bg-yellow-100 transition-colors">
                                    <p className="font-semibold text-sm text-yellow-800 truncate" title={tarefa.tarefa}>{tarefa.tarefa}</p>
                                    <p className="text-xs text-yellow-700 mt-1">
                                        Término: {formatDate(tarefa.dataProvavelTermino)} - Status: {tarefa.status}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="text-sm text-gray-500">Nenhuma tarefa com prazo nos próximos 7 dias.</p>}
                </div>

                {/* Card Tarefas Atrasadas */}
                <div className="bg-white p-4 md:p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300">
                    <h3 className="text-lg md:text-xl font-semibold text-red-600 mb-4 flex items-center">
                        <LucideAlertOctagon size={20} className="mr-2 flex-shrink-0" /> Tarefas Atrasadas
                    </h3>
                    {stats.atrasadas.length > 0 ? (
                        <ul className="space-y-3 max-h-80 overflow-y-auto pr-2">
                            {stats.atrasadas.map(tarefa => (
                                <li key={tarefa.id} className="p-3 border rounded-md bg-red-50 border-red-200 hover:bg-red-100 transition-colors">
                                    <p className="font-semibold text-sm text-red-800 truncate" title={tarefa.tarefa}>{tarefa.tarefa}</p>
                                    <p className="text-xs text-red-700 mt-1">
                                        Término: {formatDate(tarefa.dataProvavelTermino)} - Status: {tarefa.status}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="text-sm text-gray-500">Nenhuma tarefa atrasada.</p>}
                </div>
            </div>
        </div>
    );
};

export default DashboardComponent;

