import React, { useState, useEffect, useCallback } from 'react';
import { collection, onSnapshot, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { useGlobalContext } from '../../context/GlobalContext';
import { addTarefaMapa, updateTarefaMapa, deleteTarefaMapa } from '../../services/firestoreService';
import { logAlteracaoTarefa, useHistoricoTarefa } from '../../services/logService';
import { formatDate, getStatusColorClass, timestampToDateString } from '../../utils/helpers';
import { SEM_RESPONSAVEL_VALUE, TODOS_OS_STATUS_VALUE, TODAS_AS_PRIORIDADES_VALUE, TODAS_AS_AREAS_VALUE } from '../../utils/constants';
import TarefaFormModal from './TarefaFormModal';
import HistoricoModal from './HistoricoModal'; // Assuming HistoricoModal exists
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal'; // Re-using the common Modal
import {
    LucidePlusCircle, LucideEdit, LucideTrash2, LucideHistory,
    LucideFilter, LucideSearch, LucideX, LucideRotateCcw
} from 'lucide-react';

const MapaAtividadesComponent = () => {
    const { db, basePath, funcionarios, listasAuxiliares, userId, currentUser, loadingConfig } = useGlobalContext();
    const [todasTarefas, setTodasTarefas] = useState([]);
    const [tarefasExibidas, setTarefasExibidas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTarefa, setEditingTarefa] = useState(null);
    const [isHistoricoModalOpen, setIsHistoricoModalOpen] = useState(false);
    const [selectedTarefaIdParaHistorico, setSelectedTarefaIdParaHistorico] = useState(null);
    const [error, setError] = useState(null);

    // Filtros
    const [filtroResponsavel, setFiltroResponsavel] = useState("TODOS");
    const [filtroStatus, setFiltroStatus] = useState(TODOS_OS_STATUS_VALUE);
    const [filtroPrioridade, setFiltroPrioridade] = useState(TODAS_AS_PRIORIDADES_VALUE);
    const [filtroArea, setFiltroArea] = useState(TODAS_AS_AREAS_VALUE);
    const [filtroDataInicio, setFiltroDataInicio] = useState('');
    const [filtroDataFim, setFiltroDataFim] = useState('');
    const [termoBusca, setTermoBusca] = useState('');

    // Carrega tarefas do mapa em tempo real
    useEffect(() => {
        if (!db || !basePath || loadingConfig) {
            setLoading(!loadingConfig); // Only stop loading if config is also loaded
            return;
        }

        setLoading(true);
        setError(null);
        const tarefasCollectionRef = collection(db, `${basePath}/tarefas_mapa`);
        const q = query(tarefasCollectionRef, orderBy("createdAt", "desc"));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedTarefas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTodasTarefas(fetchedTarefas);
            setLoading(false);
        }, (err) => {
            console.error("Erro ao carregar tarefas do mapa: ", err);
            setError("Falha ao carregar as tarefas. Verifique a conexão ou tente novamente.");
            setLoading(false);
        });

        return () => unsubscribe(); // Limpa o listener
    }, [db, basePath, loadingConfig]);

    // Aplica filtros quando as tarefas ou os filtros mudam
    useEffect(() => {
        let tarefasProcessadas = [...todasTarefas];

        // Filtro por Responsável
        if (filtroResponsavel !== "TODOS") {
            if (filtroResponsavel === SEM_RESPONSAVEL_VALUE) {
                tarefasProcessadas = tarefasProcessadas.filter(t => !t.responsaveis || t.responsaveis.length === 0);
            } else {
                tarefasProcessadas = tarefasProcessadas.filter(t => t.responsaveis && t.responsaveis.includes(filtroResponsavel));
            }
        }

        // Filtro por Status
        if (filtroStatus !== TODOS_OS_STATUS_VALUE) {
            tarefasProcessadas = tarefasProcessadas.filter(t => t.status === filtroStatus);
        }
        // Filtro por Prioridade
        if (filtroPrioridade !== TODAS_AS_PRIORIDADES_VALUE) {
            tarefasProcessadas = tarefasProcessadas.filter(t => t.prioridade === filtroPrioridade);
        }
        // Filtro por Área
        if (filtroArea !== TODAS_AS_AREAS_VALUE) {
            tarefasProcessadas = tarefasProcessadas.filter(t => t.area === filtroArea);
        }

        // Filtro por Termo de Busca (na descrição da tarefa)
        if (termoBusca.trim() !== "") {
            const lowerCaseTermo = termoBusca.toLowerCase();
            tarefasProcessadas = tarefasProcessadas.filter(t =>
                t.tarefa && t.tarefa.toLowerCase().includes(lowerCaseTermo)
            );
        }

        // Filtro por Intervalo de Datas (considera tarefas que *ocorrem* no intervalo)
        const inicioFiltro = filtroDataInicio ? new Date(`${filtroDataInicio}T00:00:00Z`).getTime() : null;
        const fimFiltro = filtroDataFim ? new Date(`${filtroDataFim}T23:59:59Z`).getTime() : null;

        if (inicioFiltro || fimFiltro) {
            tarefasProcessadas = tarefasProcessadas.filter(t => {
                try {
                    const inicioTarefa = t.dataInicio?.toDate()?.getTime();
                    const fimTarefa = t.dataProvavelTermino?.toDate()?.getTime();

                    if (!inicioTarefa) return false; // Tarefa sem data de início não passa no filtro de data

                    const inicioFiltroVal = inicioFiltro ?? 0;
                    const fimFiltroVal = fimFiltro ?? Infinity;

                    // Lógica: A tarefa deve começar antes do fim do filtro E terminar depois do início do filtro.
                    const comecaAntesFimFiltro = inicioTarefa <= fimFiltroVal;
                    const terminaDepoisInicioFiltro = fimTarefa ? fimTarefa >= inicioFiltroVal : true; // Se não tem fim, considera que termina no futuro

                    // Caso especial: tarefa de um dia só
                    if (fimTarefa && inicioTarefa === fimTarefa) {
                        return inicioTarefa >= inicioFiltroVal && inicioTarefa <= fimFiltroVal;
                    }

                    return comecaAntesFimFiltro && terminaDepoisInicioFiltro;
                } catch (e) {
                    console.error(`Erro ao processar datas para filtro na tarefa ${t.id}:`, e);
                    return false; // Exclui tarefa com data inválida do filtro
                }
            });
        }

        setTarefasExibidas(tarefasProcessadas);
    }, [todasTarefas, filtroResponsavel, filtroStatus, filtroPrioridade, filtroArea, filtroDataInicio, filtroDataFim, termoBusca]);

    // --- Handlers para Modais ---
    const handleOpenModal = (tarefa = null) => {
        setEditingTarefa(tarefa);
        setIsModalOpen(true);
    };
    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingTarefa(null);
    };
    const handleOpenHistoricoModal = (tarefaId) => {
        setSelectedTarefaIdParaHistorico(tarefaId);
        setIsHistoricoModalOpen(true);
    };
    const handleCloseHistoricoModal = () => {
        setIsHistoricoModalOpen(false);
        setSelectedTarefaIdParaHistorico(null);
    };

    // --- Handler para Salvar Tarefa (Adicionar ou Editar) ---
    const handleSaveTarefa = useCallback(async (tarefaData, tarefaIdParaSalvar, dadosAntigos) => {
        // A lógica de salvar (add/update) e sincronizar está agora no firestoreService
        // Esta função apenas chama o serviço apropriado.
        try {
            if (tarefaIdParaSalvar) {
                await updateTarefaMapa(tarefaIdParaSalvar, tarefaData, dadosAntigos, funcionarios, basePath, userId, currentUser?.email);
            } else {
                await addTarefaMapa(tarefaData, basePath, userId, currentUser?.email);
            }
            // O onSnapshot atualizará a lista automaticamente.
        } catch (err) {
            console.error("Erro ao salvar tarefa (componente):", err);
            // Propaga o erro para ser exibido no modal
            throw err;
        }
    }, [basePath, userId, currentUser?.email, funcionarios]); // Dependências para o useCallback

    // --- Handler para Excluir Tarefa ---
    const handleDeleteTarefa = async (tarefaId) => {
        const tarefaParaExcluir = todasTarefas.find(t => t.id === tarefaId);
        const nomeTarefaExcluida = tarefaParaExcluir ? tarefaParaExcluir.tarefa : `ID ${tarefaId}`;

        if (window.confirm(`Tem certeza que deseja excluir a tarefa "${nomeTarefaExcluida}" do Mapa? Ela também será removida da programação semanal.`)) {
            try {
                // A lógica de log, remoção da programação e exclusão está no firestoreService
                await deleteTarefaMapa(tarefaId, nomeTarefaExcluida, basePath, userId, currentUser?.email);
                // O onSnapshot atualizará a lista automaticamente.
            } catch (error) {
                console.error("Erro ao excluir tarefa (componente): ", error);
                alert("Erro ao excluir tarefa: " + error.message);
            }
        }
    };

    // --- Funções Auxiliares de Exibição ---
    const getResponsavelNomes = useCallback((responsavelIds) => {
        if (!responsavelIds || responsavelIds.length === 0) return '--';
        return responsavelIds.map(id => {
            const func = funcionarios.find(f => f.id === id);
            return func ? func.nome : `ID(${id.substring(0, 5)}...)`; // Mostra parte do ID se não encontrar nome
        }).join(', ');
    }, [funcionarios]);

    const limparFiltros = () => {
        setFiltroResponsavel("TODOS");
        setFiltroStatus(TODOS_OS_STATUS_VALUE);
        setFiltroPrioridade(TODAS_AS_PRIORIDADES_VALUE);
        setFiltroArea(TODAS_AS_AREAS_VALUE);
        setFiltroDataInicio('');
        setFiltroDataFim('');
        setTermoBusca('');
    };

    // --- Renderização ---
    if (loading) return (
        <div className="p-6 text-center">
            <LoadingSpinner />
            <p className="mt-2 text-gray-600">Carregando Mapa de Atividades...</p>
        </div>
    );

    if (error) return (
        <div className="p-6 text-center text-red-600 bg-red-100 border border-red-300 rounded-md">
            <p>{error}</p>
        </div>
    );

    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-full">
            {/* Cabeçalho e Botão Adicionar */}
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h2 className="text-xl sm:text-2xl font-semibold text-gray-800">Mapa de Atividades</h2>
                <button
                    onClick={() => handleOpenModal()}
                    className="w-full sm:w-auto bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md flex items-center justify-center shadow-sm transition duration-150 ease-in-out"
                >
                    <LucidePlusCircle size={20} className="mr-2" /> Adicionar Tarefa
                </button>
            </div>

            {/* Seção de Filtros */}
            <div className="bg-white p-4 rounded-lg shadow mb-6">
                <h3 className="text-lg font-semibold mb-3 text-gray-700 flex items-center">
                    <LucideFilter size={18} className="mr-2" /> Filtros
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-4">
                    {/* Filtro Responsável */}
                    <div>
                        <label htmlFor="filtroResponsavel" className="block text-sm font-medium text-gray-700">Responsável</label>
                        <select id="filtroResponsavel" value={filtroResponsavel} onChange={(e) => setFiltroResponsavel(e.target.value)} className="mt-1 block w-full p-2 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white text-sm">
                            <option value="TODOS">TODOS</option>
                            <option value={SEM_RESPONSAVEL_VALUE}>-- Sem Responsável --</option>
                            {funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                        </select>
                    </div>
                    {/* Filtro Status */}
                    <div>
                        <label htmlFor="filtroStatus" className="block text-sm font-medium text-gray-700">Status</label>
                        <select id="filtroStatus" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="mt-1 block w-full p-2 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white text-sm">
                            <option value={TODOS_OS_STATUS_VALUE}>TODOS</option>
                            {listasAuxiliares.status.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    {/* Filtro Prioridade */}
                    <div>
                        <label htmlFor="filtroPrioridade" className="block text-sm font-medium text-gray-700">Prioridade</label>
                        <select id="filtroPrioridade" value={filtroPrioridade} onChange={(e) => setFiltroPrioridade(e.target.value)} className="mt-1 block w-full p-2 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white text-sm">
                            <option value={TODAS_AS_PRIORIDADES_VALUE}>TODAS</option>
                            {listasAuxiliares.prioridades.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    {/* Filtro Área */}
                    <div>
                        <label htmlFor="filtroArea" className="block text-sm font-medium text-gray-700">Área</label>
                        <select id="filtroArea" value={filtroArea} onChange={(e) => setFiltroArea(e.target.value)} className="mt-1 block w-full p-2 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white text-sm">
                            <option value={TODAS_AS_AREAS_VALUE}>TODAS</option>
                            {listasAuxiliares.areas.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
                     {/* Filtro Busca por Texto */}
                    <div className="lg:col-span-1">
                        <label htmlFor="termoBusca" className="block text-sm font-medium text-gray-700">Buscar Tarefa</label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <LucideSearch className="h-5 w-5 text-gray-400" aria-hidden="true" />
                            </div>
                            <input
                                type="text"
                                id="termoBusca"
                                value={termoBusca}
                                onChange={(e) => setTermoBusca(e.target.value)}
                                className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2"
                                placeholder="Digite para buscar..."
                            />
                            {termoBusca && (
                                <button
                                    onClick={() => setTermoBusca('')}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer text-gray-400 hover:text-gray-600"
                                    aria-label="Limpar busca"
                                >
                                    <LucideX className="h-5 w-5" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                 {/* Filtros de Data e Botão Limpar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 items-end">
                    <div>
                        <label htmlFor="filtroDataInicio" className="block text-sm font-medium text-gray-700">Data Início (De)</label>
                        <input type="date" id="filtroDataInicio" value={filtroDataInicio} onChange={(e) => setFiltroDataInicio(e.target.value)} className="mt-1 block w-full p-2 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"/>
                    </div>
                    <div>
                        <label htmlFor="filtroDataFim" className="block text-sm font-medium text-gray-700">Data Início (Até)</label>
                        <input type="date" id="filtroDataFim" value={filtroDataFim} onChange={(e) => setFiltroDataFim(e.target.value)} min={filtroDataInicio} className="mt-1 block w-full p-2 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"/>
                    </div>
                    <div className="sm:col-start-2 md:col-start-3 lg:col-start-4 xl:col-start-5">
                        <button
                            onClick={limparFiltros}
                            className="w-full mt-1 sm:mt-0 flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                            <LucideRotateCcw size={16} className="mr-2"/> Limpar Filtros
                        </button>
                    </div>
                </div>
            </div>

            {/* Tabela de Tarefas */}
            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            {/* Ajuste as colunas conforme necessário */}
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tarefa</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prioridade</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Área</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Responsáveis</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Datas (Início/Fim)</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {tarefasExibidas.length === 0 && (
                            <tr><td colSpan="7" className="px-4 py-4 text-center text-gray-500">Nenhuma tarefa encontrada com os filtros aplicados.</td></tr>
                        )}
                        {tarefasExibidas.map((tarefa) => (
                            <tr key={tarefa.id} className={`hover:bg-gray-50 ${getStatusColorClass(tarefa.status).split(' ')[0].replace('bg-', 'border-l-4 border-')}`}>
                                <td className="px-4 py-3 text-sm text-gray-900 font-medium max-w-xs break-words">{tarefa.tarefa}</td>
                                <td className="px-4 py-3 text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColorClass(tarefa.status)}`}>
                                        {tarefa.status}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-700">{tarefa.prioridade || '--'}</td>
                                <td className="px-4 py-3 text-sm text-gray-700">{tarefa.area || '--'}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 max-w-xs break-words">{getResponsavelNomes(tarefa.responsaveis)}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                                    {formatDate(tarefa.dataInicio)} - {formatDate(tarefa.dataProvavelTermino)}
                                </td>
                                <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">
                                    <button onClick={() => handleOpenHistoricoModal(tarefa.id)} title="Ver Histórico" className="text-gray-500 hover:text-gray-700 mr-3 transition duration-150 ease-in-out"><LucideHistory size={18}/></button>
                                    <button onClick={() => handleOpenModal(tarefa)} title="Editar Tarefa" className="text-blue-600 hover:text-blue-800 mr-3 transition duration-150 ease-in-out"><LucideEdit size={18}/></button>
                                    <button onClick={() => handleDeleteTarefa(tarefa.id)} title="Excluir Tarefa" className="text-red-600 hover:text-red-800 transition duration-150 ease-in-out"><LucideTrash2 size={18}/></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal de Adicionar/Editar Tarefa */}
            <TarefaFormModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                tarefaExistente={editingTarefa}
                onSave={handleSaveTarefa}
            />

            {/* Modal de Histórico */}
            <HistoricoModal
                isOpen={isHistoricoModalOpen}
                onClose={handleCloseHistoricoModal}
                tarefaId={selectedTarefaIdParaHistorico}
            />
        </div>
    );
};

export default MapaAtividadesComponent;

