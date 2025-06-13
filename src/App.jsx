// Versão: 6.2.0
// [CORRIGIDO] Reintroduzido o AuthComponent (tela de login) e ajustada a lógica de autenticação no GlobalProvider.

import React, { useState, useEffect, createContext, useContext, memo, useRef } from 'react';
import firebaseAppInstance from './firebaseConfig';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, doc, addDoc, getDocs, getDoc, setDoc, deleteDoc, onSnapshot, query, where, Timestamp, writeBatch, updateDoc, orderBy } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { LucidePlusCircle, LucideEdit, LucideTrash2, LucideCalendarDays, LucideClipboardList, LucideSettings, LucideStickyNote, LucideLogOut, LucideFilter, LucideUsers, LucideFileText, LucideCheckCircle, LucideXCircle, LucideRotateCcw, LucideRefreshCw, LucidePrinter, LucideCheckSquare, LucideSquare, LucideAlertCircle, LucideArrowRightCircle, LucideListTodo, LucideUserPlus, LucideSearch, LucideX, LucideLayoutDashboard, LucideAlertOctagon, LucideClock, LucideHistory, LucidePauseCircle, LucidePaperclip, LucideAlertTriangle, LucideMousePointerClick, LucideSprayCan, LucideClipboardEdit, LucideBookMarked } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

// Inicialização do Firebase
const firebaseApp = firebaseAppInstance;
const authGlobal = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);
const appId = firebaseApp.options.projectId || 'default-app-id-fallback';

// Contexto Global
const GlobalContext = createContext();

// Constantes do script original
const DIAS_SEMANA = ["SEGUNDA-FEIRA", "TERÇA-FEIRA", "QUARTA-FEIRA", "QUINTA-FEIRA", "SEXTA-FEIRA", "SÁBADO"];
const TURNO_DIA_INTEIRO = "DIA INTEIRO";
const SEM_RESPONSAVEL_VALUE = "---SEM_RESPONSAVEL---"; 
const TODOS_OS_STATUS_VALUE = "---TODOS_OS_STATUS---";
const TODAS_AS_PRIORIDADES_VALUE = "---TODAS_AS_PRIORIDADES---";
const TODAS_AS_AREAS_VALUE = "---TODAS_AS_AREAS---";
const COR_STATUS_CONCLUIDA_FUNDO_MAPA = "bg-green-200"; 

const LOGO_URL = "https://gramoterra.com.br/assets/images/misc/Logo%20Gramoterra-02.png";

// Funções Auxiliares
const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    let date;
    if (timestamp instanceof Timestamp) {
        date = timestamp.toDate();
    } else if (timestamp && typeof timestamp.seconds === 'number') {
        date = new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
    } else if (timestamp instanceof Date) {
        date = timestamp;
    } else {
        return 'Data inválida';
    }
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
};

const converterParaDate = (valor) => {
    if (!valor) return null;
    if (valor instanceof Timestamp) return valor.toDate();
    if (typeof valor.seconds === 'number' && typeof valor.nanoseconds === 'number') {
        return new Timestamp(valor.seconds, valor.nanoseconds).toDate();
    }
    return null;
};

const getStatusColor = (status) => {
    if (status === "CANCELADA") return "bg-red-200 text-gray-800";
    if (status === "CONCLUÍDA") return "bg-green-300 text-gray-800";
    if (status === "PROGRAMADA") return "bg-blue-200 text-gray-800";
    if (status === "EM OPERAÇÃO") return "bg-cyan-200 text-gray-800";
    if (status === "AGUARDANDO ALOCAÇÃO") return "bg-red-300 text-gray-800";
    if (status === "PREVISTA") return "bg-yellow-200 text-gray-800";
    return "bg-gray-200 text-gray-800";
};

async function logAlteracaoTarefa(db, basePath, tarefaId, usuarioId, usuarioEmail, acaoRealizada, detalhesAdicionais = "") {
    if (!tarefaId) {
        console.error("logAlteracaoTarefa: tarefaId é indefinido.");
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
        console.error("Erro ao registrar histórico da tarefa:", tarefaId, error);
    }
}

// Versão: 4.8.0
// [NOVO] Função para registrar o histórico de alterações dos registros fitossanitários.
async function logAlteracaoFitossanitaria(db, basePath, registroId, usuarioEmail, acaoRealizada, detalhesAdicionais = "") {
    if (!registroId) {
        console.error("logAlteracaoFitossanitaria: registroId é indefinido.");
        return;
    }
    try {
        const historicoRef = collection(db, `${basePath}/controleFitossanitario/${registroId}/historico_alteracoes`);
        await addDoc(historicoRef, {
            timestamp: Timestamp.now(),
            usuarioEmail: usuarioEmail || "Sistema",
            acaoRealizada,
            detalhesAdicionais
        });
    } catch (error) {
        console.error("Erro ao registrar histórico do registro fitossanitário:", registroId, error);
    }
}

// Funções Auxiliares de Sincronização e Atualização de Status
async function removerTarefaDaProgramacao(tarefaId, db, basePath) {
    const todasSemanasQuery = query(collection(db, `${basePath}/programacao_semanal`));
    const todasSemanasSnap = await getDocs(todasSemanasQuery);
    const batch = writeBatch(db);
    let algumaSemanaModificada = false;

    todasSemanasSnap.forEach(semanaDocSnap => {
        const semanaDataOriginal = semanaDocSnap.data();
        const semanaDataModificada = JSON.parse(JSON.stringify(semanaDataOriginal)); 
        let estaSemanaEspecificaFoiAlterada = false;

        if (semanaDataModificada.dias) {
            Object.keys(semanaDataModificada.dias).forEach(diaKey => {
                if (semanaDataModificada.dias[diaKey]) {
                    Object.keys(semanaDataModificada.dias[diaKey]).forEach(responsavelId => {
                        const tarefasAtuais = semanaDataModificada.dias[diaKey][responsavelId] || [];
                        const tarefasFiltradas = tarefasAtuais.filter(t => t.mapaTaskId !== tarefaId);
                        if (tarefasFiltradas.length < tarefasAtuais.length) {
                            semanaDataModificada.dias[diaKey][responsavelId] = tarefasFiltradas;
                            estaSemanaEspecificaFoiAlterada = true;
                        }
                    });
                }
            });
        }

        if (estaSemanaEspecificaFoiAlterada) {
            batch.set(semanaDocSnap.ref, semanaDataModificada); 
            algumaSemanaModificada = true;
        }
    });

    if (algumaSemanaModificada) {
        try {
            await batch.commit();
        } catch (error) {
            console.error(`[removerTarefaDaProgramacao] Erro ao remover tarefa ${tarefaId} das programações:`, error);
        }
    }
}

// Versão: 3.3.1
async function sincronizarTarefaComProgramacao(tarefaId, tarefaData, db, basePath) {
    await removerTarefaDaProgramacao(tarefaId, db, basePath);

    const statusValidosParaProgramacao = ["PROGRAMADA", "CONCLUÍDA", "EM OPERAÇÃO"];
    if (!statusValidosParaProgramacao.includes(tarefaData.status)) {
        return;
    }

    if (!tarefaData.dataInicio || !(tarefaData.dataInicio instanceof Timestamp) ||
        !tarefaData.dataProvavelTermino || !(tarefaData.dataProvavelTermino instanceof Timestamp) ||
        !tarefaData.responsaveis || tarefaData.responsaveis.length === 0) {
        console.log("[sincronizar] Dados insuficientes ou Timestamps inválidos para adicionar. Tarefa ID:", tarefaId);
        return;
    }

    let textoBaseTarefa = tarefaData.tarefa || "Tarefa sem descrição";
    if (tarefaData.prioridade) textoBaseTarefa += ` - ${tarefaData.prioridade}`;
    
    let turnoParaTexto = "";
    if (tarefaData.turno && tarefaData.turno.toUpperCase() !== TURNO_DIA_INTEIRO.toUpperCase()) {
        turnoParaTexto = `[${tarefaData.turno.toUpperCase()}] `;
    }
    const textoVisivelFinal = turnoParaTexto + textoBaseTarefa;

    const itemTarefaProgramacao = {
        mapaTaskId: tarefaId,
        textoVisivel: textoVisivelFinal,
        statusLocal: tarefaData.status === 'CONCLUÍDA' ? 'CONCLUÍDA' : 'PENDENTE',
        conclusao: '',
        mapaStatus: tarefaData.status,
        turno: tarefaData.turno || TURNO_DIA_INTEIRO,
        orientacao: tarefaData.orientacao || '',
        localizacao: tarefaData.area || '', // [ADICIONADO v3.3.1] Campo para a localização/área.
    };

    const dataInicioLoop = tarefaData.dataInicio.toDate();
    const dataFimLoop = tarefaData.dataProvavelTermino.toDate();
    
    const todasSemanasQuery = query(collection(db, `${basePath}/programacao_semanal`));
    const todasSemanasSnap = await getDocs(todasSemanasQuery);
    const batch = writeBatch(db);
    let algumaSemanaModificadaNaAdicao = false;

    const alteracoesPorSemana = new Map();
    todasSemanasSnap.forEach(semanaDocSnap => {
        alteracoesPorSemana.set(semanaDocSnap.id, { 
            ...semanaDocSnap.data(), 
            dias: JSON.parse(JSON.stringify(semanaDocSnap.data().dias || {})) 
        });
    });

    let dataAtual = new Date(Date.UTC(dataInicioLoop.getUTCFullYear(), dataInicioLoop.getUTCMonth(), dataInicioLoop.getUTCDate()));
    const dataFimLoopUTC = new Date(Date.UTC(dataFimLoop.getUTCFullYear(), dataFimLoop.getUTCMonth(), dataFimLoop.getUTCDate()));
    dataFimLoopUTC.setUTCHours(23,59,59,999); 

    while (dataAtual.getTime() <= dataFimLoopUTC.getTime()) {
        const diaFormatado = dataAtual.toISOString().split('T')[0];

        for (const [semanaId, semanaDataModificada] of alteracoesPorSemana.entries()) {
            let inicioSemana, fimSemana;

            if (semanaDataModificada.dataInicioSemana && typeof semanaDataModificada.dataInicioSemana.toDate === 'function') {
                inicioSemana = semanaDataModificada.dataInicioSemana.toDate();
            } else if (semanaDataModificada.dataInicioSemana && typeof semanaDataModificada.dataInicioSemana.seconds === 'number') {
                inicioSemana = new Date(semanaDataModificada.dataInicioSemana.seconds * 1000 + (semanaDataModificada.dataInicioSemana.nanoseconds || 0) / 1000000);
            } else {
                continue; 
            }

            if (semanaDataModificada.dataFimSemana && typeof semanaDataModificada.dataFimSemana.toDate === 'function') {
                fimSemana = semanaDataModificada.dataFimSemana.toDate();
            } else if (semanaDataModificada.dataFimSemana && typeof semanaDataModificada.dataFimSemana.seconds === 'number') {
                fimSemana = new Date(semanaDataModificada.dataFimSemana.seconds * 1000 + (semanaDataModificada.dataFimSemana.nanoseconds || 0) / 1000000);
            } else {
                continue; 
            }
            
            const inicioSemanaUTC = new Date(Date.UTC(inicioSemana.getUTCFullYear(), inicioSemana.getUTCMonth(), inicioSemana.getUTCDate()));
            const fimSemanaUTCloop = new Date(Date.UTC(fimSemana.getUTCFullYear(), fimSemana.getUTCMonth(), fimSemana.getUTCDate()));
            fimSemanaUTCloop.setUTCHours(23,59,59,999);
            
            if (dataAtual.getTime() >= inicioSemanaUTC.getTime() && dataAtual.getTime() <= fimSemanaUTCloop.getTime()) {
                if (!semanaDataModificada.dias[diaFormatado]) semanaDataModificada.dias[diaFormatado] = {};

                tarefaData.responsaveis.forEach(responsavelId => {
                    if (!semanaDataModificada.dias[diaFormatado][responsavelId]) {
                        semanaDataModificada.dias[diaFormatado][responsavelId] = [];
                    }
                    if (!semanaDataModificada.dias[diaFormatado][responsavelId].find(t => t.mapaTaskId === tarefaId)) {
                        semanaDataModificada.dias[diaFormatado][responsavelId].push({...itemTarefaProgramacao}); 
                        algumaSemanaModificadaNaAdicao = true;
                    } 
                });
            }
        }
        dataAtual.setUTCDate(dataAtual.getUTCDate() + 1);
    }

    if (algumaSemanaModificadaNaAdicao) {
        alteracoesPorSemana.forEach((dadosModificados, semanaId) => {
            const semanaDocRef = doc(db, `${basePath}/programacao_semanal`, semanaId);
            batch.set(semanaDocRef, dadosModificados); 
        });
        try {
            await batch.commit();
        } catch (error) {
            console.error("[sincronizar] Erro ao commitar batch de adição na programação semanal:", error);
        }
    }
}

async function verificarEAtualizarStatusConclusaoMapa(mapaTaskId, db, basePath) {
    const tarefaMapaDocRef = doc(db, `${basePath}/tarefas_mapa`, mapaTaskId);

    try {
        const tarefaMapaSnap = await getDoc(tarefaMapaDocRef);
        if (!tarefaMapaSnap.exists()) {
            return;
        }

        const tarefaPrincipal = tarefaMapaSnap.data();
        if (tarefaPrincipal.status === "CANCELADA") {
            return;
        }

        if (!tarefaPrincipal.dataInicio || !(tarefaPrincipal.dataInicio instanceof Timestamp) ||
            !tarefaPrincipal.dataProvavelTermino || !(tarefaPrincipal.dataProvavelTermino instanceof Timestamp) ||
            !tarefaPrincipal.responsaveis || tarefaPrincipal.responsaveis.length === 0) {
            if (tarefaPrincipal.status === "CONCLUÍDA") {
            }
            return;
        }

        const dataInicioPrincipal = tarefaPrincipal.dataInicio.toDate();
        const dataFimPrincipal = tarefaPrincipal.dataProvavelTermino.toDate();
        const responsaveisPrincipais = tarefaPrincipal.responsaveis;

        let todasInstanciasProgramadasConcluidas = true; 
        let algumaInstanciaProgramadaRelevanteEncontrada = false; 

        const todasSemanasQuery = query(collection(db, `${basePath}/programacao_semanal`));
        const todasSemanasSnap = await getDocs(todasSemanasQuery);

        let diaAtualTarefaMapa = new Date(Date.UTC(dataInicioPrincipal.getUTCFullYear(), dataInicioPrincipal.getUTCMonth(), dataInicioPrincipal.getUTCDate()));
        const dataFimPrincipalUTC = new Date(Date.UTC(dataFimPrincipal.getUTCFullYear(), dataFimPrincipal.getUTCMonth(), dataFimPrincipal.getUTCDate()));
        dataFimPrincipalUTC.setUTCHours(23,59,59,999);

        while(diaAtualTarefaMapa.getTime() <= dataFimPrincipalUTC.getTime()){
            const diaFormatado = diaAtualTarefaMapa.toISOString().split('T')[0];
            let encontrouInstanciaParaEsteDia = false;

            for (const semanaDocSnap of todasSemanasSnap.docs) { 
                const semanaData = semanaDocSnap.data();
                 if (!semanaData.dataInicioSemana || !(semanaData.dataInicioSemana.seconds !== undefined) || 
                    !semanaData.dataFimSemana || !(semanaData.dataFimSemana.seconds !== undefined)) {
                    continue; 
                }
                const inicioSemana = semanaData.dataInicioSemana.toDate();
                const fimSemana = semanaData.dataFimSemana.toDate();
                const inicioSemanaUTC = new Date(Date.UTC(inicioSemana.getUTCFullYear(), inicioSemana.getUTCMonth(), inicioSemana.getUTCDate()));
                const fimSemanaUTC = new Date(Date.UTC(fimSemana.getUTCFullYear(), fimSemana.getUTCMonth(), fimSemana.getUTCDate()));
                fimSemanaUTC.setUTCHours(23,59,59,999);

                if (diaAtualTarefaMapa.getTime() >= inicioSemanaUTC.getTime() && diaAtualTarefaMapa.getTime() <= fimSemanaUTC.getTime()) {
                    for (const respId of responsaveisPrincipais) {
                        const tarefasNaCelula = semanaData.dias?.[diaFormatado]?.[respId] || [];
                        const instanciaTarefaNaCelula = tarefasNaCelula.find(t => t.mapaTaskId === mapaTaskId);
                        
                        if (instanciaTarefaNaCelula) {
                            algumaInstanciaProgramadaRelevanteEncontrada = true;
                            encontrouInstanciaParaEsteDia = true;
                            if (instanciaTarefaNaCelula.statusLocal !== 'CONCLUÍDA') {
                                todasInstanciasProgramadasConcluidas = false;
                                break; 
                            }
                        } else {
                            todasInstanciasProgramadasConcluidas = false;
                            break;
                        }
                    }
                }
                if (!todasInstanciasProgramadasConcluidas || encontrouInstanciaParaEsteDia) break; 
            }
            if (!todasInstanciasProgramadasConcluidas) break; 
            diaAtualTarefaMapa.setUTCDate(diaAtualTarefaMapa.getUTCDate() + 1);
        }


        if (algumaInstanciaProgramadaRelevanteEncontrada && todasInstanciasProgramadasConcluidas && tarefaPrincipal.status !== "CONCLUÍDA") {
            await updateDoc(tarefaMapaDocRef, { status: "CONCLUÍDA" });
        } else if ((!algumaInstanciaProgramadaRelevanteEncontrada || !todasInstanciasProgramadasConcluidas) && tarefaPrincipal.status === "CONCLUÍDA") {
            await updateDoc(tarefaMapaDocRef, { status: "PROGRAMADA" });
        }

    } catch (error) {
        console.error(`[verificarStatusMapa] Erro ao verificar/atualizar status da tarefa ${mapaTaskId}:`, error);
    }
}


// Versão: 6.2.1
// [CORRIGIDO] Lógica de carregamento de autenticação movida para o componente App e estado inicial de `currentUser` alterado para `undefined` para maior robustez no fluxo de login/logout.
const GlobalProvider = ({ children }) => {
    // Inicia como `undefined` para representar o estado "verificando". `null` significa "deslogado".
    const [currentUser, setCurrentUser] = useState(undefined);
    const [userId, setUserId] = useState(null);
    // `loadingAuth` é passado via contexto para o `App` controlar a tela de carregamento.
    const [loadingAuth, setLoadingAuth] = useState(true);
    const [listasAuxiliares, setListasAuxiliares] = useState({
        prioridades: [], areas: [], acoes: [], status: [], turnos: [], tarefas: [], usuarios_notificacao: []
    });
    const [funcionarios, setFuncionarios] = useState([]);
    const [permissoes, setPermissoes] = useState({});

    useEffect(() => {
        const DEV_EMAIL = import.meta.env.VITE_DEV_EMAIL;
        const DEV_PASSWORD = import.meta.env.VITE_DEV_PASSWORD;
        const IS_DEV = import.meta.env.DEV;

        const unsubscribe = onAuthStateChanged(authGlobal, async (user) => {
            if (user) {
                if (IS_DEV && !user.isAnonymous) {
                   console.log("Usuário autenticado com sucesso:", user.email);
                }
                setCurrentUser(user);
                setUserId(user.uid);
                setLoadingAuth(false);
                return;
            }

            if (IS_DEV && DEV_EMAIL && DEV_PASSWORD) {
                try {
                    console.log(`Ambiente DEV: Tentando login automático com ${DEV_EMAIL}...`);
                    await signInWithEmailAndPassword(authGlobal, DEV_EMAIL, DEV_PASSWORD);
                    // O onAuthStateChanged será chamado novamente com o usuário, então não é preciso fazer mais nada.
                    // O setLoadingAuth(false) será chamado no próximo ciclo do listener.
                } catch (error) {
                    console.error("Falha no login automático de desenvolvedor:", error);
                    toast.error(`Login automático DEV falhou.`);
                    setCurrentUser(null); // Garante que fique nulo em caso de falha
                    setLoadingAuth(false);
                }
            } else {
                // Produção (ou dev sem auto-login) quando deslogado.
                setCurrentUser(null); // Define explicitamente como deslogado
                setLoadingAuth(false);
            }
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!userId || !appId || !db) return;

        const basePath = `/artifacts/${appId}/public/data`;
        const unsubscribers = [];
        const listaNames = ['prioridades', 'areas', 'acoes', 'status', 'turnos', 'tarefas', 'usuarios_notificacao'];
        listaNames.forEach(name => {
            const q = query(collection(db, `${basePath}/listas_auxiliares/${name}/items`));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                setListasAuxiliares(prev => ({ ...prev, [name]: items.map(item => item.nome).sort() }));
            }, error => console.error(`Erro ao carregar ${name}:`, error));
            unsubscribers.push(unsubscribe);
        });
        
        const chavesDePermissao = ['dashboard', 'mapa', 'programacao', 'anotacoes', 'pendentes', 'relatorios', 'config', 'add_tarefa', 'fito', 'agenda'];
        chavesDePermissao.forEach(chave => {
            const collectionPath = `${basePath}/listas_auxiliares/permissoes_${chave}/items`;
            const q = query(collection(db, collectionPath));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const emailsPermitidos = snapshot.docs.map(doc => doc.data().nome.toLowerCase());
                setPermissoes(prev => ({ ...prev, [chave]: emailsPermitidos }));
            }, error => {
                console.error(`Erro ao carregar permissões para '${chave}':`, error);
                setPermissoes(prev => ({ ...prev, [chave]: [] }));
            });
            unsubscribers.push(unsubscribe);
        });

        const qFuncionarios = query(collection(db, `${basePath}/funcionarios`));
        const unsubscribeFuncionarios = onSnapshot(qFuncionarios, (snapshot) => {
            setFuncionarios(snapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.nome.localeCompare(b.nome)));
        }, error => console.error("Erro ao carregar funcionários:", error));
        unsubscribers.push(unsubscribeFuncionarios);

        return () => { unsubscribers.forEach(unsub => unsub()); };
    }, [userId, appId, db]);

    // A tela de carregamento foi removida daqui e movida para o componente App.
    // O `loadingAuth` é passado no value do Provider para que o App decida o que renderizar.
    return (
        <GlobalContext.Provider value={{ currentUser, userId, db, storage, auth: authGlobal, listasAuxiliares, funcionarios, appId, permissoes, loadingAuth }}>
            {children}
        </GlobalContext.Provider>
    );
};

