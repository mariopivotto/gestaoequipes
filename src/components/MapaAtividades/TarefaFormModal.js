import React, { useState, useEffect, useCallback } from 'react';
import { Timestamp } from 'firebase/firestore';
import { useGlobalContext } from '../../context/GlobalContext';
import { addTarefaMapa, updateTarefaMapa, deleteTarefaMapa } from '../../services/firestoreService';
import { dateStringToTimestamp, timestampToDateString } from '../../utils/helpers';
import { STATUS_TAREFA, TURNOS_POSSIVEIS } from '../../utils/constants';
import Modal from '../common/Modal';
import LoadingButton from '../common/LoadingButton'; // Assuming LoadingButton exists or will be created

const TarefaFormModal = ({ isOpen, onClose, tarefaExistente, onSave }) => {
    const { listasAuxiliares, funcionarios, userId, currentUser } = useGlobalContext();
    const [tarefa, setTarefa] = useState('');
    const [status, setStatus] = useState(STATUS_TAREFA.PREVISTA);
    const [prioridade, setPrioridade] = useState('');
    const [area, setArea] = useState('');
    const [acao, setAcao] = useState('');
    const [responsaveis, setResponsaveis] = useState([]);
    const [turno, setTurno] = useState('');
    const [dataInicio, setDataInicio] = useState('');
    const [dataProvavelTermino, setDataProvavelTermino] = useState('');
    const [orientacao, setOrientacao] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        setError(''); // Clear error on open/tarefa change
        if (tarefaExistente) {
            setTarefa(tarefaExistente.tarefa || '');
            setStatus(tarefaExistente.status || STATUS_TAREFA.PREVISTA);
            setPrioridade(tarefaExistente.prioridade || '');
            setArea(tarefaExistente.area || '');
            setAcao(tarefaExistente.acao || '');
            setResponsaveis(tarefaExistente.responsaveis || []);
            setTurno(tarefaExistente.turno || '');
            setDataInicio(timestampToDateString(tarefaExistente.dataInicio));
            setDataProvavelTermino(timestampToDateString(tarefaExistente.dataProvavelTermino));
            setOrientacao(tarefaExistente.orientacao || '');
        } else {
            // Reset form for new task
            setTarefa('');
            setStatus(STATUS_TAREFA.PREVISTA); // Default status for new tasks
            setPrioridade(listasAuxiliares.prioridades[0] || ''); // Default priority
            setArea('');
            setAcao('');
            setResponsaveis([]);
            setTurno('');
            setDataInicio('');
            setDataProvavelTermino('');
            setOrientacao('');
        }
    }, [isOpen, tarefaExistente, listasAuxiliares]);

    const handleResponsavelChange = (e) => {
        const options = e.target.options;
        const selectedResponsaveis = [];
        for (let i = 0, l = options.length; i < l; i++) {
            if (options[i].selected) {
                selectedResponsaveis.push(options[i].value);
            }
        }
        setResponsaveis(selectedResponsaveis);
    };

    const validateForm = () => {
        if (!tarefa.trim()) return "O campo Tarefa (Descrição) é obrigatório.";
        if (!status) return "O campo Status é obrigatório.";
        // Add more validations as needed (e.g., dates)
        const inicio = dateStringToTimestamp(dataInicio);
        const fim = dateStringToTimestamp(dataProvavelTermino);
        if (inicio && fim && fim.toMillis() < inicio.toMillis()) {
            return "A Data de Término não pode ser anterior à Data de Início.";
        }
        // Require responsible if status is PROGRAMADA?
        if (status === STATUS_TAREFA.PROGRAMADA && responsaveis.length === 0) {
             return "É necessário selecionar ao menos um responsável para tarefas PROGRAMADAS.";
        }
        if (status === STATUS_TAREFA.PROGRAMADA && (!dataInicio || !dataProvavelTermino)) {
             return "Datas de Início e Término são obrigatórias para tarefas PROGRAMADAS.";
        }

        return ''; // No error
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const validationError = validateForm();
        if (validationError) {
            setError(validationError);
            return;
        }

        setLoading(true);
        const tarefaData = {
            tarefa: tarefa.trim().toUpperCase(),
            status,
            prioridade,
            area,
            acao,
            responsaveis,
            turno,
            dataInicio: dateStringToTimestamp(dataInicio),
            dataProvavelTermino: dateStringToTimestamp(dataProvavelTermino),
            orientacao: orientacao.trim(),
            // Campos de controle (criadoPor, createdAt, updatedAt) são gerenciados pelo serviço
        };

        try {
            await onSave(tarefaData, tarefaExistente ? tarefaExistente.id : null, tarefaExistente);
            onClose(); // Close modal on success
        } catch (err) {
            console.error("Erro ao salvar tarefa:", err);
            setError(err.message || "Ocorreu um erro ao salvar a tarefa. Tente novamente.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={tarefaExistente ? "Editar Tarefa" : "Adicionar Nova Tarefa"} maxWidth="max-w-3xl">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 bg-red-100 border border-red-300 text-red-700 rounded-md text-sm">
                        {error}
                    </div>
                )}

                {/* Linha 1: Tarefa (Descrição) */}
                <div>
                    <label htmlFor="tarefa-desc" className="block text-sm font-medium text-gray-700">Tarefa (Descrição) <span className="text-red-500">*</span></label>
                    <input
                        id="tarefa-desc"
                        type="text"
                        value={tarefa}
                        onChange={(e) => setTarefa(e.target.value)}
                        required
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>

                {/* Linha 2: Status, Prioridade, Área, Ação */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <label htmlFor="tarefa-status" className="block text-sm font-medium text-gray-700">Status <span className="text-red-500">*</span></label>
                        <select id="tarefa-status" value={status} onChange={(e) => setStatus(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white">
                            {listasAuxiliares.status.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="tarefa-prioridade" className="block text-sm font-medium text-gray-700">Prioridade</label>
                        <select id="tarefa-prioridade" value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white">
                            <option value="">Selecione...</option>
                            {listasAuxiliares.prioridades.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="tarefa-area" className="block text-sm font-medium text-gray-700">Área</label>
                        <select id="tarefa-area" value={area} onChange={(e) => setArea(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white">
                            <option value="">Selecione...</option>
                            {listasAuxiliares.areas.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="tarefa-acao" className="block text-sm font-medium text-gray-700">Ação</label>
                        <select id="tarefa-acao" value={acao} onChange={(e) => setAcao(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white">
                            <option value="">Selecione...</option>
                            {listasAuxiliares.acoes.map(ac => <option key={ac} value={ac}>{ac}</option>)}
                        </select>
                    </div>
                </div>

                {/* Linha 3: Responsáveis e Turno */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="tarefa-responsaveis" className="block text-sm font-medium text-gray-700">Responsáveis {status === STATUS_TAREFA.PROGRAMADA && <span className="text-red-500">*</span>}</label>
                        <select
                            id="tarefa-responsaveis"
                            multiple
                            value={responsaveis}
                            onChange={handleResponsavelChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 h-24 bg-white"
                        >
                            {funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Segure Ctrl (ou Cmd) para selecionar múltiplos.</p>
                    </div>
                    <div>
                        <label htmlFor="tarefa-turno" className="block text-sm font-medium text-gray-700">Turno</label>
                        <select id="tarefa-turno" value={turno} onChange={(e) => setTurno(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white">
                            <option value="">Selecione...</option>
                            {TURNOS_POSSIVEIS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                </div>

                {/* Linha 4: Datas */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="tarefa-data-inicio" className="block text-sm font-medium text-gray-700">Data Início {status === STATUS_TAREFA.PROGRAMADA && <span className="text-red-500">*</span>}</label>
                        <input
                            id="tarefa-data-inicio"
                            type="date"
                            value={dataInicio}
                            onChange={(e) => setDataInicio(e.target.value)}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="tarefa-data-termino" className="block text-sm font-medium text-gray-700">Data Término {status === STATUS_TAREFA.PROGRAMADA && <span className="text-red-500">*</span>}</label>
                        <input
                            id="tarefa-data-termino"
                            type="date"
                            value={dataProvavelTermino}
                            onChange={(e) => setDataProvavelTermino(e.target.value)}
                            min={dataInicio} // Prevent end date before start date
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                </div>

                {/* Linha 5: Orientação */}
                <div>
                    <label htmlFor="tarefa-orientacao" className="block text-sm font-medium text-gray-700">Orientação</label>
                    <textarea
                        id="tarefa-orientacao"
                        value={orientacao}
                        onChange={(e) => setOrientacao(e.target.value)}
                        rows="3"
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    ></textarea>
                </div>

                {/* Botões */}
                <div className="pt-4 flex justify-end space-x-3 border-t border-gray-200 mt-6">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition duration-150 ease-in-out"
                    >
                        Cancelar
                    </button>
                    <LoadingButton
                        type="submit"
                        loading={loading}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 transition duration-150 ease-in-out"
                    >
                        {tarefaExistente ? 'Atualizar Tarefa' : 'Adicionar Tarefa'}
                    </LoadingButton>
                </div>
            </form>
        </Modal>
    );
};

export default TarefaFormModal;

