import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { auth, db } from '../services/firebase'; // Importa instâncias do firebase.js

// Cria o Contexto Global
const GlobalContext = createContext();

// Hook customizado para usar o contexto global facilmente
export const useGlobalContext = () => useContext(GlobalContext);

// Dados iniciais de configuração (Fallback)
const DADOS_INICIAIS_CONFIG = {
    prioridades: ["P1 - CURTO PRAZO", "P2 - MÉDIO PRAZO", "P3 - LONGO PRAZO", "P4 - URGENTE"],
    areas: ["LADO 01", "LADO 02", "ANEXO A", "ANEXO B", "ANEXO C", "CANTEIRO CENTRAL", "LOJA", "OLIVEIRAS - ANT. REFEITORIO"],
    acoes: ["ROÇADA", "PLANTIO", "MANUTENÇÃO", "LIMPEZA", "ADUBAÇÃO", "PULVERIZAÇÃO", "OUTROS"],
    status: ["PREVISTA", "AGUARDANDO ALOCAÇÃO", "PROGRAMADA", "CONCLUÍDA", "CANCELADA"],
    turnos: ["DIA INTEIRO", "MANHÃ", "TARDE"],
};

// Provedor do Contexto Global
export const GlobalProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [loadingAuth, setLoadingAuth] = useState(true);
    const [funcionarios, setFuncionarios] = useState([]);
    const [listasAuxiliares, setListasAuxiliares] = useState(DADOS_INICIAIS_CONFIG);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [appId, setAppId] = useState('default-app-id'); // Mantém appId, mas idealmente viria de outro lugar

    // Define o caminho base para os dados no Firestore
    // Usar o appId no path pode ser útil para multitenancy ou separação de ambientes
    const basePath = `/artifacts/${appId}/public/data`;

    // Efeito para autenticação
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setCurrentUser(user);
            } else {
                // Tenta login anônimo se não houver usuário
                try {
                    const userCredential = await signInAnonymously(auth);
                    setCurrentUser(userCredential.user);
                } catch (error) {
                    console.error("Erro no login anônimo:", error);
                    // Considerar um estado de erro aqui
                }
            }
            setLoadingAuth(false);
        });
        return () => unsubscribe(); // Limpa o listener ao desmontar
    }, []);

    // Efeito para carregar configurações e funcionários
    useEffect(() => {
        if (!appId || !db) return; // Não executa se appId ou db não estiverem prontos

        setLoadingConfig(true);
        const configDocRef = doc(db, basePath, 'configuracoes');
        const funcionariosCollectionRef = collection(db, `${basePath}/funcionarios`);

        // Listener para configurações
        const unsubscribeConfig = onSnapshot(configDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const configData = docSnap.data();
                // Mescla com dados iniciais para garantir que todas as chaves existam
                setListasAuxiliares({
                    prioridades: configData.prioridades || DADOS_INICIAIS_CONFIG.prioridades,
                    areas: configData.areas || DADOS_INICIAIS_CONFIG.areas,
                    acoes: configData.acoes || DADOS_INICIAIS_CONFIG.acoes,
                    status: configData.status || DADOS_INICIAIS_CONFIG.status,
                    turnos: configData.turnos || DADOS_INICIAIS_CONFIG.turnos,
                });
            } else {
                console.warn("Documento de configurações não encontrado, usando valores padrão.");
                setListasAuxiliares(DADOS_INICIAIS_CONFIG);
                // Opcional: Criar o documento de config com valores padrão se não existir
                // setDoc(configDocRef, DADOS_INICIAIS_CONFIG).catch(err => console.error("Erro ao criar config padrão:", err));
            }
            setLoadingConfig(false);
        }, (error) => {
            console.error("Erro ao carregar configurações:", error);
            setListasAuxiliares(DADOS_INICIAIS_CONFIG); // Usa padrão em caso de erro
            setLoadingConfig(false);
        });

        // Listener para funcionários
        const qFuncionarios = query(funcionariosCollectionRef, orderBy("nome")); // Ordena por nome
        const unsubscribeFuncionarios = onSnapshot(qFuncionarios, (snapshot) => {
            const fetchedFuncionarios = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setFuncionarios(fetchedFuncionarios);
        }, (error) => {
            console.error("Erro ao carregar funcionários:", error);
            setFuncionarios([]); // Limpa em caso de erro
        });

        // Limpa os listeners ao desmontar ou se appId mudar
        return () => {
            unsubscribeConfig();
            unsubscribeFuncionarios();
        };
    }, [appId, db, basePath]); // Depende de appId e db

    // Função para salvar configurações (exemplo, pode ser movida para um service)
    const salvarConfiguracoes = useCallback(async (novasConfig) => {
        if (!appId || !db) {
            console.error("Salvar Config: appId ou db não disponível.");
            throw new Error("Conexão com banco de dados não estabelecida.");
        }
        const configDocRef = doc(db, basePath, 'configuracoes');
        try {
            await setDoc(configDocRef, novasConfig, { merge: true }); // Usa merge para não sobrescrever campos não enviados
            console.log("Configurações salvas com sucesso.");
        } catch (error) {
            console.error("Erro ao salvar configurações:", error);
            throw error; // Propaga o erro para o componente tratar
        }
    }, [appId, db, basePath]);

    // Valores fornecidos pelo contexto
    const value = {
        currentUser,
        userId: currentUser?.uid,
        loadingAuth,
        auth, // Exporta a instância auth
        db,   // Exporta a instância db
        appId,
        basePath, // Exporta o basePath para ser usado nos services/hooks
        funcionarios,
        listasAuxiliares,
        loadingConfig,
        salvarConfiguracoes, // Disponibiliza a função de salvar
    };

    // Renderiza children apenas quando autenticação e config não estão carregando (ou mostrar um loader global)
    // Ou podemos deixar os componentes internos gerenciarem seus próprios loaders
    return (
        <GlobalContext.Provider value={value}>
            {children}
        </GlobalContext.Provider>
    );
};

