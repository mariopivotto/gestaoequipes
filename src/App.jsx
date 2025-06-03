import React, { useState, useEffect, createContext, useContext, memo } from 'react';
// Importa a instância do app Firebase já inicializada a partir de firebaseConfig.js
import firebaseAppInstance from './firebaseConfig'; 
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, doc, addDoc, getDocs, getDoc, setDoc, deleteDoc, onSnapshot, query, where, Timestamp, writeBatch, updateDoc, orderBy } from 'firebase/firestore'; 
import { LucidePlusCircle, LucideEdit, LucideTrash2, LucideCalendarDays, LucideClipboardList, LucideSettings, LucideStickyNote, LucideLogOut, LucideEye, LucideFilter, LucideUsers, LucideListChecks, LucideFileText, LucideCheckCircle, LucideXCircle, LucideRotateCcw, LucideRefreshCw, LucidePrinter, LucideCheckSquare, LucideSquare, LucideAlertCircle, LucideArrowRightCircle, LucideListTodo, LucideUserPlus, LucideSearch, LucideX, LucideLayoutDashboard, LucideAlertOctagon, LucideClock, LucideHistory, LucideUserCog } from 'lucide-react'; 

// Inicialização do Firebase usando a instância importada
const firebaseApp = firebaseAppInstance; // firebaseAppInstance DEVE ser a instância do app Firebase
const authGlobal = getAuth(firebaseApp); 
const db = getFirestore(firebaseApp);

// Usa o projectId da configuração do Firebase para o appId interno da aplicação
const appId = (firebaseApp && firebaseApp.options && firebaseApp.options.projectId) 
              ? firebaseApp.options.projectId 
              : 'default-app-id-fallback'; // Fallback se projectId não estiver disponível

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

// Função auxiliar para formatar data
const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    let date;
    if (timestamp instanceof Timestamp) {
        date = timestamp.toDate();
    } else if (timestamp && typeof timestamp.seconds === 'number' && typeof timestamp.nanoseconds === 'number') { 
        date = new Date(timestamp.seconds * 1000 + timestamp.nanoseconds / 1000000);
    } else if (timestamp instanceof Date) {
        date = timestamp;
    } else {
        return 'Data inválida';
    }
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
};


// Função para registrar histórico de alterações
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

async function sincronizarTarefaComProgramacao(tarefaId, tarefaData, db, basePath) {
    await removerTarefaDaProgramacao(tarefaId, db, basePath);

    if (tarefaData.status !== "PROGRAMADA" && tarefaData.status !== "CONCLUÍDA") {
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
        turno: tarefaData.turno || TURNO_DIA_INTEIRO 
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


const GlobalProvider = ({ children }) => {
    const DADOS_INICIAIS_CONFIG = {
        prioridades: ["P1 - CURTO PRAZO", "P2 - MÉDIO PRAZO", "P3 - LONGO PRAZO", "P4 - URGENTE"],
        areas: ["LADO 01", "LADO 02", "ANEXO A", "ANEXO B", "ANEXO C", "CANTEIRO CENTRAL", "LOJA", "OLIVEIRAS - ANT. REFEITORIO", "OLIVEIRAS - ESQUINA", "TERRENO - TEO (FRENTE ANT. REF.)", "PLANTÃO", "EXTERNO"],
        acoes: ["MANUTENÇÃO", "IRRIGAÇÃO", "PREVENÇÃO"],
        responsaveis: ["ALEX", "THIAGO", "BERNARD", "ADAIR", "ODAIR", "ENIVALDO", "MARCELO", "ROBERTO M.", "VALDIR (DUNA)", "GIOVANI (DIDIO)", "CARGA/DESCARGA"],
        status: ["PREVISTA", "PROGRAMADA", "CONCLUÍDA", "AGUARDANDO ALOCAÇÃO", "CANCELADA"],
        turnos: ["MANHÃ", "TARDE", "DIA INTEIRO"]
    };

    const [currentUser, setCurrentUser] = useState(null);
    const [userId, setUserId] = useState(null);
    const [loadingAuth, setLoadingAuth] = useState(true);
    const [listasAuxiliares, setListasAuxiliares] = useState({
        prioridades: [], areas: [], acoes: [], status: [], turnos: []
    });
    const [funcionarios, setFuncionarios] = useState([]);
    const [initialDataSeeded, setInitialDataSeeded] = useState(false);


    useEffect(() => {
        const unsubscribe = onAuthStateChanged(authGlobal, async (user) => { 
            if (user) {
                setCurrentUser(user);
                setUserId(user.uid);
            } else {
                try {
                    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                         console.warn("Initial auth token present, but custom token sign-in flow might need backend setup. Falling back to anonymous for now if direct sign-in fails or not implemented.");
                         await signInAnonymously(authGlobal); 
                    } else {
                        await signInAnonymously(authGlobal); 
                    }
                } catch (error) {
                    console.error("Erro no login anônimo ou customizado:", error);
                }
                setCurrentUser(authGlobal.currentUser); 
                setUserId(authGlobal.currentUser ? authGlobal.currentUser.uid : crypto.randomUUID());
            }
            setLoadingAuth(false);
        });
        return () => unsubscribe();
    }, []);

    // Seed Initial Data
    useEffect(() => {
        const seedInitialData = async () => {
            if (!db || !appId || initialDataSeeded || appId === 'default-app-id-fallback' || appId === 'default-app-id-fallback-no-app') { 
                if (appId === 'default-app-id-fallback' || appId === 'default-app-id-fallback-no-app') console.warn("[SeedData] appId é fallback, pulando seed.");
                return;
            }
            console.log("[SeedData] Tentando pré-carregar dados iniciais...");
            const basePath = `/artifacts/${appId}/public/data`;
            let seededSomething = false;
            const seedMarkerDocRef = doc(db, `${basePath}/app_metadata/initial_seed_status`); 

            try {
                const seedMarkerSnap = await getDoc(seedMarkerDocRef);
                if (seedMarkerSnap.exists() && seedMarkerSnap.data().seeded) { 
                    console.log("[SeedData] Dados iniciais já pré-carregados anteriormente (marcador encontrado e válido).");
                    setInitialDataSeeded(true);
                    return;
                }

                const listasParaSeed = [
                    { nomeCol: 'prioridades', data: DADOS_INICIAIS_CONFIG.prioridades },
                    { nomeCol: 'areas', data: DADOS_INICIAIS_CONFIG.areas },
                    { nomeCol: 'acoes', data: DADOS_INICIAIS_CONFIG.acoes },
                    { nomeCol: 'status', data: DADOS_INICIAIS_CONFIG.status },
                    { nomeCol: 'turnos', data: DADOS_INICIAIS_CONFIG.turnos },
                ];
                const batchSeed = writeBatch(db);

                for (const lista of listasParaSeed) {
                    const itemsCollectionRef = collection(db, `${basePath}/listas_auxiliares/${lista.nomeCol}/items`);
                    const currentItemsSnap = await getDocs(query(itemsCollectionRef)); 
                    if (currentItemsSnap.empty) {
                        console.log(`[SeedData] Populando ${lista.nomeCol}...`);
                        for (const itemName of lista.data) {
                            const newItemRef = doc(itemsCollectionRef); 
                            batchSeed.set(newItemRef, { nome: itemName.toUpperCase() });
                        }
                        seededSomething = true;
                    } else {
                         console.log(`[SeedData] Coleção ${lista.nomeCol} já possui itens. Pulando seed para esta lista.`);
                    }
                }

                const funcionariosCollectionRef = collection(db, `${basePath}/funcionarios`);
                const currentFuncionariosSnap = await getDocs(query(funcionariosCollectionRef));
                if (currentFuncionariosSnap.empty) {
                    console.log(`[SeedData] Populando funcionários...`);
                    for (const nomeFunc of DADOS_INICIAIS_CONFIG.responsaveis) {
                        const nomeIdFormatado = nomeFunc.trim().toUpperCase().replace(/\//g, '_');
                        const nomeDisplayFormatado = nomeFunc.trim().toUpperCase();
                        const funcDocRef = doc(funcionariosCollectionRef, nomeIdFormatado);
                        batchSeed.set(funcDocRef, { nome: nomeDisplayFormatado });
                    }
                    seededSomething = true;
                } else {
                    console.log(`[SeedData] Coleção funcionários já possui itens. Pulando seed.`);
                }
                
                if(seededSomething) {
                    console.log("[SeedData] Preparando para commitar dados iniciais...");
                    await batchSeed.commit(); 
                    await setDoc(seedMarkerDocRef, { seeded: true, seededAt: Timestamp.now() }); 
                    console.log("[SeedData] Dados iniciais pré-carregados com sucesso e marcador criado!");
                } else {
                    if (!seedMarkerSnap.exists()){
                         await setDoc(seedMarkerDocRef, { seeded: true, seededAt: Timestamp.now(), note: "Nenhum dado novo semeado, coleções já populadas." });
                         console.log("[SeedData] Marcador de seed criado pois coleções já estavam populadas.");
                    }
                }
                setInitialDataSeeded(true); 

            } catch (error) {
                console.error("[SeedData] Erro ao pré-carregar dados iniciais:", error);
            }
        };

        if (userId && appId && !initialDataSeeded) { 
            seedInitialData();
        }

    }, [userId, appId, db, initialDataSeeded, DADOS_INICIAIS_CONFIG]); 


    useEffect(() => {
        if (!userId || !appId || !db || appId === 'default-app-id-fallback' || appId === 'default-app-id-fallback-no-app') {
            if (appId === 'default-app-id-fallback' || appId === 'default-app-id-fallback-no-app') console.warn("[GlobalProvider] appId é fallback, pulando carregamento de listas auxiliares.");
            return;
        }

        const basePath = `/artifacts/${appId}/public/data`;
        const unsubscribers = [];

        const listaNames = ['prioridades', 'areas', 'acoes', 'status', 'turnos'];
        listaNames.forEach(name => {
            const q = query(collection(db, `${basePath}/listas_auxiliares/${name}/items`));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                setListasAuxiliares(prev => ({ ...prev, [name]: items.map(item => item.nome).sort() }));
            }, error => console.error(`Erro ao carregar ${name}:`, error));
            unsubscribers.push(unsubscribe);
        });

        const qFuncionarios = query(collection(db, `${basePath}/funcionarios`));
        const unsubscribeFuncionarios = onSnapshot(qFuncionarios, (snapshot) => {
            const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setFuncionarios(items.sort((a,b) => a.nome.localeCompare(b.nome)));
        }, error => console.error("Erro ao carregar funcionários:", error));
        unsubscribers.push(unsubscribeFuncionarios);

        return () => {
            unsubscribers.forEach(unsub => unsub());
        };
    }, [userId, appId, db]); 


    if (loadingAuth) {
        return <div className="flex justify-center items-center h-screen"><div className="text-xl">Carregando autenticação...</div></div>;
    }

    return (
        <GlobalContext.Provider value={{ currentUser, userId, db, auth: authGlobal, listasAuxiliares, funcionarios, appId, setFuncionarios, setListasAuxiliares }}>
            {children}
        </GlobalContext.Provider>
    );
};

// Componente de Autenticação Simples
const AuthComponent = () => {
    const { auth } = useContext(GlobalContext); 
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLogin, setIsLogin] = useState(true);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
            }
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
                <img src={LOGO_URL} alt="Logo Gramoterra" className="mx-auto h-16 w-auto mb-6" onError={(e) => e.target.style.display='none'}/>
                <h2 className="text-2xl font-bold text-center text-gray-700 mb-6">
                    {isLogin ? 'Login' : 'Registrar'} - Gerenciamento de Equipes
                </h2>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">
                            Email
                        </label>
                        <input
                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                            id="email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>
                    <div className="mb-6">
                        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
                            Senha
                        </label>
                        <input
                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline"
                            id="password" type="password" placeholder="********" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>
                    {error && <p className="text-red-500 text-xs italic mb-4">{error}</p>}
                    <div className="flex items-center justify-between">
                        <button
                            className={`w-full ${loading ? 'bg-gray-400' : 'bg-blue-500 hover:bg-blue-700'} text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline`}
                            type="submit" disabled={loading}>
                            {loading ? 'Processando...' : (isLogin ? 'Entrar' : 'Registrar')}
                        </button>
                    </div>
                </form>
                <p className="text-center text-sm text-gray-600 mt-6">
                    {isLogin ? 'Não tem uma conta?' : 'Já tem uma conta?'}
                    <button onClick={() => { setIsLogin(!isLogin); setError(''); }} className="font-bold text-blue-500 hover:text-blue-700 ml-1">
                        {isLogin ? 'Registre-se' : 'Faça Login'}
                    </button>
                </p>
                 <p className="text-center text-xs text-gray-500 mt-4">
                    Se o login anônimo estiver ativo, você pode ser logado automaticamente.
                </p>
            </div>
        </div>
    );
};


