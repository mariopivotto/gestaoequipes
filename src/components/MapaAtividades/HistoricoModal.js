import React from 'react';
import { useHistoricoTarefa } from '../../services/logService'; // Import the hook
import { useGlobalContext } from '../../context/GlobalContext';
import { formatDate } from '../../utils/helpers';
import Modal from '../common/Modal';
import LoadingSpinner from '../common/LoadingSpinner';

/**
 * Modal para exibir o histórico de alterações de uma tarefa.
 * @param {object} props
 * @param {boolean} props.isOpen - Controla a visibilidade do modal.
 * @param {Function} props.onClose - Função para fechar o modal.
 * @param {string|null} props.tarefaId - ID da tarefa para buscar o histórico.
 */
const HistoricoModal = ({ isOpen, onClose, tarefaId }) => {
    const { basePath } = useGlobalContext();
    // Use the custom hook to fetch history
    const { historico, loadingHistorico, errorHistorico } = useHistoricoTarefa(basePath, tarefaId);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Histórico da Tarefa (ID: ${tarefaId ? tarefaId.substring(0, 8) : 'N/A'}...)`} maxWidth="max-w-4xl">
            {loadingHistorico && (
                <div className="flex justify-center items-center p-6">
                    <LoadingSpinner />
                    <span className="ml-3 text-gray-600">Carregando histórico...</span>
                </div>
            )}
            {errorHistorico && (
                <div className="p-4 bg-red-100 border border-red-300 text-red-700 rounded-md text-sm">
                    Erro ao carregar histórico: {errorHistorico.message}
                </div>
            )}
            {!loadingHistorico && !errorHistorico && (
                <div className="max-h-[60vh] overflow-y-auto">
                    {historico.length === 0 ? (
                        <p className="text-center text-gray-500 py-4">Nenhum histórico encontrado para esta tarefa.</p>
                    ) : (
                        <ul className="divide-y divide-gray-200">
                            {historico.map((item) => (
                                <li key={item.id} className="py-3 px-1 hover:bg-gray-50">
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="flex-grow">
                                            <p className="text-sm font-medium text-gray-800">
                                                <span className="font-semibold">Ação:</span> {item.acaoRealizada}
                                            </p>
                                            {item.detalhesAdicionais && (
                                                <p className="text-sm text-gray-600 mt-1">
                                                    <span className="font-semibold">Detalhes:</span> {item.detalhesAdicionais}
                                                </p>
                                            )}
                                        </div>
                                        <div className="text-right flex-shrink-0 ml-4">
                                            <p className="text-xs text-gray-500 whitespace-nowrap">
                                                {formatDate(item.timestamp)} às {item.timestamp?.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                            <p className="text-xs text-gray-500 truncate" title={item.usuarioEmail || item.usuarioId}>
                                                Por: {item.usuarioEmail || item.usuarioId}
                                            </p>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
            <div className="pt-4 flex justify-end border-t border-gray-200 mt-4">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition duration-150 ease-in-out"
                >
                    Fechar
                </button>
            </div>
        </Modal>
    );
};

export default HistoricoModal;