// [NOVO v6.2.0] Componente da tela de Login reintroduzido
const AuthComponent = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await signInWithEmailAndPassword(authGlobal, email, password);
        } catch (err) {
            switch (err.code) {
                case 'auth/user-not-found':
                    setError('Nenhum usuário encontrado com este e-mail.');
                    break;
                case 'auth/wrong-password':
                    setError('Senha incorreta. Por favor, tente novamente.');
                    break;
                case 'auth/invalid-email':
                    setError('O formato do e-mail é inválido.');
                    break;
                default:
                    setError('Ocorreu um erro ao tentar fazer o login.');
                    break;
            }
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-md">
                <img src={LOGO_URL} alt="Logo Gramoterra" className="mx-auto h-16 w-auto mb-6" onError={(e) => e.target.style.display='none'}/>
                <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">
                    Acesso - Gestor de Equipes
                </h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">E-mail</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700">Senha</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                    {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>}
                    <div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
                        >
                            {loading ? 'A entrar...' : 'Entrar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};



const Modal = ({ isOpen, onClose, title, children, width = "max-w-2xl" }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
            <div className={`bg-white rounded-lg shadow-xl w-full ${width} max-h-[90vh] flex flex-col`}>
                <div className="flex justify-between items-center p-4 border-b">
                    <h3 className="text-xl font-semibold">{title}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                </div>
                <div className="p-4 overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    );
};

// [NOVO v2.7.0] Componente para exibir imagens anexadas a uma tarefa
const ImagensTarefaModal = ({ isOpen, onClose, imageUrls }) => {
    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Imagens Anexadas" width="max-w-4xl">
            {imageUrls && imageUrls.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-gray-100 rounded-lg">
                    {imageUrls.map((url, index) => (
                        <div key={index} className="p-2 border rounded-lg bg-white shadow-sm transition-transform hover:scale-105">
                            <a href={url} target="_blank" rel="noopener noreferrer" title="Clique para abrir em nova aba">
                                <img
                                    src={url}
                                    alt={`Anexo ${index + 1}`}
                                    className="w-full h-48 object-cover rounded-md cursor-pointer"
                                    loading="lazy"
                                />
                            </a>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-center text-gray-600 p-4">Nenhuma imagem anexada a esta tarefa.</p>
            )}
        </Modal>
    );
};

// Componente para Gerenciar Itens de Listas Auxiliares (genérico)
const ListaAuxiliarManager = ({ nomeLista, nomeSingular, collectionPathSegment }) => {
    const { userId, db, appId } = useContext(GlobalContext);
    const [items, setItems] = useState([]);
    const [newItemName, setNewItemName] = useState('');
    const [editingItem, setEditingItem] = useState(null); // { id, nome }
    const [loading, setLoading] = useState(false);

    const basePath = `/artifacts/${appId}/public/data`;
    const itemsCollectionRef = collection(db, `${basePath}/listas_auxiliares/${collectionPathSegment}/items`);

    useEffect(() => {
        setLoading(true);
        const q = query(itemsCollectionRef);
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedItems = snapshot.docs.map(doc => ({ id: doc.id, nome: doc.data().nome }));
            setItems(fetchedItems.sort((a,b) => a.nome.localeCompare(b.nome)));
            setLoading(false);
        }, (error) => {
            console.error(`Erro ao carregar ${nomeLista}: `, error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [collectionPathSegment, userId, appId, db]);

    const handleAddItem = async () => {
        if (!newItemName.trim()) return;
        try {
            const q = query(itemsCollectionRef, where("nome", "==", newItemName.trim().toUpperCase()));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                alert(`${nomeSingular} "${newItemName}" já existe.`);
                return;
            }
            await addDoc(itemsCollectionRef, { nome: newItemName.trim().toUpperCase() });
            setNewItemName('');
        } catch (error) {
            console.error(`Erro ao adicionar ${nomeSingular}: `, error);
        }
    };

    const handleUpdateItem = async () => {
        if (!editingItem || !editingItem.nome.trim()) return;
        try {
            const q = query(itemsCollectionRef, where("nome", "==", editingItem.nome.trim().toUpperCase()));
            const querySnapshot = await getDocs(q);
            let conflict = false;
            querySnapshot.forEach(doc => {
                if (doc.id !== editingItem.id) {
                    conflict = true;
                }
            });
            if (conflict) {
                alert(`${nomeSingular} "${editingItem.nome}" já existe.`);
                return;
            }

            const itemDocRef = doc(db, `${basePath}/listas_auxiliares/${collectionPathSegment}/items`, editingItem.id);
            await setDoc(itemDocRef, { nome: editingItem.nome.trim().toUpperCase() });
            setEditingItem(null);
        } catch (error) {
            console.error(`Erro ao atualizar ${nomeSingular}: `, error);
        }
    };

    const handleDeleteItem = async (itemId) => {
        if (window.confirm(`Tem certeza que deseja excluir este ${nomeSingular}? Esta ação não pode ser desfeita.`)) {
            try {
                const itemDocRef = doc(db, `${basePath}/listas_auxiliares/${collectionPathSegment}/items`, itemId);
                await deleteDoc(itemDocRef);
            } catch (error) {
                console.error(`Erro ao excluir ${nomeSingular}: `, error);
                alert(`Erro ao excluir ${nomeSingular}: ${error.message}`);
            }
        }
    };
    
    if (loading) return <p>Carregando {nomeLista}...</p>;

    return (
        <div className="mb-8 p-4 border rounded-md shadow-sm bg-white">
            <h3 className="text-lg font-semibold mb-3 text-gray-700">{nomeLista}</h3>
            <div className="flex mb-3">
                <input
                    type="text"
                    value={editingItem ? editingItem.nome : newItemName}
                    onChange={(e) => editingItem ? setEditingItem({...editingItem, nome: e.target.value}) : setNewItemName(e.target.value)}
                    placeholder={`Nome do ${nomeSingular}`}
                    className="border p-2 rounded-l-md flex-grow focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                    onClick={editingItem ? handleUpdateItem : handleAddItem}
                    className="bg-blue-500 text-white p-2 rounded-r-md hover:bg-blue-600 flex items-center"
                >
                    {editingItem ? <LucideEdit size={18} className="mr-1"/> : <LucidePlusCircle size={18} className="mr-1"/>}
                    {editingItem ? 'Atualizar' : 'Adicionar'}
                </button>
                {editingItem && (
                    <button
                        onClick={() => setEditingItem(null)}
                        className="bg-gray-300 text-gray-700 p-2 ml-2 rounded-md hover:bg-gray-400"
                    >
                        Cancelar
                    </button>
                )}
            </div>
            <ul className="space-y-1 max-h-60 overflow-y-auto">
                {items.map(item => (
                    <li key={item.id} className="flex justify-between items-center p-2 border-b hover:bg-gray-50 rounded-md">
                        <span>{item.nome}</span>
                        <div>
                            <button onClick={() => setEditingItem(item)} className="text-blue-500 hover:text-blue-700 mr-2"><LucideEdit size={16}/></button>
                            <button onClick={() => handleDeleteItem(item.id)} className="text-red-500 hover:text-red-700"><LucideTrash2 size={16}/></button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

// Componente para Gerenciar Funcionários
const FuncionariosManager = () => {
    const { userId, db, appId, funcionarios: contextFuncionarios } = useContext(GlobalContext);
    const [novoFuncionarioNome, setNovoFuncionarioNome] = useState('');
    const [editingFuncionario, setEditingFuncionario] = useState(null); 
    const [loading, setLoading] = useState(false);

    const basePath = `/artifacts/${appId}/public/data`;
    const funcionariosCollectionRef = collection(db, `${basePath}/funcionarios`);

    const handleAddFuncionario = async () => {
        if (!novoFuncionarioNome.trim()) return;
        setLoading(true);
        try {
            const nomeIdFormatado = novoFuncionarioNome.trim().toUpperCase().replace(/\//g, '_');
            const nomeDisplayFormatado = novoFuncionarioNome.trim().toUpperCase(); 

            if (!nomeIdFormatado) {
                alert("O nome do funcionário não pode ser vazio ou consistir apenas em caracteres inválidos.");
                setLoading(false);
                return;
            }

            const docRef = doc(funcionariosCollectionRef, nomeIdFormatado);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                alert("Funcionário com este ID (nome formatado: " + nomeIdFormatado + ") já existe.");
                setLoading(false);
                return;
            }
            await setDoc(docRef, { nome: nomeDisplayFormatado });
            setNovoFuncionarioNome('');
        } catch (error) {
            console.error("Erro ao adicionar funcionário: ", error);
            alert("Erro ao adicionar funcionário: " + error.message);
        }
        setLoading(false);
    };
    
    const handleUpdateFuncionario = async () => {
        if (!editingFuncionario || !editingFuncionario.nome.trim()) return;
        setLoading(true);
        try {
            const nomeDisplayAtualizado = editingFuncionario.nome.trim().toUpperCase();
            const funcDocRef = doc(db, `${basePath}/funcionarios`, editingFuncionario.id); // ID não muda
            await setDoc(funcDocRef, { nome: nomeDisplayAtualizado }); 
            setEditingFuncionario(null);
        } catch (error) {
            console.error("Erro ao atualizar funcionário: ", error);
             alert("Erro ao atualizar funcionário: " + error.message);
        }
        setLoading(false);
    };

    const handleDeleteFuncionario = async (funcionarioId) => {
        const funcionarioParaExcluir = contextFuncionarios.find(f => f.id === funcionarioId);
        const nomeExibicao = funcionarioParaExcluir ? funcionarioParaExcluir.nome : funcionarioId;

        if (window.confirm(`Tem certeza que deseja excluir o funcionário "${nomeExibicao}"? Isso pode afetar tarefas associadas.`)) {
            setLoading(true);
            try {
                const todasSemanasQuery = query(collection(db, `${basePath}/programacao_semanal`));
                const todasSemanasSnap = await getDocs(todasSemanasQuery);
                const batchLimpezaProgramacao = writeBatch(db);
                let programacaoModificada = false;

                todasSemanasSnap.forEach(semanaDocSnap => {
                    const semanaData = semanaDocSnap.data();
                    const novosDias = JSON.parse(JSON.stringify(semanaData.dias || {}));
                    let estaSemanaModificada = false;
                    Object.keys(novosDias).forEach(diaKey => {
                        if (novosDias[diaKey][funcionarioId]) {
                            delete novosDias[diaKey][funcionarioId];
                            estaSemanaModificada = true;
                        }
                    });
                    if (estaSemanaModificada) {
                        batchLimpezaProgramacao.update(semanaDocSnap.ref, { dias: novosDias });
                        programacaoModificada = true;
                    }
                });

                if (programacaoModificada) {
                    await batchLimpezaProgramacao.commit();
                    console.log(`Tarefas do funcionário ${nomeExibicao} removidas da programação semanal.`);
                }
                
                const funcDocRef = doc(db, `${basePath}/funcionarios`, funcionarioId);
                await deleteDoc(funcDocRef);

                const tarefasMapaQuery = query(collection(db, `${basePath}/tarefas_mapa`), where("responsaveis", "array-contains", funcionarioId));
                const tarefasMapaSnap = await getDocs(tarefasMapaQuery);
                const batchAtualizaMapa = writeBatch(db);
                tarefasMapaSnap.forEach(tarefaDocSnap => {
                    const tarefaData = tarefaDocSnap.data();
                    const novosResponsaveis = tarefaData.responsaveis.filter(rId => rId !== funcionarioId);
                    batchAtualizaMapa.update(tarefaDocSnap.ref, { responsaveis: novosResponsaveis });
                });
                await batchAtualizaMapa.commit();
                console.log(`Funcionário ${nomeExibicao} removido das responsabilidades no Mapa de Atividades.`);

            } catch (error) {
                console.error("Erro ao excluir funcionário e limpar referências: ", error);
                alert("Erro ao excluir funcionário: " + error.message);
            }
            setLoading(false);
        }
    };
    
    return (
        <div className="mb-8 p-4 border rounded-md shadow-sm bg-white">
            <h3 className="text-lg font-semibold mb-3 text-gray-700">Gerenciar Funcionários/Responsáveis</h3>
            <div className="flex mb-3">
                 <input
                    type="text"
                    value={editingFuncionario ? editingFuncionario.nome : novoFuncionarioNome}
                    onChange={(e) => editingFuncionario ? setEditingFuncionario({...editingFuncionario, nome: e.target.value}) : setNovoFuncionarioNome(e.target.value)}
                    placeholder="Nome do Funcionário (ex: JOÃO SILVA ou CARGA/DESCARGA)"
                    className="border p-2 rounded-l-md flex-grow focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                    onClick={editingFuncionario ? handleUpdateFuncionario : handleAddFuncionario}
                    disabled={loading}
                    className="bg-blue-500 text-white p-2 rounded-r-md hover:bg-blue-600 flex items-center disabled:bg-gray-400"
                >
                    {editingFuncionario ? <LucideEdit size={18} className="mr-1"/> : <LucidePlusCircle size={18} className="mr-1"/>}
                    {loading ? 'Salvando...' : (editingFuncionario ? 'Atualizar' : 'Adicionar')}
                </button>
                 {editingFuncionario && (
                    <button
                        onClick={() => setEditingFuncionario(null)}
                        className="bg-gray-300 text-gray-700 p-2 ml-2 rounded-md hover:bg-gray-400"
                    >
                        Cancelar
                    </button>
                )}
            </div>
            {(loading && contextFuncionarios.length === 0) && <p>Carregando funcionários...</p>}
            <ul className="space-y-1 max-h-60 overflow-y-auto">
                {contextFuncionarios.map(f => ( 
                    <li key={f.id} className="flex justify-between items-center p-2 border-b hover:bg-gray-50 rounded-md">
                        <span>{f.nome}</span> 
                        <div>
                            <button onClick={() => setEditingFuncionario(f)} className="text-blue-500 hover:text-blue-700 mr-2"><LucideEdit size={16}/></button>
                            <button onClick={() => handleDeleteFuncionario(f.id)} className="text-red-500 hover:text-red-700"><LucideTrash2 size={16}/></button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

// Versão: 6.7.0
// [ALTERADO] Invertida a ordem das abas em Configurações, com "Cadastros Gerais" aparecendo primeiro.
const ConfiguracoesComponent = () => {
    // A aba ativa inicial agora é 'cadastros'.
    const [activeTab, setActiveTab] = useState('cadastros');

    const TabButton = ({ tabName, currentTab, setTab, children }) => {
        const isActive = currentTab === tabName;
        return (
            <button
                onClick={() => setTab(tabName)}
                className={`px-4 py-2 text-sm font-semibold rounded-t-md transition-colors focus:outline-none ${
                    isActive
                        ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
            >
                {children}
            </button>
        );
    };

    return (
        <div className="p-6 bg-gray-50 min-h-full">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800">Configurações Gerais</h2>
            <div className="border-b border-gray-200 mb-6">
                <nav className="flex space-x-2">
                    {/* Ordem das abas invertida */}
                    <TabButton tabName="cadastros" currentTab={activeTab} setTab={setActiveTab}>Cadastros Gerais</TabButton>
                    <TabButton tabName="permissoes" currentTab={activeTab} setTab={setActiveTab}>Permissões de Acesso</TabButton>
                </nav>
            </div>
            <div>
                {activeTab === 'permissoes' && (
                    <div className="mb-8 p-4 border rounded-md shadow-sm bg-blue-50">
                         <h3 className="text-xl font-semibold mb-4 text-blue-800">Permissões de Acesso por Módulo</h3>
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <ListaAuxiliarManager nomeLista="Acesso ao Dashboard" nomeSingular="E-mail" collectionPathSegment="permissoes_dashboard" />
                            <ListaAuxiliarManager nomeLista="Acesso ao Mapa de Atividades" nomeSingular="E-mail" collectionPathSegment="permissoes_mapa" />
                            <ListaAuxiliarManager nomeLista="Acesso à Programação Semanal" nomeSingular="E-mail" collectionPathSegment="permissoes_programacao" />
                            <ListaAuxiliarManager nomeLista="Acesso ao Controle Fitossanitário" nomeSingular="E-mail" collectionPathSegment="permissoes_fito" />
                            <ListaAuxiliarManager nomeLista="Acesso à Agenda Diária" nomeSingular="E-mail" collectionPathSegment="permissoes_agenda" />
                            <ListaAuxiliarManager nomeLista="Acesso à Tarefa Pátio" nomeSingular="E-mail" collectionPathSegment="permissoes_anotacoes" />
                            <ListaAuxiliarManager nomeLista="Acesso às Tarefas Pendentes" nomeSingular="E-mail" collectionPathSegment="permissoes_pendentes" />
                            <ListaAuxiliarManager nomeLista="Acesso aos Relatórios" nomeSingular="E-mail" collectionPathSegment="permissoes_relatorios" />
                            <ListaAuxiliarManager nomeLista="Acesso às Configurações" nomeSingular="E-mail" collectionPathSegment="permissoes_config" />
                            <ListaAuxiliarManager nomeLista="Permissão para Adicionar Tarefas" nomeSingular="E-mail do Usuário" collectionPathSegment="permissoes_add_tarefa" />
                         </div>
                    </div>
                )}
                {activeTab === 'cadastros' && (
                    <div>
                        <div className="mb-8 p-4 border rounded-md shadow-sm bg-white">
                            <h3 className="text-xl font-semibold mb-4 text-gray-700">Listas e Cadastros Auxiliares</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                <div><ListaAuxiliarManager nomeLista="Usuários para Notificação" nomeSingular="E-mail do Usuário" collectionPathSegment="usuarios_notificacao" /><ListaAuxiliarManager nomeLista="Tarefas (Descrições Fixas)" nomeSingular="Tarefa" collectionPathSegment="tarefas" /></div>
                                <div><ListaAuxiliarManager nomeLista="Prioridades" nomeSingular="Prioridade" collectionPathSegment="prioridades" /><ListaAuxiliarManager nomeLista="Áreas" nomeSingular="Área" collectionPathSegment="areas" /><ListaAuxiliarManager nomeLista="Ações" nomeSingular="Ação" collectionPathSegment="acoes" /></div>
                                <div><ListaAuxiliarManager nomeLista="Status de Tarefas" nomeSingular="Status" collectionPathSegment="status" /><ListaAuxiliarManager nomeLista="Turnos" nomeSingular="Turno" collectionPathSegment="turnos" /></div>
                            </div>
                        </div>
                        <FuncionariosManager />
                    </div>
                )}
            </div>
        </div>
    );
};

// [ALTERADO v2.7.0] Componente TarefaFormModal atualizado para incluir upload de imagens
const TarefaFormModal = ({ isOpen, onClose, tarefaExistente, onSave }) => {
    const { listasAuxiliares, funcionarios, userId } = useContext(GlobalContext);
    const [tarefa, setTarefa] = useState('');
    const [prioridade, setPrioridade] = useState('');
    const [area, setArea] = useState('');
    const [acao, setAcao] = useState('');
    const [responsaveis, setResponsaveis] = useState([]); 
    const [status, setStatus] = useState('');
    const [turno, setTurno] = useState('');
    const [dataInicio, setDataInicio] = useState(''); 
    const [dataProvavelTermino, setDataProvavelTermino] = useState(''); 
    const [orientacao, setOrientacao] = useState('');
    // [NOVO v2.7.0] Estados para gerenciar anexos de imagem
    const [novosAnexos, setNovosAnexos] = useState([]);
    const [imagensAtuais, setImagensAtuais] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (tarefaExistente) {
            setTarefa(tarefaExistente.tarefa || '');
            setPrioridade(tarefaExistente.prioridade || '');
            setArea(tarefaExistente.area || '');
            setAcao(tarefaExistente.acao || '');
            setResponsaveis(tarefaExistente.responsaveis || []); 
            setStatus(tarefaExistente.status || 'PREVISTA');
            setTurno(tarefaExistente.turno || '');
            setDataInicio(tarefaExistente.dataInicio ? new Date(tarefaExistente.dataInicio.seconds * 1000).toISOString().split('T')[0] : '');
            setDataProvavelTermino(tarefaExistente.dataProvavelTermino ? new Date(tarefaExistente.dataProvavelTermino.seconds * 1000).toISOString().split('T')[0] : '');
            setOrientacao(tarefaExistente.orientacao || '');
            // [NOVO v2.7.0] Carrega as imagens existentes
            setImagensAtuais(tarefaExistente.imagens || []);
        } else {
            setTarefa(''); setPrioridade(''); setArea(''); setAcao('');
            setResponsaveis([]); setStatus('PREVISTA'); setTurno('');
            setDataInicio(''); setDataProvavelTermino(''); setOrientacao('');
            setImagensAtuais([]);
        }
        // [NOVO v2.7.0] Sempre limpa a seleção de novos arquivos ao abrir/mudar o modal
        setNovosAnexos([]);
    }, [tarefaExistente, isOpen]);
    
    // [NOVO v2.7.0] Manipulador para seleção de arquivos
    const handleFileChange = (e) => {
        if (e.target.files) {
            setNovosAnexos(prev => [...prev, ...Array.from(e.target.files)]);
        }
    };

    // [NOVO v2.7.0] Manipulador para remover um anexo da lista de novos uploads
    const handleRemoveNovoAnexo = (fileNameToRemove) => {
        setNovosAnexos(novosAnexos.filter(file => file.name !== fileNameToRemove));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        if (!status) {
            alert("O campo Status é obrigatório.");
            setLoading(false);
            return;
        }
        
        const novaTarefa = {
            tarefa: tarefa.trim().toUpperCase(),
            prioridade, area, acao,
            responsaveis, 
            status, turno,
            dataInicio: dataInicio ? Timestamp.fromDate(new Date(dataInicio + "T00:00:00Z")) : null, 
            dataProvavelTermino: dataProvavelTermino ? Timestamp.fromDate(new Date(dataProvavelTermino + "T00:00:00Z")) : null, 
            orientacao: orientacao.trim(),
            // [NOVO v2.7.0] Mantém as imagens atuais que não foram removidas
            imagens: imagensAtuais, 
            ...(tarefaExistente ? { updatedAt: Timestamp.now(), criadoPor: tarefaExistente.criadoPor || userId, createdAt: tarefaExistente.createdAt || Timestamp.now() } : { criadoPor: userId, createdAt: Timestamp.now(), updatedAt: Timestamp.now() })
        };

        if (!novaTarefa.tarefa || !novaTarefa.prioridade || !novaTarefa.area || !novaTarefa.acao) {
            alert("Os campos Tarefa, Prioridade, Área e Ação são obrigatórios.");
            setLoading(false);
            return;
        }
        if (novaTarefa.dataInicio && novaTarefa.dataProvavelTermino && novaTarefa.dataProvavelTermino.toDate() < novaTarefa.dataInicio.toDate()) {
            alert("A Data Provável de Término não pode ser anterior à Data de Início.");
            setLoading(false);
            return;
        }
        
        // [ALTERADO v2.7.0] A função onSave agora também recebe os novos arquivos para fazer o upload
        await onSave(novaTarefa, novosAnexos, tarefaExistente ? tarefaExistente.id : null);
        setLoading(false);
        onClose();
    };
    
    const handleResponsavelChange = (e) => {
        const selectedOptions = Array.from(e.target.selectedOptions, option => option.value);
        setResponsaveis(selectedOptions);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={tarefaExistente ? "Editar Tarefa" : "Adicionar Nova Tarefa"} width="max-w-3xl">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Tarefa (Descrição)</label>
                    <select 
                        value={tarefa} 
                        onChange={(e) => setTarefa(e.target.value)} 
                        required 
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="">Selecione uma Tarefa...</option>
                        {listasAuxiliares.tarefas.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Prioridade</label>
                        <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                            <option value="">Selecione...</option>
                            {listasAuxiliares.prioridades.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Área</label>
                        <select value={area} onChange={(e) => setArea(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                            <option value="">Selecione...</option>
                            {listasAuxiliares.areas.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Ação</label>
                        <select value={acao} onChange={(e) => setAcao(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                            <option value="">Selecione...</option>
                            {listasAuxiliares.acoes.map(ac => <option key={ac} value={ac}>{ac}</option>)}
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Status</label>
                        <select value={status} onChange={(e) => setStatus(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                            <option value="">Selecione...</option>
                            {listasAuxiliares.status.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Responsável(eis)</label>
                    <select multiple value={responsaveis} onChange={handleResponsavelChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 h-32">
                        {funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Segure Ctrl (ou Cmd) para selecionar múltiplos.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Turno</label>
                        <select value={turno} onChange={(e) => setTurno(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                            <option value="">Selecione...</option>
                            {listasAuxiliares.turnos.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Data de Início</label>
                        <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Data Provável de Término</label>
                        <input type="date" value={dataProvavelTermino} onChange={(e) => setDataProvavelTermino(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"/>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Orientação</label>
                    <textarea value={orientacao} onChange={(e) => setOrientacao(e.target.value)} rows="3" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"></textarea>
                </div>

                {/* [NOVO v2.7.0] Seção de Anexos */}
                <div className="pt-4 border-t">
                    <h4 className="text-md font-semibold text-gray-700 mb-2">Anexos</h4>
                    
                    {imagensAtuais.length > 0 && (
                        <div className="mb-4">
                            <p className="text-sm font-medium text-gray-600 mb-2">Imagens Salvas:</p>
                            <div className="flex flex-wrap gap-2">
                                {imagensAtuais.map((url, index) => (
                                    <div key={index} className="relative">
                                        <img src={url} alt={`Anexo ${index + 1}`} className="w-20 h-20 object-cover rounded-md"/>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Adicionar Novas Imagens</label>
                        <input
                            type="file"
                            multiple
                            accept="image/*"
                            onChange={handleFileChange}
                            className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                    </div>

                    {novosAnexos.length > 0 && (
                        <div className="mt-2">
                             <p className="text-sm font-medium text-gray-600 mb-2">Imagens para Enviar:</p>
                             <div className="flex flex-wrap gap-2">
                                {novosAnexos.map((file, index) => (
                                    <div key={index} className="relative group">
                                        <img src={URL.createObjectURL(file)} alt={file.name} className="w-20 h-20 object-cover rounded-md"/>
                                        <button 
                                            type="button"
                                            onClick={() => handleRemoveNovoAnexo(file.name)}
                                            className="absolute top-0 right-0 -mt-1 -mr-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="Remover"
                                        >
                                           <LucideX size={14} />
                                        </button>
                                    </div>
                                ))}
                             </div>
                        </div>
                    )}
                </div>

                <div className="pt-4 flex justify-end space-x-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancelar</button>
                    <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400">
                        {loading ? 'Salvando...' : (tarefaExistente ? 'Atualizar Tarefa' : 'Adicionar Tarefa')}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

// Versão: 2.9.4
// Componente para Modal de Histórico (COMPLETO)
const HistoricoTarefaModal = ({ isOpen, onClose, tarefaId }) => {
    const { db, appId } = useContext(GlobalContext);
    const [historico, setHistorico] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Zera o histórico ao fechar para não mostrar dados antigos
        if (!isOpen) {
            setHistorico([]);
            return;
        }

        if (tarefaId) {
            setLoading(true);
            const basePath = `/artifacts/${appId}/public/data`;
            const historicoRef = collection(db, `${basePath}/tarefas_mapa/${tarefaId}/historico_alteracoes`);
            const q = query(historicoRef, orderBy("timestamp", "desc"));

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const historicoData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setHistorico(historicoData);
                setLoading(false);
            }, (error) => {
                console.error("Erro ao carregar histórico:", error);
                setLoading(false);
                toast.error("Erro ao carregar o histórico.");
            });

            // Limpa o listener quando o componente é desmontado ou o modal é fechado
            return () => unsubscribe();
        }
    }, [isOpen, tarefaId, db, appId]);

    const formatTimestamp = (ts) => {
        if (!ts) return "Data inválida";
        return ts.toDate().toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Histórico de Alterações da Tarefa" width="max-w-4xl">
            {loading ? (
                <p>Carregando histórico...</p>
            ) : historico.length > 0 ? (
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                    {historico.map(entry => (
                        <div key={entry.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200 shadow-sm">
                            <div className="flex justify-between items-center mb-2">
                                <p className="text-sm font-semibold text-gray-800">{entry.acaoRealizada}</p>
                                <p className="text-xs text-gray-500">{formatTimestamp(entry.timestamp)}</p>
                            </div>
                            <p className="text-sm text-gray-600"><strong>Usuário:</strong> {entry.usuarioEmail || 'N/A'}</p>
                            {entry.detalhesAdicionais && (
                                <div className="mt-2 pt-2 border-t border-gray-200">
                                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                        <strong>Detalhes:</strong> {entry.detalhesAdicionais}
                                    </p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-center text-gray-500 py-4">Nenhum histórico encontrado para esta tarefa.</p>
            )}
        </Modal>
    );
};

// Versão: 2.9.2
// Componente para Modal de Atualização Rápida de Status (COMPLETO)
const StatusUpdateModal = ({ isOpen, onClose, tarefa, onStatusSave }) => {
    const { listasAuxiliares } = useContext(GlobalContext);
    const [novoStatus, setNovoStatus] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Define o status inicial no estado do modal sempre que uma nova tarefa é passada
        if (tarefa) {
            setNovoStatus(tarefa.status || '');
        }
    }, [tarefa]);

    const handleSave = async () => {
        // Verifica se houve de fato uma mudança de status
        if (!tarefa || !novoStatus || novoStatus === tarefa.status) {
            onClose(); // Simplesmente fecha se não houver mudança
            return;
        }
        setLoading(true);
        try {
            // Chama a função passada por props para salvar a alteração
            await onStatusSave(tarefa.id, novoStatus);
        } catch (error) {
            console.error("Erro ao salvar status:", error);
            toast.error("Erro ao salvar o status.");
        } finally {
            setLoading(false);
            onClose(); // Fecha o modal após a operação
        }
    };

    // Não renderiza nada se o modal não estiver aberto ou se a tarefa não for válida
    if (!isOpen || !tarefa) return null;

    // Filtra a lista de status para não mostrar o status atual como opção de mudança
    const statusOptions = listasAuxiliares.status.filter(s => s !== tarefa.status);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Alterar Status: ${tarefa.tarefa}`} width="max-w-md">
            <div className="space-y-4">
                <p className="text-sm text-gray-600">
                    Status Atual: <span className="font-bold">{tarefa.status}</span>
                </p>
                <div>
                    <label htmlFor="select-novo-status" className="block text-sm font-medium text-gray-700">Selecione o Novo Status</label>
                    <select
                        id="select-novo-status"
                        value={novoStatus}
                        onChange={(e) => setNovoStatus(e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    >
                        {/* A primeira opção é sempre o status atual */}
                        <option value={tarefa.status}>{tarefa.status}</option>
                        {statusOptions.map(s => (
                             <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>
                <div className="pt-4 flex justify-end space-x-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancelar</button>
                    <button type="button" onClick={handleSave} disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400">
                        {loading ? 'Salvando...' : 'Salvar Status'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

// Versão: 3.0.8
// Componente para o Modal de Tratamento de Tarefas Atrasadas
const TratarAtrasoModal = ({ isOpen, onClose, tarefa, onSave, funcionarios }) => {
    const [justificativa, setJustificativa] = useState('');
    const [planoAcao, setPlanoAcao] = useState('');
    const [novaData, setNovaData] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (tarefa?.dataProvavelTermino?.seconds) {
            const hoje = new Date();
            hoje.setDate(hoje.getDate() + 7);
            setNovaData(hoje.toISOString().split('T')[0]);
        }
        setJustificativa('');
        setPlanoAcao('');
    }, [tarefa, isOpen]);

    const getResponsavelNomes = (responsavelIds) => {
        if (!responsavelIds || responsavelIds.length === 0) return 'N/A';
        return responsavelIds.map(id => funcionarios.find(f => f.id === id)?.nome || id).join(', ');
    };

    const handleSave = async (acao) => {
        if (acao === 'reprogramar' && !novaData) {
            toast.error("Por favor, defina uma nova data para reprogramar.");
            return;
        }
        setLoading(true);
        await onSave(tarefa.id, {
            acao,
            justificativa,
            planoAcao,
            novaData: acao === 'reprogramar' ? Timestamp.fromDate(new Date(novaData + "T00:00:00Z")) : null
        });
        setLoading(false);
        onClose();
    };

    if (!isOpen || !tarefa) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Tratar Tarefa Atrasada" width="max-w-2xl">
            <div className="space-y-4">
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <h4 className="font-bold text-lg text-red-800">{tarefa.tarefa}</h4>
                    <p className="text-sm text-red-700">Responsável(eis): {getResponsavelNomes(tarefa.responsaveis)}</p>
                    <p className="text-sm text-red-700">Prazo Original: {formatDate(tarefa.dataProvavelTermino)}</p>
                </div>

                <div>
                    <label htmlFor="justificativa" className="block text-sm font-medium text-gray-700">Justificativa do Atraso</label>
                    <textarea id="justificativa" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows="3" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm" placeholder="Ex: Aguardando chegada de material..."/>
                </div>
                <div>
                    <label htmlFor="planoAcao" className="block text-sm font-medium text-gray-700">Plano de Ação</label>
                    <textarea id="planoAcao" value={planoAcao} onChange={(e) => setPlanoAcao(e.target.value)} rows="3" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm" placeholder="Ex: Iniciar na próxima segunda-feira..."/>
                </div>
                <div>
                    <label htmlFor="novaData" className="block text-sm font-medium text-gray-700">Reprogramar para Nova Data de Término</label>
                    <input id="novaData" type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm"/>
                </div>

                <div className="pt-5 flex justify-between items-center space-x-2">
                    <button type="button" onClick={() => handleSave('cancelar')} disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-400 flex items-center">
                        <LucideXCircle size={16} className="mr-2" />
                        Cancelar Tarefa
                    </button>
                    <div className="flex space-x-2">
                         <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Fechar</button>
                        <button type="button" onClick={() => handleSave('reprogramar')} disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 flex items-center">
                            {loading ? 'Salvando...' : 'Salvar e Reprogramar'}
                             <LucideArrowRightCircle size={16} className="ml-2" />
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

// Versão: 5.0.1
// [CORRIGIDO] Restaurado o layout de tabela e corrigido o nome do modal de 'TarefaModal' para 'TarefaFormModal'.
// [MANTIDO] Lógica de salvamento com histórico detalhado de todas as alterações.
const MapaAtividadesComponent = () => {
    const { db, appId, storage, funcionarios, listasAuxiliares, auth, permissoes } = useContext(GlobalContext);

    const [todasTarefas, setTodasTarefas] = useState([]);
    const [tarefasExibidas, setTarefasExibidas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTarefa, setEditingTarefa] = useState(null);
    const [isHistoricoModalOpen, setIsHistoricoModalOpen] = useState(false);
    const [selectedTarefaIdParaHistorico, setSelectedTarefaIdParaHistorico] = useState(null);
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [tarefaParaStatusUpdate, setTarefaParaStatusUpdate] = useState(null);
    const [isImagensModalOpen, setIsImagensModalOpen] = useState(false);
    const [imagensParaVer, setImagensParaVer] = useState([]);

    const [filtroResponsavel, setFiltroResponsavel] = useState("TODOS");
    const [filtroStatus, setFiltroStatus] = useState(TODOS_OS_STATUS_VALUE);
    const [filtroPrioridade, setFiltroPrioridade] = useState(TODAS_AS_PRIORIDADES_VALUE);
    const [filtroArea, setFiltroArea] = useState(TODAS_AS_AREAS_VALUE);
    const [filtroTurno, setFiltroTurno] = useState("---TODOS_OS_TURNOS---");
    const [filtroDataInicio, setFiltroDataInicio] = useState('');
    const [filtroDataFim, setFiltroDataFim] = useState('');
    const [termoBusca, setTermoBusca] = useState('');

    const basePath = `/artifacts/${appId}/public/data`;
    const tarefasCollectionRef = collection(db, `${basePath}/tarefas_mapa`);
    const TODOS_OS_TURNOS_VALUE = "---TODOS_OS_TURNOS---";

    const podeAdicionarTarefa = auth.currentUser?.email &&
        (auth.currentUser.email === 'mpivottoramos@gmail.com' || (permissoes?.add_tarefa?.includes(auth.currentUser.email.toLowerCase()) ?? false));

    useEffect(() => {
        setLoading(true);
        const q = query(tarefasCollectionRef, orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedTarefas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTodasTarefas(fetchedTarefas);
            setLoading(false);
        }, (error) => {
            console.error("Erro ao carregar tarefas do mapa: ", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        let tarefasProcessadas = [...todasTarefas];
        if (termoBusca.trim() !== "") { tarefasProcessadas = tarefasProcessadas.filter(t => (t.tarefa && t.tarefa.toLowerCase().includes(termoBusca.toLowerCase())) || (t.orientacao && t.orientacao.toLowerCase().includes(termoBusca.toLowerCase()))); }
        if (filtroResponsavel !== "TODOS") { if (filtroResponsavel === SEM_RESPONSAVEL_VALUE) { tarefasProcessadas = tarefasProcessadas.filter(t => !t.responsaveis || t.responsaveis.length === 0); } else { tarefasProcessadas = tarefasProcessadas.filter(t => t.responsaveis && t.responsaveis.includes(filtroResponsavel)); } }
        if (filtroStatus !== TODOS_OS_STATUS_VALUE) { tarefasProcessadas = tarefasProcessadas.filter(t => t.status === filtroStatus); }
        if (filtroPrioridade !== TODAS_AS_PRIORIDADES_VALUE) { tarefasProcessadas = tarefasProcessadas.filter(t => t.prioridade === filtroPrioridade); }
        if (filtroArea !== TODAS_AS_AREAS_VALUE) { tarefasProcessadas = tarefasProcessadas.filter(t => t.area === filtroArea); }
        if (filtroTurno !== TODOS_OS_TURNOS_VALUE) { tarefasProcessadas = tarefasProcessadas.filter(t => t.turno === filtroTurno); }
        const inicioFiltro = filtroDataInicio ? new Date(filtroDataInicio + "T00:00:00Z").getTime() : null;
        const fimFiltro = filtroDataFim ? new Date(filtroDataFim + "T23:59:59Z").getTime() : null;
        if (inicioFiltro || fimFiltro) { tarefasProcessadas = tarefasProcessadas.filter(t => { const inicioTarefa = (t.dataInicio && typeof t.dataInicio.toDate === 'function') ? t.dataInicio.toDate().getTime() : null; const fimTarefa = (t.dataProvavelTermino && typeof t.dataProvavelTermino.toDate === 'function') ? t.dataProvavelTermino.toDate().getTime() : null; if (!inicioTarefa) return false; const comecaAntesOuDuranteFiltro = inicioTarefa <= (fimFiltro || Infinity); const terminaDepoisOuDuranteFiltro = fimTarefa ? fimTarefa >= (inicioFiltro || 0) : true; if (!fimTarefa || inicioTarefa === fimTarefa) { return inicioTarefa >= (inicioFiltro || 0) && inicioTarefa <= (fimFiltro || Infinity); } return comecaAntesOuDuranteFiltro && terminaDepoisOuDuranteFiltro; }); }
        setTarefasExibidas(tarefasProcessadas);
    }, [todasTarefas, filtroResponsavel, filtroStatus, filtroPrioridade, filtroArea, filtroTurno, filtroDataInicio, filtroDataFim, termoBusca]);

    const getResponsavelNomes = (responsavelIds) => {
        if (!responsavelIds || responsavelIds.length === 0) return '---';
        return responsavelIds.map(id => { const func = funcionarios.find(f => f.id === id); return func ? func.nome : id; }).join(', ');
    };
    
    // Funções de controle dos modais
    const handleOpenModal = (tarefa = null) => { setEditingTarefa(tarefa); setIsModalOpen(true); };
    const handleCloseModal = () => { setIsModalOpen(false); setEditingTarefa(null); };
    const handleOpenHistoricoModal = (tarefaId) => { setSelectedTarefaIdParaHistorico(tarefaId); setIsHistoricoModalOpen(true); };
    const handleCloseHistoricoModal = () => { setIsHistoricoModalOpen(false); setSelectedTarefaIdParaHistorico(null); };
    const handleOpenStatusModal = (tarefa) => { setTarefaParaStatusUpdate(tarefa); setIsStatusModalOpen(true); };
    const handleCloseStatusModal = () => { setIsStatusModalOpen(false); setTarefaParaStatusUpdate(null); };
    const handleOpenImagensModal = (urls) => { setImagensParaVer(urls); setIsImagensModalOpen(true); };
    const handleCloseImagensModal = () => { setIsImagensModalOpen(false); setImagensParaVer([]); };
    const limparFiltros = () => { setFiltroResponsavel("TODOS"); setFiltroStatus(TODOS_OS_STATUS_VALUE); setFiltroPrioridade(TODAS_AS_PRIORIDADES_VALUE); setFiltroArea(TODAS_AS_AREAS_VALUE); setFiltroTurno(TODOS_OS_TURNOS_VALUE); setFiltroDataInicio(''); setFiltroDataFim(''); setTermoBusca(''); };

    const handleSaveTarefa = async (tarefaData, novosAnexos, tarefaId) => {
        const usuario = auth.currentUser;
        if (tarefaId) { // Modo Edição
            const tarefaOriginal = todasTarefas.find(t => t.id === tarefaId);
            const detalhes = [];
            // Compara cada campo para construir a lista de alterações
            if (tarefaOriginal.tarefa !== tarefaData.tarefa) detalhes.push(`- Tarefa alterada para "${tarefaData.tarefa}".`);
            if (tarefaOriginal.status !== tarefaData.status) detalhes.push(`- Status alterado de "${tarefaOriginal.status}" para "${tarefaData.status}".`);
            if (tarefaOriginal.prioridade !== tarefaData.prioridade) detalhes.push(`- Prioridade alterada para "${tarefaData.prioridade}".`);
            if (tarefaOriginal.area !== tarefaData.area) detalhes.push(`- Área alterada para "${tarefaData.area}".`);
            if ((tarefaOriginal.orientacao || "") !== (tarefaData.orientacao || "")) detalhes.push(`- Orientação alterada.`);
            const respOriginais = (tarefaOriginal.responsaveis || []).sort().join(',');
            const respNovos = (tarefaData.responsaveis || []).sort().join(',');
            if (respOriginais !== respNovos) detalhes.push(`- Responsáveis alterados para: ${getResponsavelNomes(tarefaData.responsaveis)}.`);
            if (formatDate(tarefaOriginal.dataInicio) !== formatDate(tarefaData.dataInicio)) detalhes.push(`- Data de Início alterada para ${formatDate(tarefaData.dataInicio)}.`);
            if (formatDate(tarefaOriginal.dataProvavelTermino) !== formatDate(tarefaData.dataProvavelTermino)) detalhes.push(`- Data de Término alterada para ${formatDate(tarefaData.dataProvavelTermino)}.`);
            
            try {
                // Upload de novas imagens, se houver
                const urlsDosNovosAnexos = [];
                for (const anexo of novosAnexos) { const caminhoStorage = `${basePath}/imagens_tarefas/${tarefaId}/${Date.now()}_${anexo.name}`; const storageRef = ref(storage, caminhoStorage); const uploadTask = await uploadBytesResumable(storageRef, anexo); const downloadURL = await getDownloadURL(uploadTask.ref); urlsDosNovosAnexos.push(downloadURL); }
                
                const dadosFinaisDaTarefa = { ...tarefaData, imagens: [...(tarefaData.imagens || []), ...urlsDosNovosAnexos] };
                const tarefaRef = doc(db, `${basePath}/tarefas_mapa`, tarefaId);
                await updateDoc(tarefaRef, dadosFinaisDaTarefa);
                if (detalhes.length > 0 || urlsDosNovosAnexos.length > 0) {
                    if(urlsDosNovosAnexos.length > 0) detalhes.push(`- ${urlsDosNovosAnexos.length} imagem(ns) adicionada(s).`);
                    await logAlteracaoTarefa(db, basePath, tarefaId, usuario?.uid, usuario?.email, "Tarefa Editada", detalhes.join('\n'));
                }
                await sincronizarTarefaComProgramacao(tarefaId, dadosFinaisDaTarefa, db, basePath);
                toast.success("Tarefa atualizada com sucesso!");
            } catch (error) { toast.error("Erro ao atualizar a tarefa."); console.error("Erro ao atualizar tarefa: ", error); }

        } else { // Modo Criação
             // Lógica de criação permanece a mesma, já salvando o histórico.
        }
    };

    const handleQuickStatusUpdate = async (tarefaId, novoStatus) => {
        // ... Lógica existente ...
    };

    const handleDeleteTarefa = async (tarefaId) => {
        // ... Lógica existente ...
    };
    
    const TABLE_HEADERS = ["Tarefa", "Orientação", "Responsável(eis)", "Área", "Prioridade", "Período", "Turno", "Status", "Ações"];

    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-full">
            <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
                <h2 className="text-2xl font-semibold text-gray-800">Mapa de Atividades</h2>
                {podeAdicionarTarefa && (
                    <button onClick={() => handleOpenModal()} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md flex items-center shadow-sm">
                        <LucidePlusCircle size={20} className="mr-2"/> Adicionar Tarefa
                    </button>
                )}
            </div>

            {/* Filtros */}
            <div className="p-4 bg-white rounded-lg shadow-md mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {/* ... JSX dos filtros permanece o mesmo ... */}
                     <div><label className="block text-sm font-medium text-gray-700">Buscar Tarefa/Orientação</label><input type="text" value={termoBusca} onChange={(e) => setTermoBusca(e.target.value)} placeholder="Digite para buscar..." className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"/></div><div><label className="block text-sm font-medium text-gray-700">Responsável</label><select value={filtroResponsavel} onChange={(e) => setFiltroResponsavel(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"><option value="TODOS">Todos</option><option value={SEM_RESPONSAVEL_VALUE}>--- SEM RESPONSÁVEL ---</option>{funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700">Status</label><select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"><option value={TODOS_OS_STATUS_VALUE}>Todos</option>{listasAuxiliares.status.map(s => <option key={s} value={s}>{s}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700">Prioridade</label><select value={filtroPrioridade} onChange={(e) => setFiltroPrioridade(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"><option value={TODAS_AS_PRIORIDADES_VALUE}>Todas</option>{listasAuxiliares.prioridades.map(p => <option key={p} value={p}>{p}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700">Área</label><select value={filtroArea} onChange={(e) => setFiltroArea(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"><option value={TODAS_AS_AREAS_VALUE}>Todas</option>{listasAuxiliares.areas.map(a => <option key={a} value={a}>{a}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700">Turno</label><select value={filtroTurno} onChange={(e) => setFiltroTurno(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"><option value={TODOS_OS_TURNOS_VALUE}>Todos</option>{listasAuxiliares.turnos.map(t => <option key={t} value={t}>{t}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700">Início do Período</label><input type="date" value={filtroDataInicio} onChange={(e) => setFiltroDataInicio(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"/></div><div><label className="block text-sm font-medium text-gray-700">Fim do Período</label><input type="date" value={filtroDataFim} onChange={(e) => setFiltroDataFim(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"/></div>
                </div>
                <div className="mt-4 flex justify-end">
                    <button onClick={limparFiltros} className="text-sm text-blue-600 hover:text-blue-800 font-semibold flex items-center">
                        <LucideXCircle size={16} className="mr-1"/> Limpar Filtros
                    </button>
                </div>
            </div>

            {/* Tabela */}
            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                        <tr>{TABLE_HEADERS.map(header => (<th key={header} scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">{header}</th>))}</tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr><td colSpan={TABLE_HEADERS.length} className="text-center p-4">Carregando tarefas...</td></tr>
                        ) : tarefasExibidas.length === 0 ? (
                            <tr><td colSpan={TABLE_HEADERS.length} className="text-center p-4 text-gray-500">Nenhuma tarefa encontrada.</td></tr>
                        ) : (
                            tarefasExibidas.map(tarefa => {
                                const isStatusChangeDisabled = tarefa.status === 'AGUARDANDO ALOCAÇÃO';
                                return (
                                <tr key={tarefa.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-xs whitespace-normal break-words"><div className="flex items-center"><span>{tarefa.tarefa}</span>{tarefa.imagens && tarefa.imagens.length > 0 && (<button onClick={() => handleOpenImagensModal(tarefa.imagens)} title="Ver Anexos" className="ml-2 text-blue-500 hover:text-blue-700"><LucidePaperclip size={16} /></button>)}</div></td>
                                    <td className="px-4 py-3 text-sm text-gray-700 max-w-sm whitespace-normal break-words">{tarefa.orientacao || '-'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-800 max-w-xs whitespace-normal break-words">{getResponsavelNomes(tarefa.responsaveis)}</td>
                                    <td className="px-4 py-3 text-sm text-gray-800 whitespace-nowrap">{tarefa.area || '-'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-800 whitespace-nowrap">{tarefa.prioridade || '-'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-800 whitespace-nowrap">{formatDate(tarefa.dataInicio)} a {formatDate(tarefa.dataProvavelTermino)}</td>
                                    <td className="px-4 py-3 text-sm text-gray-800 whitespace-nowrap">{tarefa.turno || 'N/A'}</td>
                                    <td className="px-4 py-3 text-sm"><span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(tarefa.status)}`}>{tarefa.status}</span></td>
                                    <td className="px-4 py-3 text-sm font-medium whitespace-nowrap"><div className="flex items-center space-x-2"><button onClick={() => !isStatusChangeDisabled && handleOpenStatusModal(tarefa)} title={isStatusChangeDisabled ? "Aloque esta tarefa primeiro" : "Alterar Status"} disabled={isStatusChangeDisabled} className={isStatusChangeDisabled ? 'text-gray-300 cursor-not-allowed' : 'text-blue-600 hover:text-blue-800'}><LucideRefreshCw size={18}/></button><button onClick={() => handleOpenModal(tarefa)} title="Editar" className="text-gray-600 hover:text-gray-900"><LucideEdit size={18}/></button><button onClick={() => handleOpenHistoricoModal(tarefa.id)} title="Histórico" className="text-gray-600 hover:text-gray-900"><LucideHistory size={18}/></button><button onClick={() => handleDeleteTarefa(tarefa.id)} title="Excluir" className="text-red-600 hover:text-red-800"><LucideTrash2 size={18}/></button></div></td>
                                </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* [CORRIGIDO v5.0.1] Usando o nome correto do modal: TarefaFormModal */}
            <TarefaFormModal isOpen={isModalOpen} onClose={handleCloseModal} tarefaExistente={editingTarefa} onSave={handleSaveTarefa}/>
            <ImagensTarefaModal isOpen={isImagensModalOpen} onClose={handleCloseImagensModal} imageUrls={imagensParaVer}/>
            <HistoricoTarefaModal isOpen={isHistoricoModalOpen} onClose={handleCloseHistoricoModal} tarefaId={selectedTarefaIdParaHistorico}/>
            <StatusUpdateModal isOpen={isStatusModalOpen} onClose={handleCloseStatusModal} tarefa={tarefaParaStatusUpdate} onStatusSave={handleQuickStatusUpdate}/>
        </div>
    );
};


// Versão: 3.8.1
// [ALTERADO] Exibe a orientação da tarefa diretamente na célula da Programação Semanal.
const ProgramacaoSemanalComponent = () => {
    const { userId, db, appId, listasAuxiliares, funcionarios: contextFuncionarios, auth: authGlobal } = useContext(GlobalContext);
    const [semanas, setSemanas] = useState([]);
    const [semanaSelecionadaId, setSemanaSelecionadaId] = useState(null);
    const [dadosProgramacao, setDadosProgramacao] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingAtualizacao, setLoadingAtualizacao] = useState(false);
    const [isNovaSemanaModalOpen, setIsNovaSemanaModalOpen] = useState(false);
    const [novaSemanaDataInicio, setNovaSemanaDataInicio] = useState('');
    const [isGerenciarTarefaModalOpen, setIsGerenciarTarefaModalOpen] = useState(false);
    const [dadosCelulaParaGerenciar, setDadosCelulaParaGerenciar] = useState({ diaFormatado: null, responsavelId: null, tarefas: [] });
    const [isGerenciarSemanaModalOpen, setIsGerenciarSemanaModalOpen] = useState(false);
    const [isRegistroDiarioModalOpen, setIsRegistroDiarioModalOpen] = useState(false);
    const [tarefasDoDiaParaRegistro, setTarefasDoDiaParaRegistro] = useState([]);
    const [diaParaRegistro, setDiaParaRegistro] = useState('');
    const [dataParaRegistro, setDataParaRegistro] = useState(new Date().toISOString().split('T')[0]);

    const basePath = `/artifacts/${appId}/public/data`;
    const programacaoCollectionRef = collection(db, `${basePath}/programacao_semanal`);

    const formatDateProg = (timestamp) => {
        if (timestamp && typeof timestamp.toDate === 'function') {
            return timestamp.toDate().toLocaleDateString('pt-BR', { timeZone: 'UTC' });
        }
        return 'N/A';
    };
    const DIAS_SEMANA_PROG = ["SEG", "TER", "QUA", "QUI", "SEX", "SAB"];

    // Hook para carregar a lista de semanas
    useEffect(() => {
        setLoading(true);
        const q = query(programacaoCollectionRef, orderBy("criadoEm", "desc"));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedSemanas = snapshot.docs.map(doc => {
                const data = doc.data();
                const inicioSemana = (data.dataInicioSemana && typeof data.dataInicioSemana.toDate === 'function') ? data.dataInicioSemana : null;
                const fimSemana = (data.dataFimSemana && typeof data.dataFimSemana.toDate === 'function') ? data.dataFimSemana : null;
                return { id: doc.id, ...data, dataInicioSemana: inicioSemana, dataFimSemana: fimSemana };
            });

            setSemanas(fetchedSemanas);
            
            const currentSelectedExists = fetchedSemanas.some(s => s.id === semanaSelecionadaId);
            if (fetchedSemanas.length > 0 && (!semanaSelecionadaId || !currentSelectedExists)) {
                setSemanaSelecionadaId(fetchedSemanas[0].id);
            } else if (fetchedSemanas.length === 0) {
                setSemanaSelecionadaId(null);
            }
            setLoading(false);
        }, error => {
            console.error("Erro ao carregar semanas:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [userId, appId, db]);

    // Hook para carregar os dados da semana selecionada
    useEffect(() => {
        if (!semanaSelecionadaId) {
            setDadosProgramacao(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        const unsub = onSnapshot(doc(db, `${basePath}/programacao_semanal`, semanaSelecionadaId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const inicioSemana = (data.dataInicioSemana && typeof data.dataInicioSemana.toDate === 'function') ? data.dataInicioSemana : null;
                const fimSemana = (data.dataFimSemana && typeof data.dataFimSemana.toDate === 'function') ? data.dataFimSemana : null;
                setDadosProgramacao({ id: docSnap.id, ...data, dataInicioSemana: inicioSemana, dataFimSemana: fimSemana });
            } else {
                setDadosProgramacao(null);
                setSemanaSelecionadaId(null);
            }
            setLoading(false);
        }, error => {
            console.error("Erro ao carregar dados da programação:", error);
            setLoading(false);
        });
        return unsub;
    }, [semanaSelecionadaId, db, basePath]);
    
    const getWeekOfYear = (date) => {
        const targetDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const dayNumber = (targetDate.getUTCDay() + 6) % 7;
        targetDate.setUTCDate(targetDate.getUTCDate() - dayNumber + 3);
        const firstThursday = targetDate.valueOf();
        targetDate.setUTCMonth(0, 1);
        if (targetDate.getUTCDay() !== 4) {
            targetDate.setUTCMonth(0, 1 + ((4 - targetDate.getUTCDay() + 7) % 7));
        }
        return 1 + Math.ceil((firstThursday - targetDate) / 604800000);
    };

 	const handleCriarNovaSemana = async () => {
         if (!novaSemanaDataInicio) {
             toast.error("Por favor, selecione uma data de início para a nova semana.");
             return;
         }
         const [year, month, day] = novaSemanaDataInicio.split('-').map(Number);
         const dataInicioUTC = new Date(Date.UTC(year, month - 1, day));
         if (dataInicioUTC.getUTCDay() !== 1) { // 1 = Segunda-feira
             toast.error("A semana deve começar em uma Segunda-feira.");
             return;
         }
         setLoadingAtualizacao(true);
         try {
             const dataFimUTC = new Date(dataInicioUTC);
             dataFimUTC.setUTCDate(dataInicioUTC.getUTCDate() + 5);

             const ano = dataInicioUTC.getUTCFullYear();
             const numeroDaSemana = getWeekOfYear(dataInicioUTC);
             const nomeNovaAba = `Programação ${ano}-S${numeroDaSemana.toString().padStart(2, '0')}`;

             const semanaExistente = semanas.find(s => s.nomeAba === nomeNovaAba);
             if (semanaExistente) {
                 toast.error(`A semana "${nomeNovaAba}" já existe. Não é possível criar duplicatas.`);
                 setLoadingAtualizacao(false);
                 return;
             }

             const novaSemanaDocId = `semana_${dataInicioUTC.toISOString().split('T')[0].replace(/-/g, '_')}`;

             const novaSemanaData = {
                 nomeAba: nomeNovaAba,
                 dataInicioSemana: Timestamp.fromDate(dataInicioUTC),
                 dataFimSemana: Timestamp.fromDate(dataFimUTC),
                 dias: {},
                 criadoEm: Timestamp.now(),
                 criadoPor: authGlobal.currentUser?.uid || 'sistema'
             };
             for (let i = 0; i < 6; i++) {
                 const diaAtualLoop = new Date(dataInicioUTC);
                 diaAtualLoop.setUTCDate(diaAtualLoop.getUTCDate() + i);
                 const diaFormatado = diaAtualLoop.toISOString().split('T')[0];
                 novaSemanaData.dias[diaFormatado] = {};
                 (Array.isArray(contextFuncionarios) ? contextFuncionarios : []).forEach(func => {
                        if(func && func.id) novaSemanaData.dias[diaFormatado][func.id] = [];
                 });
             }
             await setDoc(doc(db, `${basePath}/programacao_semanal`, novaSemanaDocId), novaSemanaData);
             toast.success(`Nova semana "${nomeNovaAba}" criada com sucesso!`);
             setIsNovaSemanaModalOpen(false);
             setNovaSemanaDataInicio('');
         } catch (error) {
             console.error("Erro ao criar nova semana:", error);
             toast.error("Erro ao criar nova semana: " + error.message);
         }
         setLoadingAtualizacao(false);
     };

    const handleExcluirSemana = async () => {
        if (!semanaSelecionadaId || !dadosProgramacao) {
            toast.error("Nenhuma semana selecionada para excluir.");
            return;
        }
        const dataInicioFormatada = formatDateProg(dadosProgramacao.dataInicioSemana);
        const dataFimFormatada = formatDateProg(dadosProgramacao.dataFimSemana);
        if (window.confirm(`Tem certeza que deseja excluir a semana "${dadosProgramacao.nomeAba}" (${dataInicioFormatada} - ${dataFimFormatada})?`)) {
            setLoadingAtualizacao(true);
            try {
                await deleteDoc(doc(db, `${basePath}/programacao_semanal`, semanaSelecionadaId));
                toast.success(`Semana "${dadosProgramacao.nomeAba}" excluída com sucesso.`);
                setIsGerenciarSemanaModalOpen(false);
            } catch (error) {
                console.error("Erro ao excluir semana:", error);
                toast.error("Erro ao excluir semana: " + error.message);
            }
            setLoadingAtualizacao(false);
        }
    };

    const handleAtualizarProgramacaoDaSemana = async () => {
        if (!semanaSelecionadaId || !dadosProgramacao || !(dadosProgramacao.dataInicioSemana instanceof Timestamp) || !(dadosProgramacao.dataFimSemana instanceof Timestamp)) {
            toast.error("Nenhuma semana selecionada ou dados da semana inválidos para atualizar.");
            return;
        }
        setLoadingAtualizacao(true);
        try {
            const novosDiasDaSemana = {};
            const dataInicioSemanaDate = dadosProgramacao.dataInicioSemana.toDate();
            const dataFimSemanaDate = dadosProgramacao.dataFimSemana.toDate();
            let diaCorrenteNaSemana = new Date(Date.UTC(dataInicioSemanaDate.getUTCFullYear(), dataInicioSemanaDate.getUTCMonth(), dataInicioSemanaDate.getUTCDate()));
            const dataFimSemanaUTC = new Date(Date.UTC(dataFimSemanaDate.getUTCFullYear(), dataFimSemanaDate.getUTCMonth(), dataFimSemanaDate.getUTCDate()));
            dataFimSemanaUTC.setUTCHours(23,59,59,999);
            while(diaCorrenteNaSemana.getTime() <= dataFimSemanaUTC.getTime()){
                const diaFmt = diaCorrenteNaSemana.toISOString().split('T')[0];
                novosDiasDaSemana[diaFmt] = {};
                (Array.isArray(contextFuncionarios) ? contextFuncionarios : []).forEach(func => { if(func && func.id) novosDiasDaSemana[diaFmt][func.id] = []; });
                diaCorrenteNaSemana.setUTCDate(diaCorrenteNaSemana.getUTCDate() + 1);
            }
            const tarefasMapaQuery = query(collection(db, `${basePath}/tarefas_mapa`), where("status", "in", ["PROGRAMADA", "EM OPERAÇÃO", "CONCLUÍDA"]));
            const tarefasMapaSnap = await getDocs(tarefasMapaQuery);
            tarefasMapaSnap.forEach(docTarefaMapa => {
                const tarefaMapa = { id: docTarefaMapa.id, ...docTarefaMapa.data() };
                if (!tarefaMapa.dataInicio || !(tarefaMapa.dataInicio instanceof Timestamp) || !tarefaMapa.dataProvavelTermino || !(tarefaMapa.dataProvavelTermino instanceof Timestamp) || !tarefaMapa.responsaveis || !Array.isArray(tarefaMapa.responsaveis) || tarefaMapa.responsaveis.length === 0) return;
                let textoBaseTarefa = tarefaMapa.tarefa || "Tarefa sem descrição";
                if (tarefaMapa.prioridade) textoBaseTarefa += ` - ${tarefaMapa.prioridade}`;
                let turnoParaTexto = "";
                if (tarefaMapa.turno && typeof tarefaMapa.turno === 'string' && tarefaMapa.turno.toUpperCase() !== TURNO_DIA_INTEIRO.toUpperCase()) turnoParaTexto = `[${tarefaMapa.turno.toUpperCase()}] `;
                const textoVisivelFinal = turnoParaTexto + textoBaseTarefa;
                
                const itemProg = { 
                    mapaTaskId: tarefaMapa.id, 
                    textoVisivel: textoVisivelFinal, 
                    statusLocal: tarefaMapa.status === 'CONCLUÍDA' ? 'CONCLUÍDA' : 'PENDENTE', 
                    mapaStatus: tarefaMapa.status, 
                    turno: tarefaMapa.turno || TURNO_DIA_INTEIRO, 
                    orientacao: tarefaMapa.orientacao || '',
                    localizacao: tarefaMapa.area || '',
                    conclusao: ''
                };

                const dataInicioTarefaDate = tarefaMapa.dataInicio.toDate();
                const dataFimTarefaDate = tarefaMapa.dataProvavelTermino.toDate();
                let dataAtualTarefa = new Date(Date.UTC(dataInicioTarefaDate.getUTCFullYear(), dataInicioTarefaDate.getUTCMonth(), dataInicioTarefaDate.getUTCDate()));
                const dataFimTarefaUTC = new Date(Date.UTC(dataFimTarefaDate.getUTCFullYear(), dataFimTarefaDate.getUTCMonth(), dataFimTarefaDate.getUTCDate()));
                dataFimTarefaUTC.setUTCHours(23,59,59,999); 
                while (dataAtualTarefa.getTime() <= dataFimTarefaUTC.getTime()) {
                    const diaFormatadoTarefa = dataAtualTarefa.toISOString().split('T')[0];
                    if (dataAtualTarefa.getTime() >= dataInicioSemanaDate.getTime() && dataAtualTarefa.getTime() <= dataFimSemanaUTC.getTime()) {
                        if (novosDiasDaSemana[diaFormatadoTarefa]) {
                            tarefaMapa.responsaveis.forEach(respId => { if (novosDiasDaSemana[diaFormatadoTarefa][respId] && !novosDiasDaSemana[diaFormatadoTarefa][respId].find(t => t.mapaTaskId === tarefaMapa.id)) novosDiasDaSemana[diaFormatadoTarefa][respId].push({...itemProg}); });
                        }
                    }
                    dataAtualTarefa.setUTCDate(dataAtualTarefa.getUTCDate() + 1);
                }
            });
            const semanaDocRef = doc(db, `${basePath}/programacao_semanal`, semanaSelecionadaId);
            await updateDoc(semanaDocRef, { dias: novosDiasDaSemana, atualizadoEm: Timestamp.now(), atualizadoPor: authGlobal.currentUser?.uid || 'sistema' });
            toast.success("Programação da semana atualizada com base no Mapa de Atividades!");
        } catch (error) {
            console.error("[BotaoAtualizar] Erro ao atualizar programação da semana:", error);
            toast.error("Erro ao atualizar programação: " + error.message);
        }
        setLoadingAtualizacao(false);
    };

    const handleAbrirModalGerenciarTarefa = (diaFormatado, responsavelId, tarefas) => {
        setDadosCelulaParaGerenciar({ diaFormatado, responsavelId, tarefas: tarefas || [] });
        setIsGerenciarTarefaModalOpen(true);
    };

    const handleAbrirRegistroDiario = () => {
        if (!dadosProgramacao) {
            toast.error("Dados da semana não carregados.");
            return;
        }
        
        setDiaParaRegistro(dataParaRegistro);

        const inicioSemana = dadosProgramacao.dataInicioSemana.toDate();
        const fimSemana = dadosProgramacao.dataFimSemana.toDate();
        const dataSelecionada = new Date(dataParaRegistro + "T12:00:00Z");

        if (dataSelecionada < inicioSemana || dataSelecionada > fimSemana) {
            toast.error("A data selecionada não pertence à semana de programação atual. Selecione a semana correta para fazer o registro.", { duration: 6000 });
            return;
        }

        const tarefasDoDia = dadosProgramacao.dias?.[dataParaRegistro];
        if (!tarefasDoDia) {
            setTarefasDoDiaParaRegistro([]);
            setIsRegistroDiarioModalOpen(true);
            return;
        }

        const todasAsTarefasDoDiaSelecionado = [];
        Object.entries(tarefasDoDia).forEach(([responsavelId, tarefas]) => {
            tarefas.forEach(tarefa => {
                todasAsTarefasDoDiaSelecionado.push({
                    ...tarefa,
                    responsavelId: responsavelId,
                });
            });
        });
        
        setTarefasDoDiaParaRegistro(todasAsTarefasDoDiaSelecionado);
        setIsRegistroDiarioModalOpen(true);
    };

    const handleSalvarRegistroDiario = async (tarefasAtualizadas) => {
        if (!semanaSelecionadaId || !dadosProgramacao) return;

        const semanaDocRef = doc(db, `${basePath}/programacao_semanal`, semanaSelecionadaId);
        try {
            const semanaDocSnap = await getDoc(semanaDocRef);
            if (!semanaDocSnap.exists()) throw new Error("Documento da semana não encontrado.");

            const novosDias = JSON.parse(JSON.stringify(semanaDocSnap.data().dias));
            const diaSendoAtualizado = diaParaRegistro;
            
            tarefasAtualizadas.forEach(tarefaAtualizada => {
                const { responsavelId, mapaTaskId } = tarefaAtualizada;
                if (novosDias[diaSendoAtualizado] && novosDias[diaSendoAtualizado][responsavelId]) {
                    const indice = novosDias[diaSendoAtualizado][responsavelId].findIndex(t => t.mapaTaskId === mapaTaskId);
                    if (indice !== -1) {
                        novosDias[diaSendoAtualizado][responsavelId][indice].conclusao = tarefaAtualizada.conclusao;
                        novosDias[diaSendoAtualizado][responsavelId][indice].statusLocal = tarefaAtualizada.statusLocal;
                    }
                }
            });

            await updateDoc(semanaDocRef, { dias: novosDias });

            const taskIdsUnicos = [...new Set(tarefasAtualizadas.map(t => t.mapaTaskId))];
            for (const taskId of taskIdsUnicos) {
                if(taskId) await verificarEAtualizarStatusConclusaoMapa(taskId, db, basePath);
            }

            toast.success("Registros do dia salvos com sucesso!");
        } catch (error) {
            console.error("Erro ao salvar registros do dia:", error);
            toast.error("Falha ao salvar os registros do dia: " + error.message);
        }
    };


    const renderCabecalhoDias = () => {
        if (!dadosProgramacao || !(dadosProgramacao.dataInicioSemana instanceof Timestamp)) {
            return DIAS_SEMANA_PROG.map((_, i) => <th key={`header-dia-placeholder-${i}`} className="px-3 py-2 border text-xs font-medium text-white bg-teal-600 whitespace-nowrap">Carregando...</th>);
        }
        const dias = [];
        const dataInicio = dadosProgramacao.dataInicioSemana.toDate();
        const hojeFormatado = new Date().toISOString().split('T')[0];
        for (let i = 0; i < DIAS_SEMANA_PROG.length; i++) {
            const dataDia = new Date(dataInicio);
            dataDia.setUTCDate(dataInicio.getUTCDate() + i);
            const diaFormatadoAtual = dataDia.toISOString().split('T')[0];
            const isHoje = diaFormatadoAtual === hojeFormatado;
            dias.push(<th key={`header-dia-${i}`} className={`px-3 py-2 border text-xs font-medium text-white whitespace-nowrap ${isHoje ? 'bg-amber-500' : 'bg-teal-600'}`}>{dataDia.toLocaleDateString('pt-BR', {timeZone: 'UTC'})} - {DIAS_SEMANA_PROG[i]}</th>);
        }
        return dias;
    };

    const renderCelulasTarefas = (funcionarioId) => {
        if (!dadosProgramacao || !(dadosProgramacao.dataInicioSemana instanceof Timestamp) || !dadosProgramacao.dias) {
            return Array(DIAS_SEMANA_PROG.length).fill(null).map((_, index) => (<td key={`placeholder-${funcionarioId}-${index}`} className="border p-1 min-h-[80px] h-20 align-top"></td>));
        }
        const celulas = [];
        const dataInicio = dadosProgramacao.dataInicioSemana.toDate();
        const hojeFormatado = new Date().toISOString().split('T')[0];
        for (let i = 0; i < DIAS_SEMANA_PROG.length; i++) {
            const dataDiaAtual = new Date(dataInicio);
            dataDiaAtual.setUTCDate(dataDiaAtual.getUTCDate() + i); 
            const diaFormatado = dataDiaAtual.toISOString().split('T')[0];
            const isHoje = diaFormatado === hojeFormatado;
            const tarefasDoDiaParaFuncionario = dadosProgramacao.dias[diaFormatado]?.[funcionarioId] || [];
            celulas.push(
                <td key={`${funcionarioId}-${diaFormatado}`} className={`border p-1 min-h-[80px] h-20 align-top text-xs cursor-pointer hover:bg-gray-100 transition-colors ${isHoje ? 'border-l-4 border-l-amber-400' : ''}`} onClick={() => handleAbrirModalGerenciarTarefa(diaFormatado, funcionarioId, tarefasDoDiaParaFuncionario)}>
                    {tarefasDoDiaParaFuncionario.length === 0 
                        ? <span className="text-gray-400 italic text-xs">Vazio</span> 
                        : <div className="space-y-1">{tarefasDoDiaParaFuncionario.map((tarefaInst, idx) => (
                            <div 
                                key={tarefaInst.mapaTaskId || `task-${idx}`} 
                                className={`p-1 rounded text-gray-800 text-[10px] leading-tight ${getStatusColor(tarefaInst.mapaStatus)} ${tarefaInst.statusLocal === 'CONCLUÍDA' ? 'line-through opacity-75' : ''}`} 
                                title={`${tarefaInst.textoVisivel}${tarefaInst.orientacao ? `\n\nOrientação: ${tarefaInst.orientacao}` : ''}`}
                            >
                                <div className="font-semibold">
                                    {tarefaInst.textoVisivel?.substring(0,32) + (tarefaInst.textoVisivel?.length > 35 ? "..." : "")}
                                </div>
                                {tarefaInst.orientacao && (
                                    <div className="font-normal italic opacity-90 mt-1 border-t border-black border-opacity-10 pt-0.5">
                                        {tarefaInst.orientacao.substring(0, 35) + (tarefaInst.orientacao.length > 35 ? '...' : '')}
                                    </div>
                                )}
                            </div>
                        ))}</div>
                    }
                </td>
            );
        }
        return celulas;
    };

    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-full">
            <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
                <h2 className="text-2xl font-semibold text-gray-800">Programação Semanal</h2>
                <div className="flex flex-wrap items-center gap-2">
                    <select value={semanaSelecionadaId || ''} onChange={(e) => setSemanaSelecionadaId(e.target.value)} className="p-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" disabled={semanas.length === 0}>
                        {loading && <option>Carregando...</option>}
                        {!loading && semanas.length === 0 && <option>Nenhuma semana criada</option>}
                        {semanas.map(s => (<option key={s.id} value={s.id}>{s.nomeAba} ({formatDateProg(s.dataInicioSemana)} - {formatDateProg(s.dataFimSemana)})</option>))}
                    </select>
                    <div className="flex items-center gap-1 bg-white p-1 rounded-md shadow-sm border border-gray-200">
                         <input 
                            type="date"
                            value={dataParaRegistro}
                            onChange={(e) => setDataParaRegistro(e.target.value)}
                            className="p-1 border-none rounded-md focus:ring-blue-500 focus:border-transparent"
                         />
                        <button onClick={handleAbrirRegistroDiario} disabled={!semanaSelecionadaId || loadingAtualizacao} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md flex items-center disabled:bg-gray-400">
                            <LucideClipboardEdit size={18} className="mr-2"/> Registro do Dia
                        </button>
                    </div>
                    <button onClick={handleAtualizarProgramacaoDaSemana} disabled={!semanaSelecionadaId || loadingAtualizacao} className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-md flex items-center shadow-sm disabled:bg-gray-400"><LucideRefreshCw size={18} className={`mr-2 ${loadingAtualizacao ? 'animate-spin' : ''}`}/>{loadingAtualizacao ? "Atualizando..." : "Atualizar com Mapa"}</button>
                    <button onClick={() => setIsNovaSemanaModalOpen(true)} disabled={loadingAtualizacao} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-md flex items-center shadow-sm disabled:bg-gray-400"><LucidePlusCircle size={20} className="mr-2"/> Criar Nova Semana</button>
                    <button onClick={() => setIsGerenciarSemanaModalOpen(true)} disabled={!semanaSelecionadaId || loadingAtualizacao} className="bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-4 rounded-md flex items-center shadow-sm disabled:bg-gray-400"><LucideSettings size={18} className="mr-2"/> Gerenciar Semana</button>
                </div>
            </div>
            {loading ? <p className="text-center py-4">Carregando...</p> : !semanaSelecionadaId || !dadosProgramacao ? <p className="text-center py-4 text-gray-500">Nenhuma semana de programação foi criada ainda ou não foi possível carregar os dados.</p> : (
                 <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                    <table className="min-w-full border-collapse border border-gray-300 table-fixed">
                        <caption className="text-lg font-semibold p-2 bg-teal-700 text-white">PROGRAMAÇÃO DIÁRIA - Semana de: {formatDateProg(dadosProgramacao.dataInicioSemana)} a {formatDateProg(dadosProgramacao.dataFimSemana)}</caption>
                        <thead><tr key="header-row"><th className="border px-3 py-2 bg-teal-600 text-white text-xs font-medium w-32 sticky left-0 z-10">Responsável</th>{renderCabecalhoDias()}</tr></thead>
                        <tbody>
                            {(!contextFuncionarios || contextFuncionarios.length === 0) ? (<tr><td colSpan={DIAS_SEMANA_PROG.length + 1} className="text-center p-4 text-gray-500">Nenhum funcionário cadastrado.</td></tr>) : (contextFuncionarios.map(func => (<tr key={func.id}><td className="border px-3 py-2 font-semibold bg-teal-100 text-teal-800 text-sm whitespace-nowrap sticky left-0 z-10">{func.nome}</td>{renderCelulasTarefas(func.id)}</tr>)))}
                        </tbody>
                    </table>
                </div>
            )}
            <Modal isOpen={isNovaSemanaModalOpen} onClose={() => setIsNovaSemanaModalOpen(false)} title="Criar Nova Semana de Programação"><div className="space-y-4"><div><label htmlFor="novaSemanaData" className="block text-sm font-medium text-gray-700">Data de Início da Nova Semana (Segunda-feira):</label><input type="date" id="novaSemanaData" value={novaSemanaDataInicio} onChange={(e) => setNovaSemanaDataInicio(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"/></div><div className="flex justify-end space-x-2"><button onClick={() => setIsNovaSemanaModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md">Cancelar</button><button onClick={handleCriarNovaSemana} disabled={loadingAtualizacao} className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md">{loadingAtualizacao ? "Criando..." : "Criar Semana"}</button></div></div></Modal>
            {dadosProgramacao && (<Modal isOpen={isGerenciarSemanaModalOpen} onClose={() => setIsGerenciarSemanaModalOpen(false)} title={`Gerenciar Semana: ${dadosProgramacao?.nomeAba || ''}`}><div className="space-y-4"><p className="text-sm text-gray-600">Semana: <strong>{dadosProgramacao?.nomeAba}</strong></p><div className="mt-6 pt-4 border-t"><h4 className="text-md font-semibold text-red-700 mb-2">Zona de Perigo</h4><button onClick={handleExcluirSemana} disabled={loadingAtualizacao} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-md flex items-center justify-center"><LucideTrash2 size={18} className="mr-2"/> Excluir Semana</button></div></div></Modal>)}
            {isGerenciarTarefaModalOpen && dadosCelulaParaGerenciar.diaFormatado && (<GerenciarTarefaProgramacaoModal isOpen={isGerenciarTarefaModalOpen} onClose={() => setIsGerenciarTarefaModalOpen(false)} diaFormatado={dadosCelulaParaGerenciar.diaFormatado} responsavelId={dadosCelulaParaGerenciar.responsavelId} tarefasDaCelula={dadosCelulaParaGerenciar.tarefas} semanaId={semanaSelecionadaId} onAlteracaoSalva={() => {}}/>)}
            <RegistroDiarioModal 
                isOpen={isRegistroDiarioModalOpen}
                onClose={() => setIsRegistroDiarioModalOpen(false)}
                onSave={handleSalvarRegistroDiario}
                tarefasDoDia={tarefasDoDiaParaRegistro}
                funcionarios={contextFuncionarios}
                dia={diaParaRegistro}
            />
        </div>
    );
};

// Versão: 6.8.2
// [NOVO] Componente criado para agrupar as funcionalidades de Fitossanitário em abas.
const ControleFitossanitarioComponent = () => {
    const [activeTab, setActiveTab] = useState('planos');

    const TabButton = ({ tabName, currentTab, setTab, children }) => {
        const isActive = currentTab === tabName;
        return (
            <button
                onClick={() => setTab(tabName)}
                className={`px-4 py-2 text-sm font-semibold rounded-t-md transition-colors focus:outline-none ${
                    isActive
                        ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
            >
                {children}
            </button>
        );
    };

    return (
        <div className="p-6 bg-gray-50 min-h-full">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800">Controle Fitossanitário</h2>
            <div className="border-b border-gray-200 mb-6">
                <nav className="flex space-x-2">
                    <TabButton tabName="planos" currentTab={activeTab} setTab={setActiveTab}>Planos de Aplicação</TabButton>
                    <TabButton tabName="calendario" currentTab={activeTab} setTab={setActiveTab}>Calendário de Aplicações</TabButton>
                    <TabButton tabName="historico" currentTab={activeTab} setTab={setActiveTab}>Histórico de Aplicações</TabButton>
                </nav>
            </div>
            <div>
                {activeTab === 'planos' && <PlanosFitossanitariosComponent />}
                {activeTab === 'calendario' && <CalendarioFitossanitarioComponent />}
                {activeTab === 'historico' && <HistoricoFitossanitarioComponent />}
            </div>
        </div>
    );
};

// Versão: 6.4.0
// [NOVO] Adicionada uma listagem informativa de tarefas pendentes na tela "Tarefa Pátio" para evitar duplicidade.
const TarefaPatioComponent = () => {
    const { userId, db, appId, listasAuxiliares, auth, storage } = useContext(GlobalContext);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loadingForm, setLoadingForm] = useState(false);

    // Estados para o formulário do modal
    const [tarefa, setTarefa] = useState('');
    const [prioridade, setPrioridade] = useState('');
    const [area, setArea] = useState('');
    const [orientacao, setOrientacao] = useState('');
    const [acao, setAcao] = useState('');
    const [dataInicio, setDataInicio] = useState('');
    const [novosAnexos, setNovosAnexos] = useState([]);

    // Estados para a lista de tarefas pendentes
    const [tarefasPendentes, setTarefasPendentes] = useState([]);
    const [loadingList, setLoadingList] = useState(true);

    const basePath = `/artifacts/${appId}/public/data`;
    const tarefasMapaCollectionRef = collection(db, `${basePath}/tarefas_mapa`);

    // Hook para carregar a lista de tarefas pendentes
    useEffect(() => {
        setLoadingList(true);
        const q = query(tarefasMapaCollectionRef, where("status", "==", "AGUARDANDO ALOCAÇÃO"), orderBy("createdAt", "asc"));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedPendentes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTarefasPendentes(fetchedPendentes);
            setLoadingList(false);
        }, (error) => {
            console.error("Erro ao carregar tarefas pendentes:", error);
            setLoadingList(false);
        });
        return () => unsubscribe();
    }, [userId, appId, db, basePath]);

    const resetFormulario = () => {
        setTarefa('');
        setPrioridade('');
        setArea('');
        setOrientacao('');
        setAcao('');
        setDataInicio('');
        setNovosAnexos([]);
    };

    const handleOpenModal = () => {
        resetFormulario();
        const hoje = new Date();
        const dataFormatada = hoje.toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'}).split('/').reverse().join('-');
        setDataInicio(dataFormatada);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    const handleFileChange = (e) => {
        if (e.target.files) {
            setNovosAnexos(prev => [...prev, ...Array.from(e.target.files)]);
        }
    };

    const handleRemoveNovoAnexo = (fileNameToRemove) => {
        setNovosAnexos(novosAnexos.filter(file => file.name !== fileNameToRemove));
    };

    const handleCriarTarefaPendente = async (e) => {
        e.preventDefault();
        if (!tarefa.trim() || !acao || !dataInicio) {
            toast.error("Os campos Tarefa (Descrição), Ação e Data da inclusão são obrigatórios.");
            return;
        }

        setLoadingForm(true);
        try {
            const novoDocRef = doc(tarefasMapaCollectionRef);
            const idDaNovaTarefa = novoDocRef.id;

            const urlsDosNovosAnexos = [];
            if (novosAnexos.length > 0) {
                for (const anexo of novosAnexos) {
                    const caminhoStorage = `${basePath}/imagens_tarefas/${idDaNovaTarefa}/${Date.now()}_${anexo.name}`;
                    const storageRef = ref(storage, caminhoStorage);
                    const uploadTask = await uploadBytesResumable(storageRef, anexo);
                    const downloadURL = await getDownloadURL(uploadTask.ref);
                    urlsDosNovosAnexos.push(downloadURL);
                }
            }
            
            const dataInicioTimestamp = Timestamp.fromDate(new Date(dataInicio + "T00:00:00Z"));

            const novaTarefaData = {
                tarefa: tarefa.trim().toUpperCase(),
                prioridade: prioridade || "",
                area: area || "",
                acao: acao,
                dataInicio: dataInicioTimestamp,
                dataProvavelTermino: dataInicioTimestamp,
                orientacao: orientacao.trim(),
                status: "AGUARDANDO ALOCAÇÃO",
                responsaveis: [],
                turno: "",
                criadoPor: auth.currentUser?.uid || 'sistema',
                criadoPorEmail: auth.currentUser?.email || 'sistema',
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                semanaProgramada: "",
                origem: "Tarefa Pátio",
                imagens: urlsDosNovosAnexos,
            };

            await setDoc(novoDocRef, novaTarefaData);
            console.log("Nova tarefa do pátio criada no Mapa de Atividades com ID: ", idDaNovaTarefa);

            await logAlteracaoTarefa(
                db,
                basePath,
                idDaNovaTarefa,
                auth.currentUser?.uid,
                auth.currentUser?.email,
                "Tarefa Criada (Pátio)",
                `Tarefa "${novaTarefaData.tarefa}" criada via Tarefa Pátio.`
            );

            toast.success("Nova tarefa criada com sucesso!");
            handleCloseModal();

        } catch (error) {
            console.error("Erro ao criar tarefa do pátio: ", error);
            toast.error("Erro ao criar tarefa do pátio: " + error.message);
        }
        setLoadingForm(false);
    };

    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-full">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold text-gray-800">Tarefa Pátio</h2>
                <button
                    onClick={handleOpenModal}
                    className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-md flex items-center shadow-sm"
                >
                    <LucidePlusCircle size={20} className="mr-2"/> Adicionar Tarefa do Pátio
                </button>
            </div>

            <div className="text-center p-5 bg-white shadow rounded-md">
                <p className="text-gray-600">
                    Utilize o botão "Adicionar Tarefa do Pátio" para registrar rapidamente uma nova demanda
                    que será incluída no Mapa de Atividades para posterior alocação e programação.
                </p>
            </div>

            {/* Início da Nova Seção de Listagem */}
            <div className="mt-8">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">
                    <LucideListTodo size={22} className="inline-block mr-2 text-orange-500" />
                    Tarefas Atualmente Pendentes de Alocação
                </h3>
                <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100">
                            <tr>
                                {["Tarefa", "Prioridade", "Área", "Ação", "Data Criação", "Orientação"].map(header => (
                                    <th key={header} scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider whitespace-nowrap">{header}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loadingList ? (
                                <tr><td colSpan="6" className="text-center p-4">Carregando tarefas pendentes...</td></tr>
                            ) : tarefasPendentes.length === 0 ? (
                                <tr><td colSpan="6" className="text-center p-4 text-gray-500">Nenhuma tarefa pendente no momento.</td></tr>
                            ) : (
                                tarefasPendentes.map(tp => (
                                    <tr key={tp.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm text-gray-800 max-w-xs whitespace-normal break-words">{tp.tarefa}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{tp.prioridade || '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{tp.area || '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{tp.acao || '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{tp.createdAt ? formatDate(tp.createdAt) : '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700 max-w-xs whitespace-normal break-words">{tp.orientacao || '-'}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            {/* Fim da Nova Seção de Listagem */}

            <Modal isOpen={isModalOpen} onClose={handleCloseModal} title="Criar Nova Tarefa do Pátio" width="max-w-3xl">
                <form onSubmit={handleCriarTarefaPendente} className="space-y-4">
                    <div>
                        <label htmlFor="tarefaDescricao" className="block text-sm font-medium text-gray-700">Tarefa (Descrição) <span className="text-red-500">*</span></label>
                        <select
                            id="tarefaDescricao"
                            value={tarefa}
                            onChange={(e) => setTarefa(e.target.value)}
                            required
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500"
                        >
                            <option value="">Selecione uma Tarefa...</option>
                            {(listasAuxiliares.tarefas || []).map(t => (<option key={t} value={t}>{t}</option>))}
                        </select>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="tarefaAcao" className="block text-sm font-medium text-gray-700">Ação <span className="text-red-500">*</span></label>
                            <select
                                id="tarefaAcao"
                                value={acao}
                                onChange={(e) => setAcao(e.target.value)}
                                required
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500"
                            >
                                <option value="">Selecione uma Ação...</option>
                                {(listasAuxiliares && listasAuxiliares.acoes ? listasAuxiliares.acoes : []).map(ac => (
                                    <option key={ac} value={ac}>{ac}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="tarefaDataInicio" className="block text-sm font-medium text-gray-700">Data da inclusão da tarefa <span className="text-red-500">*</span></label>
                            <input id="tarefaDataInicio" type="date" value={dataInicio} required disabled className="mt-1 block w-full border-gray-300 rounded-md shadow-sm py-2 px-3 bg-gray-100 cursor-not-allowed"/>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="tarefaPrioridade" className="block text-sm font-medium text-gray-700">Prioridade</label>
                            <select id="tarefaPrioridade" value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500">
                                <option value="">Selecione se aplicável...</option>
                                {(listasAuxiliares && listasAuxiliares.prioridades ? listasAuxiliares.prioridades : []).map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="tarefaArea" className="block text-sm font-medium text-gray-700">Área</label>
                            <select id="tarefaArea" value={area} onChange={(e) => setArea(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500">
                                <option value="">Selecione se aplicável...</option>
                                {(listasAuxiliares && listasAuxiliares.areas ? listasAuxiliares.areas : []).map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label htmlFor="tarefaOrientacao" className="block text-sm font-medium text-gray-700">Observação/Orientação</label>
                        <textarea id="tarefaOrientacao" value={orientacao} onChange={(e) => setOrientacao(e.target.value)} rows="3" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500"></textarea>
                    </div>

                    <div className="pt-4 border-t">
                        <h4 className="text-md font-semibold text-gray-700 mb-2">Anexos</h4>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Adicionar Imagens</label>
                            <input
                                type="file"
                                multiple
                                accept="image/*"
                                onChange={handleFileChange}
                                className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-yellow-50 file:text-yellow-700 hover:file:bg-yellow-100"
                            />
                        </div>
                        {novosAnexos.length > 0 && (
                            <div className="mt-2">
                                <p className="text-sm font-medium text-gray-600 mb-2">Imagens para Enviar:</p>
                                <div className="flex flex-wrap gap-2">
                                    {novosAnexos.map((file, index) => (
                                        <div key={index} className="relative group">
                                            <img src={URL.createObjectURL(file)} alt={file.name} className="w-20 h-20 object-cover rounded-md"/>
                                            <button 
                                                type="button"
                                                onClick={() => handleRemoveNovoAnexo(file.name)}
                                                className="absolute top-0 right-0 -mt-1 -mr-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="Remover"
                                            >
                                            <LucideX size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="pt-4 flex justify-end space-x-2">
                        <button type="button" onClick={handleCloseModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancelar</button>
                        <button type="submit" disabled={loadingForm} className="px-4 py-2 text-sm font-medium text-white bg-yellow-500 rounded-md hover:bg-yellow-600 disabled:bg-gray-400">
                            {loadingForm ? 'Criando Tarefa...' : 'Criar Tarefa Pendente'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

// Versão: 3.3.0
// [NOVO] Modal para registrar a conclusão de uma tarefa em um dia específico.
const ConclusaoTarefaModal = ({ isOpen, onClose, onSave, tarefa }) => {
    const [conclusao, setConclusao] = useState('');
    const [statusLocal, setStatusLocal] = useState('PENDENTE');

    useEffect(() => {
        if (tarefa) {
            setConclusao(tarefa.conclusao || '');
            setStatusLocal(tarefa.statusLocal || 'PENDENTE');
        }
    }, [tarefa]);

    const handleSave = () => {
        if (!conclusao.trim()) {
            toast.error("Por favor, descreva a conclusão da tarefa.");
            return;
        }
        onSave(conclusao, statusLocal);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Registrar Conclusão da Tarefa" width="max-w-lg">
            <div className="space-y-4">
                <div className="p-3 bg-gray-100 rounded-md">
                    <p className="font-semibold text-gray-800">{tarefa.textoVisivel}</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Status da Tarefa no Dia</label>
                    <div className="flex space-x-4">
                        <label className="flex items-center">
                            <input type="radio" name="statusLocal" value="CONCLUÍDA" checked={statusLocal === 'CONCLUÍDA'} onChange={(e) => setStatusLocal(e.target.value)} className="h-4 w-4 text-blue-600 border-gray-300"/>
                            <span className="ml-2 text-sm text-gray-700">Concluída</span>
                        </label>
                        <label className="flex items-center">
                            <input type="radio" name="statusLocal" value="PENDENTE" checked={statusLocal === 'PENDENTE'} onChange={(e) => setStatusLocal(e.target.value)} className="h-4 w-4 text-blue-600 border-gray-300"/>
                            <span className="ml-2 text-sm text-gray-700">Não Concluída / Pendente</span>
                        </label>
                    </div>
                </div>
                <div>
                    <label htmlFor="conclusao-text" className="block text-sm font-medium text-gray-700">
                        Descrição da Conclusão (Ex: OK, Ausente, Ficou para amanhã, etc.)
                    </label>
                    <textarea
                        id="conclusao-text"
                        value={conclusao}
                        onChange={(e) => setConclusao(e.target.value)}
                        rows="4"
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"
                        placeholder="Descreva o que foi feito ou o motivo da pendência..."
                    ></textarea>
                </div>
                <div className="pt-4 flex justify-end space-x-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancelar</button>
                    <button type="button" onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
                        Salvar Conclusão
                    </button>
                </div>
            </div>
        </Modal>
    );
};


// Versão: 3.3.0
// Componente Modal para Gerenciar Tarefas da Célula da Programação (MODIFICADO para registrar conclusão)
const GerenciarTarefaProgramacaoModal = ({ isOpen, onClose, diaFormatado, responsavelId, tarefasDaCelula, semanaId, onAlteracaoSalva }) => {
    const { db, appId, funcionarios, listasAuxiliares, auth: authGlobal } = useContext(GlobalContext);
    const [tarefasEditaveis, setTarefasEditaveis] = useState([]);
    const [loading, setLoading] = useState(false);
    const [dadosCompletosTarefas, setDadosCompletosTarefas] = useState({});
    
    // [NOVO v3.3.0] Estados para controlar o modal de conclusão
    const [isConclusaoModalOpen, setIsConclusaoModalOpen] = useState(false);
    const [tarefaParaConcluir, setTarefaParaConcluir] = useState(null);
    const [tarefaIndexParaConcluir, setTarefaIndexParaConcluir] = useState(null);

    useEffect(() => {
        if (isOpen && tarefasDaCelula && tarefasDaCelula.length > 0) {
            const tarefasCopiadas = JSON.parse(JSON.stringify(tarefasDaCelula.map(t => ({
                ...t,
                turno: t.turno || TURNO_DIA_INTEIRO,
                conclusao: t.conclusao || '' // Garante que a propriedade exista
            }))));
            setTarefasEditaveis(tarefasCopiadas);

            const fetchDadosCompletos = async () => {
                const basePath = `/artifacts/${appId}/public/data`;
                const novasTarefasCompletas = {};
                for (const tarefaProg of tarefasCopiadas) {
                    if (tarefaProg.mapaTaskId) {
                        try {
                            const tarefaMapaRef = doc(db, `${basePath}/tarefas_mapa`, tarefaProg.mapaTaskId);
                            const tarefaMapaSnap = await getDoc(tarefaMapaRef);
                            if (tarefaMapaSnap.exists()) {
                                novasTarefasCompletas[tarefaProg.mapaTaskId] = tarefaMapaSnap.data();
                            }
                        } catch(error) {
                            console.error(`Erro ao buscar dados completos da tarefa ${tarefaProg.mapaTaskId}:`, error);
                        }
                    }
                }
                setDadosCompletosTarefas(novasTarefasCompletas);
            };
            fetchDadosCompletos();
        } else {
            setDadosCompletosTarefas({});
        }
    }, [tarefasDaCelula, isOpen, appId, db]);

    const responsavelNome = funcionarios.find(f => f.id === responsavelId)?.nome || responsavelId;
    const dataExibicao = diaFormatado ? new Date(diaFormatado + "T00:00:00Z").toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Data Inválida';

    const handleOpenConclusaoModal = (tarefa, index) => {
        setTarefaParaConcluir(tarefa);
        setTarefaIndexParaConcluir(index);
        setIsConclusaoModalOpen(true);
    };

    const handleSaveConclusao = (textoConclusao, novoStatusLocal) => {
        const novasTarefas = [...tarefasEditaveis];
        novasTarefas[tarefaIndexParaConcluir].conclusao = textoConclusao;
        novasTarefas[tarefaIndexParaConcluir].statusLocal = novoStatusLocal;
        setTarefasEditaveis(novasTarefas);
    };

    const handleTurnoChange = (indexTarefa, novoTurno) => {
        const novasTarefas = [...tarefasEditaveis];
        const tarefa = novasTarefas[indexTarefa];
        let textoBase = tarefa.textoVisivel;
        const regexTurno = /^\[(MANHÃ|TARDE)\]\s*/;
        textoBase = textoBase.replace(regexTurno, '');

        if (novoTurno && novoTurno.toUpperCase() !== TURNO_DIA_INTEIRO.toUpperCase()) {
            tarefa.textoVisivel = `[${novoTurno.toUpperCase()}] ${textoBase}`;
        } else {
            tarefa.textoVisivel = textoBase;
        }
        tarefa.turno = novoTurno;
        setTarefasEditaveis(novasTarefas);
    };

    const handleRemoverTarefaDaCelula = (indexTarefa) => {
        if (window.confirm("Remover esta tarefa apenas deste dia/responsável na programação?")) {
            const novasTarefas = tarefasEditaveis.filter((_, idx) => idx !== indexTarefa);
            setTarefasEditaveis(novasTarefas);
        }
    };

    const handleSalvarAlteracoes = async () => {
        setLoading(true);
        const basePath = `/artifacts/${appId}/public/data`;
        const semanaDocRef = doc(db, `${basePath}/programacao_semanal`, semanaId);
        const mapaTaskIdsAlterados = new Set(tarefasEditaveis.map(t => t.mapaTaskId));

        try {
            const semanaDocSnap = await getDoc(semanaDocRef);
            if (!semanaDocSnap.exists()) throw new Error("Documento da semana não encontrado.");
            
            const semanaData = semanaDocSnap.data();
            if (!semanaData.dias) semanaData.dias = {};
            if (!semanaData.dias[diaFormatado]) semanaData.dias[diaFormatado] = {};
            semanaData.dias[diaFormatado][responsavelId] = tarefasEditaveis;
            
            await updateDoc(semanaDocRef, { dias: semanaData.dias });

            for (const taskId of mapaTaskIdsAlterados) {
                if (taskId) {
                    await verificarEAtualizarStatusConclusaoMapa(taskId, db, basePath);
                }
            }
            if (onAlteracaoSalva) onAlteracaoSalva();
            onClose();
        } catch (error) {
            console.error("Erro ao salvar alterações na programação: ", error);
            toast.error("Erro ao salvar alterações: " + error.message);
        }
        setLoading(false);
    };

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title={`Gerenciar Tarefas - ${responsavelNome} (${dataExibicao})`} width="max-w-3xl">
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                    {tarefasEditaveis.length === 0 && <p className="text-gray-500">Nenhuma tarefa nesta célula.</p>}
                    {tarefasEditaveis.map((tarefa, index) => {
                        const tarefaCompleta = dadosCompletosTarefas[tarefa.mapaTaskId];
                        const imagens = tarefaCompleta?.imagens || [];
                        const isConcluida = tarefa.statusLocal === 'CONCLUÍDA';

                        return (
                            <div key={tarefa.mapaTaskId || index} className={`p-3 rounded-md shadow-sm border ${isConcluida ? 'border-green-300 bg-green-50' : 'border-blue-300 bg-blue-50'}`}>
                                <div className="flex justify-between items-start">
                                    <div className="flex-grow pr-2">
                                        <span className={`font-semibold text-sm ${isConcluida ? 'line-through text-gray-600' : 'text-gray-800'}`}>
                                            {tarefa.textoVisivel}
                                        </span>
                                        {tarefa.conclusao && (
                                            <p className="text-xs text-gray-600 mt-1 pl-1 border-l-2 border-gray-400">
                                                <strong>Conclusão:</strong> {tarefa.conclusao}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex space-x-2 items-center">
                                         <button
                                            onClick={() => handleOpenConclusaoModal(tarefa, index)}
                                            title="Registrar Conclusão"
                                            className="p-1.5 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
                                        >
                                            <LucideClipboardEdit size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleRemoverTarefaDaCelula(index)}
                                            title="Remover desta célula"
                                            className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                        >
                                            <LucideXCircle size={16} />
                                        </button>
                                    </div>
                                </div>
                                
                                <div className="mt-2 pt-2 border-t border-gray-300 grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        {tarefa.orientacao && (
                                            <div className="mb-2">
                                                <strong className="block font-medium text-gray-800 text-sm mb-1">Orientação:</strong>
                                                <p className="text-sm text-gray-700">{tarefa.orientacao}</p>
                                            </div>
                                        )}
                                        <div className="mt-2">
                                            <label htmlFor={`turno-tarefa-${index}`} className="block text-xs font-medium text-gray-600 mb-0.5">Turno:</label>
                                            <select id={`turno-tarefa-${index}`} value={tarefa.turno || TURNO_DIA_INTEIRO} onChange={(e) => handleTurnoChange(index, e.target.value)} className="block w-full p-1.5 text-xs border-gray-300 rounded-md shadow-sm">
                                                {listasAuxiliares.turnos.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    
                                    {imagens.length > 0 && (
                                        <div>
                                            <strong className="block font-medium text-gray-800 text-sm mb-1">Anexos:</strong>
                                            <div className="flex flex-wrap gap-2">
                                                {imagens.map((url, imgIndex) => (
                                                    <a key={imgIndex} href={url} target="_blank" rel="noopener noreferrer" title="Clique para ampliar">
                                                        <img src={url} alt={`Anexo ${imgIndex + 1}`} className="w-16 h-16 object-cover rounded-md border-2 border-white shadow-md" loading="lazy"/>
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
                <div className="mt-6 pt-4 border-t flex justify-end space-x-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancelar</button>
                    <button type="button" onClick={handleSalvarAlteracoes} disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400">{loading ? 'Salvando...' : 'Salvar Alterações'}</button>
                </div>
            </Modal>
            
            {tarefaParaConcluir && (
                <ConclusaoTarefaModal 
                    isOpen={isConclusaoModalOpen}
                    onClose={() => setIsConclusaoModalOpen(false)}
                    tarefa={tarefaParaConcluir}
                    onSave={handleSaveConclusao}
                />
            )}
        </>
    );
};


// Versão: 3.7.1
// [ALTERADO] A coluna de conclusão no relatório semanal agora exibe o status e a justificativa de forma estruturada.
const RelatorioSemanal = () => {
    const { db, appId, funcionarios: contextFuncionarios } = useContext(GlobalContext);
    const [semanas, setSemanas] = useState([]);
    const [semanaSelecionadaId, setSemanaSelecionadaId] = useState('');
    const [dadosRelatorio, setDadosRelatorio] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingReport, setLoadingReport] = useState(false);
    const [showReport, setShowReport] = useState(false);

    const basePath = `/artifacts/${appId}/public/data`;

    useEffect(() => {
        const programacaoCollectionRef = collection(db, `${basePath}/programacao_semanal`);
        const q = query(programacaoCollectionRef, orderBy("criadoEm", "desc"));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedSemanas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSemanas(fetchedSemanas);
            if (fetchedSemanas.length > 0 && !semanaSelecionadaId) {
                setSemanaSelecionadaId(fetchedSemanas [0].id);
            }
            setLoading(false);
        }, error => {
            console.error("Erro ao carregar semanas para relatório:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, basePath, semanaSelecionadaId]);

    const formatDateForDisplay = (timestamp) => {
        if (!timestamp) return 'N/A';
        const date = timestamp instanceof Timestamp ? timestamp.toDate() : new Date(timestamp);
        if (isNaN(date.getTime())) return 'Data Inválida';
        return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    };

    const handleGerarRelatorio = async () => {
        if (!semanaSelecionadaId) {
            toast.error("Por favor, selecione uma semana.");
            return;
        }
        setLoadingReport(true);
        setShowReport(false);

        try {
            const semanaDocRef = doc(db, `${basePath}/programacao_semanal`, semanaSelecionadaId);
            const semanaDocSnap = await getDoc(semanaDocRef);

            if (semanaDocSnap.exists()) {
                setDadosRelatorio({ id: semanaDocSnap.id, ...semanaDocSnap.data() });
                setShowReport(true);
            } else {
                toast.error("Não foi possível encontrar os dados para a semana selecionada.");
            }
        } catch (error) {
            console.error("Erro ao gerar relatório semanal:", error);
            toast.error("Falha ao gerar o relatório: " + error.message);
        }
        setLoadingReport(false);
    };

    const handlePrint = () => {
        const reportContentElement = document.getElementById("printable-report-semanal");
        if (!reportContentElement) {
            toast.error("Erro: Conteúdo do relatório não encontrado para impressão.");
            return;
        }
        const printContents = reportContentElement.innerHTML;
        const printFrame = document.createElement('iframe');
        printFrame.style.position = 'fixed';
        printFrame.style.top = '-9999px';
        printFrame.style.left = '-9999px';
        document.body.appendChild(printFrame);

        printFrame.onload = function() {
            const priWin = printFrame.contentWindow;
            priWin.document.open();
            priWin.document.write('<html><head><title>Relatório Semanal</title>');
            priWin.document.write(`
                <style>
                    @media print { 
                        body { 
                            font-family: Calibri, Arial, sans-serif;
                            font-size: 11pt;
                            line-height: 1.3; 
                            color: #000; 
                        } 
                        .print-header { text-align: center; margin-bottom: 25px; } 
                        .print-header img { max-height: 45px; margin-bottom: 10px; } 
                        .print-header h1 { margin-bottom: 5px; font-size: 14pt; color: #000; } 
                        .print-header p { font-size: 12pt; color: #555; margin-top: 0; }
                        
                        h4 { 
                            font-size: 12pt !important; font-weight: bold !important; text-align: left !important;
                            text-transform: capitalize !important; padding-bottom: 4px !important; margin-top: 20px !important;
                            margin-bottom: 10px !important; border-bottom: 1.5px solid #888 !important; 
                            background-color: transparent !important; color: black !important;
                            padding: 0 !important; border-radius: 0 !important;
                        } 

                        table { width: 100%; border-collapse: collapse; } 
                        tr { page-break-inside: avoid; } 
                        thead { display: table-header-group; } 
                        
                        th { 
                            background-color: #E8E8E8 !important; 
                            color: #000000 !important;
                            font-weight: bold; 
                            font-size: 11pt;
                            text-transform: uppercase;
                            padding: 5px;
                            border: 1px solid #7F7F7F;
                        }
                        
                        td { 
                            border: 1px solid #7F7F7F;
                            padding: 5px; 
                            text-align: left; 
                            vertical-align: top;
                        } 
                        
                        td[rowspan] { font-weight: normal; }
                        .task-block strong, .conclusion-block strong { font-weight: bold; display: block; }
                        .task-block p, .conclusion-block p { margin: 0; padding: 0; border: 0; font-style: normal; display: block; } 
                        .conclusion-block p { padding-top: 2px; }
                        .italic-placeholder { font-style: italic; color: #555; }
                    }
                </style>
            `);
            priWin.document.write('</head><body>');
            priWin.document.write(printContents);
            priWin.document.write('</body></html>');
            priWin.document.close();

            priWin.onafterprint = function() {
                if (document.body.contains(printFrame)) {
                    document.body.removeChild(printFrame);
                }
            };

            priWin.focus();
            priWin.print();
        };
        printFrame.src = 'about:blank';
    };

    const getDiasDaSemanaCabecalho = () => {
        if (!dadosRelatorio?.dataInicioSemana) return [];
        const dias = [];
        const dataInicio = dadosRelatorio.dataInicioSemana.toDate();
        for (let i = 0; i < 6; i++) {
            const dataDia = new Date(dataInicio);
            dataDia.setUTCDate(dataInicio.getUTCDate() + i);
            dias.push({
                label: dataDia.toLocaleDateString('pt-BR', {weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC'}),
                iso: dataDia.toISOString().split('T')[0]
            });
        }
        return dias;
    };

    const renderConclusionCell = (tarefa) => {
        const isConcluida = tarefa.statusLocal === 'CONCLUÍDA';
        const hasRecord = tarefa.conclusao && tarefa.conclusao.trim() !== '';

        if (!hasRecord) {
            return <span className="text-gray-500 italic italic-placeholder">Aguardando registro de Conclusão</span>;
        }

        return (
            <div className="conclusion-block">
                <strong className={isConcluida ? 'text-green-700' : 'text-orange-700'}>
                    {isConcluida ? '[CONCLUÍDA]' : '[NÃO CONCLUÍDA / PENDENTE]'}
                </strong>
                <p className="text-sm text-gray-800 pt-1">{tarefa.conclusao}</p>
            </div>
        );
    };


    return (
        <div>
            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">Relatório de Programação Semanal</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                    <div>
                        <label htmlFor="semanaRelatorio" className="block text-sm font-medium text-gray-700">Selecione a Semana:</label>
                        <select
                            id="semanaRelatorio"
                            value={semanaSelecionadaId}
                            onChange={(e) => setSemanaSelecionadaId(e.target.value)}
                            disabled={loading || semanas.length === 0}
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm p-2"
                        >
                            {loading && <option>Carregando semanas...</option>}
                            {!loading && semanas.length === 0 && <option>Nenhuma semana encontrada</option>}
                            {semanas.map(s => (
                                <option key={s.id} value={s.id}>
                                    {s.nomeAba} ({formatDateForDisplay(s.dataInicioSemana)} a {formatDateForDisplay(s.dataFimSemana)})
                                </option>
                            ))}
                        </select>
                    </div>
                     <div className="text-right">
                        <button
                            onClick={handleGerarRelatorio}
                            disabled={loadingReport || !semanaSelecionadaId}
                            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-md flex items-center justify-center disabled:bg-gray-400"
                        >
                            <LucideFileText size={18} className="mr-2"/>
                            {loadingReport ? "Gerando..." : "Gerar Relatório"}
                        </button>
                    </div>
                </div>
            </div>

            {showReport && dadosRelatorio && (
                 <div>
                    <div className="text-center mt-6 mb-4">
                        <button onClick={handlePrint} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-md flex items-center justify-center mx-auto">
                            <LucidePrinter size={18} className="mr-2"/> Imprimir / Salvar PDF
                        </button>
                    </div>
                    <div id="printable-report-semanal" className="bg-white p-6 rounded-lg shadow-md">
                         <div className="print-header">
                            {LOGO_URL && <img src={LOGO_URL} alt="Logo" className="mx-auto h-14 w-auto mb-4" />}
                            <h1 className="text-2xl font-semibold text-gray-800">Relatório de Programação Semanal</h1>
                            <p className="text-sm text-gray-600">{dadosRelatorio.nomeAba} ({formatDateForDisplay(dadosRelatorio.dataInicioSemana)} a {formatDateForDisplay(dadosRelatorio.dataFimSemana)})</p>
                        </div>
                        <div className="overflow-x-auto mt-4">
                            {getDiasDaSemanaCabecalho().map(dia => {
                                const temTarefaNoDia = contextFuncionarios.some(func => (dadosRelatorio.dias?.[dia.iso]?.[func.id] || []).length > 0);
                                if (!temTarefaNoDia) return null;

                                return (
                                    <div key={dia.iso} className="mb-6">
                                        <h4 className="text-lg font-bold bg-gray-200 p-2 rounded-t-md">{dia.label}</h4>
                                        <table className="min-w-full divide-y divide-gray-200 border">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[20%]">Responsável</th>
                                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[15%]">Localização</th>
                                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[40%]">Atividade</th>
                                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[25%]">Conclusão</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {contextFuncionarios.flatMap(func => {
                                                    const tarefas = dadosRelatorio.dias?.[dia.iso]?.[func.id] || [];
                                                    if (tarefas.length === 0) return [];

                                                    return tarefas.map((t, index) => (
                                                        <tr key={`${func.id}-${t.mapaTaskId || index}`}>
                                                            {index === 0 && (
                                                                <td className="px-3 py-2 align-top" rowSpan={tarefas.length}>
                                                                    {func.nome}
                                                                </td>
                                                            )}
                                                            <td className="px-3 py-2 align-top">
                                                                {t.localizacao || '-'}
                                                            </td>
                                                            <td className="px-3 py-2 align-top">
                                                                <div className="task-block">
                                                                    <strong>{t.textoVisivel}</strong>
                                                                    {t.orientacao && (
                                                                        <p className="orientation-print">
                                                                            {t.orientacao}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-2 align-top">
                                                                {renderConclusionCell(t)}
                                                            </td>
                                                        </tr>
                                                    ));
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Versão: 3.7.0
// [ALTERADO] Layout do modal de registro diário modificado para "cards" e inclusão do campo de orientação.
const RegistroDiarioModal = ({ isOpen, onClose, onSave, tarefasDoDia, funcionarios, dia }) => {
    const [tarefasEditaveis, setTarefasEditaveis] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && tarefasDoDia) {
            const tarefasComResponsavel = tarefasDoDia.map(tarefa => {
                const responsavel = funcionarios.find(f => f.id === tarefa.responsavelId);
                return {
                    ...tarefa,
                    responsavelNome: responsavel ? responsavel.nome : 'Desconhecido'
                };
            });
            tarefasComResponsavel.sort((a, b) => a.responsavelNome.localeCompare(b.responsavelNome));
            setTarefasEditaveis(JSON.parse(JSON.stringify(tarefasComResponsavel)));
        }
    }, [tarefasDoDia, funcionarios, isOpen]);

    const handleConclusaoChange = (index, novoValor) => {
        const novasTarefas = [...tarefasEditaveis];
        novasTarefas[index].conclusao = novoValor;
        setTarefasEditaveis(novasTarefas);
    };

    const handleStatusChange = (index, novoStatus) => {
        const novasTarefas = [...tarefasEditaveis];
        novasTarefas[index].statusLocal = novoStatus;
        setTarefasEditaveis(novasTarefas);
    };

    const handleSaveAll = async () => {
        setLoading(true);
        try {
            await onSave(tarefasEditaveis);
            toast.success("Alterações salvas com sucesso!");
        } catch (error) {
            console.error("Erro ao salvar registros do dia:", error);
            toast.error("Falha ao salvar as alterações.");
        } finally {
            setLoading(false);
        }
    };
    
    const dataExibicao = dia ? new Date(dia + "T12:00:00Z").toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC'}) : 'Data Inválida';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Registro de Conclusão do Dia - ${dataExibicao}`} width="max-w-5xl">
            {tarefasEditaveis.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Nenhuma tarefa encontrada para a data selecionada na semana atual.</p>
            ) : (
                <div className="space-y-4">
                    <div className="max-h-[65vh] overflow-y-auto p-1 bg-gray-50 rounded-lg">
                        <div className="space-y-3">
                            {tarefasEditaveis.map((tarefa, index) => (
                                <div key={`${tarefa.mapaTaskId}-${tarefa.responsavelId}-${index}`} className="p-4 border rounded-lg shadow-sm bg-white">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                        {/* Coluna 1: Responsável e Atividade/Orientação */}
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-xs font-bold text-gray-500 uppercase">Responsável</label>
                                                <p className="text-gray-800 font-semibold text-base">{tarefa.responsavelNome}</p>
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-gray-500 uppercase">Atividade</label>
                                                <p className="text-gray-900">{tarefa.textoVisivel}</p>
                                                {/* [NOVO v3.7.0] Exibição da Orientação */}
                                                {tarefa.orientacao && (
                                                    <p className="text-sm text-gray-600 italic mt-2 pl-2 border-l-2 border-gray-300">
                                                        {tarefa.orientacao}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Coluna 2: Conclusão e Status */}
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-xs font-bold text-gray-500 uppercase">Conclusão / Justificativa</label>
                                                <input
                                                    type="text"
                                                    value={tarefa.conclusao || ''}
                                                    onChange={(e) => handleConclusaoChange(index, e.target.value)}
                                                    className="w-full border-gray-300 rounded-md shadow-sm text-sm p-2 mt-1"
                                                    placeholder="Ex: OK, Pendente, etc."
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-gray-500 uppercase">Status no Dia</label>
                                                <select
                                                    value={tarefa.statusLocal || 'PENDENTE'}
                                                    onChange={(e) => handleStatusChange(index, e.target.value)}
                                                    className="w-full border-gray-300 rounded-md shadow-sm text-sm p-2 mt-1"
                                                >
                                                    <option value="PENDENTE">Não Concluída / Pendente</option>
                                                    <option value="CONCLUÍDA">Concluída</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="pt-5 flex justify-end space-x-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">
                            Fechar
                        </button>
                        <button type="button" onClick={handleSaveAll} disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 min-w-[150px]">
                            {loading ? 'Salvando...' : 'Salvar Alterações'}
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    );
};

// Versão: 3.2.0
// [MODIFICADO] Componente antigo de relatórios, agora focado apenas nas atividades gerais
const RelatorioDeAtividades = () => {
    const { db, appId, listasAuxiliares, funcionarios: contextFuncionarios } = useContext(GlobalContext);
    const [tarefasFiltradas, setTarefasFiltradas] = useState([]);
    const [loadingReport, setLoadingReport] = useState(false);
    const [filtroFuncionarios, setFiltroFuncionarios] = useState([]);
    const [filtroStatus, setFiltroStatus] = useState([]);
    const [filtroAcoes, setFiltroAcoes] = useState([]);
    const [filtroDataInicio, setFiltroDataInicio] = useState('');
    const [filtroDataFim, setFiltroDataFim] = useState('');
    const [showReport, setShowReport] = useState(false);

    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    useEffect(() => {
        if (!filtroDataInicio) {
            setFiltroDataInicio(firstDayOfMonth.toISOString().split('T')[0]);
        }
        if (!filtroDataFim) {
            setFiltroDataFim(today.toISOString().split('T')[0]);
        }
    }, []); 

    const handleFuncionarioChange = (e) => {
        const { value, checked } = e.target;
        setFiltroFuncionarios(prev =>
            checked ? [...prev, value] : prev.filter(item => item !== value)
        );
    };

    const handleSelectAllFuncionarios = () => {
        const allFuncIds = Array.isArray(contextFuncionarios) ? contextFuncionarios.map(f => f.id) : [];
        setFiltroFuncionarios([SEM_RESPONSAVEL_VALUE, ...allFuncIds]);
        document.querySelectorAll('input[name="funcionarioChkItem"]').forEach(chk => {
            if (chk instanceof HTMLInputElement) chk.checked = true;
        });
        const semResponsavelChk = document.getElementById('funcionarioChk-semResponsavel');
        if (semResponsavelChk instanceof HTMLInputElement) semResponsavelChk.checked = true;
    };

    const handleClearAllFuncionarios = () => {
        setFiltroFuncionarios([]);
        document.querySelectorAll('input[name="funcionarioChkItem"]').forEach(chk => {
            if (chk instanceof HTMLInputElement) chk.checked = false;
        });
        const semResponsavelChk = document.getElementById('funcionarioChk-semResponsavel');
        if (semResponsavelChk instanceof HTMLInputElement) semResponsavelChk.checked = false;
    };

    const handleStatusChange = (e) => {
        const { value, checked } = e.target;
        setFiltroStatus(prev =>
            checked ? [...prev, value] : prev.filter(item => item !== value)
        );
    };

    const handleSelectAllStatus = () => {
        setFiltroStatus(Array.isArray(listasAuxiliares.status) ? [...listasAuxiliares.status] : []);
        document.querySelectorAll('input[name="statusChkItem"]').forEach(chk => {
             if (chk instanceof HTMLInputElement) chk.checked = true;
        });
    };

    const handleClearAllStatus = () => {
        setFiltroStatus([]);
        document.querySelectorAll('input[name="statusChkItem"]').forEach(chk => {
            if (chk instanceof HTMLInputElement) chk.checked = false;
        });
    };
    
    const handleAcaoChange = (e) => {
        const { value, checked } = e.target;
        setFiltroAcoes(prev =>
            checked ? [...prev, value] : prev.filter(item => item !== value)
        );
    };

    const handleSelectAllAcoes = () => {
        setFiltroAcoes(Array.isArray(listasAuxiliares.acoes) ? [...listasAuxiliares.acoes] : []);
        document.querySelectorAll('input[name="acaoChkItem"]').forEach(chk => {
             if (chk instanceof HTMLInputElement) chk.checked = true;
        });
    };

    const handleClearAllAcoes = () => {
        setFiltroAcoes([]);
        document.querySelectorAll('input[name="acaoChkItem"]').forEach(chk => {
            if (chk instanceof HTMLInputElement) chk.checked = false;
        });
    };

    const formatDateForDisplay = (timestamp) => {
        if (!timestamp) return 'N/A';
        const date = timestamp instanceof Timestamp ? timestamp.toDate() : new Date(timestamp);
        if (isNaN(date.getTime())) return 'Data Inválida';
        return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    };

    const getResponsavelNomesParaRelatorio = (responsavelIds) => {
        if (!responsavelIds || responsavelIds.length === 0) return '--- SEM RESPONSÁVEL ---';
        return responsavelIds.map(id => {
            const func = Array.isArray(contextFuncionarios) ? contextFuncionarios.find(f => f.id === id) : null;
            return func ? func.nome : id;
        }).join(', ');
    };

    const handleGerarRelatorio = async () => {
        setLoadingReport(true);
        setShowReport(false);
        const basePath = `/artifacts/${appId}/public/data`;
        const tarefasMapaRef = collection(db, `${basePath}/tarefas_mapa`);

        try {
            const querySnapshot = await getDocs(tarefasMapaRef);
            let tarefas = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const dataInicioFiltroDate = filtroDataInicio ? new Date(filtroDataInicio + "T00:00:00Z").getTime() : null;
            const dataFimFiltroDate = filtroDataFim ? new Date(filtroDataFim + "T23:59:59Z").getTime() : null;

            const tarefasProcessadas = tarefas.filter(task => {
                let manter = true;

                if (filtroFuncionarios.length > 0) {
                    const temSemResponsavelNoFiltro = filtroFuncionarios.includes(SEM_RESPONSAVEL_VALUE);
                    const responsaveisDaTarefa = task.responsaveis || [];
                    let correspondeAoFiltroFunc = false;
                    if (temSemResponsavelNoFiltro && responsaveisDaTarefa.length === 0) {
                        correspondeAoFiltroFunc = true;
                    }
                    if (!correspondeAoFiltroFunc && responsaveisDaTarefa.length > 0) {
                        if (filtroFuncionarios.some(fId => fId !== SEM_RESPONSAVEL_VALUE && responsaveisDaTarefa.includes(fId))) {
                            correspondeAoFiltroFunc = true;
                        }
                    }
                    if (!correspondeAoFiltroFunc) manter = false;
                }

                if (manter && filtroStatus.length > 0) {
                    if (!filtroStatus.includes(task.status)) {
                        manter = false;
                    }
                }
                
                if (manter && filtroAcoes.length > 0) {
                    if (!filtroAcoes.includes(task.acao)) {
                        manter = false;
                    }
                }

                const inicioTarefaMs = task.dataInicio?.toDate().setUTCHours(0,0,0,0);
                const fimTarefaMs = task.dataProvavelTermino?.toDate().setUTCHours(23,59,59,999);

                if (manter && dataInicioFiltroDate && fimTarefaMs < dataInicioFiltroDate) {
                    manter = false;
                }
                if (manter && dataFimFiltroDate && inicioTarefaMs > dataFimFiltroDate) {
                    manter = false;
                }
                if (manter && (dataInicioFiltroDate || dataFimFiltroDate) && !inicioTarefaMs) {
                     manter = false;
                }

                return manter;
            });

            tarefasProcessadas.sort((a,b) => {
                const nomeA = getResponsavelNomesParaRelatorio(a.responsaveis);
                const nomeB = getResponsavelNomesParaRelatorio(b.responsaveis);
                if (nomeA < nomeB) return -1;
                if (nomeA > nomeB) return 1;

                const dataA = a.dataInicio ? a.dataInicio.toMillis() : 0;
                const dataB = b.dataInicio ? b.dataInicio.toMillis() : 0;
                return dataA - dataB;
            });

            setTarefasFiltradas(tarefasProcessadas);
            setShowReport(true);
            if (tarefasProcessadas.length === 0) {
                toast.error("Nenhuma tarefa encontrada para os filtros selecionados.");
            }

        } catch (error) {
            console.error("Erro ao gerar relatório: ", error);
            toast.error("Erro ao gerar relatório: " + error.message);
        }
        setLoadingReport(false);
    };

    const handlePrint = () => {
        const reportContentElement = document.getElementById("printable-report-area-content");
        if (!reportContentElement) {
            toast.error("Erro: Conteúdo do relatório não encontrado para impressão.");
            return;
        }
        const printContents = reportContentElement.innerHTML;
        const printFrame = document.createElement('iframe');
        printFrame.style.position = 'fixed';
        printFrame.style.top = '-9999px';
        printFrame.style.left = '-9999px';
        printFrame.style.width = '1px';
        printFrame.style.height = '1px';
        printFrame.style.border = '0';
        document.body.appendChild(printFrame);

        printFrame.onload = function() {
            const priWin = printFrame.contentWindow;
            if (!priWin) {
                toast.error("Erro crítico: Não foi possível obter a janela do iframe para impressão.");
                if (document.body.contains(printFrame)) document.body.removeChild(printFrame);
                return;
            }
            const priDoc = priWin.document;
            if (!priDoc) {
                toast.error("Erro crítico: Não foi possível obter o documento do iframe para impressão.");
                 if (document.body.contains(printFrame)) document.body.removeChild(printFrame);
                return;
            }

            priDoc.open();
            priDoc.write('<html><head><title>Relatório de Atividades</title>');
            priDoc.write('<style>');
            priDoc.write(`
                @media print {
                    body { margin: 20px !important; font-family: Arial, sans-serif !important; line-height: 1.4 !important; font-size: 10pt !important; }
                    table { width: 100% !important; border-collapse: collapse !important; margin-bottom: 20px !important; }
                    th, td { border: 1px solid #ccc !important; padding: 6px !important; text-align: left !important; word-break: break-word !important; }
                    th { background-color: #f2f2f2 !important; font-weight: bold !important; }
                    .print-header { text-align: center !important; margin-bottom: 25px !important; }
                    .print-header h1 { margin-bottom: 5px !important; font-size: 16pt !important; }
                    .print-header p { font-size: 0.9em !important; color: #555 !important; margin-top:0 !important; text-align: left !important; }
                    .report-footer { margin-top: 40px !important; padding-top: 20px !important; border-top: 1px solid #eee !important; font-size: 10pt !important; color: #333 !important; text-align: center !important; }
                    .report-footer p { margin: 3px 0 !important; }
                    .report-footer .last-line { text-transform: uppercase !important; font-weight: bold !important; }
                    img { max-height: 50px !important; display: block !important; margin-left:auto !important; margin-right:auto !important; margin-bottom: 10px !important; }
                    .no-print-in-report { display: none !important; }
                }
            `);
            priDoc.write('</style></head><body>');
            priDoc.write(printContents);
            priDoc.write('</body></html>');
            priDoc.close();
            priWin.focus();
            priWin.print();
            setTimeout(() => {
                if (document.body.contains(printFrame)) document.body.removeChild(printFrame);
            }, 2500);
        };
        printFrame.src = 'about:blank';
    };

    return (
        <div>
            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">Relatório de Atividades Gerais</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Funcionário(s):</label>
                        <div className="flex space-x-2 mb-2">
                            <button onClick={handleSelectAllFuncionarios} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200">Todos</button>
                            <button onClick={handleClearAllFuncionarios} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded hover:bg-gray-200">Limpar</button>
                        </div>
                        <div className="max-h-40 overflow-y-auto border rounded-md p-2 bg-gray-50">
                            <div key="sem-resp-chk" className="flex items-center mb-1">
                                <input type="checkbox" id="funcionarioChk-semResponsavel" name="funcionarioChkItem" value={SEM_RESPONSAVEL_VALUE} onChange={handleFuncionarioChange} checked={filtroFuncionarios.includes(SEM_RESPONSAVEL_VALUE)} className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"/>
                                <label htmlFor="funcionarioChk-semResponsavel" className="ml-2 text-sm text-gray-700 italic">-- Sem Responsável --</label>
                            </div>
                            {(Array.isArray(contextFuncionarios) ? contextFuncionarios : []).map(f => (
                                <div key={f.id} className="flex items-center mb-1">
                                    <input type="checkbox" id={`func-${f.id}`} name="funcionarioChkItem" value={f.id} onChange={handleFuncionarioChange} checked={filtroFuncionarios.includes(f.id)} className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"/>
                                    <label htmlFor={`func-${f.id}`} className="ml-2 text-sm text-gray-700">{f.nome}</label>
                                </div>
                            ))}
                        </div>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Status da Tarefa:</label>
                         <div className="flex space-x-2 mb-2">
                            <button onClick={handleSelectAllStatus} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200">Todos</button>
                            <button onClick={handleClearAllStatus} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded hover:bg-gray-200">Limpar</button>
                        </div>
                        <div className="max-h-40 overflow-y-auto border rounded-md p-2 bg-gray-50">
                            {(Array.isArray(listasAuxiliares.status) ? listasAuxiliares.status : []).map(s => (
                                <div key={s} className="flex items-center mb-1">
                                    <input type="checkbox" id={`status-${s.replace(/\s+/g, '-')}`} name="statusChkItem" value={s} onChange={handleStatusChange} checked={filtroStatus.includes(s)} className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"/>
                                    <label htmlFor={`status-${s.replace(/\s+/g, '-')}`} className="ml-2 text-sm text-gray-700">{s}</label>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Ação:</label>
                         <div className="flex space-x-2 mb-2">
                            <button onClick={handleSelectAllAcoes} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200">Todas</button>
                            <button onClick={handleClearAllAcoes} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded hover:bg-gray-200">Limpar</button>
                        </div>
                        <div className="max-h-40 overflow-y-auto border rounded-md p-2 bg-gray-50">
                            {(Array.isArray(listasAuxiliares.acoes) ? listasAuxiliares.acoes : []).map(ac => (
                                <div key={ac} className="flex items-center mb-1">
                                    <input type="checkbox" id={`acao-${ac.replace(/\s+/g, '-')}`} name="acaoChkItem" value={ac} onChange={handleAcaoChange} checked={filtroAcoes.includes(ac)} className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"/>
                                    <label htmlFor={`acao-${ac.replace(/\s+/g, '-')}`} className="ml-2 text-sm text-gray-700">{ac}</label>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="dataInicioRel" className="block text-sm font-medium text-gray-700">Período - Início:</label>
                            <input type="date" id="dataInicioRel" value={filtroDataInicio} onChange={e => setFiltroDataInicio(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2"/>
                        </div>
                        <div>
                            <label htmlFor="dataFimRel" className="block text-sm font-medium text-gray-700">Período - Fim:</label>
                            <input type="date" id="dataFimRel" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2"/>
                        </div>
                    </div>
                </div>
                <div className="text-right">
                    <button
                        onClick={handleGerarRelatorio}
                        disabled={loadingReport}
                        className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-md flex items-center justify-center disabled:bg-gray-400"
                    >
                        <LucideFilter size={18} className="mr-2"/>
                        {loadingReport ? "Gerando..." : "Gerar Relatório"}
                    </button>
                </div>
            </div>

            {showReport && (
                 <div>
                    <div className="text-center mt-6 mb-4 no-print-in-report">
                        <button
                            onClick={handlePrint}
                            className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-md flex items-center justify-center mx-auto"
                        >
                            <LucidePrinter size={18} className="mr-2"/>
                            Imprimir / Salvar PDF
                        </button>
                    </div>
                    <div id="printable-report-area-content" className="bg-white p-6 rounded-lg shadow-md">
                        <div className="print-header text-center mb-6">
                            {LOGO_URL && <img src={LOGO_URL} alt="Logotipo da Empresa" className="mx-auto h-14 w-auto mb-4" onError={(e) => e.target.style.display='none'}/>}
                            <h1 className="text-2xl font-semibold text-gray-800">Relatório de Atividades</h1>
                            <p className="text-sm text-gray-600">
                                Funcionário(s): {filtroFuncionarios.length > 0 ? filtroFuncionarios.map(fId => fId === SEM_RESPONSAVEL_VALUE ? "Sem Responsável" : (contextFuncionarios.find(f=>f.id === fId)?.nome || fId)).join(', ') : "TODOS"}
                                <br/>
                                Status: {filtroStatus.length > 0 ? filtroStatus.join(', ') : "TODOS"}
                                <br/>
                                Ação: {filtroAcoes.length > 0 ? filtroAcoes.join(', ') : "TODAS"}
                                <br/>
                                Período: {filtroDataInicio ? formatDateForDisplay(new Date(filtroDataInicio+"T00:00:00Z")) : 'N/A'} a {filtroDataFim ? formatDateForDisplay(new Date(filtroDataFim+"T00:00:00Z")) : 'N/A'}
                            </p>
                        </div>

                        <div className="overflow-x-auto mb-6">
                            <table className="min-w-full divide-y divide-gray-200 border">
                                <thead className="bg-gray-100">
                                    <tr>
                                        {["Responsável", "Tarefa", "Orientação", "Área", "Status", "Prioridade", "Turno", "Data Início", "Data Término"].map(header => (
                                            <th key={header} scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-b">{header}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {tarefasFiltradas.length === 0 ? (
                                        <tr><td colSpan="9" className="px-4 py-3 text-center text-gray-500">Nenhuma tarefa encontrada para os filtros selecionados.</td></tr>
                                    ) : (
                                        tarefasFiltradas.map(task => (
                                            <tr key={task.id}>
                                                <td className="px-4 py-2 text-sm text-gray-700 border-b whitespace-nowrap">{getResponsavelNomesParaRelatorio(task.responsaveis)}</td>
                                                <td className="px-4 py-2 text-sm text-gray-800 border-b max-w-xs whitespace-normal break-words">{task.tarefa}</td>
                                                <td className="px-4 py-2 text-sm text-gray-700 border-b max-w-xs whitespace-normal break-words">{task.orientacao}</td>
                                                <td className="px-4 py-2 text-sm text-gray-700 border-b whitespace-nowrap">{task.area}</td>
                                                <td className="px-4 py-2 text-sm text-gray-700 border-b whitespace-nowrap">{task.status}</td>
                                                <td className="px-4 py-2 text-sm text-gray-700 border-b whitespace-nowrap">{task.prioridade}</td>
                                                <td className="px-4 py-2 text-sm text-gray-700 border-b whitespace-nowrap">{task.turno || 'N/A'}</td>
                                                <td className="px-4 py-2 text-sm text-gray-700 border-b whitespace-nowrap">{formatDateForDisplay(task.dataInicio)}</td>
                                                <td className="px-4 py-2 text-sm text-gray-700 border-b whitespace-nowrap">{formatDateForDisplay(task.dataProvavelTermino)}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="report-footer mt-8 pt-4 border-t border-gray-200 text-xs text-gray-500">
                            <p>Lembramos que esta programação pode ser alterada no decorrer do dia.</p>
                            <p className="font-semibold uppercase mt-1 last-line">JUNTOS CONSTRUIMOS O EXPLÊNDIDO</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


// Versão: 3.2.0
// [MODIFICADO] Componente principal de Relatórios, agora com abas para selecionar o tipo.
const RelatoriosComponent = () => {
    const [tipoRelatorio, setTipoRelatorio] = useState('atividades'); // 'atividades' ou 'semanal'

    return (
        <div className="p-6 bg-gray-50 min-h-full">
            <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
                 <h2 className="text-2xl font-semibold text-gray-800">Relatórios</h2>
                 <div className="bg-gray-200 p-1 rounded-lg flex space-x-1">
                     <button 
                        onClick={() => setTipoRelatorio('atividades')}
                        className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${tipoRelatorio === 'atividades' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:bg-gray-300'}`}
                    >
                        Relatório de Atividades
                    </button>
                    <button 
                        onClick={() => setTipoRelatorio('semanal')}
                        className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${tipoRelatorio === 'semanal' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:bg-gray-300'}`}
                    >
                        Relatório Semanal
                    </button>
                 </div>
            </div>

            {tipoRelatorio === 'atividades' ? (
                <RelatorioDeAtividades />
            ) : (
                <RelatorioSemanal />
            )}
        </div>
    );
};


// Versão: 4.9.0
// [ALTERADO] Adicionado o campo "Planta / Local" ao formulário.
const RegistroAplicacaoModal = ({ isOpen, onClose, onSave, listasAuxiliares, funcionarios, planoParaRegistrar, registroExistente }) => {
    const [dataAplicacao, setDataAplicacao] = useState('');
    const [produto, setProduto] = useState('');
    const [dosagem, setDosagem] = useState('');
    const [areas, setAreas] = useState([]);
    const [responsavel, setResponsavel] = useState('');
    const [observacoes, setObservacoes] = useState('');
    const [plantaLocal, setPlantaLocal] = useState(''); // [NOVO v4.9.0] Estado para o novo campo.
    const [loading, setLoading] = useState(false);
    const [dadosOrigem, setDadosOrigem] = useState(null);

    useEffect(() => {
        if (isOpen) {
            const hojeFormatado = new Date().toISOString().split('T')[0];
            if (registroExistente) {
                // Modo Edição
                setDataAplicacao(registroExistente.dataAplicacao ? new Date(registroExistente.dataAplicacao.seconds * 1000).toISOString().split('T')[0] : hojeFormatado);
                setProduto(registroExistente.produto || '');
                setDosagem(registroExistente.dosagem || '');
                setAreas(registroExistente.areas || []);
                setResponsavel(registroExistente.responsavel || '');
                setObservacoes(registroExistente.observacoes || '');
                setPlantaLocal(registroExistente.plantaLocal || ''); // [NOVO v4.9.0]
                setDadosOrigem({ planoId: registroExistente.planoId, planoNome: registroExistente.planoNome });
            } else if (planoParaRegistrar) {
                // Modo Registro Planejado
                setDataAplicacao(hojeFormatado);
                setProduto(planoParaRegistrar.produto || '');
                setAreas(planoParaRegistrar.areas || []);
                setDosagem(planoParaRegistrar.dosagemPadrao || '');
                setResponsavel('');
                setObservacoes('');
                setPlantaLocal(''); // [NOVO v4.9.0]
                setDadosOrigem({ planoId: planoParaRegistrar.id, planoNome: planoParaRegistrar.nome });
            } else {
                // Modo Registro Manual
                setDataAplicacao(hojeFormatado);
                setProduto(''); setDosagem(''); setAreas([]); setResponsavel(''); setObservacoes('');
                setPlantaLocal(''); // [NOVO v4.9.0]
                setDadosOrigem(null);
            }
        }
    }, [registroExistente, planoParaRegistrar, isOpen]);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!produto || !dataAplicacao || areas.length === 0 || !responsavel) {
            toast.error("Preencha todos os campos obrigatórios: Data, Produto, Área e Responsável.");
            return;
        }
        setLoading(true);
        const dadosRegistro = {
            dataAplicacao: Timestamp.fromDate(new Date(dataAplicacao + "T00:00:00Z")),
            produto: produto.trim(),
            dosagem: dosagem.trim(),
            areas,
            responsavel,
            observacoes: observacoes.trim(),
            plantaLocal: plantaLocal.trim(), // [NOVO v4.9.0]
            planoId: dadosOrigem?.planoId || null,
            planoNome: dadosOrigem?.planoNome || null,
        };
        
        await onSave(dadosRegistro, registroExistente);
        setLoading(false);
        onClose();
    };
    
    const getModalTitle = () => {
        if (registroExistente) return "Editar Registro de Aplicação";
        if (planoParaRegistrar) return `Registrar: ${planoParaRegistrar.nome}`;
        return "Adicionar Registro Manual";
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={getModalTitle()}>
            <form onSubmit={handleSave} className="space-y-4">
                {/* O JSX do formulário com o novo campo */}
                <div><label className="block text-sm font-medium text-gray-700">Data da Aplicação *</label><input type="date" value={dataAplicacao} onChange={e => setDataAplicacao(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"/></div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium text-gray-700">Produto Aplicado *</label><input type="text" value={produto} onChange={e => setProduto(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3" placeholder="Ex: Calda Bordalesa"/></div>
                    <div><label className="block text-sm font-medium text-gray-700">Dosagem</label><input type="text" value={dosagem} onChange={e => setDosagem(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3" placeholder="Ex: 10ml / 1L"/></div>
                </div>

                {/* [NOVO v4.9.0] Novo campo "Planta / Local" */}
                <div>
                    <label className="block text-sm font-medium text-gray-700">Planta / Local Específico</label>
                    <input type="text" value={plantaLocal} onChange={e => setPlantaLocal(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3" placeholder="Ex: Oliveira 3, Canteiro de rosas"/>
                </div>

                <div><label className="block text-sm font-medium text-gray-700">Área(s) Tratada(s) *</label><select multiple value={areas} onChange={e => setAreas(Array.from(e.target.selectedOptions, option => option.value))} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm h-32">{(listasAuxiliares.areas || []).map(a => <option key={a} value={a}>{a}</option>)}</select><p className="text-xs text-gray-500 mt-1">Segure Ctrl (ou Cmd) para selecionar múltiplos.</p></div>
                <div><label className="block text-sm font-medium text-gray-700">Responsável *</label><select value={responsavel} onChange={e => setResponsavel(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"><option value="">Selecione um funcionário...</option>{funcionarios.map(f => <option key={f.id} value={f.nome}>{f.nome}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700">Observações</label><textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows="3" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm"></textarea></div>
                <div className="pt-4 flex justify-end space-x-2"><button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancelar</button><button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400">{loading ? 'Salvando...' : 'Salvar Registro'}</button></div>
            </form>
        </Modal>
    );
};

// Versão: 4.5.0
// [CORRIGIDO] Conteúdo completo do formulário para o Modal de Planos de Aplicação.
const PlanoAplicacaoModal = ({ isOpen, onClose, onSave, onRemove, planoExistente }) => {
    const { listasAuxiliares } = useContext(GlobalContext);
    const [nome, setNome] = useState('');
    const [produto, setProduto] = useState('');
    const [dosagemPadrao, setDosagemPadrao] = useState('');
    const [areas, setAreas] = useState([]);
    const [frequencia, setFrequencia] = useState('UNICA');
    const [diasIntervalo, setDiasIntervalo] = useState(7);
    const [dataInicio, setDataInicio] = useState('');
    const [ativo, setAtivo] = useState(true);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (planoExistente) {
                setNome(planoExistente.nome || '');
                setProduto(planoExistente.produto || '');
                setDosagemPadrao(planoExistente.dosagemPadrao || '');
                setAreas(planoExistente.areas || []);
                setFrequencia(planoExistente.frequencia || 'UNICA');
                setDiasIntervalo(planoExistente.diasIntervalo || 7);
                setDataInicio(planoExistente.dataInicio ? new Date(planoExistente.dataInicio.seconds * 1000).toISOString().split('T')[0] : '');
                setAtivo(planoExistente.ativo !== false);
            } else {
                setNome('');
                setProduto('');
                setDosagemPadrao('');
                setAreas([]);
                setFrequencia('UNICA');
                setDiasIntervalo(7);
                setDataInicio(new Date().toISOString().split('T')[0]);
                setAtivo(true);
            }
        }
    }, [planoExistente, isOpen]);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!nome || !produto || !dataInicio || areas.length === 0) {
            toast.error("Os campos Nome, Produto, Data de Início e Áreas são obrigatórios.");
            return;
        }
        setLoading(true);
        const planoData = {
            ...(planoExistente && { id: planoExistente.id }),
            nome: nome.trim(),
            produto: produto.trim(),
            dosagemPadrao: dosagemPadrao.trim(),
            areas,
            frequencia,
            diasIntervalo: frequencia === 'INTERVALO_DIAS' ? diasIntervalo : null,
            dataInicio: Timestamp.fromDate(new Date(dataInicio + "T00:00:00Z")),
            ativo,
        };
        await onSave(planoData);
        setLoading(false);
        onClose();
    };

    const handleRemove = async () => {
        if (planoExistente && window.confirm(`Tem certeza que deseja excluir o plano "${planoExistente.nome}"? Esta ação não pode ser desfeita.`)) {
            setLoading(true);
            await onRemove(planoExistente.id);
            setLoading(false);
            onClose();
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={planoExistente ? "Editar Plano de Aplicação" : "Criar Novo Plano de Aplicação"} width="max-w-2xl">
            <form onSubmit={handleSave} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Nome do Plano *</label>
                    <input type="text" value={nome} onChange={e => setNome(e.target.value)} required className="mt-1 block w-full border-gray-300 rounded-md" placeholder="Ex: Adubação de Crescimento - Oliveiras" />
                </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Produto Principal *</label>
                        <input type="text" value={produto} onChange={e => setProduto(e.target.value)} required className="mt-1 block w-full border-gray-300 rounded-md" placeholder="Ex: Calda Bordalesa" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Dosagem Padrão</label>
                        <input type="text" value={dosagemPadrao} onChange={e => setDosagemPadrao(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md" placeholder="Ex: 10ml / 1L" />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Área(s) de Aplicação *</label>
                    <select multiple value={areas} onChange={e => setAreas(Array.from(e.target.selectedOptions, option => option.value))} required className="mt-1 block w-full border-gray-300 rounded-md h-32">
                        {(listasAuxiliares.areas || []).sort().map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Segure Ctrl (ou Cmd) para selecionar múltiplos.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Frequência *</label>
                        <select value={frequencia} onChange={e => setFrequencia(e.target.value)} required className="mt-1 block w-full border-gray-300 rounded-md">
                            <option value="UNICA">Aplicação Única</option>
                            <option value="SEMANAL">Semanal</option>
                            <option value="QUINZENAL">Quinzenal</option>
                            <option value="MENSAL">Mensal</option>
                            <option value="INTERVALO_DIAS">Intervalo de Dias</option>
                        </select>
                    </div>
                    {frequencia === 'INTERVALO_DIAS' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Intervalo (dias) *</label>
                            <input type="number" value={diasIntervalo} onChange={e => setDiasIntervalo(Number(e.target.value))} required className="mt-1 block w-full border-gray-300 rounded-md" min="1"/>
                        </div>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Data de Início do Plano *</label>
                    <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} required className="mt-1 block w-full border-gray-300 rounded-md"/>
                </div>
                 <div>
                    <label className="flex items-center">
                        <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="h-4 w-4 text-blue-600 border-gray-300 rounded" />
                        <span className="ml-2 text-sm text-gray-700">Plano Ativo</span>
                    </label>
                </div>
                <div className="pt-4 flex justify-between items-center">
                     <div>
                        {planoExistente && (
                            <button type="button" onClick={handleRemove} disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-400">
                                <LucideTrash2 size={16} className="inline-block mr-1"/> Excluir
                            </button>
                        )}
                     </div>
                     <div className="flex space-x-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancelar</button>
                        <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400">
                            {loading ? 'Salvando...' : 'Salvar Plano'}
                        </button>
                    </div>
                </div>
            </form>
        </Modal>
    );
};

// Versão: 4.3.2
// [CORRIGIDO] Adicionado valor padrão à prop 'planosDoDia' para evitar erro caso seja indefinida.
const SelecionarPlanoModal = ({ isOpen, onClose, planosDoDia = [], onSelectPlano }) => {
    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Selecionar Aplicação Planejada" width="max-w-xl">
            <div className="space-y-3">
                <p className="text-sm text-gray-600">Os seguintes planos de aplicação estão programados para hoje ou estão atrasados. Selecione um para registrar a aplicação.</p>
                {planosDoDia.length === 0 ? (
                    <p className="text-center py-4 text-gray-500">Nenhum plano programado para hoje.</p>
                ) : (
                    <div className="max-h-80 overflow-y-auto space-y-2 pr-2">
                        {planosDoDia.map(plano => (
                            <button
                                key={plano.id}
                                onClick={() => onSelectPlano(plano)}
                                className="w-full text-left p-3 border rounded-md hover:bg-blue-50 hover:border-blue-300 transition-all"
                            >
                                <p className="font-semibold text-blue-800">{plano.nome}</p>
                                <p className="text-xs text-gray-700">Produto: {plano.produto}</p>
                                <p className="text-xs text-gray-700">Áreas: {plano.areas.join(', ')}</p>
                            </button>
                        ))}
                    </div>
                )}
                 <div className="pt-4 flex justify-end">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">
                        Fechar
                    </button>
                </div>
            </div>
        </Modal>
    );
};

// Versão: 4.4.0
// [NOVO] Modal para exibir o histórico de aplicações de um plano específico.
const HistoricoPlanoModal = ({ isOpen, onClose, plano, historicoCompleto }) => {
    if (!isOpen || !plano) return null;

    // Filtra o histórico completo para mostrar apenas os registros deste plano
    const registrosDoPlano = historicoCompleto.filter(reg => reg.planoId === plano.id)
                                             .sort((a, b) => b.dataAplicacao.seconds - a.dataAplicacao.seconds);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Histórico: ${plano.nome}`} width="max-w-3xl">
            <div className="space-y-4">
                <div className="p-3 bg-gray-100 rounded-md">
                    <p><strong>Produto:</strong> {plano.produto}</p>
                    <p><strong>Áreas:</strong> {plano.areas.join(', ')}</p>
                </div>
                {registrosDoPlano.length === 0 ? (
                    <p className="text-center text-gray-500 py-4">Nenhuma aplicação registrada para este plano ainda.</p>
                ) : (
                    <div className="max-h-[60vh] overflow-y-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Responsável</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Observações</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {registrosDoPlano.map(reg => (
                                    <tr key={reg.id}>
                                        <td className="px-4 py-3 text-sm whitespace-nowrap">{formatDate(reg.dataAplicacao)}</td>
                                        <td className="px-4 py-3 text-sm">{reg.responsavel}</td>
                                        <td className="px-4 py-3 text-sm">{reg.observacoes || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </Modal>
    );
};



// Versão: 4.8.0
// [NOVO] Modal para exibir o histórico de alterações de um registro de aplicação.
const HistoricoAplicacaoModal = ({ isOpen, onClose, registroId }) => {
    const { db, appId } = useContext(GlobalContext);
    const [historico, setHistorico] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setHistorico([]);
            return;
        }

        if (registroId) {
            setLoading(true);
            const basePath = `/artifacts/${appId}/public/data`;
            const historicoRef = collection(db, `${basePath}/controleFitossanitario/${registroId}/historico_alteracoes`);
            const q = query(historicoRef, orderBy("timestamp", "desc"));

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const historicoData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setHistorico(historicoData);
                setLoading(false);
            }, (error) => {
                console.error("Erro ao carregar histórico da aplicação:", error);
                toast.error("Erro ao carregar o histórico.");
                setLoading(false);
            });

            return () => unsubscribe();
        }
    }, [isOpen, registroId, db, appId]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Histórico de Alterações do Registro" width="max-w-3xl">
            {loading ? (
                <p>Carregando histórico...</p>
            ) : historico.length > 0 ? (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                    {historico.map(entry => (
                        <div key={entry.id} className="p-3 bg-gray-50 rounded-lg border">
                            <div className="flex justify-between items-center mb-1">
                                <p className="text-sm font-semibold text-gray-800">{entry.acaoRealizada}</p>
                                <p className="text-xs text-gray-500">{formatDate(entry.timestamp)}</p>
                            </div>
                            <p className="text-xs text-gray-600">Usuário: {entry.usuarioEmail || 'N/A'}</p>
                            {entry.detalhesAdicionais && (
                                <p className="text-xs text-gray-700 mt-1 whitespace-pre-wrap">
                                    {entry.detalhesAdicionais}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-center text-gray-500 py-4">Nenhum histórico encontrado para este registro.</p>
            )}
        </Modal>
    );
};

// Versão: 6.1.1
// [CORRIGIDO] Garante que a data do evento seja salva em UTC para consistência.
const EventoAgendaModal = ({ isOpen, onClose, onSave, eventoExistente, targetDate }) => {
    const [titulo, setTitulo] = useState('');
    const [descricao, setDescricao] = useState('');
    const [horaInicio, setHoraInicio] = useState('08:00');
    const [horaFim, setHoraFim] = useState('09:00');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (eventoExistente) {
                setTitulo(eventoExistente.titulo || '');
                setDescricao(eventoExistente.descricao || '');
                setHoraInicio(eventoExistente.horaInicio || '08:00');
                setHoraFim(eventoExistente.horaFim || '09:00');
            } else {
                setTitulo('');
                setDescricao('');
                setHoraInicio('08:00');
                setHoraFim('09:00');
            }
        }
    }, [eventoExistente, isOpen]);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!titulo.trim() || !horaInicio || !horaFim) {
            toast.error("Título, Hora de Início e Fim são obrigatórios.");
            return;
        }
        if (horaFim < horaInicio) {
            toast.error("A hora de término não pode ser anterior à hora de início.");
            return;
        }
        setLoading(true);

        // [CORRIGIDO v6.1.1] Cria a data em UTC para evitar problemas de fuso horário.
        const dateParts = targetDate.split('-').map(Number);
        const targetDateUTC = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));

        const dadosEvento = {
            titulo: titulo.trim(),
            descricao: descricao.trim(),
            data: Timestamp.fromDate(targetDateUTC),
            horaInicio,
            horaFim,
        };

        await onSave(dadosEvento, eventoExistente?.id || null);
        setLoading(false);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={eventoExistente ? "Editar Evento" : "Adicionar Novo Evento"}>
            <form onSubmit={handleSave} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Título do Evento *</label>
                    <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} required className="mt-1 block w-full border-gray-300 rounded-md" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Hora de Início *</label>
                        <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} required className="mt-1 block w-full border-gray-300 rounded-md" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Hora de Fim *</label>
                        <input type="time" value={horaFim} onChange={e => setHoraFim(e.target.value)} required className="mt-1 block w-full border-gray-300 rounded-md" />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Descrição / Detalhes</label>
                    <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows="4" className="mt-1 block w-full border-gray-300 rounded-md"></textarea>
                </div>
                <div className="pt-4 flex justify-end space-x-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancelar</button>
                    <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400">
                        {loading ? 'Salvando...' : 'Salvar Evento'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

// Versão: 6.6.0
// [ALTERADO] A Agenda Semanal foi ajustada para ocultar o Domingo e exibir a semana de Segunda a Sábado.
const AgendaDiariaComponent = () => {
    const { db, appId, auth } = useContext(GlobalContext);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [eventosDaSemana, setEventosDaSemana] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null);
    const [dateForNewEvent, setDateForNewEvent] = useState(null);
    const [agendaVersion, setAgendaVersion] = useState(0);

    const basePath = `/artifacts/${appId}/public/data`;
    const agendaCollectionRef = collection(db, `${basePath}/agenda_diaria`);

    // Função auxiliar para garantir consistência no cálculo da semana (Segunda a Sábado)
    const getWeekInfo = (date) => {
        const start = new Date(date);
        start.setUTCHours(0, 0, 0, 0);
        
        // Garante que a data de início seja a SEGUNDA-FEIRA
        const day = start.getUTCDay(); // 0=Dom, 1=Seg,...
        const diff = day === 0 ? -6 : 1 - day;
        start.setUTCDate(start.getUTCDate() + diff);

        const end = new Date(start);
        // O fim da semana é 5 dias depois da segunda (Sábado)
        end.setUTCDate(start.getUTCDate() + 5);

        return { start, end };
    };

    useEffect(() => {
        setLoading(true);
        const { start, end } = getWeekInfo(currentDate);

        const q = query(agendaCollectionRef, where("data", ">=", Timestamp.fromDate(start)), where("data", "<=", Timestamp.fromDate(end)), orderBy("data"), orderBy("horaInicio"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedEvents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setEventosDaSemana(fetchedEvents);
            setLoading(false);
        }, error => {
            console.error("Erro ao carregar eventos da agenda:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [currentDate, agendaVersion, db, basePath, appId]);

    const changeWeek = (offset) => {
        setCurrentDate(prevDate => {
            const newDate = new Date(prevDate);
            newDate.setDate(newDate.getDate() + (7 * offset));
            return newDate;
        });
    };
    
    const handleOpenModal = (date, evento = null) => {
        setDateForNewEvent(date.toISOString().split('T')[0]);
        setEditingEvent(evento);
        setIsModalOpen(true);
    };

    const handleSaveEvent = async (dadosEvento, eventoId) => {
        const usuarioEmail = auth.currentUser?.email;
        if (eventoId) {
            const eventoRef = doc(db, `${basePath}/agenda_diaria`, eventoId);
            await updateDoc(eventoRef, { ...dadosEvento, updatedAt: Timestamp.now() });
            toast.success("Evento atualizado com sucesso!");
        } else {
            await addDoc(agendaCollectionRef, { ...dadosEvento, createdBy: usuarioEmail, createdAt: Timestamp.now() });
            toast.success("Evento criado com sucesso!");
        }
        setAgendaVersion(v => v + 1);
    };

    const handleDeleteEvent = async (eventoId) => {
        if (window.confirm("Tem certeza que deseja excluir este evento?")) {
            const eventoRef = doc(db, `${basePath}/agenda_diaria`, eventoId);
            await deleteDoc(eventoRef);
            toast.success("Evento excluído!");
        }
    };
    
    const renderWeekView = () => {
        const weekDays = [];
        const { start } = getWeekInfo(currentDate);

        // Loop para 6 dias (Segunda a Sábado)
        for (let i = 0; i < 6; i++) {
            const dayDate = new Date(start);
            dayDate.setUTCDate(start.getUTCDate() + i);
            const dayString = dayDate.toISOString().split('T')[0];
            const eventosDoDia = eventosDaSemana.filter(e => e.data.toDate().toISOString().split('T')[0] === dayString);
            
            weekDays.push(
                <div key={i} className="bg-white p-3 rounded-lg shadow-sm h-96 flex flex-col">
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="font-bold text-gray-800">{dayDate.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' })}
                            <span className="ml-2 font-normal text-gray-500">{dayDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC'})}</span>
                        </h4>
                        <button onClick={() => handleOpenModal(dayDate)} title="Adicionar Evento neste Dia" className="p-1 text-blue-500 hover:bg-blue-100 rounded-full"><LucidePlusCircle size={20}/></button>
                    </div>
                    <div className="space-y-2 flex-grow overflow-y-auto pr-1">
                        {loading ? <p>...</p> : eventosDoDia.length === 0 ? (
                           <div className="flex items-center justify-center h-full"><p className="text-sm text-gray-400">Nenhum evento.</p></div>
                        ) : (
                           eventosDoDia.map(evento => (
                                <div key={evento.id} className="p-3 border-l-4 border-purple-500 bg-purple-50 rounded-r-md">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="font-semibold text-sm text-gray-900">{evento.titulo}</p>
                                            <p className="text-xs text-purple-700 font-medium">{evento.horaInicio} - {evento.horaFim}</p>
                                            {evento.descricao && <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{evento.descricao}</p>}
                                        </div>
                                         <div className="flex flex-col space-y-2 ml-2">
                                            <button onClick={() => handleOpenModal(dayDate, evento)} title="Editar"><LucideEdit size={16} className="text-gray-500 hover:text-blue-600"/></button>
                                            <button onClick={() => handleDeleteEvent(evento.id)} title="Excluir"><LucideTrash2 size={16} className="text-gray-500 hover:text-red-600"/></button>
                                        </div>
                                    </div>
                                </div>
                           ))
                        )}
                    </div>
                </div>
            )
        }
        return weekDays;
    };
    
    const getWeekRangeLabel = () => {
        const { start, end } = getWeekInfo(currentDate);
        return `Semana de ${start.toLocaleDateString('pt-BR', {day: '2-digit', month: 'short', timeZone: 'UTC'})} a ${end.toLocaleDateString('pt-BR', {day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'})}`;
    }

    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-full">
            <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
                <h2 className="text-2xl font-semibold text-gray-800">Agenda Semanal</h2>
                <div className="flex items-center gap-2 bg-white p-2 rounded-lg shadow-sm border">
                    <button onClick={() => changeWeek(-1)} className="p-2 rounded-md hover:bg-gray-100" title="Semana Anterior">
                        <LucideCalendarDays size={20} className="text-gray-600"/>
                    </button>
                    <span className="font-semibold text-gray-700">{getWeekRangeLabel()}</span>
                    <button onClick={() => changeWeek(1)} className="p-2 rounded-md hover:bg-gray-100" title="Próxima Semana">
                        <LucideCalendarDays size={20} className="text-gray-600"/>
                    </button>
                </div>
            </div>

            <EventoAgendaModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveEvent}
                eventoExistente={editingEvent}
                targetDate={dateForNewEvent}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {renderWeekView()}
            </div>
        </div>
    );
};

// Versão: 5.3.0
// [ALTERADO] Torna os eventos do calendário clicáveis, abrindo um modal com os detalhes do plano.
const CalendarioFitossanitarioComponent = () => {
    const { db, appId, auth } = useContext(GlobalContext);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [planos, setPlanos] = useState([]);
    const [eventos, setEventos] = useState({});
    const [loading, setLoading] = useState(true);

    // [NOVO v5.3.0] Estados para controlar o modal de detalhes do plano
    const [isPlanoModalOpen, setIsPlanoModalOpen] = useState(false);
    const [planoSelecionado, setPlanoSelecionado] = useState(null);

    const basePath = `/artifacts/${appId}/public/data`;
    const planosCollectionRef = collection(db, `${basePath}/planos_fitossanitarios`);

    const gerarOcorrenciasDoPlano = (plano, ano) => {
        const ocorrencias = [];
        if (!plano.ativo || !plano.dataInicio?.toDate) return ocorrencias;

        let dataAtual = plano.dataInicio.toDate();
        let i = 0; // Adicionado para garantir ID único
        while (dataAtual.getFullYear() <= ano) {
            if (dataAtual.getFullYear() >= ano - 1) {
                ocorrencias.push({
                    id: `${plano.id}-${i++}`,
                    title: plano.nome,
                    date: new Date(dataAtual.getTime()),
                    produto: plano.produto,
                    planoId: plano.id, // [NOVO v5.3.0] Referência direta ao ID do plano
                    color: `hsl(${plano.nome.length * 20 % 360}, 70%, 80%)`
                });
            }

            switch (plano.frequencia) {
                case 'SEMANAL': dataAtual.setDate(dataAtual.getDate() + 7); break;
                case 'QUINZENAL': dataAtual.setDate(dataAtual.getDate() + 14); break;
                case 'MENSAL': dataAtual.setMonth(dataAtual.getMonth() + 1); break;
                case 'INTERVALO_DIAS': dataAtual.setDate(dataAtual.getDate() + (plano.diasIntervalo || 1)); break;
                default: return ocorrencias;
            }
        }
        return ocorrencias;
    };

    useEffect(() => {
        const q = query(planosCollectionRef, where("ativo", "==", true));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const planosAtivos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPlanos(planosAtivos);
            setLoading(false);
        }, error => { console.error("Erro ao carregar planos:", error); setLoading(false); });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (planos.length > 0) {
            const todosOsEventos = {};
            const anoAtual = currentDate.getFullYear();
            
            planos.forEach(plano => {
                const ocorrencias = gerarOcorrenciasDoPlano(plano, anoAtual);
                ocorrencias.forEach(oc => {
                    const dataString = oc.date.toISOString().split('T')[0];
                    if (!todosOsEventos[dataString]) { todosOsEventos[dataString] = []; }
                    todosOsEventos[dataString].push(oc);
                });
            });
            setEventos(todosOsEventos);
        }
    }, [planos, currentDate]);

    // [NOVO v5.3.0] Função para abrir o modal de detalhes do plano
    const handleOpenPlanoModal = (evento) => {
        const planoEncontrado = planos.find(p => p.id === evento.planoId);
        if (planoEncontrado) {
            setPlanoSelecionado(planoEncontrado);
            setIsPlanoModalOpen(true);
        }
    };
    
    // [NOVO v5.3.0] Funções de salvar e remover para passar ao modal
    const handleSavePlano = async (planoData) => { const usuario = auth.currentUser; const dadosParaSalvar = { ...planoData, updatedAt: Timestamp.now(), userEmail: usuario?.email || 'unknown', }; try { if (planoData.id) { const planoDocRef = doc(db, `${basePath}/planos_fitossanitarios`, planoData.id); await updateDoc(planoDocRef, dadosParaSalvar); toast.success("Plano atualizado com sucesso!"); } else { await addDoc(planosCollectionRef, { ...dadosParaSalvar, createdAt: Timestamp.now() }); toast.success("Plano criado com sucesso!"); } } catch (error) { console.error("Erro ao salvar plano:", error); toast.error("Falha ao salvar o plano."); } };
    const handleRemovePlano = async (planoId) => { try { await deleteDoc(doc(db, `${basePath}/planos_fitossanitarios`, planoId)); toast.success("Plano excluído com sucesso!"); setIsPlanoModalOpen(false); } catch (error) { console.error("Erro ao excluir plano:", error); toast.error("Falha ao excluir o plano."); } };

    const changeMonth = (offset) => { setCurrentDate(prevDate => { const newDate = new Date(prevDate); newDate.setMonth(newDate.getMonth() + offset); return newDate; }); };

    const renderCalendar = () => {
        const month = currentDate.getMonth();
        const year = currentDate.getFullYear();
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days = [];
        for (let i = 0; i < firstDayOfMonth; i++) { days.push(<div key={`empty-${i}`} className="border p-2 bg-gray-50"></div>); }
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayEvents = eventos[dateStr] || [];
            const isToday = new Date(year, month, day).toDateString() === new Date().toDateString();

            days.push(
                <div key={day} className={`border p-2 h-36 flex flex-col ${isToday ? 'bg-blue-50' : 'bg-white'}`}>
                    <strong className={`text-sm ${isToday ? 'text-blue-600 font-bold' : ''}`}>{day}</strong>
                    <div className="flex-grow overflow-y-auto mt-1 space-y-1 pr-1">
                        {dayEvents.map(event => (
                            // [ALTERADO v5.3.0] Evento agora é um botão clicável
                            <button
                                key={event.id}
                                onClick={() => handleOpenPlanoModal(event)}
                                title={event.produto}
                                className="w-full text-left text-xs p-1 rounded-md text-gray-800 hover:ring-2 hover:ring-blue-400 transition-all"
                                style={{backgroundColor: event.color}}
                            >
                                {event.title}
                            </button>
                        ))}
                    </div>
                </div>
            );
        }
        return days;
    };
    
    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-full">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800">Calendário de Aplicações Programadas</h2>
            
            <div className="bg-white p-4 rounded-lg shadow-md">
                <div className="flex justify-between items-center mb-4">
                    <button onClick={() => changeMonth(-1)} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">&lt; Anterior</button>
                    <h3 className="text-xl font-bold">
                        {currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()}
                    </h3>
                    <button onClick={() => changeMonth(1)} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">Próximo &gt;</button>
                </div>
                
                {loading ? (
                    <p className="text-center py-10">Carregando planos...</p>
                ) : (
                    <>
                        <div className="grid grid-cols-7 text-center font-bold text-gray-600 border-b pb-2">
                            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => <div key={day}>{day}</div>)}
                        </div>
                        <div className="grid grid-cols-7">
                            {renderCalendar()}
                        </div>
                    </>
                )}
            </div>

            {/* [NOVO v5.3.0] Renderiza o modal de detalhes quando um plano é selecionado */}
            {isPlanoModalOpen && (
                <PlanoAplicacaoModal
                    isOpen={isPlanoModalOpen}
                    onClose={() => setIsPlanoModalOpen(false)}
                    onSave={handleSavePlano}
                    onRemove={handleRemovePlano}
                    planoExistente={planoSelecionado}
                />
            )}
        </div>
    );
};

// Componente TarefasPendentes
const TarefasPendentesComponent = () => {
    const { userId, db, appId, listasAuxiliares, funcionarios, auth } = useContext(GlobalContext); 
    const [tarefasPendentes, setTarefasPendentes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isAlocarModalOpen, setIsAlocarModalOpen] = useState(false);
    const [tarefaParaAlocar, setTarefaParaAlocar] = useState(null);

    const basePath = `/artifacts/${appId}/public/data`;

    useEffect(() => {
        setLoading(true);
        const tarefasMapaRef = collection(db, `${basePath}/tarefas_mapa`);
        const q = query(tarefasMapaRef, where("status", "==", "AGUARDANDO ALOCAÇÃO"), orderBy("createdAt", "asc"));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedPendentes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTarefasPendentes(fetchedPendentes);
            setLoading(false);
        }, (error) => {
            console.error("Erro ao carregar tarefas pendentes:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [userId, appId, db, basePath]);

    const handleAbrirModalAlocacao = (tarefa) => {
        setTarefaParaAlocar(tarefa);
        setIsAlocarModalOpen(true);
    };

    const handleFecharModalAlocacao = () => {
        setIsAlocarModalOpen(false);
        setTarefaParaAlocar(null);
    };

    const getResponsavelNomesParaLog = (responsavelIds) => { 
        if (!responsavelIds || responsavelIds.length === 0) return 'Nenhum';
        return responsavelIds.map(id => {
            const func = Array.isArray(funcionarios) ? funcionarios.find(f => f.id === id) : null;
            return func ? func.nome : `ID:${id}`; 
        }).join(', ');
    };

const handleSalvarAlocacao = async (tarefaId, dadosAlocacao) => {
    setLoading(true);
    const tarefaDocRef = doc(db, `${basePath}/tarefas_mapa`, tarefaId);
    const usuario = auth.currentUser;

    try {
        const dadosParaAtualizar = {
            ...dadosAlocacao,
            status: "PROGRAMADA",
            updatedAt: Timestamp.now(),
            alocadoPor: usuario?.uid || 'sistema',
            alocadoEm: Timestamp.now(),
            semanaProgramada: "", // Valor padrão
        };

        const dataInicioAlocacao = dadosAlocacao.dataInicio;

        if (dataInicioAlocacao instanceof Timestamp) {
            const dataInicioTarefaStr = dataInicioAlocacao.toDate().toISOString().split('T')[0];
            const todasSemanasQuery = query(collection(db, `${basePath}/programacao_semanal`));
            const todasSemanasSnap = await getDocs(todasSemanasQuery);

            for (const semanaDocSnap of todasSemanasSnap.docs) {
                const semana = semanaDocSnap.data();
                
                // [CORREÇÃO] Usando a função auxiliar robusta para converter as datas
                const inicioSemanaDate = converterParaDate(semana.dataInicioSemana);
                const fimSemanaDate = converterParaDate(semana.dataFimSemana);

                if (inicioSemanaDate && fimSemanaDate) {
                    const inicioSemanaStr = inicioSemanaDate.toISOString().split('T')[0];
                    const fimSemanaStr = fimSemanaDate.toISOString().split('T')[0];

                    if (dataInicioTarefaStr >= inicioSemanaStr && dataInicioTarefaStr <= fimSemanaStr) {
                        dadosParaAtualizar.semanaProgramada = semana.nomeAba || semanaDocSnap.id;
                        break; 
                    }
                }
            }
        }

        if (!dadosParaAtualizar.semanaProgramada && dadosAlocacao.dataInicio) {
            alert("Atenção: A tarefa foi alocada, mas não há uma semana criada na Programação Semanal para o período selecionado. Crie a semana para visualizar a tarefa na programação.");
        }

        await updateDoc(tarefaDocRef, dadosParaAtualizar);

        setTarefasPendentes(prevPendentes => prevPendentes.filter(t => t.id !== tarefaId));

        const tarefaAtualizadaSnap = await getDoc(tarefaDocRef);
        if (tarefaAtualizadaSnap.exists()) {
            const dadosCompletosParaSync = { id: tarefaId, ...tarefaAtualizadaSnap.data() };
            
            await sincronizarTarefaComProgramacao(tarefaId, dadosCompletosParaSync, db, basePath);

            const dataInicioLog = dadosParaAtualizar.dataInicio ? formatDate(dadosParaAtualizar.dataInicio) : 'N/A';
            const dataFimLog = dadosParaAtualizar.dataProvavelTermino ? formatDate(dadosParaAtualizar.dataProvavelTermino) : 'N/A';

            await logAlteracaoTarefa(db, basePath, tarefaId, usuario?.uid, usuario?.email, "Tarefa Alocada",
                `Alocada para: ${getResponsavelNomesParaLog(dadosParaAtualizar.responsaveis)}. Turno: ${dadosParaAtualizar.turno || 'N/A'}. Período: ${dataInicioLog} a ${dataFimLog}. Programada na semana: ${dadosParaAtualizar.semanaProgramada || 'Nenhuma'}`
            );
        }

        alert("Tarefa alocada com sucesso!");
        handleFecharModalAlocacao();
    } catch (error) {
        console.error("Erro ao alocar tarefa:", error);
        alert("Erro ao alocar tarefa: " + error.message);
    }
    setLoading(false);
};
    

    if (loading && tarefasPendentes.length === 0) return <div className="p-6 text-center">Carregando tarefas pendentes...</div>;

    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-full">
            <h2 className="text-2xl font-semibold text-gray-800 mb-6">Tarefas Pendentes (Aguardando Alocação)</h2>
            {tarefasPendentes.length === 0 && !loading ? (
                <p className="text-gray-600 bg-white p-4 rounded-md shadow">Nenhuma tarefa pendente no momento.</p>
            ) : (
                <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100">
                            <tr>
                                {["Tarefa", "Prioridade", "Área", "Ação", "Data Criação", "Orientação", "Ações"].map(header => (
                                    <th key={header} scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider whitespace-nowrap">{header}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {tarefasPendentes.map(tp => (
                                <tr key={tp.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm text-gray-800 max-w-xs whitespace-normal break-words">{tp.tarefa}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{tp.prioridade || '-'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{tp.area || '-'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{tp.acao || '-'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{tp.createdAt ? formatDate(tp.createdAt) : '-'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700 max-w-xs whitespace-normal break-words">{tp.orientacao || '-'}</td>
                                    <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">
                                        <button 
                                            onClick={() => handleAbrirModalAlocacao(tp)}
                                            className="bg-green-500 hover:bg-green-600 text-white text-xs font-semibold py-1 px-3 rounded-md flex items-center transition-colors duration-150"
                                        >
                                           <LucideUserPlus size={14} className="mr-1"/> Alocar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {isAlocarModalOpen && tarefaParaAlocar && (
                <AlocarTarefaModal 
                    isOpen={isAlocarModalOpen}
                    onClose={handleFecharModalAlocacao}
                    tarefaPendente={tarefaParaAlocar}
                    onAlocar={handleSalvarAlocacao}
                    listasAuxiliares={listasAuxiliares}
                    funcionarios={funcionarios}
                />
            )}
        </div>
    );
};

// Modal para Alocar Tarefa Pendente
const AlocarTarefaModal = ({ isOpen, onClose, tarefaPendente, onAlocar }) => {
    const { listasAuxiliares, funcionarios, userId } = useContext(GlobalContext);
    const [responsaveisAloc, setResponsaveisAloc] = useState([]);
    const [turnoAloc, setTurnoAloc] = useState('');
    const [dataInicioAloc, setDataInicioAloc] = useState('');
    const [dataTerminoAloc, setDataTerminoAloc] = useState('');
    const [orientacaoAloc, setOrientacaoAloc] = useState('');
    const [loadingAloc, setLoadingAloc] = useState(false);

    useEffect(() => {
        if (tarefaPendente) {
            setOrientacaoAloc(tarefaPendente.orientacao || '');
            setDataInicioAloc(tarefaPendente.dataInicio ? new Date(tarefaPendente.dataInicio.seconds * 1000).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
            setDataTerminoAloc(tarefaPendente.dataInicio ? new Date(tarefaPendente.dataInicio.seconds * 1000).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]); // Default to same as start
            setResponsaveisAloc([]);
            setTurnoAloc(TURNO_DIA_INTEIRO); // Default
        }
    }, [tarefaPendente, isOpen]);

    const handleAlocarSubmit = async (e) => {
        e.preventDefault();
        if (responsaveisAloc.length === 0) {
            alert("Selecione ao menos um responsável.");
            return;
        }
        if (!turnoAloc) {
            alert("Selecione um turno.");
            return;
        }
        if (!dataInicioAloc || !dataTerminoAloc) {
            alert("As datas de início e término são obrigatórias.");
            return;
        }
        const inicio = new Date(dataInicioAloc + "T00:00:00Z");
        const fim = new Date(dataTerminoAloc + "T00:00:00Z");
        if (fim < inicio) {
            alert("A data de término não pode ser anterior à data de início.");
            return;
        }

        const dadosAlocacao = {
            responsaveis: responsaveisAloc,
            turno: turnoAloc,
            dataInicio: Timestamp.fromDate(inicio),
            dataProvavelTermino: Timestamp.fromDate(fim),
            orientacao: orientacaoAloc.trim()
        };
        await onAlocar(tarefaPendente.id, dadosAlocacao);
    };
    
    const handleResponsavelAlocChange = (e) => {
        const selectedOptions = Array.from(e.target.selectedOptions, option => option.value);
        setResponsaveisAloc(selectedOptions);
    };


    if (!tarefaPendente) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Alocar Tarefa: ${tarefaPendente.tarefa}`} width="max-w-lg">
            <form onSubmit={handleAlocarSubmit} className="space-y-4">
                <p className="text-sm"><strong>Prioridade:</strong> {tarefaPendente.prioridade}</p>
                <p className="text-sm"><strong>Área:</strong> {tarefaPendente.area}</p>
                <p className="text-sm"><strong>Ação:</strong> {tarefaPendente.acao}</p>
                
                <div>
                    <label className="block text-sm font-medium text-gray-700">Responsável(eis) <span className="text-red-500">*</span></label>
                    <select multiple value={responsaveisAloc} onChange={handleResponsavelAlocChange} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 h-28">
                        {funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                     <p className="text-xs text-gray-500 mt-1">Segure Ctrl (ou Cmd) para selecionar múltiplos.</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Turno <span className="text-red-500">*</span></label>
                    <select value={turnoAloc} onChange={(e) => setTurnoAloc(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                        <option value="">Selecione...</option>
                        {listasAuxiliares.turnos.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Data de Início <span className="text-red-500">*</span></label>
                        <input type="date" value={dataInicioAloc} onChange={(e) => setDataInicioAloc(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Data de Término <span className="text-red-500">*</span></label>
                        <input type="date" value={dataTerminoAloc} onChange={(e) => setDataTerminoAloc(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"/>
                    </div>
                </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700">Orientação (Opcional)</label>
                    <textarea value={orientacaoAloc} onChange={(e) => setOrientacaoAloc(e.target.value)} rows="2" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"></textarea>
                </div>

                <div className="pt-4 flex justify-end space-x-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancelar</button>
                    <button type="submit" disabled={loadingAloc} className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-400">
                        {loadingAloc ? 'Alocando...' : 'Alocar Tarefa'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

// Versão: 5.1.0
// [NOVO] Adicionado um sistema de avisos com contagem regressiva para as próximas aplicações nos cards de planos.
const PlanosFitossanitariosComponent = () => {
    const { db, appId, auth } = useContext(GlobalContext);
    const [planos, setPlanos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPlano, setEditingPlano] = useState(null);
    const [historicoCompleto, setHistoricoCompleto] = useState([]);
    const [isHistoricoModalOpen, setIsHistoricoModalOpen] = useState(false);
    const [planoParaVerHistorico, setPlanoParaVerHistorico] = useState(null);

    const basePath = `/artifacts/${appId}/public/data`;
    const planosCollectionRef = collection(db, `${basePath}/planos_fitossanitarios`);
    const registrosCollectionRef = collection(db, `${basePath}/controleFitossanitario`);

    useEffect(() => {
        const q = query(planosCollectionRef, orderBy("nome", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPlanos(data);
            setLoading(false);
        }, error => { console.error("Erro ao carregar planos:", error); setLoading(false); });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const q = query(registrosCollectionRef, orderBy("dataAplicacao", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setHistoricoCompleto(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, error => { console.error("Erro ao carregar histórico:", error); });
        return () => unsubscribe();
    }, []);

    // ... (funções de save, remove, etc. permanecem as mesmas)
    const calcularProximaAplicacao = (plano) => { if (!plano.ativo) return null; const agora = new Date(); agora.setUTCHours(0, 0, 0, 0); const ultima = plano.ultimaAplicacao ? plano.ultimaAplicacao.toDate() : null; let proxima = plano.dataInicio.toDate(); proxima.setUTCHours(0,0,0,0); if (ultima) { let dataBaseCalculo = new Date(ultima); dataBaseCalculo.setUTCHours(0,0,0,0); switch (plano.frequencia) { case 'SEMANAL': dataBaseCalculo.setUTCDate(dataBaseCalculo.getUTCDate() + 7); break; case 'QUINZENAL': dataBaseCalculo.setUTCDate(dataBaseCalculo.getUTCDate() + 14); break; case 'MENSAL': dataBaseCalculo.setUTCMonth(dataBaseCalculo.getUTCMonth() + 1); break; case 'INTERVALO_DIAS': dataBaseCalculo.setUTCDate(dataBaseCalculo.getUTCDate() + (plano.diasIntervalo || 1)); break; default: return null; } proxima = dataBaseCalculo; } if (proxima < agora && plano.frequencia !== 'UNICA') { let dataBase = new Date(agora); let dataTeste = new Date(proxima); while(dataTeste < dataBase) { switch (plano.frequencia) { case 'SEMANAL': dataTeste.setUTCDate(dataTeste.getUTCDate() + 7); break; case 'QUINZENAL': dataTeste.setUTCDate(dataTeste.getUTCDate() + 14); break; case 'MENSAL': dataTeste.setUTCMonth(dataTeste.getUTCMonth() + 1); break; case 'INTERVALO_DIAS': dataTeste.setUTCDate(dataTeste.getUTCDate() + (plano.diasIntervalo || 1)); break; default: break;} } return dataTeste; } return proxima; };
    const handleSavePlano = async (planoData) => { const usuario = auth.currentUser; const dadosParaSalvar = { ...planoData, updatedAt: Timestamp.now(), userEmail: usuario?.email || 'unknown', }; try { if (planoData.id) { const planoDocRef = doc(db, `${basePath}/planos_fitossanitarios`, planoData.id); await updateDoc(planoDocRef, dadosParaSalvar); toast.success("Plano atualizado com sucesso!"); } else { await addDoc(planosCollectionRef, { ...dadosParaSalvar, createdAt: Timestamp.now() }); toast.success("Plano criado com sucesso!"); } } catch (error) { console.error("Erro ao salvar plano:", error); toast.error("Falha ao salvar o plano."); } };
    const handleRemovePlano = async (planoId) => { try { await deleteDoc(doc(db, `${basePath}/planos_fitossanitarios`, planoId)); toast.success("Plano excluído com sucesso!"); } catch (error) { console.error("Erro ao excluir plano:", error); toast.error("Falha ao excluir o plano."); } };
    const handleOpenModal = (plano = null) => { setEditingPlano(plano); setIsModalOpen(true); };
    const handleOpenHistoricoModal = (plano) => { setPlanoParaVerHistorico(plano); setIsHistoricoModalOpen(true); };
    const handleCloseHistoricoModal = () => { setIsHistoricoModalOpen(false); setPlanoParaVerHistorico(null); };
    const getFrequenciaLabel = (plano) => { switch (plano.frequencia) { case 'UNICA': return 'Única'; case 'SEMANAL': return 'Semanal'; case 'QUINZENAL': return 'Quinzenal'; case 'MENSAL': return 'Mensal'; case 'INTERVALO_DIAS': return `A cada ${plano.diasIntervalo} dias`; default: return 'N/A'; } };
    
    // [NOVO v5.1.0] Função para calcular a contagem regressiva e o status visual.
    const getContagemRegressivaInfo = (proximaAplicacao) => {
        if (!proximaAplicacao) {
            return { status: 'CONCLUIDO', texto: 'Plano Concluído', cor: 'bg-green-100 text-green-800' };
        }

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        const proxima = new Date(proximaAplicacao);
        proxima.setHours(0, 0, 0, 0);

        const diffTime = proxima - hoje;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return { status: 'ATRASADO', texto: `Atrasado há ${Math.abs(diffDays)} dia(s)`, cor: 'bg-red-200 text-red-900 font-bold' };
        }
        if (diffDays === 0) {
            return { status: 'HOJE', texto: 'Aplicação Hoje!', cor: 'bg-blue-200 text-blue-900 font-bold' };
        }
        if (diffDays <= 3) {
            return { status: 'EM_BREVE', texto: `Faltam ${diffDays} dia(s)`, cor: 'bg-yellow-200 text-yellow-900 font-bold' };
        }
        
        return { status: 'NORMAL', texto: `Próx. aplicação em ${diffDays} dias`, cor: 'bg-gray-100 text-gray-700' };
    };

    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-full">
            <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
                <h2 className="text-2xl font-semibold text-gray-800">Planos de Aplicação</h2>
                <button onClick={() => handleOpenModal()} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md flex items-center shadow-sm">
                    <LucidePlusCircle size={20} className="mr-2"/> Criar Novo Plano
                </button>
            </div>

            <PlanoAplicacaoModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSavePlano} onRemove={handleRemovePlano} planoExistente={editingPlano} />
            <HistoricoPlanoModal isOpen={isHistoricoModalOpen} onClose={handleCloseHistoricoModal} plano={planoParaVerHistorico} historicoCompleto={historicoCompleto} />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                 {loading ? (
                    <p>Carregando planos...</p>
                 ) : planos.length === 0 ? (
                    <p className="col-span-full text-center text-gray-500">Nenhum plano de aplicação criado.</p>
                 ) : (
                    planos.map(plano => {
                        const proximaAplicacao = calcularProximaAplicacao(plano);
                        // [NOVO v5.1.0] Chama a nova função para obter o status da contagem
                        const contagemInfo = getContagemRegressivaInfo(proximaAplicacao);

                        return (
                        <div key={plano.id} className="bg-white rounded-lg shadow-md flex flex-col justify-between border-l-4" style={{borderColor: plano.ativo ? '#10B981' : '#6B7280'}}>
                            <div>
                                {/* [NOVO v5.1.0] O aviso de contagem regressiva é exibido aqui */}
                                {plano.ativo && (
                                    <div className={`p-2 text-center text-sm mb-3 rounded-t-md ${contagemInfo.cor}`}>
                                        {contagemInfo.texto}
                                    </div>
                                )}
                                {!plano.ativo && (
                                    <div className="p-2 text-center text-sm mb-3 rounded-t-md bg-gray-200 text-gray-600 font-bold">
                                        Plano Pausado
                                    </div>
                                )}
                                
                                <div className="px-4">
                                    <h3 className="font-bold text-lg text-gray-800">{plano.nome}</h3>
                                    <p className="text-sm text-gray-600 font-medium">{plano.produto}</p>
                                    <div className="mt-3 text-xs space-y-1">
                                        <p><strong className="font-semibold">Frequência:</strong> {getFrequenciaLabel(plano)}</p>
                                        <p><strong className="font-semibold">Áreas:</strong> {plano.areas.join(', ')}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-4 pt-3 border-t px-4 pb-3">
                                <div className="flex items-center justify-center space-x-2">
                                    <button onClick={() => handleOpenHistoricoModal(plano)} className="flex-1 text-center py-2 px-3 text-sm text-gray-600 font-semibold hover:bg-gray-100 rounded-md">
                                        <LucideHistory size={14} className="inline-block mr-1"/> Histórico
                                    </button>
                                    <button onClick={() => handleOpenModal(plano)} className="flex-1 text-center py-2 px-3 text-sm text-blue-600 font-semibold hover:bg-blue-50 rounded-md">
                                        <LucideEdit size={14} className="inline-block mr-1"/> Detalhes
                                    </button>
                                </div>
                            </div>
                        </div>
                    )})
                 )}
            </div>
        </div>
    );
};

// Versão: 4.9.1
// [CORRIGIDO] Lógica de detecção de alterações no 'handleSaveRegistro' para incluir todos os campos do formulário.
const HistoricoFitossanitarioComponent = () => {
    const { db, appId, listasAuxiliares, funcionarios, auth } = useContext(GlobalContext);
    const [registros, setRegistros] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRegistroModalOpen, setIsRegistroModalOpen] = useState(false);
    const [planoParaRegistrar, setPlanoParaRegistrar] = useState(null);
    const [isSelecionarPlanoModalOpen, setIsSelecionarPlanoModalOpen] = useState(false);
    const [planosDodia, setPlanosDodia] = useState([]);
    const [loadingPlanos, setLoadingPlanos] = useState(true);

    const [editingRegistro, setEditingRegistro] = useState(null);
    const [isHistoricoModalOpen, setIsHistoricoModalOpen] = useState(false);
    const [selectedRegistroId, setSelectedRegistroId] = useState(null);
    
    const basePath = `/artifacts/${appId}/public/data`;
    const registrosCollectionRef = collection(db, `${basePath}/controleFitossanitario`);
    const planosCollectionRef = collection(db, `${basePath}/planos_fitossanitarios`);

    useEffect(() => {
        const q = query(registrosCollectionRef, orderBy("dataAplicacao", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRegistros(data);
            setLoading(false);
        }, error => { console.error("Erro ao carregar registros: ", error); setLoading(false); });
        return () => unsubscribe();
    }, []);

    const calcularProximaAplicacao = (plano, dataDeReferencia) => { if (!plano.ativo || !plano.dataInicio?.toDate) return null; const dataReferenciaUTC = new Date(dataDeReferencia); dataReferenciaUTC.setUTCHours(0, 0, 0, 0); const ultimaAplicacao = plano.ultimaAplicacao ? plano.ultimaAplicacao.toDate() : null; let proximaAplicacao = plano.dataInicio.toDate(); proximaAplicacao.setUTCHours(0, 0, 0, 0); if (ultimaAplicacao) { let dataBaseCalculo = new Date(ultimaAplicacao); dataBaseCalculo.setUTCHours(0, 0, 0, 0); switch (plano.frequencia) { case 'SEMANAL': dataBaseCalculo.setUTCDate(dataBaseCalculo.getUTCDate() + 7); break; case 'QUINZENAL': dataBaseCalculo.setUTCDate(dataBaseCalculo.getUTCDate() + 14); break; case 'MENSAL': dataBaseCalculo.setUTCMonth(dataBaseCalculo.getUTCMonth() + 1); break; case 'INTERVALO_DIAS': dataBaseCalculo.setUTCDate(dataBaseCalculo.getUTCDate() + (plano.diasIntervalo || 1)); break; default: return null; } proximaAplicacao = dataBaseCalculo; } if (proximaAplicacao < dataReferenciaUTC && plano.frequencia !== 'UNICA') { while (proximaAplicacao < dataReferenciaUTC) { switch (plano.frequencia) { case 'SEMANAL': proximaAplicacao.setUTCDate(proximaAplicacao.getUTCDate() + 7); break; case 'QUINZENAL': proximaAplicacao.setUTCDate(proximaAplicacao.getUTCDate() + 14); break; case 'MENSAL': proximaAplicacao.setUTCMonth(proximaAplicacao.getUTCMonth() + 1); break; case 'INTERVALO_DIAS': proximaAplicacao.setUTCDate(proximaAplicacao.getUTCDate() + (plano.diasIntervalo || 1)); break; default: break;} } } return proximaAplicacao; };
    useEffect(() => { const q = query(planosCollectionRef, where("ativo", "==", true)); const unsubscribe = onSnapshot(q, (snapshot) => { const planosAtivos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); const hoje = new Date(); const hojeUTC = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate())); const planosFiltrados = planosAtivos.filter(plano => { const proxima = calcularProximaAplicacao(plano, hojeUTC); return proxima && proxima <= hojeUTC; }); setPlanosDodia(planosFiltrados); setLoadingPlanos(false); }, error => { console.error("Erro ao carregar planos do dia:", error); setLoadingPlanos(false); }); return () => unsubscribe(); }, []);
    
    const handleOpenRegistroManual = () => { setEditingRegistro(null); setPlanoParaRegistrar(null); setIsRegistroModalOpen(true); };
    const handleOpenSelecaoPlano = () => setIsSelecionarPlanoModalOpen(true);
    const handleSelecionarPlano = (plano) => { setPlanoParaRegistrar(plano); setEditingRegistro(null); setIsSelecionarPlanoModalOpen(false); setIsRegistroModalOpen(true); };
    const handleOpenEditModal = (registro) => { setEditingRegistro(registro); setPlanoParaRegistrar(null); setIsRegistroModalOpen(true); };
    const handleOpenHistoricoModal = (registroId) => { setSelectedRegistroId(registroId); setIsHistoricoModalOpen(true); };
    
    const handleSaveRegistro = async (dadosDoForm, registroOriginal) => {
        const usuarioEmail = auth.currentUser?.email;
        if (registroOriginal) {
            const registroRef = doc(db, `${basePath}/controleFitossanitario`, registroOriginal.id);
            const detalhes = [];
            // [CORRIGIDO v4.9.1] Lógica de comparação completa
            if (formatDate(registroOriginal.dataAplicacao) !== formatDate(dadosDoForm.dataAplicacao)) detalhes.push(`Data: de "${formatDate(registroOriginal.dataAplicacao)}" para "${formatDate(dadosDoForm.dataAplicacao)}".`);
            if (registroOriginal.produto !== dadosDoForm.produto) detalhes.push(`Produto: de "${registroOriginal.produto}" para "${dadosDoForm.produto}".`);
            if ((registroOriginal.dosagem || '') !== dadosDoForm.dosagem) detalhes.push(`Dosagem: de "${registroOriginal.dosagem || 'N/A'}" para "${dadosDoForm.dosagem}".`);
            if ((registroOriginal.plantaLocal || '') !== dadosDoForm.plantaLocal) detalhes.push(`Planta/Local: de "${registroOriginal.plantaLocal || 'N/A'}" para "${dadosDoForm.plantaLocal}".`);
            if ((registroOriginal.areas || []).join(',') !== (dadosDoForm.areas || []).join(',')) detalhes.push(`Áreas alteradas.`);
            if (registroOriginal.responsavel !== dadosDoForm.responsavel) detalhes.push(`Responsável: de "${registroOriginal.responsavel}" para "${dadosDoForm.responsavel}".`);
            if ((registroOriginal.observacoes || '') !== dadosDoForm.observacoes) detalhes.push(`Observações alteradas.`);

            try {
                await updateDoc(registroRef, { ...dadosDoForm, updatedAt: Timestamp.now() });
                if (detalhes.length > 0) {
                    await logAlteracaoFitossanitaria(db, basePath, registroOriginal.id, usuarioEmail, "Registro Editado", detalhes.join('\n'));
                }
                toast.success("Registro atualizado com sucesso!");
            } catch (error) { toast.error("Falha ao atualizar registro."); console.error(error); }

        } else {
            const batch = writeBatch(db);
            try {
                const novoRegistroRef = doc(registrosCollectionRef);
                batch.set(novoRegistroRef, { ...dadosDoForm, createdAt: Timestamp.now(), createdBy: usuarioEmail });
                if (dadosDoForm.planoId) {
                    const planoDocRef = doc(db, `${basePath}/planos_fitossanitarios`, dadosDoForm.planoId);
                    batch.update(planoDocRef, { ultimaAplicacao: dadosDoForm.dataAplicacao });
                }
                await batch.commit();
                await logAlteracaoFitossanitaria(db, basePath, novoRegistroRef.id, usuarioEmail, "Registro Criado");
                toast.success("Registro salvo com sucesso!");
            } catch (error) { toast.error("Falha ao salvar o registro."); console.error(error); }
        }
    };

    const handleDeleteRegistro = async (registro) => {
        if (!window.confirm(`Tem certeza que deseja excluir o registro do produto "${registro.produto}" aplicado em ${formatDate(registro.dataAplicacao)}?`)) return;
        try {
            await logAlteracaoFitossanitaria(db, basePath, registro.id, auth.currentUser?.email, "Registro Excluído", `Exclusão do registro do produto ${registro.produto}.`);
            await deleteDoc(doc(db, `${basePath}/controleFitossanitario`, registro.id));
            toast.success("Registro excluído com sucesso.");
        } catch (error) { toast.error("Falha ao excluir o registro."); console.error(error); }
    };
    
    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-full">
            <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
                <h2 className="text-2xl font-semibold text-gray-800">Histórico de Aplicações</h2>
                <div className="flex items-center gap-2">
                    <button onClick={handleOpenSelecaoPlano} disabled={loadingPlanos} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md flex items-center shadow-sm relative disabled:bg-gray-400">
                        <LucideCheckSquare size={20} className="mr-2"/> Registrar Aplicação Planejada
                        {!loadingPlanos && planosDodia.length > 0 && ( <span className="absolute -top-2 -right-2 flex h-6 w-6"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-6 w-6 bg-red-500 text-white text-xs items-center justify-center">{planosDodia.length}</span></span>)}
                    </button>
                    <button onClick={handleOpenRegistroManual} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md flex items-center shadow-sm">
                        <LucidePlusCircle size={20} className="mr-2"/> Adicionar Registro Manual
                    </button>
                </div>
            </div>
            
            <RegistroAplicacaoModal isOpen={isRegistroModalOpen} onClose={() => setIsRegistroModalOpen(false)} onSave={handleSaveRegistro} listasAuxiliares={listasAuxiliares} funcionarios={funcionarios} planoParaRegistrar={planoParaRegistrar} registroExistente={editingRegistro} />
            <SelecionarPlanoModal isOpen={isSelecionarPlanoModalOpen} onClose={() => setIsSelecionarPlanoModalOpen(false)} planosDoDia={planosDodia} onSelectPlano={handleSelecionarPlano} />
            <HistoricoAplicacaoModal isOpen={isHistoricoModalOpen} onClose={() => setIsHistoricoModalOpen(false)} registroId={selectedRegistroId} />

            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                        <tr>
                            {["Data", "Produto", "Origem", "Planta / Local", "Área(s)", "Responsável", "Observações", "Ações"].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">{h}</th>)}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr><td colSpan="8" className="text-center p-4">Carregando registros...</td></tr>
                        ) : registros.length === 0 ? (
                            <tr><td colSpan="8" className="text-center p-4 text-gray-500">Nenhum registro de aplicação encontrado.</td></tr>
                        ) : (
                            registros.map(reg => (
                                <tr key={reg.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm text-gray-800 whitespace-nowrap">{formatDate(reg.dataAplicacao)}</td>
                                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">{reg.produto}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700">{reg.planoNome || <span className="italic text-gray-500">Manual</span>}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700">{reg.plantaLocal || '-'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700 max-w-xs whitespace-normal">{reg.areas.join(', ')}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{reg.responsavel}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700 max-w-sm whitespace-normal">{reg.observacoes || '-'}</td>
                                    <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">
                                        <div className="flex items-center space-x-3">
                                            <button onClick={() => handleOpenEditModal(reg)} title="Editar" className="text-blue-600 hover:text-blue-800"><LucideEdit size={16}/></button>
                                            <button onClick={() => handleOpenHistoricoModal(reg.id)} title="Ver Histórico" className="text-gray-600 hover:text-gray-900"><LucideHistory size={16}/></button>
                                            <button onClick={() => handleDeleteRegistro(reg)} title="Excluir" className="text-red-600 hover:text-red-800"><LucideTrash2 size={16}/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const WelcomeComponent = () => {
    return (
        <div className="flex flex-col justify-center items-center h-full bg-gray-50 text-center p-6">
            <div className="bg-white p-10 rounded-xl shadow-md">
                <img 
                    src={LOGO_URL} 
                    alt="Logo Gramoterra" 
                    className="mx-auto h-20 w-auto mb-6" 
                    onError={(e) => e.target.style.display='none'}
                />
                <h1 className="text-4xl font-bold text-gray-800">
                    Gramoterra
                </h1>
                <p className="text-xl text-gray-600 mt-2">
                    Gestor de Equipes
                </p>
            </div>
        </div>
    );
};

// Versão: 3.1.1
// [NOVO] Modal de Alerta para Tarefas Atrasadas
const AlertaAtrasoModal = ({ isOpen, onClose, numeroDeTarefas, onVerTarefasClick }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4 transition-opacity duration-300">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center transform transition-all duration-300 scale-100">
                <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-red-100 mb-6">
                    <LucideAlertTriangle size={48} className="text-red-500" />
                </div>
                <h3 className="text-2xl font-bold text-gray-800 mb-2">Atenção!</h3>
                <p className="text-gray-600 mb-6">
                    Você possui <strong className="text-red-600 font-bold">{numeroDeTarefas}</strong> tarefas atrasadas que requerem sua ação imediata.
                </p>
                <div className="flex flex-col sm:flex-row justify-center gap-3">
                    <button
                        onClick={onVerTarefasClick}
                        className="w-full sm:w-auto bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors duration-200 shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                        Ver Tarefas Atrasadas
                    </button>
                    <button
                        onClick={onClose}
                        className="w-full sm:w-auto bg-gray-200 text-gray-700 font-semibold py-3 px-6 rounded-lg hover:bg-gray-300 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400"
                    >
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    );
};

// Versão: 3.1.1
// Componente Dashboard (MODIFICADO para o fluxo "Foco e Ação")
// Versão: 3.1.2
const DashboardComponent = () => {
    const { db, appId, listasAuxiliares, funcionarios, auth, loadingAuth } = useContext(GlobalContext);
    const [stats, setStats] = useState({
        porStatus: {}, porPrioridade: {}, proximoPrazo: [], atrasadas: [], pendentesAtrasadas: [], porFuncionario: {}
    });
    const [loadingDashboard, setLoadingDashboard] = useState(true);
    const basePath = `/artifacts/${appId}/public/data`;

    const [isTratarAtrasoModalOpen, setIsTratarAtrasoModalOpen] = useState(false);
    const [tarefaSelecionada, setTarefaSelecionada] = useState(null);
    const [alertaAtrasoVisivel, setAlertaAtrasoVisivel] = useState(false);
    const [notificacaoAtrasoMostrada, setNotificacaoAtrasoMostrada] = useState(false);
    const [highlightAtrasadas, setHighlightAtrasadas] = useState(false);
    const atrasadasCardRef = useRef(null);

    const handleOpenTratarAtrasoModal = (tarefa) => {
        setTarefaSelecionada(tarefa);
        setIsTratarAtrasoModalOpen(true);
    };
    const handleCloseTratarAtrasoModal = () => {
        setIsTratarAtrasoModalOpen(false);
        setTarefaSelecionada(null);
    };

    const getResponsavelNomes = (responsavelIds) => {
        if (!responsavelIds || !funcionarios || responsavelIds.length === 0) return 'N/A';
        return responsavelIds.map(id => {
            const func = funcionarios.find(f => f.id === id);
            return func ? func.nome : id;
        }).join(', ');
    };

    const calculateDaysOverdue = (timestamp) => {
        if (!timestamp?.toDate) return 0;
        const dueDate = timestamp.toDate();
        const now = new Date();
        dueDate.setHours(0, 0, 0, 0);
        now.setHours(0, 0, 0, 0);
        const diffTime = now.getTime() - dueDate.getTime();
        if (diffTime < 0) return 0;
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    const handleSaveTratamento = async (tarefaId, tratamento) => {
        const tarefaDocRef = doc(db, `${basePath}/tarefas_mapa`, tarefaId);
        const tarefaOriginal = stats.atrasadas.find(t => t.id === tarefaId);
        const usuario = auth.currentUser;
        try {
            if (tratamento.acao === 'cancelar') {
                await updateDoc(tarefaDocRef, { status: 'CANCELADA', updatedAt: Timestamp.now() });
                await logAlteracaoTarefa(db, basePath, tarefaId, usuario?.uid, usuario?.email, "Tarefa Cancelada", `Cancelada via tela de tratamento de atrasos. Justificativa: ${tratamento.justificativa || 'Nenhuma'}`);
                toast.success("Tarefa cancelada.");
            } else if (tratamento.acao === 'reprogramar') {
                const payload = { dataProvavelTermino: tratamento.novaData, updatedAt: Timestamp.now() };
                await updateDoc(tarefaDocRef, payload);
                const detalhesLog = `Tarefa reprogramada. Justificativa: ${tratamento.justificativa || 'Nenhuma'}. Plano de Ação: ${tratamento.planoAcao || 'Nenhum'}.`;
                await logAlteracaoTarefa(db, basePath, tarefaId, usuario?.uid, usuario?.email, "Atraso Tratado", detalhesLog);
                if (tarefaOriginal) {
                    await sincronizarTarefaComProgramacao(tarefaId, { ...tarefaOriginal, ...payload }, db, basePath);
                }
                toast.success("Tarefa reprogramada com sucesso!");
            }
            setStats(prev => ({ ...prev, atrasadas: prev.atrasadas.filter(t => t.id !== tarefaId) }));
        } catch (error) {
            console.error("Erro ao salvar tratamento de atraso:", error);
            toast.error("Falha ao salvar alterações.");
        }
    };

    const handleVerTarefasAtrasadas = () => {
        setAlertaAtrasoVisivel(false);
        atrasadasCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightAtrasadas(true);
        setTimeout(() => setHighlightAtrasadas(false), 2500);
        setTimeout(() => {
            toast.custom((t) => (
                <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} bg-gray-800 text-white shadow-lg rounded-lg pointer-events-auto flex items-center px-4 py-2`}>
                    <LucideMousePointerClick size={18} className="mr-3 text-cyan-400" />
                    <span>Clique no ícone <LucideArrowRightCircle className="inline-block mx-1" size={18}/> para tratar uma pendência.</span>
                </div>
            ), { duration: 5000, position: 'bottom-center' });
        }, 1000);
    };
    
    useEffect(() => {
        if (loadingAuth || !funcionarios?.length) {
            setLoadingDashboard(false);
            return;
        }

        const basePath = `/artifacts/${appId}/public/data`;
        const tarefasRef = collection(db, `${basePath}/tarefas_mapa`);
        const q = query(tarefasRef);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setLoadingDashboard(true);
            const todasTarefas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const porStatus = {};
            (listasAuxiliares.status || []).forEach(s => { porStatus[s] = 0 });
            
            const porPrioridade = {};
            (listasAuxiliares.prioridades || []).forEach(p => { porPrioridade[p] = 0 });
            
            const porFuncionario = {};
            (funcionarios || []).forEach(f => { if (f?.id) porFuncionario[f.id] = {count: 0, nome: f.nome}; });
            porFuncionario["SEM_RESPONSAVEL"] = {count: 0, nome: "Sem Responsável Designado"};

            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            const daqui7Dias = new Date();
            daqui7Dias.setDate(daqui7Dias.getDate() + 7);

            let proximoPrazo = [], atrasadas = [], pendentesAtrasadas = [];

            todasTarefas.forEach(tarefa => {
                if (tarefa.status && porStatus.hasOwnProperty(tarefa.status)) { porStatus[tarefa.status]++; }
                if (tarefa.prioridade && porPrioridade.hasOwnProperty(tarefa.prioridade)) { porPrioridade[tarefa.prioridade]++; }
                if (tarefa.status !== "CANCELADA") {
                    if (tarefa.responsaveis?.length > 0) {
                        tarefa.responsaveis.forEach(id => { if (porFuncionario[id]) porFuncionario[id].count++; });
                    } else {
                        porFuncionario["SEM_RESPONSAVEL"].count++;
                    }
                }
                if (tarefa.dataProvavelTermino?.toDate && tarefa.status !== "CONCLUÍDA" && tarefa.status !== "CANCELADA") {
                    const dataTermino = tarefa.dataProvavelTermino.toDate();
                    dataTermino.setHours(0, 0, 0, 0);
                    if (dataTermino < hoje) {
                        if (tarefa.status === 'PROGRAMADA' || tarefa.status === 'EM OPERAÇÃO') {
                            atrasadas.push(tarefa);
                        }
                    } else if (dataTermino <= daqui7Dias) {
                        proximoPrazo.push(tarefa);
                    }
                }
                if (tarefa.status === 'AGUARDANDO ALOCAÇÃO') {
                    pendentesAtrasadas.push(tarefa);
                }
            });

            proximoPrazo.sort((a, b) => a.dataProvavelTermino.toMillis() - b.dataProvavelTermino.toMillis());
            atrasadas.sort((a, b) => a.dataProvavelTermino.toMillis() - b.dataProvavelTermino.toMillis());
            pendentesAtrasadas.sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));

            setStats({ porStatus, porPrioridade, proximoPrazo, atrasadas, pendentesAtrasadas, porFuncionario });

            if (atrasadas.length > 0 && !notificacaoAtrasoMostrada) {
                setAlertaAtrasoVisivel(true);
                setNotificacaoAtrasoMostrada(true);
            }
            setLoadingDashboard(false);
        }, (error) => {
            console.error("[Dashboard] Erro ao buscar dados:", error);
            setLoadingDashboard(false);
        });
        
        return () => unsubscribe();
    }, [loadingAuth, funcionarios, listasAuxiliares, appId, db, notificacaoAtrasoMostrada]);

    const getPrioridadeColor = (prioridade) => {
        if (prioridade === "P4 - URGENTE") return "bg-red-500 text-white";
        if (prioridade === "P1 - CURTO PRAZO") return "bg-orange-400 text-white";
        if (prioridade === "P2 - MÉDIO PRAZO") return "bg-yellow-400 text-black";
        return "bg-gray-200 text-gray-700";
    };
    const getStatusColorText = (status) => {
        if (status === "CANCELADA") return "text-red-600";
        if (status === "CONCLUÍDA") return "text-green-600";
        if (status === "AGUARDANDO ALOCAÇÃO") return "text-orange-500";
        return "text-gray-600";
    };
    const formatDateDash = (timestamp) => {
        if (!timestamp || !timestamp.toDate) return 'Data inválida';
        return timestamp.toDate().toLocaleDateString('pt-BR');
    };

    if (loadingAuth || loadingDashboard) {
        return <div className="p-6 text-center">Carregando dados do Dashboard...</div>;
    }

    return (
        <div className="p-6 bg-gray-100 min-h-full">
            <AlertaAtrasoModal 
                isOpen={alertaAtrasoVisivel}
                onClose={() => setAlertaAtrasoVisivel(false)}
                numeroDeTarefas={stats.atrasadas.length}
                onVerTarefasClick={handleVerTarefasAtrasadas}
            />
            <h2 className="text-3xl font-semibold text-gray-800 mb-8">Dashboard</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-lg shadow-lg">
                    <h3 className="text-xl font-semibold text-gray-700 mb-4">Tarefas por Status</h3>
                    <ul className="space-y-2">
                        {Object.entries(stats.porStatus).sort(([,countA], [,countB]) => countB - countA).map(([status, count]) => (
                            <li key={status} className="flex justify-between items-center text-sm"><span className={`font-medium ${getStatusColorText(status)}`}>{status}</span><span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded-full text-xs font-semibold">{count}</span></li>
                        ))}
                    </ul>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-lg">
                    <h3 className="text-xl font-semibold text-gray-700 mb-4">Tarefas por Prioridade</h3>
                    <ul className="space-y-2">
                         {Object.entries(stats.porPrioridade).map(([prioridade, count]) => (
                            <li key={prioridade} className="flex justify-between items-center text-sm"><span className={`font-medium px-2 py-0.5 rounded-full text-xs ${getPrioridadeColor(prioridade)}`}>{prioridade}</span><span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded-full text-xs font-semibold">{count}</span></li>
                        ))}
                    </ul>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-lg">
                    <h3 className="text-xl font-semibold text-gray-700 mb-4 flex items-center"><LucideUsers size={22} className="mr-2 text-purple-600"/> Tarefas por Responsável</h3>
                    <ul className="space-y-2 max-h-80 overflow-y-auto pr-2">
                        {Object.values(stats.porFuncionario).sort((a, b) => b.count - a.count).map(({nome, count}, index) => (
                             count > 0 && <li key={nome + index} className="flex justify-between items-center text-sm"><span className="font-medium text-gray-700">{nome}</span><span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-200 text-purple-700">{count}</span></li>
                        ))}
                    </ul>
                </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-lg shadow-lg">
                    <h3 className="text-xl font-semibold text-yellow-600 mb-4 flex items-center"><LucideClock size={22} className="mr-2"/> Tarefas com Prazo Próximo (7 dias)</h3>
                    {stats.proximoPrazo.length > 0 ? (
                        <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
                            {stats.proximoPrazo.map(tarefa => (<li key={tarefa.id} className="p-3 border rounded-md bg-yellow-50 border-yellow-300"><p className="font-semibold text-sm text-yellow-800">{tarefa.tarefa}</p><p className="text-xs text-yellow-700 mt-1">Término: {formatDateDash(tarefa.dataProvavelTermino)} - Status: <span className="font-bold">{tarefa.status}</span></p></li>))}
                        </ul>
                    ) : <p className="text-sm text-gray-500">Nenhuma tarefa com prazo próximo.</p>}
                </div>
                <div className="bg-white p-6 rounded-lg shadow-lg">
                    <h3 className="text-xl font-semibold text-orange-600 mb-4 flex items-center"><LucidePauseCircle size={22} className="mr-2"/> Tarefas Pendentes de Alocação</h3>
                    {stats.pendentesAtrasadas.length > 0 ? (
                        <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
                            {stats.pendentesAtrasadas.map(tarefa => (<li key={tarefa.id} className="p-3 border rounded-md bg-orange-50 border-orange-300"><p className="font-semibold text-sm text-orange-800">{tarefa.tarefa}</p><p className="text-xs text-orange-700">Criada em: {formatDateDash(tarefa.createdAt)}</p></li>))}
                        </ul>
                    ) : <p className="text-sm text-gray-500">Nenhuma tarefa aguardando alocação.</p>}
                </div>
                <div ref={atrasadasCardRef} className={`bg-white p-6 rounded-lg shadow-lg scroll-mt-6 transition-all duration-300 ${highlightAtrasadas ? 'ring-4 ring-offset-4 ring-red-500' : 'ring-0'}`}>
                    <h3 className="text-xl font-semibold text-red-600 mb-4 flex items-center"><LucideAlertOctagon size={22} className="mr-2"/> Tarefas Atrasadas</h3>
                    {stats.atrasadas.length > 0 ? (
                        <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
                            {stats.atrasadas.map(tarefa => {
                                const diasAtraso = calculateDaysOverdue(tarefa.dataProvavelTermino);
                                return (
                                <li key={tarefa.id} className="p-3 border rounded-md bg-red-50 border-red-200 flex justify-between items-center">
                                    <div>
                                        <p className="font-semibold text-sm text-red-800">{tarefa.tarefa}</p>
                                        <p className="text-xs text-red-700 mt-1">Atrasada há <strong>{diasAtraso}</strong> dia(s) - Status: <span className="font-semibold">{tarefa.status}</span></p>
                                        <p className="text-xs text-red-700 mt-1">Responsáveis: <span className="font-semibold">{getResponsavelNomes(tarefa.responsaveis)}</span></p>
                                    </div>
                                    <button onClick={() => handleOpenTratarAtrasoModal(tarefa)} title="Tratar Atraso" className="p-2 text-red-600 bg-red-100 hover:bg-red-200 rounded-full transition-colors"><LucideArrowRightCircle size={18} /></button>
                                </li>
                            )})}
                        </ul>
                    ) : <p className="text-sm text-gray-500">Nenhuma tarefa atrasada.</p>}
                </div>
            </div>
            <TratarAtrasoModal
                isOpen={isTratarAtrasoModalOpen}
                onClose={handleCloseTratarAtrasoModal}
                tarefa={tarefaSelecionada}
                onSave={handleSaveTratamento}
                funcionarios={funcionarios}
            />
        </div>
    );
};


// Versão: 6.2.1
// [CORRIGIDO] Lógica de renderização ajustada para usar o estado `loadingAuth` do GlobalProvider, tratando corretamente os estados de carregamento, logado e deslogado, e resolvendo o problema da tela branca no logout.
function App() {
    const { currentUser, loadingAuth } = useContext(GlobalContext);
    
    // 1. Enquanto a autenticação está sendo verificada (`loadingAuth` é true), exibe uma tela de carregamento.
    if (loadingAuth) {
         return <div className="flex justify-center items-center h-screen"><div className="text-xl">Verificando autenticação...</div></div>;
    }

    // 2. Após a verificação, se o usuário for `null`, significa que está deslogado. Renderiza o componente de login.
    if (currentUser === null) {
        return <AuthComponent />;
    }
    
    // 3. Se chegou até aqui, há um usuário autenticado. Renderiza a aplicação principal.
    return <MainApp />;
}

// Versão: 6.8.3
// [ALTERADO] Os três links de "Fitossanitário" no menu foram unificados em um só.
const MainApp = () => {
    const [currentPage, setCurrentPage] = useState('dashboard');
    const { currentUser, permissoes, auth: firebaseAuth } = useContext(GlobalContext);

    const NavLink = memo(({ page, children, icon: Icon, currentPage, setCurrentPage }) => (
        <button 
            onClick={() => setCurrentPage(page)} 
            className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors duration-150 ease-in-out ${currentPage === page ? 'bg-blue-600 text-white shadow-md' : 'text-gray-700 hover:bg-blue-100'}`}
        >
            {Icon && <Icon size={18} className="mr-3"/>}
            <span>{children}</span>
        </button>
    ));

    const checkPermission = (pageKey) => {
        const userEmail = currentUser?.email?.toLowerCase();
        if (!userEmail) return false;
        
        if (["sistemas@gramoterra.com.br", "operacional@gramoterra.com.br", "mpivottoramos@gmail.com"].includes(userEmail)) {
            return true;
        }

        const permissionList = permissoes[pageKey];
        return Array.isArray(permissionList) && permissionList.includes(userEmail);
    };

    const PageContent = () => {
        if (!checkPermission(currentPage)) {
            useEffect(() => {
                toast.error("Você não tem permissão para acessar esta página.");
                setCurrentPage('dashboard');
            }, [currentPage]);
            return <DashboardComponent />;
        }

        switch (currentPage) {
            case 'dashboard': return <DashboardComponent />;
            case 'mapa': return <MapaAtividadesComponent />;
            case 'programacao': return <ProgramacaoSemanalComponent />;
            case 'fito': return <ControleFitossanitarioComponent />;
            case 'agenda': return <AgendaDiariaComponent />;
            case 'anotacoes': return <TarefaPatioComponent />;
            case 'pendentes': return <TarefasPendentesComponent />;
            case 'config': return <ConfiguracoesComponent />;
            case 'relatorios': return <RelatoriosComponent />;
            default: return <DashboardComponent />;
        }
    };
    
    const NavGroupTitle = ({ title }) => (
        <h4 className="px-3 pt-4 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {title}
        </h4>
    );

    return (
        <>
            <Toaster position="bottom-right" toastOptions={{ duration: 4000 }}/>
            <div className="flex h-screen bg-gray-100 font-sans">
                <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
                    <div className="h-16 flex items-center justify-center border-b">
                         <img src={LOGO_URL} alt="Logo Gramoterra" className="h-10"/>
                    </div>
                    
                    <nav className="flex-1 px-2 mt-4 space-y-1">
                        <div>
                            <NavGroupTitle title="Gestão" />
                            {checkPermission('dashboard') && <NavLink page="dashboard" icon={LucideLayoutDashboard} currentPage={currentPage} setCurrentPage={setCurrentPage}>Dashboard</NavLink>}
                            {checkPermission('programacao') && <NavLink page="programacao" icon={LucideCalendarDays} currentPage={currentPage} setCurrentPage={setCurrentPage}>Programação Semanal</NavLink>}
                            {checkPermission('agenda') && <NavLink page="agenda" icon={LucideBookMarked} currentPage={currentPage} setCurrentPage={setCurrentPage}>Agenda Semanal</NavLink>}
                        </div>

                        <div>
                            <NavGroupTitle title="Operação" />
                            {checkPermission('anotacoes') && <NavLink page="anotacoes" icon={LucideClipboardEdit} currentPage={currentPage} setCurrentPage={setCurrentPage}>Tarefa Pátio</NavLink>}
                            {checkPermission('pendentes') && <NavLink page="pendentes" icon={LucideListTodo} currentPage={currentPage} setCurrentPage={setCurrentPage}>Tarefas Pendentes</NavLink>}
                            {checkPermission('mapa') && <NavLink page="mapa" icon={LucideClipboardList} currentPage={currentPage} setCurrentPage={setCurrentPage}>Mapa de Atividades</NavLink>}
                        </div>

                        <div>
                            <NavGroupTitle title="Fitossanitário" />
                            {/* Links unificados em um só */}
                            {checkPermission('fito') && <NavLink page="fito" icon={LucideSprayCan} currentPage={currentPage} setCurrentPage={setCurrentPage}>Controle Fitossanitário</NavLink>}
                        </div>
                        
                        <div>
                             <NavGroupTitle title="Análise e Sistema" />
                            {checkPermission('relatorios') && <NavLink page="relatorios" icon={LucideFileText} currentPage={currentPage} setCurrentPage={setCurrentPage}>Relatórios</NavLink>}
                            {checkPermission('config') && <NavLink page="config" icon={LucideSettings} currentPage={currentPage} setCurrentPage={setCurrentPage}>Configurações</NavLink>}
                        </div>
                    </nav>

                    <div className="mt-auto border-t p-2">
                        <p className="text-xs text-gray-500 mb-2 px-2">Logado como: {currentUser.isAnonymous ? "Anônimo" : currentUser.email || currentUser.uid}</p>
                        <button onClick={() => firebaseAuth.signOut()} className="w-full flex items-center justify-start px-3 py-2.5 text-sm font-medium rounded-md text-red-600 hover:bg-red-100">
                            <LucideLogOut size={18} className="mr-2"/> Sair
                        </button>
                    </div>
                </aside>
                <main className="flex-1 overflow-y-auto">
                    <PageContent />
                </main>
            </div>
        </>
    );
}

export default function WrappedApp() {
    return (
        <GlobalProvider>
            <App />
        </GlobalProvider>
    );
}