// Componente Modal Genérico
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

// Componente de Configurações
const ConfiguracoesComponent = () => {
    return (
        <div className="p-6 bg-gray-50 min-h-full">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800">Configurações Gerais</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <ListaAuxiliarManager nomeLista="Prioridades" nomeSingular="Prioridade" collectionPathSegment="prioridades" />
                    <ListaAuxiliarManager nomeLista="Áreas" nomeSingular="Área" collectionPathSegment="areas" />
                    <ListaAuxiliarManager nomeLista="Ações" nomeSingular="Ação" collectionPathSegment="acoes" />
                </div>
                <div>
                    <ListaAuxiliarManager nomeLista="Status de Tarefas" nomeSingular="Status" collectionPathSegment="status" />
                    <ListaAuxiliarManager nomeLista="Turnos" nomeSingular="Turno" collectionPathSegment="turnos" />
                    <FuncionariosManager />
                </div>
            </div>
        </div>
    );
};

// Componente TarefaFormModal
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
        } else {
            setTarefa(''); setPrioridade(''); setArea(''); setAcao('');
            setResponsaveis([]); setStatus('PREVISTA'); setTurno('');
            setDataInicio(''); setDataProvavelTermino(''); setOrientacao('');
        }
    }, [tarefaExistente, isOpen]);

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

        await onSave(novaTarefa, tarefaExistente ? tarefaExistente.id : null);
        setLoading(false);
        onClose();
    };
    
    const handleResponsavelChange = (e) => {
        const selectedOptions = Array.from(e.target.selectedOptions, option => option.value);
        setResponsaveis(selectedOptions);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={tarefaExistente ? "Editar Tarefa" : "Adicionar Nova Tarefa"}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Tarefa (Descrição)</label>
                    <input type="text" value={tarefa} onChange={(e) => setTarefa(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"/>
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

// Modal para exibir histórico da tarefa
const HistoricoTarefaModal = ({ isOpen, onClose, tarefaId }) => {
    const { db, appId } = useContext(GlobalContext);
    const [historico, setHistorico] = useState([]);
    const [loadingHistorico, setLoadingHistorico] = useState(true);
    const basePath = `/artifacts/${appId}/public/data`;

    useEffect(() => {
        if (isOpen && tarefaId) {
            setLoadingHistorico(true);
            const historicoRef = collection(db, `${basePath}/tarefas_mapa/${tarefaId}/historico_alteracoes`);
            const q = query(historicoRef, orderBy("timestamp", "desc"));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const fetchedHistorico = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setHistorico(fetchedHistorico);
                setLoadingHistorico(false);
            }, (error) => {
                console.error("Erro ao carregar histórico da tarefa:", error);
                setLoadingHistorico(false);
            });
            return () => unsubscribe();
        } else {
            setHistorico([]); 
            setLoadingHistorico(false);
        }
    }, [isOpen, tarefaId, db, basePath, appId]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Histórico da Tarefa" width="max-w-3xl">
            {loadingHistorico ? (
                <p>Carregando histórico...</p>
            ) : historico.length === 0 ? (
                <p>Nenhum histórico encontrado para esta tarefa.</p>
            ) : (
                <ul className="space-y-3 max-h-[70vh] overflow-y-auto">
                    {historico.map(entry => (
                        <li key={entry.id} className="p-3 border rounded-md bg-gray-50">
                            <p className="text-xs text-gray-500">
                                {formatDate(entry.timestamp)} às {entry.timestamp.toDate().toLocaleTimeString('pt-BR')}
                                 - Por: <span className="font-medium">{entry.usuarioEmail || entry.usuarioId}</span>
                            </p>
                            <p className="text-sm font-semibold text-gray-700 mt-1">{entry.acaoRealizada}</p>
                            {entry.detalhesAdicionais && <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap">{entry.detalhesAdicionais}</p>}
                        </li>
                    ))}
                </ul>
            )}
        </Modal>
    );
};


// Componente MapaAtividades
const MapaAtividadesComponent = () => {
    const { userId, db, appId, funcionarios: contextFuncionarios, listasAuxiliares, auth } = useContext(GlobalContext); 
    const [todasTarefas, setTodasTarefas] = useState([]); 
    const [tarefasExibidas, setTarefasExibidas] = useState([]); 
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTarefa, setEditingTarefa] = useState(null); 
    const [isHistoricoModalOpen, setIsHistoricoModalOpen] = useState(false);
    const [selectedTarefaIdParaHistorico, setSelectedTarefaIdParaHistorico] = useState(null);


    const [filtroResponsavel, setFiltroResponsavel] = useState("TODOS");
    const [filtroStatus, setFiltroStatus] = useState(TODOS_OS_STATUS_VALUE);
    const [filtroPrioridade, setFiltroPrioridade] = useState(TODAS_AS_PRIORIDADES_VALUE);
    const [filtroArea, setFiltroArea] = useState(TODAS_AS_AREAS_VALUE);
    const [filtroDataInicio, setFiltroDataInicio] = useState('');
    const [filtroDataFim, setFiltroDataFim] = useState('');
    const [termoBusca, setTermoBusca] = useState('');


    const basePath = `/artifacts/${appId}/public/data`;
    const tarefasCollectionRef = collection(db, `${basePath}/tarefas_mapa`);

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
    }, [userId, appId, db]); 

     useEffect(() => {
        let tarefasProcessadas = [...todasTarefas];

        if (filtroResponsavel !== "TODOS") {
            if (filtroResponsavel === SEM_RESPONSAVEL_VALUE) {
                tarefasProcessadas = tarefasProcessadas.filter(t => !t.responsaveis || t.responsaveis.length === 0);
            } else {
                tarefasProcessadas = tarefasProcessadas.filter(t => t.responsaveis && t.responsaveis.includes(filtroResponsavel));
            }
        }

        if (filtroStatus !== TODOS_OS_STATUS_VALUE) {
            tarefasProcessadas = tarefasProcessadas.filter(t => t.status === filtroStatus);
        }
        if (filtroPrioridade !== TODAS_AS_PRIORIDADES_VALUE) {
            tarefasProcessadas = tarefasProcessadas.filter(t => t.prioridade === filtroPrioridade);
        }
        if (filtroArea !== TODAS_AS_AREAS_VALUE) {
            tarefasProcessadas = tarefasProcessadas.filter(t => t.area === filtroArea);
        }
        
        if (termoBusca.trim() !== "") {
            tarefasProcessadas = tarefasProcessadas.filter(t => 
                t.tarefa && t.tarefa.toLowerCase().includes(termoBusca.toLowerCase())
            );
        }

        const inicioFiltro = filtroDataInicio ? new Date(filtroDataInicio + "T00:00:00Z").getTime() : null;
        const fimFiltro = filtroDataFim ? new Date(filtroDataFim + "T23:59:59Z").getTime() : null;

        if (inicioFiltro || fimFiltro) {
            tarefasProcessadas = tarefasProcessadas.filter(t => {
                const inicioTarefa = t.dataInicio ? t.dataInicio.toDate().getTime() : null;
                const fimTarefa = t.dataProvavelTermino ? t.dataProvavelTermino.toDate().getTime() : null;

                if (!inicioTarefa) return false; 
                
                const comecaAntesOuDuranteFiltro = inicioTarefa <= (fimFiltro || Infinity);
                const terminaDepoisOuDuranteFiltro = fimTarefa ? fimTarefa >= (inicioFiltro || 0) : true; 
                
                if (!fimTarefa || inicioTarefa === fimTarefa) {
                    return inicioTarefa >= (inicioFiltro || 0) && inicioTarefa <= (fimFiltro || Infinity);
                }

                return comecaAntesOuDuranteFiltro && terminaDepoisOuDuranteFiltro;
            });
        }
        
        setTarefasExibidas(tarefasProcessadas);
    }, [todasTarefas, filtroResponsavel, filtroStatus, filtroPrioridade, filtroArea, filtroDataInicio, filtroDataFim, termoBusca]);


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


    const handleSaveTarefa = async (tarefaData, tarefaIdParaSalvar) => { 
        let idDaTarefaSalva = tarefaIdParaSalvar;
        const usuario = authGlobal.currentUser;
        try {
            if (tarefaIdParaSalvar) { 
                const tarefaDocRef = doc(db, `${basePath}/tarefas_mapa`, tarefaIdParaSalvar);
                const tarefaExistenteSnap = await getDoc(tarefaDocRef);
                let detalhesMudanca = [];

                if (tarefaExistenteSnap.exists()) {
                    const dadosAntigos = tarefaExistenteSnap.data();
                    if (dadosAntigos.tarefa !== tarefaData.tarefa) detalhesMudanca.push(`Descrição: '${dadosAntigos.tarefa || ''}' -> '${tarefaData.tarefa}'`);
                    if (dadosAntigos.status !== tarefaData.status) detalhesMudanca.push(`Status: ${dadosAntigos.status || 'N/A'} -> ${tarefaData.status || 'N/A'}`);
                    if (dadosAntigos.prioridade !== tarefaData.prioridade) detalhesMudanca.push(`Prioridade: ${dadosAntigos.prioridade || 'N/A'} -> ${tarefaData.prioridade || 'N/A'}`);
                    if (dadosAntigos.area !== tarefaData.area) detalhesMudanca.push(`Área: ${dadosAntigos.area || 'N/A'} -> ${tarefaData.area || 'N/A'}`);
                    if (dadosAntigos.acao !== tarefaData.acao) detalhesMudanca.push(`Ação: ${dadosAntigos.acao || 'N/A'} -> ${tarefaData.acao || 'N/A'}`);
                    
                    const respAntigosNomes = (dadosAntigos.responsaveis || []).map(id => contextFuncionarios.find(f => f.id === id)?.nome || id).join(', ') || 'Nenhum';
                    const respNovosNomes = (tarefaData.responsaveis || []).map(id => contextFuncionarios.find(f => f.id === id)?.nome || id).join(', ') || 'Nenhum';
                    if (JSON.stringify(dadosAntigos.responsaveis || []) !== JSON.stringify(tarefaData.responsaveis || [])) detalhesMudanca.push(`Responsáveis: ${respAntigosNomes} -> ${respNovosNomes}`);
                    
                    if (dadosAntigos.turno !== tarefaData.turno) detalhesMudanca.push(`Turno: ${dadosAntigos.turno || 'N/A'} -> ${tarefaData.turno || 'N/A'}`);
                    
                    const dataInicioAntigaStr = dadosAntigos.dataInicio ? formatDate(dadosAntigos.dataInicio) : 'N/A';
                    const dataInicioNovaStr = tarefaData.dataInicio ? formatDate(tarefaData.dataInicio) : 'N/A';
                    if (dataInicioAntigaStr !== dataInicioNovaStr) detalhesMudanca.push(`Data Início: ${dataInicioAntigaStr} -> ${dataInicioNovaStr}`);

                    const dataTerminoAntigaStr = dadosAntigos.dataProvavelTermino ? formatDate(dadosAntigos.dataProvavelTermino) : 'N/A';
                    const dataTerminoNovaStr = tarefaData.dataProvavelTermino ? formatDate(tarefaData.dataProvavelTermino) : 'N/A';
                    if (dataTerminoAntigaStr !== dataTerminoNovaStr) detalhesMudanca.push(`Data Término: ${dataTerminoAntigaStr} -> ${dataTerminoNovaStr}`);
                    
                    if (dadosAntigos.orientacao !== tarefaData.orientacao) detalhesMudanca.push(`Orientação alterada.`);
                }
                
                await setDoc(tarefaDocRef, tarefaData, { merge: true }); 
                idDaTarefaSalva = tarefaIdParaSalvar;
                if (detalhesMudanca.length > 0) {
                    await logAlteracaoTarefa(db, basePath, idDaTarefaSalva, usuario?.uid, usuario?.email, "Tarefa Atualizada", detalhesMudanca.join('; '));
                }

            } else { 
                const docRef = await addDoc(tarefasCollectionRef, tarefaData);
                idDaTarefaSalva = docRef.id; 
                await logAlteracaoTarefa(db, basePath, idDaTarefaSalva, usuario?.uid, usuario?.email, "Tarefa Criada", `Tarefa "${tarefaData.tarefa}" adicionada.`);
            }
            
            if (idDaTarefaSalva) { 
                const tarefaSalvaNoMapaRef = doc(db, `${basePath}/tarefas_mapa`, idDaTarefaSalva);
                const tarefaSalvaSnap = await getDoc(tarefaSalvaNoMapaRef);
                if (tarefaSalvaSnap.exists()){
                    const dadosCompletosFirestore = {id: tarefaSalvaSnap.id, ...tarefaSalvaSnap.data()}; 
                    if (!(dadosCompletosFirestore.dataInicio instanceof Timestamp) || !(dadosCompletosFirestore.dataProvavelTermino instanceof Timestamp)) {
                        console.error("Erro CRÍTICO: Datas da tarefa não são Timestamps válidos após buscar do Firestore. Sincronização abortada.", dadosCompletosFirestore);
                        alert("Erro interno crítico: As datas da tarefa não foram salvas/recuperadas como Timestamps. A programação pode não ser atualizada.");
                        return; 
                    }
                    await sincronizarTarefaComProgramacao(idDaTarefaSalva, dadosCompletosFirestore, db, basePath);
                } else {
                    console.error("Tarefa recém salva não encontrada para sincronização:", idDaTarefaSalva);
                }
            }
        } catch (error) {
            console.error("Erro ao salvar tarefa: ", error);
            alert("Erro ao salvar tarefa: " + error.message);
        }
    };

    const handleDeleteTarefa = async (tarefaId) => {
        const tarefaParaExcluir = todasTarefas.find(t => t.id === tarefaId);
        const nomeTarefaExcluida = tarefaParaExcluir ? tarefaParaExcluir.tarefa : `ID ${tarefaId}`;

        if (window.confirm(`Tem certeza que deseja excluir a tarefa "${nomeTarefaExcluida}" do Mapa de Atividades? Ela também será removida da programação semanal.`)) {
            try {
                const usuario = authGlobal.currentUser;
                await logAlteracaoTarefa(db, basePath, tarefaId, usuario?.uid, usuario?.email, "Tarefa Excluída", `Tarefa "${nomeTarefaExcluida}" foi removida.`);
                
                await removerTarefaDaProgramacao(tarefaId, db, basePath);
                const tarefaDocRef = doc(db, `${basePath}/tarefas_mapa`, tarefaId);
                await deleteDoc(tarefaDocRef);
                console.log(`Tarefa ${tarefaId} excluída do mapa e da programação.`);
            } catch (error) {
                console.error("Erro ao excluir tarefa: ", error);
                alert("Erro ao excluir tarefa: " + error.message);
            }
        }
    };
    
    const getResponsavelNomes = (responsavelIds) => {
        if (!responsavelIds || responsavelIds.length === 0) return '---';
        return responsavelIds.map(id => {
            const func = contextFuncionarios.find(f => f.id === id); 
            return func ? func.nome : id; 
        }).join(', ');
    };
    
    const getStatusColor = (status) => {
        if (status === "CANCELADA") return "bg-red-200";
        if (status === "CONCLUÍDA") return "bg-green-300";
        if (status === "PROGRAMADA") return "bg-blue-200";
        if (status === "AGUARDANDO ALOCAÇÃO") return "bg-red-300";
        if (status === "PREVISTA") return "bg-yellow-200";
        return "bg-gray-100";
    };
    
    const limparFiltros = () => {
        setFiltroResponsavel("TODOS");
        setFiltroStatus(TODOS_OS_STATUS_VALUE);
        setFiltroPrioridade(TODAS_AS_PRIORIDADES_VALUE);
        setFiltroArea(TODAS_AS_AREAS_VALUE);
        setFiltroDataInicio('');
        setFiltroDataFim('');
        setTermoBusca('');
    };


    if (loading && todasTarefas.length === 0) return <div className="p-6 text-center">Carregando tarefas do Mapa de Atividades...</div>;

    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-full">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold text-gray-800">Mapa de Atividades</h2>
                <button
                    onClick={() => handleOpenModal()}
                    className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md flex items-center shadow-sm"
                >
                    <LucidePlusCircle size={20} className="mr-2"/> Adicionar Tarefa
                </button>
            </div>

            {/* Seção de Filtros */}
            <div className="bg-white p-4 rounded-lg shadow mb-6">
                <h3 className="text-lg font-semibold mb-3 text-gray-700">Filtros</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <div>
                        <label htmlFor="filtroResponsavel" className="block text-sm font-medium text-gray-700">Responsável</label>
                        <select id="filtroResponsavel" value={filtroResponsavel} onChange={(e) => setFiltroResponsavel(e.target.value)} className="mt-1 block w-full p-2 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500">
                            <option value="TODOS">TODOS</option>
                            <option value={SEM_RESPONSAVEL_VALUE}>-- Sem Responsável --</option>
                            {contextFuncionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="filtroStatus" className="block text-sm font-medium text-gray-700">Status</label>
                        <select id="filtroStatus" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="mt-1 block w-full p-2 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500">
                            <option value={TODOS_OS_STATUS_VALUE}>TODOS</option>
                            {listasAuxiliares.status.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                     <div>
                        <label htmlFor="filtroPrioridade" className="block text-sm font-medium text-gray-700">Prioridade</label>
                        <select id="filtroPrioridade" value={filtroPrioridade} onChange={(e) => setFiltroPrioridade(e.target.value)} className="mt-1 block w-full p-2 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500">
                            <option value={TODAS_AS_PRIORIDADES_VALUE}>TODAS</option>
                            {listasAuxiliares.prioridades.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                     <div>
                        <label htmlFor="filtroArea" className="block text-sm font-medium text-gray-700">Área</label>
                        <select id="filtroArea" value={filtroArea} onChange={(e) => setFiltroArea(e.target.value)} className="mt-1 block w-full p-2 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500">
                            <option value={TODAS_AS_AREAS_VALUE}>TODAS</option>
                            {listasAuxiliares.areas.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
                     <div>
                        <label htmlFor="filtroDataInicio" className="block text-sm font-medium text-gray-700">Data Início (Período)</label>
                        <input type="date" id="filtroDataInicio" value={filtroDataInicio} onChange={(e) => setFiltroDataInicio(e.target.value)} className="mt-1 block w-full p-2 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"/>
                    </div>
                    <div>
                        <label htmlFor="filtroDataFim" className="block text-sm font-medium text-gray-700">Data Fim (Período)</label>
                        <input type="date" id="filtroDataFim" value={filtroDataFim} onChange={(e) => setFiltroDataFim(e.target.value)} className="mt-1 block w-full p-2 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"/>
                    </div>
                     <div className="col-span-full sm:col-span-2 md:col-span-2 lg:col-span-2">
                        <label htmlFor="termoBusca" className="block text-sm font-medium text-gray-700">Buscar na Descrição</label>
                        <div className="mt-1 flex rounded-md shadow-sm">
                             <input type="text" id="termoBusca" value={termoBusca} onChange={(e) => setTermoBusca(e.target.value)} placeholder="Digite para buscar..." className="block w-full p-2 border-gray-300 rounded-l-md focus:ring-blue-500 focus:border-blue-500"/>
                             <button onClick={() => setTermoBusca('')} className="bg-gray-200 p-2 rounded-r-md text-gray-500 hover:bg-gray-300">
                                <LucideX size={18}/>
                             </button>
                        </div>
                    </div>
                </div>
                <div className="mt-4 text-right">
                    <button 
                        onClick={limparFiltros}
                        className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md flex items-center justify-center ml-auto"
                    >
                        <LucideXCircle size={18} className="mr-2"/>
                        Limpar Filtros
                    </button>
                </div>
            </div>


            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                        <tr>
                            {["Tarefa", "Prioridade", "Área", "Ação", "Responsável(eis)", "Status", "Turno", "Início", "Término", "Orientação", "Ações"].map(header => (
                                <th key={header} scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider whitespace-nowrap">
                                    {header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading && tarefasExibidas.length === 0 && (
                            <tr><td colSpan="11" className="px-4 py-4 text-center text-gray-500">Carregando...</td></tr>
                        )}
                        {!loading && tarefasExibidas.length === 0 && (
                            <tr><td colSpan="11" className="px-4 py-4 text-center text-gray-500">Nenhuma tarefa encontrada com os filtros aplicados.</td></tr>
                        )}
                        {tarefasExibidas.map((t) => (
                            <tr key={t.id} className={`hover:bg-gray-50 ${t.status === "CANCELADA" ? 'line-through text-gray-500' : ''} ${t.status === "CONCLUÍDA" ? COR_STATUS_CONCLUIDA_FUNDO_MAPA : ''}`}>
                                <td className="px-4 py-3 text-sm text-gray-800 whitespace-normal break-words max-w-xs">{t.tarefa}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{t.prioridade}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{t.area}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{t.acao}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{getResponsavelNomes(t.responsaveis)}</td>
                                <td className="px-4 py-3 text-sm whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(t.status)} text-gray-800`}>
                                        {t.status}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{t.turno || 'N/A'}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{formatDate(t.dataInicio)}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{formatDate(t.dataProvavelTermino)}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 whitespace-normal break-words max-w-xs">{t.orientacao}</td>
                                <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">
                                    <button onClick={() => handleOpenHistoricoModal(t.id)} title="Histórico" className="text-gray-500 hover:text-gray-700 mr-2"><LucideHistory size={18}/></button>
                                    <button onClick={() => handleOpenModal(t)} title="Editar" className="text-blue-600 hover:text-blue-800 mr-2"><LucideEdit size={18}/></button>
                                    <button onClick={() => handleDeleteTarefa(t.id)} title="Excluir" className="text-red-600 hover:text-red-800"><LucideTrash2 size={18}/></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <TarefaFormModal isOpen={isModalOpen} onClose={handleCloseModal} tarefaExistente={editingTarefa} onSave={handleSaveTarefa} />
            {selectedTarefaIdParaHistorico && (
                <HistoricoTarefaModal 
                    isOpen={isHistoricoModalOpen} 
                    onClose={handleCloseHistoricoModal} 
                    tarefaId={selectedTarefaIdParaHistorico} 
                />
            )}
        </div>
    );
};

// Modal para Gerenciar Tarefas da Célula da Programação
const GerenciarTarefaProgramacaoModal = ({ isOpen, onClose, diaFormatado, responsavelId, tarefasDaCelula, semanaId, onAlteracaoSalva }) => {
    const { db, appId, funcionarios, listasAuxiliares, auth } = useContext(GlobalContext); 
    const [tarefasEditaveis, setTarefasEditaveis] = useState([]);
    const [loading, setLoading] = useState(false);
    const [statusTarefasMapa, setStatusTarefasMapa] = useState({}); 

    useEffect(() => {
        if (tarefasDaCelula) {
            const tarefasComTurnoPadrao = tarefasDaCelula.map(t => ({
                ...t,
                turno: t.turno || TURNO_DIA_INTEIRO 
            }));
            const tarefasCopiadas = JSON.parse(JSON.stringify(tarefasComTurnoPadrao));
            setTarefasEditaveis(tarefasCopiadas);

            const fetchStatusMapa = async () => {
                const statusMap = {};
                const basePath = `/artifacts/${appId}/public/data`;
                for (const tarefaProg of tarefasCopiadas) {
                    if (tarefaProg.mapaTaskId) {
                        const tarefaMapaRef = doc(db, `${basePath}/tarefas_mapa`, tarefaProg.mapaTaskId);
                        const tarefaMapaSnap = await getDoc(tarefaMapaRef);
                        if (tarefaMapaSnap.exists()) {
                            statusMap[tarefaProg.mapaTaskId] = tarefaMapaSnap.data().status;
                        }
                    }
                }
                setStatusTarefasMapa(statusMap);
            };
            if(isOpen) fetchStatusMapa();
        }
    }, [tarefasDaCelula, isOpen, appId, db]);

    const responsavelNome = funcionarios.find(f => f.id === responsavelId)?.nome || responsavelId;
    const dataExibicao = diaFormatado ? new Date(diaFormatado + "T00:00:00Z").toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : 'Data Inválida'; 

    const handleToggleStatusLocal = async (indexTarefa) => {
        const novasTarefas = [...tarefasEditaveis];
        const tarefa = novasTarefas[indexTarefa];
        tarefa.statusLocal = tarefa.statusLocal === 'CONCLUÍDA' ? 'PENDENTE' : 'CONCLUÍDA';
        setTarefasEditaveis(novasTarefas);
    };
    
    const handleMarcarTodasComo = (novoStatusLocal) => {
        const novasTarefas = tarefasEditaveis.map(tarefa => ({
            ...tarefa,
            statusLocal: novoStatusLocal
        }));
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
        const usuario = authGlobal.currentUser;

        try {
            const semanaDocSnap = await getDoc(semanaDocRef);
            if (!semanaDocSnap.exists()) {
                throw new Error("Documento da semana não encontrado.");
            }
            const semanaData = semanaDocSnap.data();
            
            if (semanaData.dias && semanaData.dias[diaFormatado]) {
                semanaData.dias[diaFormatado][responsavelId] = tarefasEditaveis;
            } else {
                if(!semanaData.dias) semanaData.dias = {};
                if(!semanaData.dias[diaFormatado]) semanaData.dias[diaFormatado] = {};
                semanaData.dias[diaFormatado][responsavelId] = tarefasEditaveis;
            }

            await updateDoc(semanaDocRef, { dias: semanaData.dias });
            console.log("Alterações na programação salvas com sucesso.");

            for (const taskId of mapaTaskIdsAlterados) {
                if (taskId) { 
                    await verificarEAtualizarStatusConclusaoMapa(taskId, db, basePath);
                }
            }

            if(onAlteracaoSalva) onAlteracaoSalva(); 
            onClose();
        } catch (error) {
            console.error("Erro ao salvar alterações na programação: ", error);
            alert("Erro ao salvar alterações: " + error.message);
        }
        setLoading(false);
    };


    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Gerenciar Tarefas - ${responsavelNome} (${dataExibicao})`} width="max-w-xl"> 
            <div className="mb-4 flex justify-start space-x-2">
                <button 
                    onClick={() => handleMarcarTodasComo('CONCLUÍDA')}
                    className="bg-green-500 text-white px-3 py-1.5 text-xs rounded hover:bg-green-600 flex items-center"
                >
                    <LucideCheckSquare size={14} className="mr-1"/> Marcar Todas Concluídas
                </button>
                <button 
                    onClick={() => handleMarcarTodasComo('PENDENTE')}
                    className="bg-yellow-500 text-white px-3 py-1.5 text-xs rounded hover:bg-yellow-600 flex items-center"
                >
                     <LucideSquare size={14} className="mr-1"/> Marcar Todas Pendentes
                </button>
            </div>
            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-2">
                {tarefasEditaveis.length === 0 && <p className="text-gray-500">Nenhuma tarefa nesta célula.</p>}
                {tarefasEditaveis.map((tarefa, index) => (
                    <div key={tarefa.mapaTaskId || index} className={`p-3 rounded-md shadow-sm border ${tarefa.statusLocal === 'CONCLUÍDA' ? 'border-green-300 bg-green-50' : 'border-blue-300 bg-blue-50'}`}>
                        <div className="flex justify-between items-start">
                            <span className={`text-sm ${tarefa.statusLocal === 'CONCLUÍDA' ? 'line-through text-gray-600' : 'text-gray-800'}`}>
                                {tarefa.textoVisivel}
                            </span>
                            <div className="flex space-x-2 items-center">
                                <button
                                    onClick={() => handleToggleStatusLocal(index)}
                                    title={tarefa.statusLocal === 'CONCLUÍDA' ? "Reabrir Tarefa" : "Concluir Tarefa"}
                                    className={`p-1.5 rounded-full hover:bg-opacity-80 transition-colors ${tarefa.statusLocal === 'CONCLUÍDA' ? 'bg-yellow-500 text-white' : 'bg-green-500 text-white'}`}
                                >
                                    {tarefa.statusLocal === 'CONCLUÍDA' ? <LucideRotateCcw size={16}/> : <LucideCheckCircle size={16}/>}
                                </button>
                                <button
                                    onClick={() => handleRemoverTarefaDaCelula(index)}
                                    title="Remover desta célula"
                                    className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                >
                                    <LucideXCircle size={16}/>
                                </button>
                            </div>
                        </div>
                        <div className="mt-2">
                            <label htmlFor={`turno-tarefa-${index}`} className="block text-xs font-medium text-gray-600 mb-0.5">Turno:</label>
                            <select 
                                id={`turno-tarefa-${index}`}
                                value={tarefa.turno || TURNO_DIA_INTEIRO}
                                onChange={(e) => handleTurnoChange(index, e.target.value)}
                                className="block w-full p-1.5 text-xs border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                            >
                                {listasAuxiliares.turnos.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        {statusTarefasMapa[tarefa.mapaTaskId] && (
                             <div className="mt-1 text-xs text-gray-500">
                                Status no Mapa: <span className={`font-medium ${
                                    statusTarefasMapa[tarefa.mapaTaskId] === 'CONCLUÍDA' ? 'text-green-600' : 
                                    statusTarefasMapa[tarefa.mapaTaskId] === 'PROGRAMADA' ? 'text-blue-600' :
                                    statusTarefasMapa[tarefa.mapaTaskId] === 'CANCELADA' ? 'text-red-600' : 'text-gray-600'
                                }`}>{statusTarefasMapa[tarefa.mapaTaskId]}</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <div className="mt-6 pt-4 border-t flex justify-end space-x-2">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">
                    Cancelar
                </button>
                <button 
                    type="button" 
                    onClick={handleSalvarAlteracoes} 
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                >
                    {loading ? 'Salvando...' : 'Salvar Alterações'}
                </button>
            </div>
        </Modal>
    );
};


// Componente ProgramacaoSemanal
const ProgramacaoSemanalComponent = () => {
    const { userId, db, appId, listasAuxiliares, funcionarios: contextFuncionarios } = useContext(GlobalContext); 
    const [semanas, setSemanas] = useState([]); 
    const [semanaSelecionadaId, setSemanaSelecionadaId] = useState(null);
    const [dadosProgramacao, setDadosProgramacao] = useState(null); 
    const [loading, setLoading] = useState(false); 
    const [loadingAtualizacao, setLoadingAtualizacao] = useState(false); 
    const [isNovaSemanaModalOpen, setIsNovaSemanaModalOpen] = useState(false);
    const [novaSemanaDataInicio, setNovaSemanaDataInicio] = useState('');

    const [isGerenciarTarefaModalOpen, setIsGerenciarTarefaModalOpen] = useState(false);
    const [dadosCelulaParaGerenciar, setDadosCelulaParaGerenciar] = useState({ diaFormatado: null, responsavelId: null, tarefas: [] });

    const coresTurno = {
        "MANHÃ": "bg-sky-300", 
        "TARDE": "bg-indigo-300", 
    };


    const basePath = `/artifacts/${appId}/public/data`;
    const programacaoCollectionRef = collection(db, `${basePath}/programacao_semanal`);

    useEffect(() => {
        const q = query(programacaoCollectionRef, orderBy("dataInicioSemana", "desc")); // Ordena para pegar a mais recente
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedSemanas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSemanas(fetchedSemanas);
            if (fetchedSemanas.length > 0 && !semanaSelecionadaId) { // Se nenhuma semana estiver selecionada, seleciona a primeira (mais recente)
                setSemanaSelecionadaId(fetchedSemanas[0].id);
            } else if (fetchedSemanas.length === 0) {
                setSemanaSelecionadaId(null);
                setDadosProgramacao(null);
            }
        }, error => console.error("Erro ao carregar semanas:", error));
        return unsubscribe;
    }, [userId, appId, db]); // Removido semanaSelecionadaId daqui para evitar loop na seleção inicial

    useEffect(() => {
        if (!semanaSelecionadaId) {
            setDadosProgramacao(null);
            return;
        }
        setLoading(true);
        const unsub = onSnapshot(doc(db, `${basePath}/programacao_semanal`, semanaSelecionadaId), (docSnap) => {
            if (docSnap.exists()) {
                setDadosProgramacao({ id: docSnap.id, ...docSnap.data() });
            } else {
                setDadosProgramacao(null);
                console.warn(`Semana ${semanaSelecionadaId} não encontrada.`);
                // Se a semana selecionada não existe mais (ex: foi excluída), tenta selecionar a mais recente
                if (semanas.length > 0) {
                    setSemanaSelecionadaId(semanas[0].id); 
                } else {
                    setSemanaSelecionadaId(null);
                }
            }
            setLoading(false);
        }, error => {
            console.error("Erro ao carregar dados da programação:", error);
            setLoading(false);
        });
        return unsub;
    }, [semanaSelecionadaId, userId, appId, db, semanas]); // Adicionado 'semanas' como dependência para reavaliar se a semana selecionada ainda é válida

    const handleCriarNovaSemana = async () => {
        if (!novaSemanaDataInicio) {
            alert("Por favor, selecione uma data de início para a nova semana.");
            return;
        }
        
        const [year, month, day] = novaSemanaDataInicio.split('-').map(Number);
        const dataInicioUTC = new Date(Date.UTC(year, month - 1, day)); 

        if (dataInicioUTC.getUTCDay() !== 1) { 
            alert("A semana deve começar em uma Segunda-feira.");
            return;
        }

        setLoadingAtualizacao(true); 
        try {
            const dataFimUTC = new Date(dataInicioUTC);
            dataFimUTC.setUTCDate(dataInicioUTC.getUTCDate() + 5); 

            let maiorNumeroSemana = 0;
            semanas.forEach(s => {
                if (s.nomeAba && s.nomeAba.startsWith("Programação S")) {
                    const num = parseInt(s.nomeAba.substring(13), 10); 
                    if (!isNaN(num) && num > maiorNumeroSemana) maiorNumeroSemana = num;
                }
            });
            const proximoNumeroSemana = maiorNumeroSemana + 1;
            const nomeNovaAba = `Programação S${proximoNumeroSemana.toString().padStart(2, '0')}`;
            
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
                diaAtualLoop.setUTCDate(dataInicioUTC.getUTCDate() + i);
                const diaFormatado = diaAtualLoop.toISOString().split('T')[0]; 
                novaSemanaData.dias[diaFormatado] = {};
                contextFuncionarios.forEach(func => { 
                    novaSemanaData.dias[diaFormatado][func.id] = []; 
                });
            }

            await setDoc(doc(db, `${basePath}/programacao_semanal`, novaSemanaDocId), novaSemanaData);
            
            alert(`Nova semana "${nomeNovaAba}" criada com sucesso!`);
            setIsNovaSemanaModalOpen(false);
            setNovaSemanaDataInicio('');
            // setSemanaSelecionadaId(novaSemanaDocId); // O useEffect que carrega as semanas já vai selecionar a mais nova
        } catch (error) {
            console.error("Erro ao criar nova semana:", error);
            alert("Erro ao criar nova semana: " + error.message);
        }
        setLoadingAtualizacao(false);
    };

    const handleExcluirSemana = async () => {
        if (!semanaSelecionadaId || semanas.length <= 1) {
            alert("Não é possível excluir a única semana existente ou nenhuma semana está selecionada.");
            return;
        }
        if (window.confirm(`Tem certeza que deseja excluir a semana "${dadosProgramacao?.nomeAba}"? Esta ação não pode ser desfeita.`)) {
            setLoadingAtualizacao(true);
            try {
                await deleteDoc(doc(db, `${basePath}/programacao_semanal`, semanaSelecionadaId));
                alert("Semana excluída com sucesso.");
                setSemanaSelecionadaId(null); // Força a recarga para a semana mais recente
            } catch (error) {
                console.error("Erro ao excluir semana:", error);
                alert("Erro ao excluir semana: " + error.message);
            }
            setLoadingAtualizacao(false);
        }
    };


    const handleAtualizarProgramacaoDaSemana = async () => {
        if (!semanaSelecionadaId || !dadosProgramacao || !dadosProgramacao.dataInicioSemana || !dadosProgramacao.dataFimSemana) {
            alert("Nenhuma semana selecionada ou dados da semana inválidos para atualizar.");
            return;
        }
        setLoadingAtualizacao(true);
        console.log(`[BotaoAtualizar] Iniciando para semana ID: ${semanaSelecionadaId}`);
    
        try {
            const novosDiasDaSemana = {};
            const dataInicioSemana = dadosProgramacao.dataInicioSemana.toDate(); 
            const dataFimSemana = dadosProgramacao.dataFimSemana.toDate(); 
    
            let diaCorrenteNaSemana = new Date(Date.UTC(dataInicioSemana.getUTCFullYear(), dataInicioSemana.getUTCMonth(), dataInicioSemana.getUTCDate()));
            const dataFimSemanaUTC = new Date(Date.UTC(dataFimSemana.getUTCFullYear(), dataFimSemana.getUTCMonth(), dataFimSemana.getUTCDate()));
            dataFimSemanaUTC.setUTCHours(23,59,59,999);

            while(diaCorrenteNaSemana.getTime() <= dataFimSemanaUTC.getTime()){
                const diaFmt = diaCorrenteNaSemana.toISOString().split('T')[0];
                novosDiasDaSemana[diaFmt] = {};
                contextFuncionarios.forEach(func => {
                    novosDiasDaSemana[diaFmt][func.id] = [];
                });
                diaCorrenteNaSemana.setUTCDate(diaCorrenteNaSemana.getUTCDate() + 1);
            }
    
            const tarefasMapaQuery = query(
                collection(db, `${basePath}/tarefas_mapa`),
                where("status", "in", ["PROGRAMADA", "CONCLUÍDA"])
            );
            const tarefasMapaSnap = await getDocs(tarefasMapaQuery);
    
            tarefasMapaSnap.forEach(docTarefaMapa => {
                const tarefaMapa = { id: docTarefaMapa.id, ...docTarefaMapa.data() };
    
                if (!tarefaMapa.dataInicio || !(tarefaMapa.dataInicio instanceof Timestamp) ||
                    !tarefaMapa.dataProvavelTermino || !(tarefaMapa.dataProvavelTermino instanceof Timestamp) ||
                    !tarefaMapa.responsaveis || tarefaMapa.responsaveis.length === 0) {
                    return; 
                }
    
                let textoBaseTarefa = tarefaMapa.tarefa || "Tarefa sem descrição";
                if (tarefaMapa.prioridade) textoBaseTarefa += ` - ${tarefaMapa.prioridade}`;
                
                let turnoParaTexto = "";
                if (tarefaMapa.turno && tarefaMapa.turno.toUpperCase() !== TURNO_DIA_INTEIRO.toUpperCase()) {
                    turnoParaTexto = `[${tarefaMapa.turno.toUpperCase()}] `;
                }
                const textoVisivelFinal = turnoParaTexto + textoBaseTarefa;

                const itemProg = {
                    mapaTaskId: tarefaMapa.id,
                    textoVisivel: textoVisivelFinal,
                    statusLocal: tarefaMapa.status === 'CONCLUÍDA' ? 'CONCLUÍDA' : 'PENDENTE',
                    turno: tarefaMapa.turno || TURNO_DIA_INTEIRO 
                };
    
                const dataInicioTarefa = tarefaMapa.dataInicio.toDate();
                const dataFimTarefa = tarefaMapa.dataProvavelTermino.toDate();
                
                let dataAtualTarefa = new Date(Date.UTC(dataInicioTarefa.getUTCFullYear(), dataInicioTarefa.getUTCMonth(), dataInicioTarefa.getUTCDate()));
                const dataFimTarefaUTC = new Date(Date.UTC(dataFimTarefa.getUTCFullYear(), dataFimTarefa.getUTCMonth(), dataFimTarefa.getUTCDate()));
                dataFimTarefaUTC.setUTCHours(23,59,59,999);
    
                while (dataAtualTarefa.getTime() <= dataFimTarefaUTC.getTime()) {
                    const diaFormatadoTarefa = dataAtualTarefa.toISOString().split('T')[0];
                    
                    const dataInicioSemanaUTC = new Date(Date.UTC(dataInicioSemana.getUTCFullYear(), dataInicioSemana.getUTCMonth(), dataInicioSemana.getUTCDate()));
                    
                    if (dataAtualTarefa.getTime() >= dataInicioSemanaUTC.getTime() && dataAtualTarefa.getTime() <= dataFimSemanaUTC.getTime()) {
                        if (novosDiasDaSemana[diaFormatadoTarefa]) { 
                             tarefaMapa.responsaveis.forEach(respId => {
                                if (novosDiasDaSemana[diaFormatadoTarefa][respId]) { 
                                    if (!novosDiasDaSemana[diaFormatadoTarefa][respId].find(t => t.mapaTaskId === tarefaMapa.id)) {
                                        novosDiasDaSemana[diaFormatadoTarefa][respId].push({...itemProg});
                                    }
                                }
                            });
                        }
                    }
                    dataAtualTarefa.setUTCDate(dataAtualTarefa.getUTCDate() + 1);
                }
            });
            
            const semanaDocRef = doc(db, `${basePath}/programacao_semanal`, semanaSelecionadaId);
            await updateDoc(semanaDocRef, { dias: novosDiasDaSemana });
            console.log(`[BotaoAtualizar] Programação da semana ${semanaSelecionadaId} atualizada com sucesso.`);
            alert("Programação da semana atualizada com base no Mapa de Atividades!");
    
        } catch (error) {
            console.error("[BotaoAtualizar] Erro ao atualizar programação da semana:", error);
            alert("Erro ao atualizar programação: " + error.message);
        }
        setLoadingAtualizacao(false);
    };


    const handleAbrirModalGerenciarTarefa = (diaFormatado, responsavelId, tarefas) => {
        setDadosCelulaParaGerenciar({
            diaFormatado,
            responsavelId,
            tarefas: tarefas || []
        });
        setIsGerenciarTarefaModalOpen(true);
    };    const renderCabecalhoDias = () => {\n        if (!dadosProgramacao || !dadosProgramacao.dataInicioSemana || !(dadosProgramacao.dataInicioSemana instanceof Timestamp)) {\n            console.warn("[renderCabecalhoDias] dataInicioSemana inválida ou não é Timestamp:", dadosProgramacao?.dataInicioSemana);\n            return Array(DIAS_SEMANA.length).fill(null).map((_, i) => <th key={`header-dia-err-${i}`} className="px-3 py-2 border text-xs font-medium text-white bg-red-600">Data Inválida</th>);\n        }\n        const dias = [];\n        const dataInicio = dadosProgramacao.dataInicioSemana.toDate();\n        const hojeFormatado = new Date().toISOString().split('T')[0]; \n\n        for (let i = 0; i < DIAS_SEMANA.length; i++) {\n            const dataDia = new Date(dataInicio);\n            dataDia.setUTCDate(dataInicio.getUTCDate() + i);\n            const diaFormatadoAtual = dataDia.toISOString().split('T')[0];\n            const isHoje = diaFormatadoAtual === hojeFormatado;\n\n            dias.push(\n                <th key={`header-dia-${i}`} className={`px-3 py-2 border text-xs font-medium text-white whitespace-nowrap ${isHoje ? 'bg-amber-500' : 'bg-teal-600'}`}>
                    {dataDia.toLocaleDateString('pt-BR', {timeZone: 'UTC'})} - {DIAS_SEMANA[i]}\n                </th>\n            );\n        }\n        return dias;\n    };erCelulasTarefas = (funcionarioI        if (!dadosProgramacao || !dadosProgramacao.dataInicioSemana || !(dadosProgramacao.dataInicioSemana instanceof Timestamp) || !dadosProgramacao.dias) {\n            console.warn("[renderCelulasTarefas] dataInicioSemana inválida ou não é Timestamp, ou dias ausentes:", dadosProgramacao);\n            return Array(DIAS_SEMANA.length).fill(null).map((_, index) => (\n                <td key={`placeholder-err-${funcionarioId}-${index}`} className="border p-2 min-h-[80px] h-20 bg-red-100 text-red-700 text-xs">Erro: Data inválida</td>\n            ));\n        }\n        \n        const celulas = [];\n        const dataInicio = dadosProgramacao.dataInicioSemana.toDate();\n        const hojeFormatado = new Date().toISOString().split(\'T\')[0];       for (let i = 0; i < DIAS_SEMANA.length; i++) {
            const dataDiaAtual = new Date(dataInicio); 
            dataDiaAtual.setUTCDate(dataDiaAtual.getUTCDate() + i); 
            const diaFormatado = dataDiaAtual.toISOString().split('T')[0]; 
            const isHoje = diaFormatado === hojeFormatado;

            const tarefasDoDiaParaFuncionario = dadosProgramacao.dias[diaFormatado]?.[funcionarioId] || [];
            
            celulas.push(
                <td 
                    key={`${funcionarioId}-${diaFormatado}`} 
                    className={`border p-1 min-h-[80px] h-20 align-top text-xs cursor-pointer hover:bg-gray-100 transition-colors ${isHoje ? 'border-l-4 border-l-amber-400' : ''}`}
                    onClick={() => handleAbrirModalGerenciarTarefa(diaFormatado, funcionarioId, tarefasDoDiaParaFuncionario)}
                >
                    {tarefasDoDiaParaFuncionario.length === 0 ? (
                        <span className="text-gray-400 italic text-xs">Vazio</span>
                    ) : (
                        <div className="space-y-0.5">
                        {tarefasDoDiaParaFuncionario.map((tarefaInst, idx) => {
                            let corFundoTarefa = '';
                            const turnoUpper = tarefaInst.turno?.toUpperCase();

                            if (turnoUpper && coresTurno[turnoUpper]) {
                                corFundoTarefa = coresTurno[turnoUpper];
                            } else {
                                corFundoTarefa = tarefaInst.statusLocal === 'CONCLUÍDA' ? 'bg-green-500' : 'bg-blue-500';
                            }
                            
                            return (
                                <div 
                                    key={tarefaInst.mapaTaskId || `task-${idx}-${funcionarioId}-${diaFormatado}`} 
                                    className={`p-1 rounded text-white text-[10px] leading-tight ${corFundoTarefa} ${tarefaInst.statusLocal === 'CONCLUÍDA' ? 'line-through' : ''}`}
                                    title={tarefaInst.textoVisivel} 
                                >
                                    {tarefaInst.textoVisivel.length > 35 ? tarefaInst.textoVisivel.substring(0,32) + "..." : tarefaInst.textoVisivel}
                                </div>
                            );
                        })}
                        </div>
                    )}
                </td>
            );
        }
        return celulas;
    };


    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-full">
            <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
                <h2 className="text-2xl font-semibold text-gray-800">Programação Semanal</h2>
                <div className="flex items-center gap-2 flex-wrap">
                    <select 
                        value={semanaSelecionadaId || ''} 
                        onChange={(e) => setSemanaSelecionadaId(e.target.value)}
                        className="p-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        disabled={semanas.length === 0 && !loading}
                    >
                        {loading && semanas.length === 0 && <option>Carregando semanas...</option>}
                        {!loading && semanas.length === 0 && <option>Nenhuma semana criada</option>}
                        {semanas.map(s => (
                            <option key={s.id} value={s.id}>
                                {s.nomeAba} ({s.dataInicioSemana?.toDate().toLocaleDateString('pt-BR', {timeZone:'UTC'})} - {s.dataFimSemana?.toDate().toLocaleDateString('pt-BR', {timeZone:'UTC'})})
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={handleAtualizarProgramacaoDaSemana}
                        disabled={!semanaSelecionadaId || loadingAtualizacao}
                        className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-md flex items-center shadow-sm disabled:bg-gray-400"
                    >
                        <LucideRefreshCw size={18} className={`mr-2 ${loadingAtualizacao ? 'animate-spin' : ''}`}/> 
                        {loadingAtualizacao ? "Atualizando..." : "Atualizar com Mapa"}
                    </button>
                    <button
                        onClick={() => setIsNovaSemanaModalOpen(true)}
                        disabled={loadingAtualizacao}
                        className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-md flex items-center shadow-sm disabled:bg-gray-400"
                    >
                        <LucidePlusCircle size={20} className="mr-2"/> Criar Nova Semana
                    </button>
                    {semanas.length > 0 && (
                         <button
                            onClick={handleExcluirSemana}
                            disabled={!semanaSelecionadaId || loadingAtualizacao || semanas.length <= 1}
                            className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-md flex items-center shadow-sm disabled:bg-gray-400"
                        >
                            <LucideTrash2 size={18} className="mr-2"/> Excluir Semana
                        </button>
                    )}
                </div>
            </div>

            {loading && <p className="text-center py-4">Carregando programação...</p>}
            {!loading && !dadosProgramacao && semanaSelecionadaId && <p className="text-center py-4 text-red-500">Não foi possível carregar os dados da semana selecionada ou a semana não existe.</p>}
            {!loading && !semanaSelecionadaId && semanas.length === 0 && <p className="text-center py-4 text-gray-500">Nenhuma semana de programação foi criada ainda. Clique em "Criar Nova Semana".</p>}
            
            {!loading && dadosProgramacao && (
                 <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                    <table className="min-w-full border-collapse border border-gray-300 table-fixed">
                        <caption className="text-lg font-semibold p-2 bg-teal-700 text-white">
                            PROGRAMAÇÃO DIÁRIA - Semana de: {dadosProgramacao.dataInicioSemana?.toDate().toLocaleDateString('pt-BR', {timeZone:'UTC'})} a {dadosProgramacao.dataFimSemana?.toDate().toLocaleDateString('pt-BR', {timeZone:'UTC'})}
                        </caption>
                        <thead>
                            <tr key="programacao-semanal-header-row">
                                <th className="px-3 py-2 border bg-teal-600 text-white text-xs font-medium w-32">Responsável</th> 
                                {renderCabecalhoDias()}
                            </tr>
                        </thead>
                        <tbody>
                            {contextFuncionarios.length === 0 && ( 
                                <tr><td colSpan={DIAS_SEMANA.length + 1} className="text-center p-4 text-gray-500">Nenhum funcionário cadastrado. Adicione funcionários em Configurações.</td></tr>
                            )}
                            {contextFuncionarios.map(func => ( 
                                <tr key={func.id}>
                                    <td className="border px-3 py-2 font-semibold bg-teal-100 text-teal-800 text-sm whitespace-nowrap">{func.nome}</td>
                                    {renderCelulasTarefas(func.id)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <Modal isOpen={isNovaSemanaModalOpen} onClose={() => setIsNovaSemanaModalOpen(false)} title="Criar Nova Semana de Programação">
                <div className="space-y-4">
                    <div>
                        <label htmlFor="novaSemanaData" className="block text-sm font-medium text-gray-700">Data de Início da Nova Semana (Segunda-feira):</label>
                        <input
                            type="date"
                            id="novaSemanaData"
                            value={novaSemanaDataInicio}
                            onChange={(e) => setNovaSemanaDataInicio(e.target.value)}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                    <div className="flex justify-end space-x-2">
                        <button onClick={() => setIsNovaSemanaModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancelar</button>
                        <button onClick={handleCriarNovaSemana} disabled={loadingAtualizacao} className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-400">
                            {loadingAtualizacao ? "Criando..." : "Criar Semana"}
                        </button>
                    </div>
                </div>
            </Modal>

            {isGerenciarTarefaModalOpen && dadosCelulaParaGerenciar.diaFormatado && (
                <GerenciarTarefaProgramacaoModal
                    isOpen={isGerenciarTarefaModalOpen}
                    onClose={() => setIsGerenciarTarefaModalOpen(false)}
                    diaFormatado={dadosCelulaParaGerenciar.diaFormatado}
                    responsavelId={dadosCelulaParaGerenciar.responsavelId}
                    tarefasDaCelula={dadosCelulaParaGerenciar.tarefas}
                    semanaId={semanaSelecionadaId} 
                    onAlteracaoSalva={() => {
                        // O onSnapshot já deve atualizar
                    }}
                />
            )}
        </div>
    );
};

// Componente AnotacoesPatio (agora "Registro Rápido de Tarefa")
const AnotacoesPatioComponent = () => {
    const { userId, db, appId, listasAuxiliares, auth, funcionarios } = useContext(GlobalContext); 
    const [anotacoes, setAnotacoes] = useState([]); // Mantém para exibir anotações antigas, se houver
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAnotacao, setEditingAnotacao] = useState(null); 

    // Campos do formulário unificado
    const [tarefa, setTarefa] = useState('');
    const [prioridade, setPrioridade] = useState('');
    const [area, setArea] = useState('');
    const [acao, setAcao] = useState(''); // Novo campo
    const [dataInicio, setDataInicio] = useState(''); // Novo campo
    const [orientacao, setOrientacao] = useState('');
    const [loadingForm, setLoadingForm] = useState(false);


    const basePath = `/artifacts/${appId}/public/data`;
    const anotacoesCollectionRef = collection(db, `${basePath}/anotacoes_patio`);
    const tarefasMapaCollectionRef = collection(db, `${basePath}/tarefas_mapa`);


    useEffect(() => { // Apenas para carregar anotações antigas, se existirem e forem úteis
        setLoading(true);
        const q = query(anotacoesCollectionRef, orderBy("createdAt", "desc")); 
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedAnotacoes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAnotacoes(fetchedAnotacoes); 
            setLoading(false);
        }, (error) => {
            console.error("Erro ao carregar anotações do pátio: ", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [userId, appId, db]); 

    const resetForm = () => {
        setTarefa(''); setPrioridade(''); setArea(''); setAcao(''); setDataInicio(''); setOrientacao('');
        setEditingAnotacao(null);
    };

    const handleOpenModal = (anotacao = null) => { // Renomeado para ser mais genérico
        if (anotacao) { // Se estiver editando uma anotação existente (funcionalidade pode ser removida/alterada)
            setEditingAnotacao(anotacao);
            setTarefa(anotacao.tarefa || '');
            setPrioridade(anotacao.prioridade || '');
            setArea(anotacao.area || '');
            setOrientacao(anotacao.orientacao || '');
            // Campos de tarefa não são preenchidos ao editar uma anotação simples
            setAcao(''); 
            setDataInicio('');
        } else {
            resetForm();
            setDataInicio(new Date().toISOString().split('T')[0]); // Padrão para data de início
        }
        setIsModalOpen(true);
    };
    
    const handleCloseModal = () => {
        setIsModalOpen(false);
        resetForm();
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!tarefa.trim() || !prioridade || !area || !acao || !dataInicio) {
            alert("Os campos Tarefa, Prioridade, Área, Ação e Data de Início são obrigatórios para criar uma tarefa no mapa.");
            return;
        }
        setLoadingForm(true);
        const usuario = auth.currentUser;

        const novaTarefaMapa = {
            tarefa: tarefa.trim().toUpperCase(),
            prioridade,
            area,
            acao,
            dataInicio: Timestamp.fromDate(new Date(dataInicio + "T00:00:00Z")),
            dataProvavelTermino: Timestamp.fromDate(new Date(dataInicio + "T00:00:00Z")), // Padrão para mesmo dia, pode ser ajustado
            orientacao: orientacao.trim(),
            status: "AGUARDANDO ALOCAÇÃO",
            responsaveis: [],
            turno: TURNO_DIA_INTEIRO, // Padrão
            criadoPor: usuario?.uid || 'sistema',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            semanaProgramada: "", // Será preenchido na alocação ou sincronização
        };

        try {
            const docRef = await addDoc(tarefasMapaCollectionRef, novaTarefaMapa);
            await logAlteracaoTarefa(db, basePath, docRef.id, usuario?.uid, usuario?.email, "Tarefa Criada (Registro Rápido)", `Tarefa "${novaTarefaMapa.tarefa}" adicionada com status AGUARDANDO ALOCAÇÃO.`);
            alert("Tarefa registrada com sucesso no Mapa de Atividades e aguardando alocação!");
            handleCloseModal();
        } catch (error) {
            console.error("Erro ao registrar tarefa/anotação:", error);
            alert("Erro ao registrar: " + error.message);
        }
        setLoadingForm(false);
    };
    
    // A exclusão de anotações antigas pode ser mantida se necessário, ou removida se o foco for apenas criar tarefas.
    const handleDeleteAnotacaoAntiga = async (anotacaoId) => {
        if (window.confirm("Tem certeza que deseja excluir esta anotação antiga?")) {
            setLoading(true);
            try {
                await deleteDoc(doc(db, `${basePath}/anotacoes_patio`, anotacaoId));
            } catch (error) {
                console.error("Erro ao excluir anotação antiga: ", error);
                alert("Erro ao excluir anotação antiga: " + error.message);
            }
            setLoading(false);
        }
    };


    if (loading && anotacoes.length === 0) return <div className="p-6 text-center">Carregando...</div>;

    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-full">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold text-gray-800">Registro Rápido de Tarefa</h2>
                <button
                    onClick={() => handleOpenModal()}
                    className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-md flex items-center shadow-sm"
                >
                    <LucidePlusCircle size={20} className="mr-2"/> Nova Tarefa Rápida
                </button>
            </div>
            
            {/* Lista de anotações antigas (opcional, pode ser removido se não for mais útil) */}
            {anotacoes.length > 0 && (
                <div className="mb-8">
                    <h3 className="text-lg font-medium text-gray-700 mb-2">Anotações Antigas (Apenas Visualização/Exclusão)</h3>
                     <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            {/* ... cabeçalho e corpo da tabela para anotações antigas ... */}
                        </table>
                    </div>
                </div>
            )}
            {anotacoes.length === 0 && !loading && <p className="text-gray-500 text-center">Nenhuma anotação antiga para exibir.</p>}


            <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingAnotacao ? "Editar Anotação Antiga" : "Registrar Nova Tarefa Pendente"}>
                 <form onSubmit={handleSave} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Tarefa (Descrição) <span className="text-red-500">*</span></label>
                        <input type="text" value={tarefa} onChange={(e) => setTarefa(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"/>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Prioridade <span className="text-red-500">*</span></label>
                            <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                                <option value="">Selecione...</option>
                                {listasAuxiliares.prioridades.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Área <span className="text-red-500">*</span></label>
                            <select value={area} onChange={(e) => setArea(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                                <option value="">Selecione...</option>
                                {listasAuxiliares.areas.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </div>
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Ação <span className="text-red-500">*</span></label>
                            <select value={acao} onChange={(e) => setAcao(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                                <option value="">Selecione...</option>
                                {listasAuxiliares.acoes.map(ac => <option key={ac} value={ac}>{ac}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Data de Início <span className="text-red-500">*</span></label>
                            <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"/>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Orientação</label>
                        <textarea value={orientacao} onChange={(e) => setOrientacao(e.target.value)} rows="3" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"></textarea>
                    </div>
                    <div className="pt-4 flex justify-end space-x-2">
                        <button type="button" onClick={handleCloseModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancelar</button>
                        <button type="submit" disabled={loadingForm} className="px-4 py-2 text-sm font-medium text-white bg-yellow-600 rounded-md hover:bg-yellow-700 disabled:bg-gray-400">
                            {loadingForm ? 'Salvando...' : 'Salvar Tarefa Pendente'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};


// Componente Relatorios
const RelatoriosComponent = () => {
    const { db, appId, listasAuxiliares, funcionarios: contextFuncionarios } = useContext(GlobalContext);
    const [tarefasFiltradas, setTarefasFiltradas] = useState([]);
    const [loadingReport, setLoadingReport] = useState(false);
    const [filtroFuncionarios, setFiltroFuncionarios] = useState([]);
    const [filtroStatus, setFiltroStatus] = useState([]);
    const [filtroDataInicio, setFiltroDataInicio] = useState('');
    const [filtroDataFim, setFiltroDataFim] = useState('');
    const [showReport, setShowReport] = useState(false);

    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    useEffect(() => {
        setFiltroDataInicio(firstDayOfMonth.toISOString().split('T')[0]);
        setFiltroDataFim(today.toISOString().split('T')[0]);
    }, []);


    const handleFuncionarioChange = (e) => {
        const { value, checked } = e.target;
        setFiltroFuncionarios(prev => 
            checked ? [...prev, value] : prev.filter(item => item !== value)
        );
    };
    const handleSelectAllFuncionarios = () => {
        const allFuncIds = contextFuncionarios.map(f => f.id);
        setFiltroFuncionarios([SEM_RESPONSAVEL_VALUE, ...allFuncIds]);
        document.querySelectorAll('input[name="funcionarioChkItem"]').forEach(chk => chk.checked = true);
        document.getElementById('funcionarioChk-semResponsavel').checked = true;


    };
    const handleClearAllFuncionarios = () => {
        setFiltroFuncionarios([]);
        document.querySelectorAll('input[name="funcionarioChkItem"]').forEach(chk => chk.checked = false);
        document.getElementById('funcionarioChk-semResponsavel').checked = false;
    };


    const handleStatusChange = (e) => {
        const { value, checked } = e.target;
        setFiltroStatus(prev =>
            checked ? [...prev, value] : prev.filter(item => item !== value)
        );
    };
    const handleSelectAllStatus = () => {
        setFiltroStatus([...listasAuxiliares.status]);
        document.querySelectorAll('input[name="statusChkItem"]').forEach(chk => chk.checked = true);
    };
    const handleClearAllStatus = () => {
        setFiltroStatus([]);
        document.querySelectorAll('input[name="statusChkItem"]').forEach(chk => chk.checked = false);
    };

    
    const escapeHtml = (unsafe) => {
        if (unsafe === null || typeof unsafe === 'undefined') return '';
        return String(unsafe).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    };

    const formatDateForDisplay = (timestamp) => {
        if (!timestamp) return 'N/A';
        const date = timestamp instanceof Timestamp ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    };
    
    const getResponsavelNomesParaRelatorio = (responsavelIds) => {
        if (!responsavelIds || responsavelIds.length === 0) return '--- SEM RESPONSÁVEL ---';
        return responsavelIds.map(id => {
            const func = contextFuncionarios.find(f => f.id === id);
            return func ? func.nome : id; 
        }).join(', ');
    };


    const handleGerarRelatorio = async () => {
        setLoadingReport(true);
        setShowReport(false);
        const basePath = `/artifacts/${appId}/public/data`;
        const tarefasMapaRef = collection(db, `${basePath}/tarefas_mapa`);
        let q = query(tarefasMapaRef); 

        try {
            const querySnapshot = await getDocs(q);
            let tarefas = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`[Relatorio] ${tarefas.length} tarefas encontradas inicialmente no mapa.`);

            const dataInicioFiltro = filtroDataInicio ? new Date(Date.parse(filtroDataInicio + "T00:00:00Z")) : null;
            const dataFimFiltro = filtroDataFim ? new Date(Date.parse(filtroDataFim + "T23:59:59Z")) : null;

            const tarefasProcessadas = tarefas.filter(task => {
                let manter = true;

                if (filtroFuncionarios.length > 0) {
                    const temSemResponsavelNoFiltro = filtroFuncionarios.includes(SEM_RESPONSAVEL_VALUE);
                    const responsaveisDaTarefa = task.responsaveis || [];
                    
                    if (temSemResponsavelNoFiltro && responsaveisDaTarefa.length === 0) {
                        // Mantém
                    } else if (responsaveisDaTarefa.length > 0 && filtroFuncionarios.some(fId => responsaveisDaTarefa.includes(fId))) {
                        // Mantém
                    } else {
                        manter = false; 
                    }
                }


                if (manter && filtroStatus.length > 0) {
                    if (!filtroStatus.includes(task.status)) {
                        manter = false;
                    }
                }

                const dataInicioTarefa = task.dataInicio ? task.dataInicio.toDate() : null;
                const dataFimTarefa = task.dataProvavelTermino ? task.dataProvavelTermino.toDate() : null;

                if (manter && dataInicioFiltro && dataFimTarefa && dataFimTarefa.getTime() < dataInicioFiltro.getTime()) {
                    manter = false; 
                }
                if (manter && dataFimFiltro && dataInicioTarefa && dataInicioTarefa.getTime() > dataFimFiltro.getTime()) {
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
                alert("Nenhuma tarefa encontrada para os filtros selecionados.");
            }

        } catch (error) {
            console.error("Erro ao gerar relatório: ", error);
            alert("Erro ao gerar relatório: " + error.message);
        }
        setLoadingReport(false);
    };
    
    const handlePrint = () => {
        const reportContentElement = document.getElementById("printable-report-area-content");
        if (!reportContentElement) {
            alert("Erro: Conteúdo do relatório não encontrado para impressão.");
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
    
        const pri = printFrame.contentWindow;
    
        printFrame.onload = function() {
            pri.document.open();
            pri.document.write('<html><head><title>Relatório de Atividades</title>');
            pri.document.write('<style>');
            pri.document.write(`
                @media print {
                    body { margin: 20px !important; font-family: Arial, sans-serif !important; line-height: 1.4 !important; font-size: 10pt !important; }
                    table { width: 100% !important; border-collapse: collapse !important; margin-bottom: 20px !important; }
                    th, td { border: 1px solid #ccc !important; padding: 6px !important; text-align: left !important; word-break: break-word !important; }
                    th { background-color: #f2f2f2 !important; font-weight: bold !important; }
                    .print-header { text-align: center !important; margin-bottom: 25px !important; }
                    .print-header h1 { margin-bottom: 5px !important; font-size: 16pt !important; }
                    .print-header p { font-size: 0.9em !important; color: #555 !important; margin-top:0 !important; text-align: left !important; }
                    .report-footer { margin-top: 40px !important; padding-top: 20px !important; border-top: 1px solid #eee !important; font-size: 10pt !important; color: #333 !important; }
                    .report-footer p { margin: 3px 0 !important; }
                    .report-footer .footer-left { text-align: left !important; margin-bottom: 1em !important; }
                    .report-footer .footer-center { text-align: center !important; }
                    .report-footer .last-line { text-transform: uppercase !important; font-weight: bold !important; }
                    img { max-height: 50px !important; display: block !important; margin-left:auto !important; margin-right:auto !important; margin-bottom: 10px !important; }
                    .text-2xl { font-size: 16pt !important; } 
                    .font-semibold { font-weight: bold !important; }
                    .text-gray-800 { color: #374151 !important; }
                    .text-sm { font-size: 0.9em !important; }
                    .text-gray-600 { color: #4B5563 !important; }
                    .mb-6 { margin-bottom: 25px !important; }
                    .mx-auto { margin-left: auto !important; margin-right: auto !important; }
                    .h-14 { height: 50px !important; } 
                    .w-auto { width: auto !important; }
                    .mb-4 { margin-bottom: 10px !important; }
                    .border { border: 1px solid #ccc !important; }
                    .divide-y > :not([hidden]) ~ :not([hidden]) { border-top-width: 1px !important; border-color: #e5e7eb !important; }
                    .divide-gray-200 > :not([hidden]) ~ :not([hidden]) { border-color: #e5e7eb !important; }
                    .bg-gray-100 { background-color: #f2f2f2 !important; }
                    .px-4 { padding-left: 1rem !important; padding-right: 1rem !important; }
                    .py-2 { padding-top: 0.5rem !important; padding-bottom: 0.5rem !important; }
                    .text-left { text-align: left !important; }
                    .text-xs { font-size: 0.75rem !important; }
                    .font-medium { font-weight: 500 !important; }
                    .uppercase { text-transform: uppercase !important; }
                    .tracking-wider { letter-spacing: 0.05em !important; }
                    .border-b { border-bottom-width: 1px !important; }
                    .whitespace-nowrap { white-space: nowrap !important; }
                    .max-w-xs { max-width: 20rem !important; } 
                    .whitespace-normal { white-space: normal !important; }
                    .break-words { word-break: break-word !important; }
                    .mt-8 { margin-top: 2rem !important; }
                    .pt-4 { padding-top: 1rem !important; }
                    .border-t { border-top-width: 1px !important; }
                    .text-center { text-align: center !important; }
                    .mt-1 { margin-top: 0.25rem !important; }
                }
            `);
            pri.document.write('</style></head><body>');
            pri.document.write(printContents);
            pri.document.write('</body></html>');
            pri.document.close();
            pri.focus(); 
            pri.print();
            setTimeout(() => {
                if (document.body.contains(printFrame)) {
                    document.body.removeChild(printFrame);
                }
            }, 2000); 
        };
    
        if (!printFrame.contentWindow || !printFrame.contentWindow.document) {
            console.error("Não foi possível acessar o contentWindow do iframe imediatamente.");
        }
    }


    return (
        <div className="p-6 bg-gray-50 min-h-full">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800">Relatório de Atividades</h2>
            
            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-4">
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
                            {contextFuncionarios.map(f => (
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
                            {listasAuxiliares.status.map(s => (
                                <div key={s} className="flex items-center mb-1">
                                    <input type="checkbox" id={`status-${s.replace(/\s+/g, '-')}`} name="statusChkItem" value={s} onChange={handleStatusChange} checked={filtroStatus.includes(s)} className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"/>
                                    <label htmlFor={`status-${s.replace(/\s+/g, '-')}`} className="ml-2 text-sm text-gray-700">{s}</label>
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
                <div > 
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
                        <div className="text-center mb-6 print-header">
                            {LOGO_URL && <img src={LOGO_URL} alt="Logotipo Gramoterra" className="mx-auto h-14 w-auto mb-4" onError={(e) => e.target.style.display='none'}/>}
                            <h1 className="text-2xl font-semibold text-gray-800">Relatório de Atividades</h1>
                            <p className="text-sm text-gray-600">
                                Funcionário(s): {filtroFuncionarios.length > 0 ? filtroFuncionarios.map(fId => fId === SEM_RESPONSAVEL_VALUE ? "Sem Responsável" : (contextFuncionarios.find(f=>f.id === fId)?.nome || fId)).join(', ') : "TODOS"}
                                <br/>
                                Status: {filtroStatus.length > 0 ? filtroStatus.join(', ') : "TODOS"}
                                <br/>
                                Período: {filtroDataInicio ? formatDateForDisplay(new Date(filtroDataInicio+"T00:00:00Z")) : 'N/A'} a {filtroDataFim ? formatDateForDisplay(new Date(filtroDataFim+"T00:00:00Z")) : 'N/A'}
                            </p>
                        </div>
                        
                        <div className="overflow-x-auto mb-6">
                            <table className="min-w-full divide-y divide-gray-200 border">
                                <thead className="bg-gray-100">
                                    <tr>
                                        {["Responsável", "Tarefa", "Status", "Turno", "Prioridade", "Data Início", "Data Fim", "Área", "Ação"].map(header => (
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
                                                <td className="px-4 py-2 text-sm text-gray-700 border-b whitespace-nowrap">{task.status}</td>
                                                <td className="px-4 py-2 text-sm text-gray-700 border-b whitespace-nowrap">{task.turno || 'N/A'}</td>
                                                <td className="px-4 py-2 text-sm text-gray-700 border-b whitespace-nowrap">{task.prioridade}</td>
                                                <td className="px-4 py-2 text-sm text-gray-700 border-b whitespace-nowrap">{formatDateForDisplay(task.dataInicio)}</td>
                                                <td className="px-4 py-2 text-sm text-gray-700 border-b whitespace-nowrap">{formatDateForDisplay(task.dataProvavelTermino)}</td>
                                                <td className="px-4 py-2 text-sm text-gray-700 border-b whitespace-nowrap">{task.area}</td>
                                                <td className="px-4 py-2 text-sm text-gray-700 border-b whitespace-nowrap">{task.acao}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-8 pt-4 border-t border-gray-200 text-center text-xs text-gray-500 report-footer">
                            <p>Lembramos que esta programação pode ser alterada no decorrer do dia.</p>
                            <p className="font-semibold uppercase mt-1 last-line">JUNTOS CONSTRUIMOS O EXPLÊNDIDO</p>
                        </div>
                    </div>
                </div>
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
        const q = query(tarefasMapaRef, where("status", "==", "AGUARDANDO ALOCAÇÃO"));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedPendentes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTarefasPendentes(fetchedPendentes);
            setLoading(false);
        }, (error) => {
            console.error("Erro ao carregar tarefas pendentes:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [userId, appId, db]);

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
            const func = funcionarios.find(f => f.id === id);
            return func ? func.nome : id; 
        }).join(', ');
    };


    const handleSalvarAlocacao = async (tarefaId, dadosAlocacao) => {
        setLoading(true); 
        const tarefaDocRef = doc(db, `${basePath}/tarefas_mapa`, tarefaId);
        const usuario = authGlobal.currentUser;
        try {
            const dadosParaAtualizar = {
                ...dadosAlocacao, 
                status: "PROGRAMADA",
                updatedAt: Timestamp.now(),
            };
            
            if (dadosAlocacao.dataInicio instanceof Timestamp) {
                 const dataInicioJS = dadosAlocacao.dataInicio.toDate();
                 const todasSemanasQuery = query(collection(db, `${basePath}/programacao_semanal`));
                 const todasSemanasSnap = await getDocs(todasSemanasQuery);
                 let semanaEncontrada = false;
                 for (const semanaDocSnap of todasSemanasSnap.docs) {
                     const semana = semanaDocSnap.data();
                     if (semana.dataInicioSemana.toDate() <= dataInicioJS && semana.dataFimSemana.toDate() >= dataInicioJS) {
                         dadosParaAtualizar.semanaProgramada = semana.nomeAba || semanaDocSnap.id;
                         semanaEncontrada = true;
                         break;
                     }
                 }
                 if (!semanaEncontrada) {
                    console.warn(`Nenhuma semana de programação encontrada para a data de início ${formatDate(dadosAlocacao.dataInicio)} da tarefa ${tarefaId}. O campo 'semanaProgramada' não será definido.`);
                    // Não definir dadosParaAtualizar.semanaProgramada se nenhuma semana for encontrada
                 }
            }


            await updateDoc(tarefaDocRef, dadosParaAtualizar);
            
            const tarefaAtualizadaSnap = await getDoc(tarefaDocRef);
            if (tarefaAtualizadaSnap.exists()) {
                const tarefaAtualizadaData = tarefaAtualizadaSnap.data();
                await sincronizarTarefaComProgramacao(tarefaId, {id: tarefaId, ...tarefaAtualizadaData}, db, basePath);
                 await logAlteracaoTarefa(db, basePath, tarefaId, usuario?.uid, usuario?.email, "Tarefa Alocada", 
                    `Alocada para: ${getResponsavelNomesParaLog(dadosParaAtualizar.responsaveis)}. Turno: ${dadosParaAtualizar.turno}. Período: ${formatDate(dadosParaAtualizar.dataInicio)} a ${formatDate(dadosParaAtualizar.dataProvavelTermino)}.`
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
    

    if (loading) return <div className="p-6 text-center">Carregando tarefas pendentes...</div>;

    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-full">
            <h2 className="text-2xl font-semibold text-gray-800 mb-6">Tarefas Pendentes (Aguardando Alocação)</h2>
            {tarefasPendentes.length === 0 ? (
                <p className="text-gray-600">Nenhuma tarefa pendente no momento.</p>
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
                                <tr key={tp.id}>
                                    <td className="px-4 py-3 text-sm text-gray-800 max-w-xs whitespace-normal break-words">{tp.tarefa}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{tp.prioridade}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{tp.area}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{tp.acao}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{formatDate(tp.createdAt)}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700 max-w-xs whitespace-normal break-words">{tp.orientacao}</td>
                                    <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">
                                        <button 
                                            onClick={() => handleAbrirModalAlocacao(tp)}
                                            className="bg-green-500 hover:bg-green-600 text-white text-xs font-semibold py-1 px-3 rounded-md flex items-center"
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

// Componente Dashboard
const DashboardComponent = () => {
    const { db, appId, listasAuxiliares, funcionarios, loadingAuth } = useContext(GlobalContext); 
    const [stats, setStats] = useState({
        porStatus: {},
        porPrioridade: {},
        proximoPrazo: [],
        atrasadas: [],
        porFuncionario: {} 
    });
    const [loadingDashboard, setLoadingDashboard] = useState(true);
    const basePath = `/artifacts/${appId}/public/data`;

    useEffect(() => {
        console.log("[Dashboard] useEffect triggered. Deps:", { 
            loadingAuth, 
            dbReady: !!db, 
            appIdReady: !!appId, 
            statusLength: listasAuxiliares.status.length, 
            prioLength: listasAuxiliares.prioridades.length,
            funcionariosLength: funcionarios.length
        });
        
        const fetchDashboardData = async () => {
            console.log("[Dashboard] fetchDashboardData: Iniciando busca...");
            setLoadingDashboard(true); 
            try {
                const tarefasRef = collection(db, `${basePath}/tarefas_mapa`);
                const snapshot = await getDocs(tarefasRef);
                const todasTarefas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                console.log("[Dashboard] fetchDashboardData: Tarefas do mapa carregadas:", todasTarefas.length);

                const porStatus = {};
                (Array.isArray(listasAuxiliares.status) ? listasAuxiliares.status : []).forEach(s => porStatus[s] = 0);
                
                const porPrioridade = {};
                (Array.isArray(listasAuxiliares.prioridades) ? listasAuxiliares.prioridades : []).forEach(p => porPrioridade[p] = 0);

                const porFuncionario = {};
                (Array.isArray(funcionarios) ? funcionarios : []).forEach(f => porFuncionario[f.nome] = 0); 

                const hoje = new Date();
                hoje.setHours(0,0,0,0);
                const daqui7Dias = new Date(hoje);
                daqui7Dias.setDate(hoje.getDate() + 7);

                const proximoPrazo = [];
                const atrasadas = [];

                todasTarefas.forEach(tarefa => {
                    if (tarefa.status && porStatus.hasOwnProperty(tarefa.status)) { 
                        porStatus[tarefa.status]++;
                    } else if (tarefa.status) { 
                        porStatus[tarefa.status] = 1; 
                    }

                    if (tarefa.prioridade && porPrioridade.hasOwnProperty(tarefa.prioridade)) {
                        porPrioridade[tarefa.prioridade]++;
                    } else if (tarefa.prioridade) { 
                        porPrioridade[tarefa.prioridade] = 1; 
                    }

                    if (tarefa.status !== "CONCLUÍDA" && tarefa.status !== "CANCELADA" && Array.isArray(tarefa.responsaveis)) {
                        tarefa.responsaveis.forEach(respId => {
                            const func = funcionarios.find(f => f.id === respId);
                            if (func && func.nome) {
                                porFuncionario[func.nome] = (porFuncionario[func.nome] || 0) + 1;
                            }
                        });
                    }


                    if (tarefa.dataProvavelTermino && (tarefa.status !== "CONCLUÍDA" && tarefa.status !== "CANCELADA")) {
                        const dataTermino = tarefa.dataProvavelTermino.toDate();
                        dataTermino.setHours(0,0,0,0); 
                        if (dataTermino < hoje) {
                            atrasadas.push(tarefa);
                        } else if (dataTermino >= hoje && dataTermino <= daqui7Dias) {
                            proximoPrazo.push(tarefa);
                        }
                    }
                });
                
                proximoPrazo.sort((a,b) => a.dataProvavelTermino.toMillis() - b.dataProvavelTermino.toMillis());
                atrasadas.sort((a,b) => a.dataProvavelTermino.toMillis() - b.dataProvavelTermino.toMillis());

                console.log("[Dashboard] fetchDashboardData: Stats calculados:", { porStatus, porPrioridade, proximoPrazo: proximoPrazo.length, atrasadas: atrasadas.length, porFuncionario });
                setStats({ porStatus, porPrioridade, proximoPrazo, atrasadas, porFuncionario });
            } catch (error) {
                console.error("[Dashboard] fetchDashboardData: Erro ao buscar dados:", error);
                setStats({ porStatus: {}, porPrioridade: {}, proximoPrazo: [], atrasadas: [], porFuncionario: {} }); 
            } finally {
                console.log("[Dashboard] fetchDashboardData: setLoadingDashboard(false)");
                setLoadingDashboard(false); 
            }
        };

        if (!loadingAuth && db && appId) {
            console.log("[Dashboard] useEffect: Condições atendidas (auth, db, appId). Verificando listasAuxiliares e funcionarios...");
            if (listasAuxiliares && listasAuxiliares.status && listasAuxiliares.status.length > 0 && 
                listasAuxiliares.prioridades && listasAuxiliares.prioridades.length > 0 &&
                funcionarios && funcionarios.length > 0) {
                console.log("[Dashboard] Listas auxiliares e funcionarios prontos, chamando fetchDashboardData.");
                fetchDashboardData();
            } else {
                 console.log("[Dashboard] Listas auxiliares ou funcionarios ainda não estão prontas ou estão vazias. Aguardando...");
            }
        } else if (!loadingAuth) {
            console.log("[Dashboard] useEffect: db ou appId não está pronto após autenticação. Não buscando dados.");
            setLoadingDashboard(false); 
        }
        
        return () => {
           console.log("[Dashboard] Cleanup useEffect");
        };
    }, [db, appId, listasAuxiliares.status, listasAuxiliares.prioridades, funcionarios, loadingAuth]);

    const getPrioridadeColor = (prioridade) => {
        if (prioridade === "P4 - URGENTE") return "bg-red-500 text-white";
        if (prioridade === "P1 - CURTO PRAZO") return "bg-orange-400 text-white";
        if (prioridade === "P2 - MÉDIO PRAZO") return "bg-yellow-400 text-black";
        return "bg-gray-200 text-gray-700";
    };
    
    const getStatusColorText = (status) => {
        if (status === "CANCELADA") return "text-red-600";
        if (status === "CONCLUÍDA") return "text-green-600";
        if (status === "PROGRAMADA") return "text-blue-600";
        if (status === "AGUARDANDO ALOCAÇÃO") return "text-orange-600";
        if (status === "PREVISTA") return "text-yellow-600";
        return "text-gray-600";
    };


    if (loadingDashboard) {
        return <div className="p-6 text-center">Carregando dados do Dashboard...</div>;
    }

    return (
        <div className="p-6 bg-gray-100 min-h-full">
            <h2 className="text-3xl font-semibold text-gray-800 mb-8">Dashboard</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-lg shadow-lg">
                    <h3 className="text-xl font-semibold text-gray-700 mb-4 flex items-center"><LucideListChecks size={22} className="mr-2 text-blue-500"/>Tarefas por Status</h3>
                    <ul className="space-y-2">
                        {Object.entries(stats.porStatus).map(([status, count]) => (
                            <li key={status} className="flex justify-between items-center text-sm">
                                <span className={`font-medium ${getStatusColorText(status)}`}>{status}</span>
                                <span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded-full text-xs font-semibold">{count}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-lg">
                    <h3 className="text-xl font-semibold text-gray-700 mb-4 flex items-center"><LucideAlertCircle size={22} className="mr-2 text-orange-500"/>Tarefas por Prioridade</h3>
                    <ul className="space-y-2">
                         {Object.entries(stats.porPrioridade).map(([prioridade, count]) => (
                            <li key={prioridade} className="flex justify-between items-center text-sm">
                                <span className={`font-medium px-2 py-0.5 rounded-full text-xs ${getPrioridadeColor(prioridade)}`}>{prioridade}</span>
                                <span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded-full text-xs font-semibold">{count}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-lg">
                    <h3 className="text-xl font-semibold text-gray-700 mb-4 flex items-center"><LucideUserCog size={22} className="mr-2 text-indigo-500"/>Tarefas Ativas por Funcionário</h3>
                    <ul className="space-y-2 max-h-60 overflow-y-auto">
                        {Object.entries(stats.porFuncionario)
                            .sort(([, countA], [, countB]) => countB - countA) // Ordena por contagem decrescente
                            .map(([funcionario, count]) => (
                            <li key={funcionario} className="flex justify-between items-center text-sm">
                                <span className="font-medium text-gray-600">{funcionario}</span>
                                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-semibold">{count}</span>
                            </li>
                        ))}
                         {Object.keys(stats.porFuncionario).length === 0 && <p className="text-sm text-gray-500">Nenhuma tarefa ativa atribuída.</p>}
                    </ul>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-lg shadow-lg">
                    <h3 className="text-xl font-semibold text-yellow-600 mb-4 flex items-center"><LucideClock size={22} className="mr-2"/> Tarefas com Prazo Próximo (7 dias)</h3>
                    {stats.proximoPrazo.length > 0 ? (
                        <ul className="space-y-3 max-h-80 overflow-y-auto">
                            {stats.proximoPrazo.map(tarefa => (
                                <li key={tarefa.id} className="p-3 border rounded-md bg-yellow-50 border-yellow-300">
                                    <p className="font-semibold text-sm text-yellow-800">{tarefa.tarefa}</p>
                                    <p className="text-xs text-yellow-700">Término: {formatDate(tarefa.dataProvavelTermino)} - Status: {tarefa.status}</p>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="text-sm text-gray-500">Nenhuma tarefa com prazo próximo.</p>}
                </div>

                <div className="bg-white p-6 rounded-lg shadow-lg">
                    <h3 className="text-xl font-semibold text-red-600 mb-4 flex items-center"><LucideAlertOctagon size={22} className="mr-2"/> Tarefas Atrasadas</h3>
                     {stats.atrasadas.length > 0 ? (
                        <ul className="space-y-3 max-h-80 overflow-y-auto">
                            {stats.atrasadas.map(tarefa => (
                                <li key={tarefa.id} className="p-3 border rounded-md bg-red-50 border-red-300">
                                    <p className="font-semibold text-sm text-red-800">{tarefa.tarefa}</p>
                                    <p className="text-xs text-red-700">Término: {formatDate(tarefa.dataProvavelTermino)} - Status: {tarefa.status}</p>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="text-sm text-gray-500">Nenhuma tarefa atrasada.</p>}
                </div>
            </div>
        </div>
    );
};


// Componente Principal App
function App() {
    const [currentPage, setCurrentPage] = useState('dashboard'); 
    const { currentUser, auth: firebaseAuth } = useContext(GlobalContext); 

    if (!currentUser) {
        return <AuthComponent />;
    }
    
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

    const NavLink = memo(({ page, children, icon: Icon, currentPage, setCurrentPage }) => ( 
        <button
            onClick={() => setCurrentPage(page)}
            className={`flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors duration-150 ease-in-out
                        ${currentPage === page ? 'bg-blue-600 text-white shadow-md' : 'text-gray-700 hover:bg-blue-100 hover:text-blue-700'}`}
        >
            {Icon && <Icon size={18} className="mr-2"/>}
            {children}
        </button>
    ));

    return (
        <div className="flex h-screen bg-gray-100 font-sans">
            <aside className="w-64 bg-white shadow-lg flex flex-col p-4 space-y-2 border-r border-gray-200">
                <div className="mb-4 p-2 text-center">
                     <img src={LOGO_URL} alt="Logo Gramoterra" className="mx-auto h-12 w-auto mb-2" onError={(e) => e.target.style.display='none'}/>
                    <h1 className="text-xl font-semibold text-gray-700">Gestor de Equipes</h1>
                </div>
                <nav className="flex-grow space-y-1">
                    <NavLink page="dashboard" icon={LucideLayoutDashboard} currentPage={currentPage} setCurrentPage={setCurrentPage}>Dashboard</NavLink> 
                    <NavLink page="mapa" icon={LucideClipboardList} currentPage={currentPage} setCurrentPage={setCurrentPage}>Mapa de Atividades</NavLink>
                    <NavLink page="programacao" icon={LucideCalendarDays} currentPage={currentPage} setCurrentPage={setCurrentPage}>Programação Semanal</NavLink>
                    <NavLink page="anotacoes" icon={LucideStickyNote} currentPage={currentPage} setCurrentPage={setCurrentPage}>Anotações Pátio</NavLink>
                    <NavLink page="tarefasPendentes" icon={LucideListTodo} currentPage={currentPage} setCurrentPage={setCurrentPage}>Tarefas Pendentes</NavLink> 
                    <NavLink page="config" icon={LucideSettings} currentPage={currentPage} setCurrentPage={setCurrentPage}>Configurações</NavLink>
                    <NavLink page="relatorios" icon={LucideFileText} currentPage={currentPage} setCurrentPage={setCurrentPage}>Relatórios</NavLink>
                </nav>
                <div className="mt-auto">
                     <p className="text-xs text-gray-500 mb-2 px-2">Logado como: {currentUser.isAnonymous ? "Anônimo" : currentUser.email || currentUser.uid}</p>
                    <button 
                        onClick={() => firebaseAuth.signOut()}
                        className="w-full flex items-center justify-center px-3 py-2.5 text-sm font-medium rounded-md text-red-600 hover:bg-red-100 hover:text-red-700 transition-colors duration-150 ease-in-out"
                    >
                        <LucideLogOut size={18} className="mr-2"/> Sair
                    </button>
                </div>
            </aside>

            <main className="flex-1 overflow-y-auto">
                <PageContent />
            </main>
        </div>
    );
}

export default function WrappedApp() {
    return (
        <GlobalProvider>
            <App />
        </GlobalProvider>
    );
}