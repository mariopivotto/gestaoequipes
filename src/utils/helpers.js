import { Timestamp } from 'firebase/firestore';

/**
 * Formata um objeto Timestamp do Firebase ou um objeto Date para uma string de data no formato dd/mm/aaaa.
 * @param {Timestamp|Date|{seconds: number, nanoseconds: number}|null|undefined} timestamp O valor de tempo a ser formatado.
 * @returns {string} A data formatada ou 'N/A' se a entrada for inválida.
 */
export const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    let date;
    try {
        if (timestamp instanceof Timestamp) {
            date = timestamp.toDate();
        } else if (timestamp instanceof Date) {
            date = timestamp;
        } else if (timestamp && typeof timestamp.seconds === 'number') { // Tratamento para objeto serializado
            date = new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
        } else {
            // Tenta converter se for uma string de data válida (ISO 8601, etc.)
            const parsedDate = new Date(timestamp);
            if (!isNaN(parsedDate.getTime())) {
                date = parsedDate;
            } else {
                console.warn("Formato de data inválido recebido em formatDate:", timestamp);
                return 'Data inválida';
            }
        }
        // Garante que a data seja tratada como UTC para evitar problemas de fuso horário na formatação
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
    } catch (error) {
        console.error("Erro ao formatar data:", error, "Valor recebido:", timestamp);
        return 'Erro na data';
    }
};

/**
 * Gera uma cor de fundo Tailwind CSS com base no status da tarefa.
 * @param {string} status O status da tarefa.
 * @returns {string} Classe CSS Tailwind correspondente.
 */
export const getStatusColorClass = (status) => {
    switch (status) {
        case "CANCELADA": return "bg-red-200 text-red-800";
        case "CONCLUÍDA": return "bg-green-200 text-green-800";
        case "PROGRAMADA": return "bg-blue-200 text-blue-800";
        case "AGUARDANDO ALOCAÇÃO": return "bg-orange-200 text-orange-800"; // Alterado de red-300 para orange
        case "PREVISTA": return "bg-yellow-200 text-yellow-800";
        default: return "bg-gray-100 text-gray-800";
    }
};

/**
 * Gera uma cor de texto Tailwind CSS com base no status da tarefa (para Dashboard).
 * @param {string} status O status da tarefa.
 * @returns {string} Classe CSS Tailwind correspondente.
 */
export const getStatusColorTextClass = (status) => {
    switch (status) {
        case "CANCELADA": return "text-red-600";
        case "CONCLUÍDA": return "text-green-600";
        case "PROGRAMADA": return "text-blue-600";
        case "AGUARDANDO ALOCAÇÃO": return "text-orange-600";
        case "PREVISTA": return "text-yellow-600";
        default: return "text-gray-600";
    }
};

/**
 * Gera classes CSS Tailwind para prioridade (usado no Dashboard).
 * @param {string} prioridade A prioridade da tarefa.
 * @returns {string} Classes CSS Tailwind correspondentes.
 */
export const getPrioridadeColorClass = (prioridade) => {
    if (prioridade === "P4 - URGENTE") return "bg-red-500 text-white";
    if (prioridade === "P1 - CURTO PRAZO") return "bg-orange-400 text-white";
    if (prioridade === "P2 - MÉDIO PRAZO") return "bg-yellow-400 text-black"; // Médio prazo com texto preto para contraste
    if (prioridade === "P3 - LONGO PRAZO") return "bg-blue-400 text-white"; // Adicionado cor para P3
    return "bg-gray-200 text-gray-700";
};

/**
 * Converte uma string de data (YYYY-MM-DD) para um objeto Timestamp do Firebase.
 * Retorna null se a string for inválida.
 * @param {string} dateString String no formato YYYY-MM-DD.
 * @returns {Timestamp|null} Objeto Timestamp ou null.
 */
export const dateStringToTimestamp = (dateString) => {
    if (!dateString || typeof dateString !== 'string') return null;
    try {
        // Adiciona T00:00:00Z para garantir que seja interpretado como UTC
        const date = new Date(`${dateString}T00:00:00Z`);
        if (isNaN(date.getTime())) {
            console.warn("Data string inválida para conversão em Timestamp:", dateString);
            return null;
        }
        return Timestamp.fromDate(date);
    } catch (error) {
        console.error("Erro ao converter string de data para Timestamp:", dateString, error);
        return null;
    }
};

/**
 * Converte um objeto Timestamp do Firebase ou Date para uma string YYYY-MM-DD.
 * Retorna uma string vazia se a entrada for inválida.
 * @param {Timestamp|Date|null} timestamp Objeto Timestamp ou Date.
 * @returns {string} String no formato YYYY-MM-DD ou string vazia.
 */
export const timestampToDateString = (timestamp) => {
    if (!timestamp) return '';
    let date;
    try {
        if (timestamp instanceof Timestamp) {
            date = timestamp.toDate();
        } else if (timestamp instanceof Date) {
            date = timestamp;
        } else {
            return '';
        }
        // Garante que a formatação use o ano, mês e dia corretos (considerando UTC)
        const year = date.getUTCFullYear();
        const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
        const day = date.getUTCDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    } catch (error) {
        console.error("Erro ao converter Timestamp/Date para string YYYY-MM-DD:", timestamp, error);
        return '';
    }
};

