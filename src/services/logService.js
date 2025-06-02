import { db } from './firebase';
import { collection, addDoc, Timestamp, query, orderBy, onSnapshot } from 'firebase/firestore';

/**
 * Registra uma entrada no histórico de alterações de uma tarefa específica.
 * @param {string} basePath Caminho base no Firestore (ex: /artifacts/appId/public/data).
 * @param {string} tarefaId ID da tarefa do mapa cujo histórico está sendo registrado.
 * @param {string|null} usuarioId ID do usuário que realizou a ação (ou 'sistema').
 * @param {string|null} usuarioEmail Email do usuário (ou 'Sistema'/'Desconhecido').
 * @param {string} acaoRealizada Descrição da ação (ex: 'Tarefa Criada', 'Status Atualizado').
 * @param {string} [detalhesAdicionais=""] Detalhes extras sobre a alteração.
 */
export const logAlteracaoTarefa = async (basePath, tarefaId, usuarioId, usuarioEmail, acaoRealizada, detalhesAdicionais = "") => {
    if (!db || !basePath) {
        console.error("LogService: Firestore DB ou basePath não inicializado.");
        return; // Evita erro fatal se db/basePath não estiverem prontos
    }
    if (!tarefaId) {
        console.error("LogService: Tentativa de log sem tarefaId.");
        return;
    }

    try {
        const historicoRef = collection(db, `${basePath}/tarefas_mapa/${tarefaId}/historico_alteracoes`);
        await addDoc(historicoRef, {
            timestamp: Timestamp.now(),
            usuarioId: usuarioId || "sistema",
            usuarioEmail: usuarioEmail || (usuarioId === "sistema" ? "Sistema" : "Desconhecido"),
            acaoRealizada,
            detalhesAdicionais
        });
    } catch (error) {
        console.error(`LogService: Erro ao registrar histórico para tarefa ${tarefaId}:`, error);
        // Considerar um mecanismo de fallback ou notificação de erro mais robusto
    }
};

/**
 * Hook para ouvir o histórico de alterações de uma tarefa.
 * @param {string} basePath Caminho base no Firestore.
 * @param {string|null} tarefaId ID da tarefa para buscar o histórico. Null para não buscar.
 * @returns {{ historico: Array, loadingHistorico: boolean, errorHistorico: Error|null }}
 */
export const useHistoricoTarefa = (basePath, tarefaId) => {
    const [historico, setHistorico] = useState([]);
    const [loadingHistorico, setLoadingHistorico] = useState(false);
    const [errorHistorico, setErrorHistorico] = useState(null);

    useEffect(() => {
        if (!tarefaId || !db || !basePath) {
            setHistorico([]);
            setLoadingHistorico(false);
            return; // Não busca se não houver ID, db ou basePath
        }

        setLoadingHistorico(true);
        setErrorHistorico(null);
        const historicoCollectionRef = collection(db, `${basePath}/tarefas_mapa/${tarefaId}/historico_alteracoes`);
        const q = query(historicoCollectionRef, orderBy("timestamp", "desc")); // Ordena do mais recente para o mais antigo

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedHistorico = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setHistorico(fetchedHistorico);
            setLoadingHistorico(false);
        }, (error) => {
            console.error(`LogService: Erro ao carregar histórico da tarefa ${tarefaId}:`, error);
            setErrorHistorico(error);
            setHistorico([]);
            setLoadingHistorico(false);
        });

        // Limpa o listener ao desmontar ou se tarefaId/basePath mudar
        return () => unsubscribe();

    }, [basePath, tarefaId]); // Dependências do efeito

    return { historico, loadingHistorico, errorHistorico };
};

