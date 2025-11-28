// Versão: 7.3.1
// [CORRIGIDO] Adicionada a importação do hook 'useMemo' do React, que estava faltando e causando um erro.

import React, { useState, useEffect, createContext, useContext, memo, useRef, useMemo } from 'react';
import firebaseAppInstance from './firebaseConfig';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, doc, addDoc, getDocs, getDoc, setDoc, deleteDoc, onSnapshot, query, where, Timestamp, writeBatch, updateDoc, orderBy, limit, collectionGroup } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import DatePicker, { registerLocale } from 'react-datepicker';
import ptBR from 'date-fns/locale/pt-BR';
import "react-datepicker/dist/react-datepicker.css";
import { LucidePlusCircle, LucideEdit, LucideTrash2, LucideCalendarDays, LucideClipboardList, LucideSettings, LucideStickyNote, LucideLogOut, LucideFilter, LucideUsers, LucideFileText, LucideCheckCircle, LucideXCircle, LucideRotateCcw, LucideRefreshCw, LucidePrinter, LucideCheckSquare, LucideSquare, LucideAlertCircle, LucideArrowRightCircle, LucideListTodo, LucideUserPlus, LucideSearch, LucideX, LucideLayoutDashboard, LucideAlertOctagon, LucideClock, LucideHistory, LucidePauseCircle, LucidePaperclip, LucideAlertTriangle, LucideMousePointerClick, LucideSprayCan, LucideClipboardEdit, LucideBookMarked, LucideActivity, LucideNotebookText, LucideClipboardPlus, LucideShare2, LucideClipboardCopy, LucideKanbanSquare, LucideCalendar, LucidePalette } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
registerLocale('pt-BR', ptBR);

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
const TODOS_EXCETO_CONCLUIDOS_VALUE = "---TODOS_EXCETO_CONCLUIDOS---"; 

const LOGO_URL = "https://i.imgur.com/4hYwSxM.gif";

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

// Versão: 9.1.0
// [NOVO] Função para gerar uma lista de ocorrências futuras de um plano recorrente.
const gerarProximasOcorrencias = (plano, horizonteEmDias, calcularProximaAplicacao) => {
    const ocorrencias = [];
    if (!plano.ativo || plano.frequencia === 'UNICA') return ocorrencias;

    const hoje = new Date();
    hoje.setUTCHours(0, 0, 0, 0);

    const dataLimite = new Date(hoje);
    dataLimite.setUTCDate(dataLimite.getUTCDate() + horizonteEmDias);

    // Usa a função existente para encontrar o próximo ponto de partida
    let proxima = calcularProximaAplicacao(plano);

    if (!proxima) return ocorrencias;

    // Gera ocorrências futuras até atingir o horizonte definido
    while (proxima <= dataLimite) {
        // Adiciona apenas as datas que são estritamente no futuro
        if (proxima > hoje) {
            ocorrencias.push({
                planoId: plano.id,
                planoNome: plano.nome,
                produto: plano.produto,
                acao: plano.acao,
                dataPrevista: new Date(proxima.getTime()) // Clona a data para evitar mutação
            });
        }
        
        // Avança para a próxima data com base na frequência
        switch (plano.frequencia) {
            case 'SEMANAL': proxima.setUTCDate(proxima.getUTCDate() + 7); break;
            case 'QUINZENAL': proxima.setUTCDate(proxima.getUTCDate() + 14); break;
            case 'MENSAL': proxima.setUTCMonth(proxima.getUTCMonth() + 1); break;
            case 'INTERVALO_DIAS': proxima.setUTCDate(proxima.getUTCDate() + (plano.diasIntervalo || 1)); break;
            default: return ocorrencias;
        }
    }
    return ocorrencias;
};

// Versão 7.5.0
// [NOVO] Adicionada função para formatar data e hora.
const formatDateTime = (timestamp) => {
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
    return date.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
        timeZone: 'America/Sao_Paulo'
    });
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

// Versão: 8.5.1
// [NOVO] [CORREÇÃO] Adicionada a função 'calcularProximaAplicacao', que estava ausente e causando erro de referência no Dashboard.
// Esta função determina a próxima data de aplicação de um plano com base em sua frequência e último registro.
const calcularProximaAplicacao = (plano) => {
    if (!plano || !plano.ativo || !plano.dataInicio?.toDate) {
        return null;
    }

    const hojeUTC = new Date();
    hojeUTC.setUTCHours(0, 0, 0, 0);

    // Usa a última aplicação como base, se existir; senão, usa a data de início do plano.
    const baseDate = plano.ultimaAplicacao ? plano.ultimaAplicacao.toDate() : plano.dataInicio.toDate();
    // Clona a data para evitar mutação do objeto original do plano.
    let proxima = new Date(baseDate.getTime());
    proxima.setUTCHours(0, 0, 0, 0); // Normaliza para o início do dia em UTC.

    // Se houve uma última aplicação, calcula a data seguinte a partir dela.
    if (plano.ultimaAplicacao) {
        switch (plano.frequencia) {
            case 'SEMANAL':
                proxima.setUTCDate(proxima.getUTCDate() + 7);
                break;
            case 'QUINZENAL':
                proxima.setUTCDate(proxima.getUTCDate() + 14);
                break;
            case 'MENSAL':
                proxima.setUTCMonth(proxima.getUTCMonth() + 1);
                break;
            case 'INTERVALO_DIAS':
                proxima.setUTCDate(proxima.getUTCDate() + (plano.diasIntervalo || 1));
                break;
            case 'UNICA':
                // Se era única e já foi aplicada, não há próxima.
                return null;
            default:
                return null; // Frequência desconhecida.
        }
    }

    // Para planos recorrentes, se a data calculada já passou, avança até a próxima data válida a partir de hoje.
    if (proxima < hojeUTC && plano.frequencia !== 'UNICA') {
        while (proxima < hojeUTC) {
             switch (plano.frequencia) {
                case 'SEMANAL':
                    proxima.setUTCDate(proxima.getUTCDate() + 7);
                    break;
                case 'QUINZENAL':
                    proxima.setUTCDate(proxima.getUTCDate() + 14);
                    break;
                case 'MENSAL':
                    proxima.setUTCMonth(proxima.getUTCMonth() + 1);
                    break;
                case 'INTERVALO_DIAS':
                    proxima.setUTCDate(proxima.getUTCDate() + (plano.diasIntervalo || 1));
                    break;
                default:
                    return null; // Salvaguarda para evitar loop infinito.
            }
        }
    }
    
    // Se for um evento único que ainda não ocorreu, a próxima data é a data de início.
    if (plano.frequencia === 'UNICA' && !plano.ultimaAplicacao) {
        return plano.dataInicio.toDate();
    }

    // Se for um evento único que já ocorreu.
    if (plano.frequencia === 'UNICA' && plano.ultimaAplicacao) {
        return null;
    }

    return proxima;
};

// Versão: 10.3.0
// [ALTERADO] Adicionadas novas cores para ações de manutenção fitossanitária.
const getAcaoColor = (acao) => {
    switch (acao) {
        case 'MANUTENÇÃO | MUDAS':
            return '#81deab';
        case 'MANUTENÇÃO | PATIO':
            return '#83c1e6';
        case 'MELHORIAS | ESTRUTURAIS':
            return '#d9d680';
        case 'MANUTENÇÃO | PREVENTIVA':
        case 'MANUTENÇÃO | TRATAMENTO':
            return '#a289d6';
        default:
            return '#b3b2b1';
    }
};

// Versão: 8.9.1
// [ALTERADO] A lógica de verificação foi ajustada para criar a tarefa com 1 dia de antecedência (ou se já estiver atrasada).
// A função agora verifica se a 'proximaAplicacao' é menor ou igual a 'amanhaUTC', em vez de 'hojeUTC'.
async function verificarEGerarTarefasFito(db, basePath) {
    console.log("Verificando planos fitossanitários para gerar tarefas (com 1 dia de antecedência)...");
    const planosCollectionRef = collection(db, `${basePath}/planos_fitossanitarios`);
    const tarefasCollectionRef = collection(db, `${basePath}/tarefas_mapa`);

    try {
        const qPlanos = query(planosCollectionRef, where("ativo", "==", true));
        const planosSnap = await getDocs(qPlanos);

        if (planosSnap.empty) {
            console.log("Nenhum plano de aplicação ativo encontrado.");
            return;
        }

        const hojeUTC = new Date();
        hojeUTC.setUTCHours(0, 0, 0, 0);
        
        // [NOVO] Calcula a data de amanhã para criar a tarefa com antecedência
        const amanhaUTC = new Date(hojeUTC);
        amanhaUTC.setUTCDate(amanhaUTC.getUTCDate() + 1);

        for (const planoDoc of planosSnap.docs) {
            const plano = { id: planoDoc.id, ...planoDoc.data() };
            const proximaAplicacao = calcularProximaAplicacao(plano);

            // [ALTERADO] A condição agora dispara se a data de aplicação for amanhã (ou hoje/atrasada).
            // A verificação de duplicidade (qTarefaExistente) garante que tarefas atrasadas não sejam recriadas.
            if (proximaAplicacao && proximaAplicacao.getTime() <= amanhaUTC.getTime()) {
                const dataFormatada = proximaAplicacao.toISOString().split('T')[0];
                
                // Verifica se já existe uma tarefa para este plano nesta data
                const qTarefaExistente = query(
                    tarefasCollectionRef,
                    where("origemPlanoId", "==", plano.id),
                    where("origemPlanoDataString", "==", dataFormatada)
                );

                const tarefaExistenteSnap = await getDocs(qTarefaExistente);

                if (tarefaExistenteSnap.empty) {
                    // Nenhuma tarefa encontrada, então vamos criar uma.
                    console.log(`Gerando tarefa (1 dia de antecedência) para o plano "${plano.nome}" com data de ${dataFormatada}`);

                    const proximaAplicacaoTimestamp = Timestamp.fromDate(proximaAplicacao);

                    const novaTarefaData = {
                        tarefa: `APLICAÇÃO FITO: ${plano.produto || plano.nome}`,
                        orientacao: `Tarefa gerada automaticamente a partir do plano de aplicação: "${plano.nome}".`,
                        status: "PROGRAMADA", // Já entra como "PROGRAMADA"
                        prioridade: "P2 - MEDIO PRAZO",
                        acao: plano.acao || "MANUTENÇÃO | PREVENTIVA", // Usa a ação do plano ou um padrão
                        turno: "DIA INTEIRO",
                        dataInicio: proximaAplicacaoTimestamp,
                        dataProvavelTermino: proximaAplicacaoTimestamp,
                        responsaveis: [], // Começa sem responsável para ser alocada
                        criadoPor: "sistema",
                        criadoPorEmail: "Sistema (Automático)",
                        createdAt: Timestamp.now(),
                        updatedAt: Timestamp.now(),
                        origem: "Controle Fitossanitário",
                        origemPlanoId: plano.id,
                        origemPlanoDataString: dataFormatada,
                    };

                    await addDoc(tarefasCollectionRef, novaTarefaData);
                    toast.success(`Tarefa para o plano "${plano.nome}" foi criada no Mapa de Atividades!`);
                } else {
                    console.log(`Tarefa para o plano "${plano.nome}" com data de ${dataFormatada} já existe. Ignorando.`);
                }
            }
        }
    } catch (error) {
        console.error("Erro ao verificar e gerar tarefas fitossanitárias:", error);
        toast.error("Ocorreu um erro ao gerar tarefas automáticas.");
    }
}

// Versão: 11.3.0
// [MELHORIA] A função agora salva tanto o nome da tarefa (contexto) quanto sua orientação diretamente no documento de log.
async function logAlteracaoTarefa(db, basePath, tarefaId, usuarioId, usuarioEmail, acaoRealizada, detalhesAdicionais = "") {
    if (!tarefaId) {
        console.error("logAlteracaoTarefa: tarefaId é indefinido.");
        return;
    }
    try {
        let tarefaContexto = `Tarefa ID: ${tarefaId}`;
        let tarefaOrientacao = ''; // Valor padrão

        try {
            const tarefaDocRef = doc(db, `${basePath}/tarefas_mapa`, tarefaId);
            const tarefaSnap = await getDoc(tarefaDocRef);
            if (tarefaSnap.exists()) {
                const data = tarefaSnap.data();
                tarefaContexto = `Tarefa: ${data.tarefa || tarefaId}`;
                tarefaOrientacao = data.orientacao || ''; // Captura a orientação
            }
        } catch (e) {
            console.warn("Não foi possível obter o contexto/orientação da tarefa para o log.", e);
        }

        const historicoRef = collection(db, `${basePath}/tarefas_mapa/${tarefaId}/historico_alteracoes`);
        await addDoc(historicoRef, {
            timestamp: Timestamp.now(),
            usuarioId: usuarioId || "sistema",
            usuarioEmail: usuarioEmail || (usuarioId === "sistema" ? "Sistema" : "Desconhecido"),
            acaoRealizada,
            detalhesAdicionais,
            contexto: tarefaContexto,
            orientacao: tarefaOrientacao // Salva a orientação no log
        });
    } catch (error) {
        console.error("Erro ao registrar histórico da tarefa:", tarefaId, error);
    }
}

// Versão: 12.0.0
// [NOVO] Função para registrar o evento de login de um usuário.
async function logUserLogin(db, basePath, user) {
    if (!user || !user.uid) return;
    try {
        const logsAcessoRef = collection(db, `${basePath}/access_logs`);
        await addDoc(logsAcessoRef, {
            timestamp: Timestamp.now(),
            usuarioId: user.uid,
            usuarioEmail: user.email,
            acaoRealizada: "Acesso ao Sistema (Login)",
            contexto: "Autenticação",
            detalhesAdicionais: `Usuário ${user.email} autenticado com sucesso.`
        });
    } catch (error) {
        console.error("Erro ao registrar log de acesso:", error);
    }
}

// Versão: 11.3.0
// [MELHORIA] A função agora salva o contexto e as observações (como orientação) diretamente no documento de log.
async function logAlteracaoFitossanitaria(db, basePath, registroId, usuarioEmail, acaoRealizada, detalhesAdicionais = "") {
    if (!registroId) {
        console.error("logAlteracaoFitossanitaria: registroId é indefinido.");
        return;
    }
    try {
        let fitoContexto = `Registro Fito ID: ${registroId}`;
        let fitoObservacoes = ''; // Valor padrão

         try {
            const registroDocRef = doc(db, `${basePath}/controleFitossanitario`, registroId);
            const registroSnap = await getDoc(registroDocRef);
            if (registroSnap.exists()) {
                const data = registroSnap.data();
                fitoContexto = `Registro Fito: ${data.produto || registroId}`;
                fitoObservacoes = data.observacoes || ''; // Captura as observações
            }
        } catch (e) {
            console.warn("Não foi possível obter o contexto/observações para o log fito.", e);
        }

        const historicoRef = collection(db, `${basePath}/controleFitossanitario/${registroId}/historico_alteracoes`);
        await addDoc(historicoRef, {
            timestamp: Timestamp.now(),
            usuarioEmail: usuarioEmail || "Sistema",
            acaoRealizada,
            detalhesAdicionais,
            contexto: fitoContexto,
            orientacao: fitoObservacoes // Salva as observações como 'orientacao' para consistência
        });
    } catch (error) {
        console.error("Erro ao registrar histórico do registro fitossanitário:", registroId, error);
    }
}

// Versão: 13.0.0
// [MELHORIA] Após salvar uma anotação, a função agora também atualiza a tarefa principal
// com o texto e a data da última anotação para otimizar a leitura (desnormalização).
async function logAnotacaoTarefa(db, basePath, tarefaId, usuarioEmail, textoAnotacao, dataDoRegistro) {
    if (!tarefaId || !textoAnotacao || textoAnotacao.trim() === "") {
        return; // Não registra anotações vazias
    }
    try {
        const anotacoesRef = collection(db, `${basePath}/tarefas_mapa/${tarefaId}/anotacoes`);
        const newAnnotationTimestamp = Timestamp.now(); // Usar um timestamp consistente
        
        // 1. Adiciona a nova anotação na subcoleção
        await addDoc(anotacoesRef, {
            texto: textoAnotacao.trim(),
            criadoEm: newAnnotationTimestamp,
            criadoPorEmail: usuarioEmail || "Desconhecido",
            origem: "Registro do Dia - Programação Semanal",
            dataDoRegistro: dataDoRegistro 
        });

        // 2. Atualiza o documento da tarefa principal com a última anotação
        const tarefaDocRef = doc(db, `${basePath}/tarefas_mapa`, tarefaId);
        await updateDoc(tarefaDocRef, {
            ultimaAnotacaoTexto: textoAnotacao.trim(),
            ultimaAnotacaoTimestamp: newAnnotationTimestamp
        });

    } catch (error) {
        console.error("Erro ao registrar anotação da tarefa:", tarefaId, error);
    }
}

// Versão: 7.2.0
// [CORRIGIDO] A função 'removerTarefaDaProgramacao' foi ajustada para usar 'update' em vez de 'set',
// preservando os Timestamps das datas da semana e evitando a corrupção de dados ao excluir uma tarefa.
async function removerTarefaDaProgramacao(tarefaId, db, basePath) {
    const todasSemanasQuery = query(collection(db, `${basePath}/programacao_semanal`));
    const todasSemanasSnap = await getDocs(todasSemanasQuery);
    const batch = writeBatch(db);
    let algumaSemanaModificada = false;

    todasSemanasSnap.forEach(semanaDocSnap => {
        const semanaData = semanaDocSnap.data();
        // É seguro usar JSON.parse(JSON.stringify()) aqui, pois o objeto 'dias' não contém Timestamps.
        const novosDias = JSON.parse(JSON.stringify(semanaData.dias || {}));
        let estaSemanaEspecificaFoiAlterada = false;

        if (semanaData.dias) {
            Object.keys(novosDias).forEach(diaKey => {
                if (novosDias[diaKey]) {
                    Object.keys(novosDias[diaKey]).forEach(responsavelId => {
                        const tarefasAtuais = novosDias[diaKey][responsavelId] || [];
                        const tarefasOriginaisLength = tarefasAtuais.length;

                        const tarefasFiltradas = tarefasAtuais.filter(t => t.mapaTaskId !== tarefaId);
                        
                        if (tarefasFiltradas.length < tarefasOriginaisLength) {
                            novosDias[diaKey][responsavelId] = tarefasFiltradas;
                            estaSemanaEspecificaFoiAlterada = true;
                        }
                    });
                }
            });
        }

        if (estaSemanaEspecificaFoiAlterada) {
            // [CORRIGIDO] Usando batch.update para modificar apenas o campo 'dias',
            // o que preserva os outros campos (como Timestamps de data) intactos.
            batch.update(semanaDocSnap.ref, { dias: novosDias });
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

// Versão: 19.2.0
// [ARQUITETURA] Refatorada a função para eliminar a chamada separada para 'removerTarefaDaProgramacao'.
// A lógica de remoção e recriação agora é feita em memória e salva em uma única operação atômica (batch),
// corrigindo a condição de corrida que fazia os cards de tarefa desaparecerem temporariamente da grade.
async function sincronizarTarefaComProgramacao(tarefaId, tarefaData, db, basePath, options = {}) {
    const { forceStatus = false } = options;

    const todasSemanasQuery = query(collection(db, `${basePath}/programacao_semanal`));
    const todasSemanasSnap = await getDocs(todasSemanasQuery);
    const batch = writeBatch(db);
    let algumaSemanaModificada = false;

    // ETAPA 1: Percorre todas as semanas para remover instâncias antigas da tarefa (em memória)
    // e preparar a estrutura para a recriação.
    const semanasParaProcessar = [];
    todasSemanasSnap.forEach(semanaDoc => {
        const semanaData = semanaDoc.data();
        // Cria uma cópia profunda para evitar mutação
        const novosDias = JSON.parse(JSON.stringify(semanaData.dias || {}));
        let estaSemanaFoiAlteradaNaRemocao = false;

        Object.keys(novosDias).forEach(diaKey => {
            Object.keys(novosDias[diaKey]).forEach(responsavelId => {
                const tarefasAtuais = novosDias[diaKey][responsavelId] || [];
                const tamanhoOriginal = tarefasAtuais.length;
                const tarefasFiltradas = tarefasAtuais.filter(t => t.mapaTaskId !== tarefaId);
                
                if (tarefasFiltradas.length < tamanhoOriginal) {
                    novosDias[diaKey][responsavelId] = tarefasFiltradas;
                    estaSemanaFoiAlteradaNaRemocao = true;
                }
            });
        });
        
        semanasParaProcessar.push({
            ref: semanaDoc.ref,
            dadosOriginais: semanaData,
            diasModificados: novosDias,
            foiAlterada: estaSemanaFoiAlteradaNaRemocao // Marca se precisa de update mesmo se a tarefa não for re-adicionada
        });
    });


    // ETAPA 2: Verifica se a tarefa deve ser recriada na programação.
    const statusValidosParaProgramacao = ["PROGRAMADA", "CONCLUÍDA", "EM OPERAÇÃO", "CANCELADA", "PREVISTA"];
    const deveRecriar = tarefaData && 
                        statusValidosParaProgramacao.includes(tarefaData.status) &&
                        tarefaData.dataInicio instanceof Timestamp &&
                        tarefaData.dataProvavelTermino instanceof Timestamp &&
                        tarefaData.responsaveis && tarefaData.responsaveis.length > 0;

    if (deveRecriar) {
        let textoBaseTarefa = tarefaData.tarefa || "Tarefa sem descrição";
        if (tarefaData.prioridade) textoBaseTarefa += ` - ${tarefaData.prioridade}`;
        let turnoParaTexto = (tarefaData.turno && tarefaData.turno.toUpperCase() !== TURNO_DIA_INTEIRO.toUpperCase()) ? `[${tarefaData.turno.toUpperCase()}] ` : "";
        const textoVisivelFinal = turnoParaTexto + textoBaseTarefa;

        const dataInicioLoop = tarefaData.dataInicio.toDate();
        const dataFimLoop = tarefaData.dataProvavelTermino.toDate();

        let dataAtual = new Date(Date.UTC(dataInicioLoop.getUTCFullYear(), dataInicioLoop.getUTCMonth(), dataInicioLoop.getUTCDate()));
        const dataFimLoopUTC = new Date(Date.UTC(dataFimLoop.getUTCFullYear(), dataFimLoop.getUTCMonth(), dataFimLoop.getUTCDate()));
        dataFimLoopUTC.setUTCHours(23, 59, 59, 999);

        // ETAPA 3: Recria a tarefa na programação (em memória)
        while (dataAtual.getTime() <= dataFimLoopUTC.getTime()) {
            const diaFormatado = dataAtual.toISOString().split('T')[0];

            for (const semana of semanasParaProcessar) {
                const inicioSemana = converterParaDate(semana.dadosOriginais.dataInicioSemana);
                const fimSemana = converterParaDate(semana.dadosOriginais.dataFimSemana);

                if (inicioSemana && fimSemana) {
                    const inicioSemanaUTC = new Date(Date.UTC(inicioSemana.getUTCFullYear(), inicioSemana.getUTCMonth(), inicioSemana.getUTCDate()));
                    const fimSemanaUTCloop = new Date(Date.UTC(fimSemana.getUTCFullYear(), fimSemana.getUTCMonth(), fimSemana.getUTCDate()));
                    fimSemanaUTCloop.setUTCHours(23, 59, 59, 999);

                    if (dataAtual.getTime() >= inicioSemanaUTC.getTime() && dataAtual.getTime() <= fimSemanaUTCloop.getTime()) {
                        if (!semana.diasModificados[diaFormatado]) semana.diasModificados[diaFormatado] = {};
                        
                        tarefaData.responsaveis.forEach(responsavelId => {
                            const itemTarefaProgramacao = {
                                mapaTaskId: tarefaId,
                                textoVisivel: textoVisivelFinal,
                                statusLocal: forceStatus ? tarefaData.status : (tarefaData.status),
                                conclusao: (forceStatus && tarefaData.status === 'CONCLUÍDA') ? 'OK' : '',
                                mapaStatus: tarefaData.status,
                                acao: tarefaData.acao || '',
                                turno: tarefaData.turno || TURNO_DIA_INTEIRO,
                                orientacao: tarefaData.orientacao || '',
                                localizacao: tarefaData.area || '',
                                ultimaAnotacaoTexto: tarefaData.ultimaAnotacaoTexto || '',
                                ultimaAnotacaoTimestamp: tarefaData.ultimaAnotacaoTimestamp || null,
                            };
                            
                            if (!semana.diasModificados[diaFormatado][responsavelId]) {
                                semana.diasModificados[diaFormatado][responsavelId] = [];
                            }

                            if (!semana.diasModificados[diaFormatado][responsavelId].find(t => t.mapaTaskId === tarefaId)) {
                                semana.diasModificados[diaFormatado][responsavelId].push(itemTarefaProgramacao);
                                semana.foiAlterada = true;
                            }
                        });
                    }
                }
            }
            dataAtual.setUTCDate(dataAtual.getUTCDate() + 1);
        }
    }

    // ETAPA 4: Salva todas as alterações no banco de dados em um único batch
    semanasParaProcessar.forEach(semana => {
        if (semana.foiAlterada) {
            batch.update(semana.ref, { dias: semana.diasModificados });
            algumaSemanaModificada = true;
        }
    });

    if (algumaSemanaModificada) {
        try {
            await batch.commit();
        } catch (error) {
            console.error("[sincronizarTarefaComProgramacao] Erro ao commitar batch:", error);
            toast.error("Ocorreu um erro ao sincronizar a tarefa com a programação.");
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


// Versão: 27.1.0 (GlobalProvider)
// [ARQUITETURA] Movida a chamada da função 'verificarEGerarTarefasFito' do Dashboard para o GlobalProvider.
// Isso garante que a verificação de tarefas fitossanitárias pendentes seja executada uma vez por dia
// no carregamento inicial do aplicativo, independentemente da página que o usuário visita primeiro.
const GlobalProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(undefined);
    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [listasAuxiliares, setListasAuxiliares] = useState({
        prioridades: [], areas: [], acoes: [], status: [], turnos: [], tarefas: [], usuarios_notificacao: []
    });
    const [funcionarios, setFuncionarios] = useState([]);
    const [permissoes, setPermissoes] = useState({});
    const basePath = `/artifacts/${appId}/public/data`;

    // Efeito para autenticação (sem alterações)
    useEffect(() => {
        const DEV_EMAIL = import.meta.env.VITE_DEV_EMAIL;
        const DEV_PASSWORD = import.meta.env.VITE_DEV_PASSWORD;
        const IS_DEV = import.meta.env.DEV;

        const unsubscribe = onAuthStateChanged(authGlobal, async (user) => {
            if (user) {
                setCurrentUser(user);
                setUserId(user.uid);
                
                const loginLogKey = `login_logged_${user.uid}`;
                if (!sessionStorage.getItem(loginLogKey)) {
                    await logUserLogin(db, basePath, user);
                    sessionStorage.setItem(loginLogKey, 'true');
                }

            } else if (IS_DEV && DEV_EMAIL && DEV_PASSWORD) {
                try {
                    await signInWithEmailAndPassword(authGlobal, DEV_EMAIL, DEV_PASSWORD);
                } catch (error) {
                    console.error("Falha no login automático de desenvolvedor:", error);
                    setCurrentUser(null);
                    setUserId(null);
                    setLoading(false);
                }
            } else {
                setCurrentUser(null);
                setUserId(null);
                setLoading(false);
            }
        });

        return () => unsubscribe();
    }, []);

    // Efeito para carregar dados (permissões, listas, etc.)
    useEffect(() => {
        if (!userId) {
            if(currentUser === null) setLoading(false);
            return;
        }

        const fetches = [];
        // [ALTERADO] Adicionada a chave 'planejamento'.
        const chavesDePermissao = ['dashboard', 'mapa', 'programacao', 'planejamento', 'anotacoes', 'pendentes', 'relatorios', 'config', 'add_tarefa', 'fito', 'agenda', 'monitoramento', 'gerenciar_anotacoes'];
        
        chavesDePermissao.forEach(chave => {
            const q = query(collection(db, `${basePath}/listas_auxiliares/permissoes_${chave}/items`));
            fetches.push(getDocs(q).then(snapshot => ({ chave, snapshot })));
        });

        const listaNames = ['prioridades', 'areas', 'acoes', 'status', 'turnos', 'tarefas', 'usuarios_notificacao'];
        listaNames.forEach(name => {
            const q = query(collection(db, `${basePath}/listas_auxiliares/${name}/items`));
            fetches.push(getDocs(q).then(snapshot => ({ name, snapshot, type: 'lista' })));
        });
        
        const qFuncionarios = query(collection(db, `${basePath}/funcionarios`));
        fetches.push(getDocs(qFuncionarios).then(snapshot => ({ type: 'funcionarios', snapshot })));

        Promise.all(fetches).then(results => {
            const newPermissoes = {};
            const newListas = {};
            let newFuncionarios = [];

            results.forEach(result => {
                if (result.type === 'lista') {
                    newListas[result.name] = result.snapshot.docs.map(d => d.data().nome).sort();
                } else if (result.type === 'funcionarios') {
                    // [CORRIGIDO] Lógica de fallback para o campo 'ativo' adicionada aqui.
                    newFuncionarios = result.snapshot.docs.map(d => ({ 
                        id: d.id, 
                        ...d.data(),
                        ativo: d.data().ativo !== false
                    })).sort((a,b) => a.nome.localeCompare(b.nome));
                } else {
                    newPermissoes[result.chave] = result.snapshot.docs.map(doc => doc.data().nome.toLowerCase());
                }
            });

            setPermissoes(newPermissoes);
            setListasAuxiliares(prev => ({ ...prev, ...newListas }));
            setFuncionarios(newFuncionarios);
            
            // [NOVO] Gatilho de verificação fito movido para cá (do Dashboard)
            const checkKey = `fitoCheckPerformed_${new Date().toISOString().split('T')[0]}`;
            const checkPerformed = sessionStorage.getItem(checkKey);

            if (!checkPerformed) {
                console.log("GlobalProvider: Disparando verificação de tarefas fitossanitárias...");
                verificarEGerarTarefasFito(db, basePath)
                    .then(() => sessionStorage.setItem(checkKey, 'true'))
                    .catch(error => console.error("Erro na verificação automática de tarefas fito (GlobalProvider):", error));
            } else {
                 console.log("GlobalProvider: Verificação fito já realizada hoje.");
            }
            
            setLoading(false);
            
        }).catch(error => {
            console.error("Erro no carregamento inicial de dados:", error);
            toast.error("Falha ao carregar dados essenciais.");
            setLoading(false);
        });

    }, [userId, appId, db]); // 'basePath' e 'db' removidos da dependência pois são derivados de 'appId' e 'db'

    return (
        <GlobalContext.Provider value={{ currentUser, userId, db, storage, auth: authGlobal, listasAuxiliares, funcionarios, appId, permissoes, loading }}>
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

// [NOVO v25.5.2] Componente Popover da Legenda de Cores
// Movido para o escopo global para ser reutilizável por múltiplos componentes
// e corrigir o erro de 'Identifier has already been declared'.
const LegendaCoresPopover = memo(({ isOpen, onClose, acoes, triggerRef }) => {
    if (!isOpen) return null;

    const getAcaoColor = (acao) => {
        switch (acao) {
            case 'MANUTENÇÃO | MUDAS': return '#81deab';
            case 'MANUTENÇÃO | PATIO': return '#83c1e6';
            case 'MELHORIAS | ESTRUTURAIS': return '#d9d680';
            case 'MANUTENÇÃO | PREVENTIVA': case 'MANUTENÇÃO | TRATAMENTO': return '#a289d6';
            default: return '#b3b2b1';
        }
    };

    const todasAcoesComCor = [
        ...acoes.map(acao => ({ nome: acao, cor: getAcaoColor(acao) })),
        { nome: 'TAREFA CANCELADA', cor: '#fca5a5' }
    ];

    const popoverRef = useRef(null);

    // Efeito para fechar o popover ao clicar fora dele
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                popoverRef.current && !popoverRef.current.contains(event.target) &&
                triggerRef.current && !triggerRef.current.contains(event.target)
            ) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose, triggerRef]);

    return (
        <div ref={popoverRef} className="absolute top-full right-0 mt-2 w-64 bg-white p-4 rounded-lg shadow-xl border z-30">
            <h4 className="text-sm font-semibold text-gray-800 mb-3">Legenda de Cores</h4>
            <div className="flex flex-col gap-2">
                {todasAcoesComCor.map(({ nome, cor }) => (
                    <div key={nome} className="flex items-center">
                        <span className="w-4 h-4 rounded-sm mr-2 flex-shrink-0" style={{ backgroundColor: cor }}></span>
                        <span className="text-xs text-gray-700">{nome}</span>
                    </div>
                ))}
            </div>
        </div>
    );
});

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

// Versão: 22.1.1 (FuncionariosManager)
// [CORRIGIDO] Alterada a consulta do Firestore para ser simples e a lógica de ordenação foi movida
// para o lado do cliente. Isso evita a necessidade de um índice composto manual no Firestore,
// resolvendo o problema da lista de funcionários não aparecer.
// [ARQUITETURA] Implementado o conceito de "Soft Delete" (inativação).
// A exclusão de um funcionário agora apenas o marca como 'ativo: false', preservando
// todo o histórico de tarefas associadas para fins de auditoria.
const FuncionariosManager = () => {
    const { db, appId } = useContext(GlobalContext);
    const [funcionarios, setFuncionarios] = useState([]); 
    const [novoFuncionarioNome, setNovoFuncionarioNome] = useState('');
    const [editingFuncionario, setEditingFuncionario] = useState(null);
    const [loading, setLoading] = useState(true);

    const basePath = `/artifacts/${appId}/public/data`;
    const funcionariosCollectionRef = collection(db, `${basePath}/funcionarios`);

    useEffect(() => {
        setLoading(true);
        // [REMOVIDO] A consulta composta que exige um índice foi removida.
        // const q = query(funcionariosCollectionRef, orderBy("ativo", "desc"), orderBy("nome", "asc"));
        
        // [ALTERADO] Agora usamos uma consulta simples para buscar todos os funcionários.
        const q = query(funcionariosCollectionRef);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedFuncionarios = snapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(),
                ativo: doc.data().ativo !== false 
            }));
            
            // [NOVO] A lógica de ordenação agora é aplicada aqui, no cliente.
            fetchedFuncionarios.sort((a, b) => {
                // Primeiro, ordena por 'ativo' em ordem decrescente (ativos primeiro)
                if (a.ativo > b.ativo) return -1;
                if (a.ativo < b.ativo) return 1;
                // Se o status 'ativo' for igual, ordena por 'nome' em ordem crescente
                return a.nome.localeCompare(b.nome);
            });

            setFuncionarios(fetchedFuncionarios);
            setLoading(false);
        }, (error) => {
            console.error("Erro ao carregar funcionários em tempo real: ", error);
            toast.error("Não foi possível carregar a lista de funcionários.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, appId, basePath]);

    const handleAddFuncionario = async () => {
        if (!novoFuncionarioNome.trim()) return;
        setLoading(true);
        try {
            const nomeIdFormatado = novoFuncionarioNome.trim().toUpperCase().replace(/\//g, '_');
            const nomeDisplayFormatado = novoFuncionarioNome.trim().toUpperCase();

            const docRef = doc(funcionariosCollectionRef, nomeIdFormatado);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                toast.error("Um funcionário com este nome (ID formatado) já existe.");
                setLoading(false);
                return;
            }
            
            await setDoc(docRef, { nome: nomeDisplayFormatado, ativo: true }); 
            setNovoFuncionarioNome('');
            toast.success("Funcionário adicionado com sucesso!");
        } catch (error) {
            console.error("Erro ao adicionar funcionário: ", error);
            toast.error("Erro ao adicionar funcionário: " + error.message);
        }
        setLoading(false); 
    };
    
    const handleUpdateFuncionario = async () => {
        if (!editingFuncionario || !editingFuncionario.nome.trim()) return;
        setLoading(true);
        try {
            const nomeDisplayAtualizado = editingFuncionario.nome.trim().toUpperCase();
            const funcDocRef = doc(db, `${basePath}/funcionarios`, editingFuncionario.id);
            
            await updateDoc(funcDocRef, { nome: nomeDisplayAtualizado }); 
            setEditingFuncionario(null);
            toast.success("Nome do funcionário atualizado!");
        } catch (error) {
            console.error("Erro ao atualizar funcionário: ", error);
            toast.error("Erro ao atualizar funcionário: " + error.message);
        }
        setLoading(false);
    };

    const handleToggleAtivoFuncionario = async (funcionario) => {
        const novoStatus = !funcionario.ativo;
        const acao = novoStatus ? "reativar" : "inativar";
        
        if (window.confirm(`Tem certeza que deseja ${acao} o funcionário "${funcionario.nome}"?`)) {
            setLoading(true);
            try {
                const funcDocRef = doc(db, `${basePath}/funcionarios`, funcionario.id);
                await updateDoc(funcDocRef, { ativo: novoStatus });
                toast.success(`Funcionário ${novoStatus ? 'reativado' : 'inativado'} com sucesso.`);
            } catch (error) {
                console.error(`Erro ao ${acao} funcionário: `, error);
                toast.error(`Erro ao ${acao} funcionário: ` + error.message);
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
                    placeholder="Nome do Funcionário"
                    className="border p-2 rounded-l-md flex-grow focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                    onClick={editingFuncionario ? handleUpdateFuncionario : handleAddFuncionario}
                    disabled={loading}
                    className="bg-blue-500 text-white p-2 rounded-r-md hover:bg-blue-600 flex items-center disabled:bg-gray-400"
                >
                    {editingFuncionario ? <LucideEdit size={18} className="mr-1"/> : <LucidePlusCircle size={18} className="mr-1"/>}
                    {loading && !editingFuncionario ? 'Adicionando...' : (editingFuncionario ? 'Atualizar' : 'Adicionar')}
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
            {loading && funcionarios.length === 0 && <p>Carregando funcionários...</p>}
            <ul className="space-y-1 max-h-60 overflow-y-auto">
                {funcionarios.map(f => (
                    <li key={f.id} className={`flex justify-between items-center p-2 border-b rounded-md ${!f.ativo ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
                        <span className={`${!f.ativo ? 'text-gray-500 line-through' : ''}`}>{f.nome}</span>
                        <div className="flex items-center gap-2">
                             <button onClick={() => setEditingFuncionario(f)} className="text-blue-500 hover:text-blue-700" title="Editar Nome"><LucideEdit size={16}/></button>
                             {f.ativo ? (
                                <button onClick={() => handleToggleAtivoFuncionario(f)} className="text-red-500 hover:text-red-700" title="Inativar Funcionário"><LucideXCircle size={16}/></button>
                             ) : (
                                <button onClick={() => handleToggleAtivoFuncionario(f)} className="text-green-500 hover:text-green-700" title="Reativar Funcionário"><LucideCheckCircle size={16}/></button>
                             )}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

// Versão: 27.0.1 (ConfiguracoesComponent)
// [CORRIGIDO] O componente 'FuncionariosManager' foi movido para dentro do contêiner de "Cadastros",
// garantindo sua correta renderização na aba "Cadastros Gerais".
// [NOVO] Adicionado um card de gerenciamento de permissões para o "Planejamento (Visão)".
// Agora é possível controlar o acesso a essa tela de forma independente através da interface de Configurações,
// associado à nova chave de permissão `permissoes_planejamento`.
const ConfiguracoesComponent = () => {
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
                            <ListaAuxiliarManager nomeLista="Acesso à Programação (Grade)" nomeSingular="E-mail" collectionPathSegment="permissoes_programacao" />
                            {/* [NOVO] Card de permissão para o Planejamento (Visão). */}
                            <ListaAuxiliarManager nomeLista="Acesso ao Planejamento (Visão)" nomeSingular="E-mail" collectionPathSegment="permissoes_planejamento" />
                            <ListaAuxiliarManager nomeLista="Acesso ao Controle Fitossanitário" nomeSingular="E-mail" collectionPathSegment="permissoes_fito" />
                            <ListaAuxiliarManager nomeLista="Acesso à Agenda Semanal" nomeSingular="E-mail" collectionPathSegment="permissoes_agenda" />
                            <ListaAuxiliarManager nomeLista="Acesso à Tarefa Pátio" nomeSingular="E-mail" collectionPathSegment="permissoes_anotacoes" />
                            <ListaAuxiliarManager nomeLista="Acesso às Tarefas Pendentes" nomeSingular="E-mail" collectionPathSegment="permissoes_pendentes" />
                            <ListaAuxiliarManager nomeLista="Acesso aos Relatórios" nomeSingular="E-mail" collectionPathSegment="permissoes_relatorios" />
                            <ListaAuxiliarManager nomeLista="Acesso ao Monitoramento" nomeSingular="E-mail" collectionPathSegment="permissoes_monitoramento" />
                            <ListaAuxiliarManager nomeLista="Acesso ao Gerenciador de Anotações" nomeSingular="E-mail" collectionPathSegment="permissoes_gerenciar_anotacoes" />
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
                        {/* [CORRIGIDO] Movido o FuncionariosManager para um contêiner próprio, garantindo sua renderização como um card separado na mesma aba. */}
                        <FuncionariosManager />
                    </div>
                )}
            </div>
        </div>
    );
};

// Versão: 12.1.0
// [NOVO] Adicionada funcionalidade de paginação para visualizar todos os logs dos últimos 7 dias.
// [NOVO] Adicionados controles de navegação (números de página) na base da lista.
// [ALTERADO] Removido o limite de busca de logs para permitir a paginação completa.
const MonitoramentoComponent = () => {
    const { db, appId } = useContext(GlobalContext);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // [NOVO] Estados para o controle da paginação
    const [currentPage, setCurrentPage] = useState(1);
    const LOGS_PER_PAGE = 25; // Define quantos logs serão exibidos por página

    useEffect(() => {
        const fetchLogs = async () => {
            setLoading(true);
            try {
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                const sevenDaysAgoTimestamp = Timestamp.fromDate(sevenDaysAgo);

                // [ALTERADO] Removido o 'limit' para buscar todos os logs do período
                const historyQuery = query(
                    collectionGroup(db, 'historico_alteracoes'),
                    where('timestamp', '>=', sevenDaysAgoTimestamp),
                    orderBy('timestamp', 'desc')
                );

                const basePath = `/artifacts/${appId}/public/data`;
                // [ALTERADO] Removido o 'limit' para buscar todos os logs do período
                const accessLogsQuery = query(
                    collection(db, `${basePath}/access_logs`),
                    where('timestamp', '>=', sevenDaysAgoTimestamp),
                    orderBy('timestamp', 'desc')
                );

                const [historySnapshot, accessSnapshot] = await Promise.all([
                    getDocs(historyQuery),
                    getDocs(accessLogsQuery)
                ]);

                const activityLogsPromises = historySnapshot.docs.map(async (docSnap) => {
                    const logData = { id: docSnap.id, ...docSnap.data() };
                    if (logData.contexto) return logData;
                    
                    let context = 'Contexto não identificado';
                    let orientacao = '';
                    const parentDocRef = docSnap.ref.parent.parent;
                    if(parentDocRef) {
                        try {
                            const parentSnap = await getDoc(parentDocRef);
                            if (parentSnap.exists()) {
                                const parentData = parentSnap.data();
                                if(parentDocRef.path.includes('tarefas_mapa')) {
                                    context = `Tarefa: ${parentData.tarefa || parentSnap.id}`;
                                    orientacao = parentData.orientacao || '';
                                } else if (parentDocRef.path.includes('controleFitossanitario')) {
                                    context = `Registro Fito: ${parentData.produto || parentSnap.id}`;
                                    orientacao = parentData.observacoes || '';
                                }
                            }
                        } catch (e) {
                           console.warn(`Não foi possível carregar o contexto para o log antigo ${docSnap.id}:`, e);
                        }
                    }
                    return { ...logData, contexto: context, orientacao: orientacao };
                });
                
                const activityLogs = await Promise.all(activityLogsPromises);
                const accessLogs = accessSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                const allLogs = [...activityLogs, ...accessLogs];
                allLogs.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());

                setLogs(allLogs);

            } catch (error) {
                console.error("Erro ao carregar logs de monitoramento:", error);
                toast.error("Falha ao carregar o histórico de atividades. Verifique o console para mais detalhes.");
            }
            setLoading(false);
        };

        fetchLogs();
    }, [db, appId]);
    
    // [NOVO] Lógica de paginação
    const indexOfLastLog = currentPage * LOGS_PER_PAGE;
    const indexOfFirstLog = indexOfLastLog - LOGS_PER_PAGE;
    const currentLogs = logs.slice(indexOfFirstLog, indexOfLastLog);
    const totalPages = Math.ceil(logs.length / LOGS_PER_PAGE);
    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    return (
        <div className="p-6 bg-gray-50 min-h-full">
            <h2 className="text-2xl font-semibold mb-4 text-gray-800">Monitoramento de Atividades</h2>
            <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-lg mb-6 text-sm">
                <p>
                    Exibindo todas as ações e alterações registradas no sistema nos <strong>últimos 7 dias</strong>. 
                    Esta tela é destinada à auditoria e monitoramento de atividades recentes.
                </p>
            </div>
            
            <div className="bg-white shadow-md rounded-lg">
                {loading ? (
                    <p className="p-6 text-center text-gray-600">Carregando histórico de atividades...</p>
                ) : logs.length === 0 ? (
                    <p className="p-6 text-center text-gray-500">Nenhuma atividade registrada nos últimos 7 dias.</p>
                ) : (
                    <div className="max-h-[75vh] overflow-y-auto">
                        <ul className="divide-y divide-gray-200">
                            {/* [ALTERADO] Mapeia sobre 'currentLogs' em vez de 'logs' */}
                            {currentLogs.map(log => (
                                <li key={log.id} className="p-4 hover:bg-gray-50">
                                    <div className="flex flex-wrap justify-between items-start gap-2">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-blue-700 truncate">{log.acaoRealizada}</p>
                                            <p className="text-xs text-gray-500 mt-1">
                                                <span className="font-medium">{log.usuarioEmail || 'Sistema'}</span> em <span className="font-medium text-gray-700">{log.contexto || 'Contexto indisponível'}</span>
                                            </p>
                                        </div>
                                        <div className="text-xs text-gray-500 text-right whitespace-nowrap">
                                            {formatDateTime(log.timestamp)}
                                        </div>
                                    </div>
                                    {log.detalhesAdicionais && (
                                        <div className="mt-2 text-xs text-gray-800 bg-gray-100 p-2 rounded-md whitespace-pre-wrap">
                                            {log.detalhesAdicionais}
                                        </div>
                                    )}
                                    {log.orientacao && (
                                         <div className="mt-2 text-xs text-blue-900 bg-blue-50 p-2 rounded-md border-l-4 border-blue-300">
                                            <strong className="font-semibold">Orientação Registrada:</strong>
                                            <p className="whitespace-pre-wrap mt-1">{log.orientacao}</p>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                 
            </div>
             {/* [NOVO] Controles de Paginação */}
            {totalPages > 1 && (
                <div className="flex justify-center items-center mt-6 py-2">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(number => (
                        <button
                            key={number}
                            onClick={() => paginate(number)}
                            className={`mx-1 px-3 py-1 text-sm font-medium rounded-md ${
                                currentPage === number
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            {number}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// Versão: 7.6.1
// [NOVO] Adicionada a funcionalidade de excluir anotações individuais diretamente do modal de edição de tarefa.
const TarefaFormModal = ({ isOpen, onClose, tarefaExistente, onSave }) => {
    const { listasAuxiliares, funcionarios, userId, db, appId } = useContext(GlobalContext);
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
    const [novosAnexos, setNovosAnexos] = useState([]);
    const [imagensAtuais, setImagensAtuais] = useState([]);
    const [anotacoes, setAnotacoes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingAnotacoes, setLoadingAnotacoes] = useState(false);

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
            setImagensAtuais(tarefaExistente.imagens || []);
        } else {
            setTarefa(''); setPrioridade(''); setArea(''); setAcao('');
            setResponsaveis([]); setStatus('PREVISTA'); setTurno('');
            setDataInicio(''); setDataProvavelTermino(''); setOrientacao('');
            setImagensAtuais([]);
            setAnotacoes([]);
        }
        setNovosAnexos([]);
    }, [tarefaExistente, isOpen]);

    useEffect(() => {
        if (isOpen && tarefaExistente?.id) {
            setLoadingAnotacoes(true);
            const basePath = `/artifacts/${appId}/public/data`;
            const anotacoesRef = collection(db, `${basePath}/tarefas_mapa/${tarefaExistente.id}/anotacoes`);
            const q = query(anotacoesRef, orderBy("criadoEm", "desc"));

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const fetchedAnotacoes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setAnotacoes(fetchedAnotacoes);
                setLoadingAnotacoes(false);
            }, (error) => {
                console.error("Erro ao carregar anotações:", error);
                toast.error("Não foi possível carregar o histórico de anotações.");
                setAnotacoes([]);
                setLoadingAnotacoes(false);
            });

            return () => unsubscribe();
        } else {
            setAnotacoes([]);
        }
    }, [tarefaExistente, isOpen, db, appId]);
    
    const handleFileChange = (e) => {
        if (e.target.files) {
            setNovosAnexos(prev => [...prev, ...Array.from(e.target.files)]);
        }
    };

    const handleRemoveNovoAnexo = (fileNameToRemove) => {
        setNovosAnexos(novosAnexos.filter(file => file.name !== fileNameToRemove));
    };
    
    const handleDeleteAnotacao = async (tarefaId, anotacaoId) => {
        if (!tarefaId || !anotacaoId) {
            toast.error("ID da tarefa ou anotação inválido.");
            return;
        }
        if (window.confirm("Tem certeza que deseja excluir esta anotação? A ação não pode ser desfeita.")) {
            try {
                const basePath = `/artifacts/${appId}/public/data`;
                const anotacaoRef = doc(db, `${basePath}/tarefas_mapa/${tarefaId}/anotacoes`, anotacaoId);
                await deleteDoc(anotacaoRef);
                toast.success("Anotação excluída.");
            } catch (error) {
                console.error("Erro ao excluir anotação:", error);
                toast.error("Não foi possível excluir a anotação.");
            }
        }
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
                {/* Campos do formulário (sem alterações) */}
                <div>
                    <label className="block text-sm font-medium text-gray-700">Tarefa (Descrição)</label>
                    <select value={tarefa} onChange={(e) => setTarefa(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500">
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
                        {funcionarios.filter(f => f.ativo).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
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
                        <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Data Provável de Término</label>
                        <input type="date" value={dataProvavelTermino} onChange={(e) => setDataProvavelTermino(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Orientação</label>
                    <textarea value={orientacao} onChange={(e) => setOrientacao(e.target.value)} rows="3" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"></textarea>
                </div>

                {/* Seção de Anotações (com botão de exclusão) */}
                {tarefaExistente && (
                    <div className="pt-4 mt-4 border-t">
                        <h4 className="text-md font-semibold text-gray-700 mb-3 flex items-center">
                            <LucideStickyNote size={18} className="mr-2 text-gray-500" />
                            Anotações da Tarefa
                        </h4>
                        {loadingAnotacoes ? (
                           <p className="text-sm text-gray-500 italic px-3">Carregando anotações...</p>
                        ) : anotacoes.length > 0 ? (
                            <div className="space-y-3 max-h-48 overflow-y-auto pr-2 bg-gray-100 p-3 rounded-lg border">
                                {anotacoes.map(anotacao => (
                                    <div key={anotacao.id} className="p-3 bg-white shadow-sm rounded-md border-l-4 border-blue-300 flex justify-between items-start gap-4">
                                        <div className="flex-grow">
                                            <p className="text-sm text-gray-800 whitespace-pre-wrap">{anotacao.texto}</p>
                                            <div className="text-xs text-gray-500 mt-2 pt-2 border-t text-right">
                                                <p className="font-medium">
                                                    Origem: {anotacao.origem || 'Manual'}
                                                    {anotacao.dataDoRegistro && ` (${new Date(anotacao.dataDoRegistro + 'T12:00:00Z').toLocaleDateString('pt-BR', {timeZone: 'UTC'})})`}
                                                </p>
                                                <p>
                                                    Por: {anotacao.criadoPorEmail} em {formatDateTime(anotacao.criadoEm)}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteAnotacao(tarefaExistente.id, anotacao.id)}
                                            title="Excluir Anotação"
                                            className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100 flex-shrink-0"
                                        >
                                            <LucideTrash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500 italic px-3">Nenhuma anotação encontrada.</p>
                        )}
                    </div>
                )}

                {/* Seção de Anexos (sem alterações) */}
                <div className="pt-4 mt-4 border-t">
                    <h4 className="text-md font-semibold text-gray-700 mb-2">Anexos</h4>
                    {imagensAtuais.length > 0 && (
                        <div className="mb-4">
                            <p className="text-sm font-medium text-gray-600 mb-2">Imagens Salvas:</p>
                            <div className="flex flex-wrap gap-2">
                                {imagensAtuais.map((url, index) => (
                                    <div key={index} className="relative">
                                        <img src={url} alt={`Anexo ${index + 1}`} className="w-20 h-20 object-cover rounded-md" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Adicionar Novas Imagens</label>
                        <input type="file" multiple accept="image/*" onChange={handleFileChange} className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                    </div>
                    {novosAnexos.length > 0 && (
                        <div className="mt-2">
                            <p className="text-sm font-medium text-gray-600 mb-2">Imagens para Enviar:</p>
                            <div className="flex flex-wrap gap-2">
                                {novosAnexos.map((file, index) => (
                                    <div key={index} className="relative group">
                                        <img src={URL.createObjectURL(file)} alt={file.name} className="w-20 h-20 object-cover rounded-md" />
                                        <button type="button" onClick={() => handleRemoveNovoAnexo(file.name)} className="absolute top-0 right-0 -mt-1 -mr-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity" title="Remover">
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

// Versão: 8.1.0
// [ALTERADO] Adicionada a exibição do campo "Orientação" no modal de tratamento de tarefas atrasadas.
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
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg space-y-2">
                    <h4 className="font-bold text-lg text-red-800">{tarefa.tarefa}</h4>
                    
                    {tarefa.orientacao && (
                        <p className="text-sm text-red-700 border-t border-red-100 pt-2">
                            <strong>Orientação:</strong> {tarefa.orientacao}
                        </p>
                    )}

                    <p className="text-sm text-red-700"><strong>Responsável(eis):</strong> {getResponsavelNomes(tarefa.responsaveis)}</p>
                    <p className="text-sm text-red-700"><strong>Prazo Original:</strong> {formatDate(tarefa.dataProvavelTermino)}</p>
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


// Versão: 24.0.0
// [MELHORIA] Os filtros de data "Início do Período" e "Fim do Período" no Mapa de Atividades
// agora são preenchidos automaticamente com o primeiro e o último dia do mês atual ao carregar a página.
// [MELHORIA 2.1] O componente agora verifica o sessionStorage por filtros pré-definidos vindos do Dashboard.
// [CORRIGIDO] As chamadas para a função de notificação 'toast.info' foram corrigidas para 'toast', que é a função correta da biblioteca.
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

    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

    // Filtros
    const [filtroResponsavel, setFiltroResponsavel] = useState("TODOS");
    const [filtroStatus, setFiltroStatus] = useState(TODOS_OS_STATUS_VALUE);
    const [filtroPrioridade, setFiltroPrioridade] = useState(TODAS_AS_PRIORIDADES_VALUE);
    const [filtroArea, setFiltroArea] = useState(TODAS_AS_AREAS_VALUE);
    const [filtroTurno, setFiltroTurno] = useState("---TODOS_OS_TURNOS---");
    const [filtroDataInicio, setFiltroDataInicio] = useState(firstDayOfMonth);
    const [filtroDataFim, setFiltroDataFim] = useState(lastDayOfMonth);
    const [termoBusca, setTermoBusca] = useState('');

    // Paginação
    const [currentPage, setCurrentPage] = useState(1);
    const [filteredTaskCount, setFilteredTaskCount] = useState(0);
    const TASKS_PER_PAGE = 50;

    const basePath = `/artifacts/${appId}/public/data`;
    const tarefasCollectionRef = collection(db, `${basePath}/tarefas_mapa`);
    const TODOS_OS_TURNOS_VALUE = "---TODOS_OS_TURNOS---";

    const podeAdicionarTarefa = auth.currentUser?.email &&
        (["sistemas@gramoterra.com.br", "operacional@gramoterra.com.br", "mpivottoramos@gmail.com"].includes(auth.currentUser.email.toLowerCase()) ||
        (permissoes?.add_tarefa?.includes(auth.currentUser.email.toLowerCase()) ?? false));


    // useEffect para aplicar filtros do sessionStorage ao carregar
    useEffect(() => {
        const statusFromDash = sessionStorage.getItem('mapa_filter_status');
        if (statusFromDash === 'ATRASADO') {
            const hoje = new Date().toISOString().split('T')[0];
            setFiltroDataInicio(''); 
            setFiltroDataFim(new Date(new Date(hoje).setDate(new Date(hoje).getDate() - 1)).toISOString().split('T')[0]); // Ontem
            setFiltroStatus(TODOS_EXCETO_CONCLUIDOS_VALUE);
            toast("Exibindo tarefas atrasadas."); // [CORRIGIDO] Alterado de toast.info para toast
        } else if (statusFromDash) {
            setFiltroStatus(statusFromDash);
            toast(`Exibindo tarefas com status: ${statusFromDash}`); // [CORRIGIDO] Alterado de toast.info para toast
        }
        
        const prazoFromDash = sessionStorage.getItem('mapa_filter_prazo');
        if (prazoFromDash === 'PROXIMOS_7_DIAS') {
             const hoje = new Date();
             const daqui7Dias = new Date();
             daqui7Dias.setDate(hoje.getDate() + 7);
             setFiltroDataInicio(hoje.toISOString().split('T')[0]);
             setFiltroDataFim(daqui7Dias.toISOString().split('T')[0]);
             toast("Exibindo tarefas com prazo nos próximos 7 dias."); // [CORRIGIDO] Alterado de toast.info para toast
        }

        // Limpa os filtros para não persistirem
        sessionStorage.removeItem('mapa_filter_status');
        sessionStorage.removeItem('mapa_filter_prazo');
    }, []);

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
        let tarefasProcessadas = todasTarefas.filter(t => t.status !== "AGUARDANDO ALOCAÇÃO");

        if (termoBusca.trim() !== "") { tarefasProcessadas = tarefasProcessadas.filter(t => (t.tarefa && t.tarefa.toLowerCase().includes(termoBusca.toLowerCase())) || (t.orientacao && t.orientacao.toLowerCase().includes(termoBusca.toLowerCase()))); }
        if (filtroResponsavel !== "TODOS") { if (filtroResponsavel === SEM_RESPONSAVEL_VALUE) { tarefasProcessadas = tarefasProcessadas.filter(t => !t.responsaveis || t.responsaveis.length === 0); } else { tarefasProcessadas = tarefasProcessadas.filter(t => t.responsaveis && t.responsaveis.includes(filtroResponsavel)); } }
        
        if (filtroStatus === TODOS_EXCETO_CONCLUIDOS_VALUE) {
            tarefasProcessadas = tarefasProcessadas.filter(t => t.status !== 'CONCLUÍDA');
        } else if (filtroStatus !== TODOS_OS_STATUS_VALUE) {
            tarefasProcessadas = tarefasProcessadas.filter(t => t.status === filtroStatus);
        }

        if (filtroPrioridade !== TODAS_AS_PRIORIDADES_VALUE) { tarefasProcessadas = tarefasProcessadas.filter(t => t.prioridade === filtroPrioridade); }
        if (filtroArea !== TODAS_AS_AREAS_VALUE) { tarefasProcessadas = tarefasProcessadas.filter(t => t.area === filtroArea); }
        if (filtroTurno !== TODOS_OS_TURNOS_VALUE) { tarefasProcessadas = tarefasProcessadas.filter(t => t.turno === filtroTurno); }
        
        const inicioFiltro = filtroDataInicio ? new Date(filtroDataInicio + "T00:00:00Z").getTime() : null;
        const fimFiltro = filtroDataFim ? new Date(filtroDataFim + "T23:59:59Z").getTime() : null;
        if (inicioFiltro || fimFiltro) { 
             tarefasProcessadas = tarefasProcessadas.filter(t => { 
                const inicioTarefa = (t.dataInicio && typeof t.dataInicio.toDate === 'function') ? t.dataInicio.toDate().getTime() : null; 
                const fimTarefa = (t.dataProvavelTermino && typeof t.dataProvavelTermino.toDate === 'function') ? t.dataProvavelTermino.toDate().getTime() : null; 
                if (!inicioTarefa) return false; 
                
                // Lógica para tarefas atrasadas (considera apenas a data de término)
                if (filtroStatus === 'ATRASADO_CUSTOM') {
                    return fimTarefa && fimTarefa < new Date().setHours(0,0,0,0);
                }

                const comecaAntesOuDuranteFiltro = inicioTarefa <= (fimFiltro || Infinity); 
                const terminaDepoisOuDuranteFiltro = fimTarefa >= (inicioFiltro || 0);
                
                return comecaAntesOuDuranteFiltro && terminaDepoisOuDuranteFiltro;
            }); 
        }
        
        setFilteredTaskCount(tarefasProcessadas.length);
        
        const indexOfLastTask = currentPage * TASKS_PER_PAGE;
        const indexOfFirstTask = indexOfLastTask - TASKS_PER_PAGE;
        const tasksForCurrentPage = tarefasProcessadas.slice(indexOfFirstTask, indexOfLastTask);

        setTarefasExibidas(tasksForCurrentPage);

    }, [todasTarefas, filtroResponsavel, filtroStatus, filtroPrioridade, filtroArea, filtroTurno, filtroDataInicio, filtroDataFim, termoBusca, currentPage]);
    
    useEffect(() => {
        setCurrentPage(1);
    }, [filtroResponsavel, filtroStatus, filtroPrioridade, filtroArea, filtroTurno, filtroDataInicio, filtroDataFim, termoBusca]);


    const getResponsavelNomes = (responsavelIds) => {
        if (!responsavelIds || responsavelIds.length === 0) return '---';
        return responsavelIds.map(id => { const func = funcionarios.find(f => f.id === id); return func ? func.nome : id; }).join(', ');
    };
    
    const handleOpenModal = (tarefa = null) => { setEditingTarefa(tarefa); setIsModalOpen(true); };
    const handleCloseModal = () => { setIsModalOpen(false); setEditingTarefa(null); };
    const handleOpenHistoricoModal = (tarefaId) => { setSelectedTarefaIdParaHistorico(tarefaId); setIsHistoricoModalOpen(true); };
    const handleCloseHistoricoModal = () => { setIsHistoricoModalOpen(false); setSelectedTarefaIdParaHistorico(null); };
    const handleOpenStatusModal = (tarefa) => { setTarefaParaStatusUpdate(tarefa); setIsStatusModalOpen(true); };
    const handleCloseStatusModal = () => { setIsStatusModalOpen(false); setTarefaParaStatusUpdate(null); };
    const handleOpenImagensModal = (urls) => { setImagensParaVer(urls); setIsImagensModalOpen(true); };
    const handleCloseImagensModal = () => { setIsImagensModalOpen(false); setImagensParaVer([]); };
    const limparFiltros = () => { setFiltroResponsavel("TODOS"); setFiltroStatus(TODOS_OS_STATUS_VALUE); setFiltroPrioridade(TODAS_AS_PRIORIDADES_VALUE); setFiltroArea(TODAS_AS_AREAS_VALUE); setFiltroTurno(TODOS_OS_TURNOS_VALUE); setFiltroDataInicio(''); setFiltroDataFim(''); setTermoBusca(''); setCurrentPage(1); };
    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    const handleSaveTarefa = async (tarefaData, novosAnexos, tarefaId) => {
        const usuario = auth.currentUser;
        if (!usuario) {
            toast.error("Usuário não autenticado.");
            return;
        }

        const id = tarefaId || doc(tarefasCollectionRef).id;
        const tarefaDocRef = doc(db, `${basePath}/tarefas_mapa`, id);
        let urlsDosNovosAnexos = [];

        try {
            if (novosAnexos && novosAnexos.length > 0) {
                toast.loading('Enviando anexos...', { id: 'upload-toast' });
                for (const anexo of novosAnexos) {
                    const caminhoStorage = `${basePath}/imagens_tarefas/${id}/${Date.now()}_${anexo.name}`;
                    const storageRef = ref(storage, caminhoStorage);
                    const uploadTask = await uploadBytesResumable(storageRef, anexo);
                    const downloadURL = await getDownloadURL(uploadTask.ref);
                    urlsDosNovosAnexos.push(downloadURL);
                }
                toast.dismiss('upload-toast');
            }

            const dadosCompletosDaTarefa = {
                ...tarefaData,
                imagens: [...(tarefaData.imagens || []), ...urlsDosNovosAnexos],
                updatedAt: Timestamp.now(),
            };

            if (tarefaId) {
                await updateDoc(tarefaDocRef, dadosCompletosDaTarefa);
                await logAlteracaoTarefa(db, basePath, tarefaId, usuario.uid, usuario.email, "Tarefa Editada", `Detalhes da tarefa atualizados.`);
                toast.success("Tarefa atualizada com sucesso!");
            } else {
                await setDoc(tarefaDocRef, { ...dadosCompletosDaTarefa, createdAt: Timestamp.now(), criadoPorEmail: usuario.email });
                await logAlteracaoTarefa(db, basePath, id, usuario.uid, usuario.email, "Tarefa Criada", `Tarefa "${dadosCompletosDaTarefa.tarefa}" criada.`);
                toast.success("Tarefa criada com sucesso!");
            }

            const tarefaAtualizadaSnap = await getDoc(tarefaDocRef);
            if (tarefaAtualizadaSnap.exists()) {
                await sincronizarTarefaComProgramacao(id, tarefaAtualizadaSnap.data(), db, basePath);
            }

        } catch (error) {
            console.error("Erro ao salvar tarefa: ", error);
            toast.error(`Erro ao salvar tarefa: ${error.message}`);
            toast.dismiss('upload-toast');
        }
    };
    
    const handleQuickStatusUpdate = async (tarefaId, novoStatus) => {
        const tarefaDocRef = doc(db, `${basePath}/tarefas_mapa`, tarefaId);
        const tarefaOriginal = todasTarefas.find(t => t.id === tarefaId);
        if (!tarefaOriginal) {
            toast.error("Tarefa original não encontrada para atualização.");
            return;
        }

        const usuario = auth.currentUser;
        try {
            await updateDoc(tarefaDocRef, { status: novoStatus, updatedAt: Timestamp.now() });

            const dadosAtualizadosParaSync = { ...tarefaOriginal, status: novoStatus };
            await sincronizarTarefaComProgramacao(tarefaId, dadosAtualizadosParaSync, db, basePath, { forceStatus: true });
            await verificarEAtualizarStatusConclusaoMapa(tarefaId, db, basePath);

            await logAlteracaoTarefa(db, basePath, tarefaId, usuario.uid, usuario.email, "Status Alterado (Rápido)",
                `Status alterado de "${tarefaOriginal.status}" para "${novoStatus}".`
            );
            toast.success("Status da tarefa atualizado!");
        } catch (error) {
            console.error("Erro na atualização rápida de status: ", error);
            toast.error("Falha ao atualizar o status.");
        }
    };

    const handleDeleteTarefa = async (tarefaId) => {
        const tarefaParaExcluir = todasTarefas.find(t => t.id === tarefaId);
        if (!tarefaParaExcluir) {
            toast.error("Tarefa não encontrada para exclusão.");
            return;
        }

        if (window.confirm(`Tem certeza que deseja excluir a tarefa "${tarefaParaExcluir.tarefa}"? Esta ação não pode ser desfeita.`)) {
            const tarefaDocRef = doc(db, `${basePath}/tarefas_mapa`, tarefaId);
            
            try {
                await removerTarefaDaProgramacao(tarefaId, db, basePath);

                if (tarefaParaExcluir.imagens && tarefaParaExcluir.imagens.length > 0) {
                    for (const url of tarefaParaExcluir.imagens) {
                        try {
                            const imageRef = ref(storage, url);
                            await deleteObject(imageRef);
                        } catch (storageError) {
                            if (storageError.code !== 'storage/object-not-found') {
                                console.error("Erro ao excluir anexo do Storage:", storageError);
                            }
                        }
                    }
                }
                
                await deleteDoc(tarefaDocRef);
                toast.success("Tarefa excluída com sucesso!");

            } catch (error) {
                console.error("Erro ao excluir tarefa: ", error);
                toast.error(`Falha ao excluir a tarefa: ${error.message}`);
            }
        }
    };
    
    const TABLE_HEADERS = ["Tarefa", "Orientação", "Responsável(eis)", "Área", "Prioridade", "Período", "Turno", "Status", "Ações"];
    const totalPages = Math.ceil(filteredTaskCount / TASKS_PER_PAGE);

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

            <div className="p-4 bg-white rounded-lg shadow-md mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                     <div><label className="block text-sm font-medium text-gray-700">Buscar Tarefa/Orientação</label><input type="text" value={termoBusca} onChange={(e) => setTermoBusca(e.target.value)} placeholder="Digite para buscar..." className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"/></div>
                     <div><label className="block text-sm font-medium text-gray-700">Responsável</label><select value={filtroResponsavel} onChange={(e) => setFiltroResponsavel(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"><option value="TODOS">Todos</option><option value={SEM_RESPONSAVEL_VALUE}>--- SEM RESPONSÁVEL ---</option>{funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Status</label>
                        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3">
                            <option value={TODOS_OS_STATUS_VALUE}>Todos</option>
                            <option value={TODOS_EXCETO_CONCLUIDOS_VALUE}>Todos, exceto Concluídas</option>
                            {listasAuxiliares.status.filter(s => s !== "AGUARDANDO ALOCAÇÃO").map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                     <div><label className="block text-sm font-medium text-gray-700">Prioridade</label><select value={filtroPrioridade} onChange={(e) => setFiltroPrioridade(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"><option value={TODAS_AS_PRIORIDADES_VALUE}>Todas</option>{listasAuxiliares.prioridades.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                     <div><label className="block text-sm font-medium text-gray-700">Área</label><select value={filtroArea} onChange={(e) => setFiltroArea(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"><option value={TODAS_AS_AREAS_VALUE}>Todas</option>{listasAuxiliares.areas.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
                     <div><label className="block text-sm font-medium text-gray-700">Turno</label><select value={filtroTurno} onChange={(e) => setFiltroTurno(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"><option value={TODOS_OS_TURNOS_VALUE}>Todos</option>{listasAuxiliares.turnos.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                     <div><label className="block text-sm font-medium text-gray-700">Início do Período</label><input type="date" value={filtroDataInicio} onChange={(e) => setFiltroDataInicio(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"/></div>
                     <div><label className="block text-sm font-medium text-gray-700">Fim do Período</label><input type="date" value={filtroDataFim} onChange={(e) => setFiltroDataFim(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"/></div>
                </div>
                <div className="mt-4 flex justify-end">
                    <button onClick={limparFiltros} className="text-sm text-blue-600 hover:text-blue-800 font-semibold flex items-center">
                        <LucideXCircle size={16} className="mr-1"/> Limpar Filtros
                    </button>
                </div>
            </div>

            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                        <tr>{TABLE_HEADERS.map(header => (<th key={header} scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">{header}</th>))}</tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr><td colSpan={TABLE_HEADERS.length} className="text-center p-4">Carregando tarefas...</td></tr>
                        ) : tarefasExibidas.length === 0 ? (
                            <tr><td colSpan={TABLE_HEADERS.length} className="text-center p-4 text-gray-500">Nenhuma tarefa encontrada para os filtros aplicados.</td></tr>
                        ) : (
                            tarefasExibidas.map(tarefa => (
                                <tr key={tarefa.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-xs whitespace-normal break-words"><div className="flex items-center"><span>{tarefa.tarefa}</span>{tarefa.imagens && tarefa.imagens.length > 0 && (<button onClick={() => handleOpenImagensModal(tarefa.imagens)} title="Ver Anexos" className="ml-2 text-blue-500 hover:text-blue-700"><LucidePaperclip size={16} /></button>)}</div></td>
                                    <td className="px-4 py-3 text-sm text-gray-700 max-w-sm whitespace-normal break-words">{tarefa.orientacao || '-'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-800 max-w-xs whitespace-normal break-words">{getResponsavelNomes(tarefa.responsaveis)}</td>
                                    <td className="px-4 py-3 text-sm text-gray-800 whitespace-nowrap">{tarefa.area || '-'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-800 whitespace-nowrap">{tarefa.prioridade || '-'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-800 whitespace-nowrap">{formatDate(tarefa.dataInicio)} a {formatDate(tarefa.dataProvavelTermino)}</td>
                                    <td className="px-4 py-3 text-sm text-gray-800 whitespace-nowrap">{tarefa.turno || 'N/A'}</td>
                                    <td className="px-4 py-3 text-sm"><span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(tarefa.status)}`}>{tarefa.status}</span></td>
                                    <td className="px-4 py-3 text-sm font-medium whitespace-nowrap"><div className="flex items-center space-x-2"><button onClick={() => handleOpenStatusModal(tarefa)} title="Alterar Status" className={'text-blue-600 hover:text-blue-800'}><LucideRefreshCw size={18}/></button><button onClick={() => handleOpenModal(tarefa)} title="Editar" className="text-gray-600 hover:text-gray-900"><LucideEdit size={18}/></button><button onClick={() => handleOpenHistoricoModal(tarefa.id)} title="Histórico" className="text-gray-600 hover:text-gray-900"><LucideHistory size={18}/></button><button onClick={() => handleDeleteTarefa(tarefa.id)} title="Excluir" className="text-red-600 hover:text-red-800"><LucideTrash2 size={18}/></button></div></td>
                                </tr>
                                )
                            )
                        )}
                    </tbody>
                </table>
            </div>
            
            {totalPages > 1 && (
                <div className="flex justify-center items-center mt-6 py-2">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(number => (
                        <button
                            key={number}
                            onClick={() => paginate(number)}
                            className={`mx-1 px-3 py-1 text-sm font-medium rounded-md ${
                                currentPage === number
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            {number}
                        </button>
                    ))}
                </div>
            )}

            <TarefaFormModal isOpen={isModalOpen} onClose={handleCloseModal} tarefaExistente={editingTarefa} onSave={handleSaveTarefa}/>
            <ImagensTarefaModal isOpen={isImagensModalOpen} onClose={handleCloseImagensModal} imageUrls={imagensParaVer}/>
            <HistoricoTarefaModal isOpen={isHistoricoModalOpen} onClose={handleCloseHistoricoModal} tarefaId={selectedTarefaIdParaHistorico}/>
            <StatusUpdateModal isOpen={isStatusModalOpen} onClose={handleCloseStatusModal} tarefa={tarefaParaStatusUpdate} onStatusSave={handleQuickStatusUpdate}/>
        </div>
    );
};


// Versão: 19.5.0
// [NOVO] Adicionado estado 'observacoes' para armazenar dinamicamente o texto para cada funcionário.
// [NOVO] Adicionado um campo de 'textarea' para cada funcionário na lista para inserir observações.
// [ALTERADO] As funções 'abrirModalImpressao' e 'copiarTextoWhatsApp' agora recebem e incluem as observações dinâmicas.
// [ALTERADO] O estado de observações é limpo sempre que a data selecionada no modal é alterada.

// ===================================================================================
// [COMPONENTE ATUALIZADO] OrdemServicoModal - Responsável por gerar os PDFs e compartilhar
// ===================================================================================
const OrdemServicoModal = ({ isOpen, onClose, dadosProgramacao, funcionarios, logoUrl }) => {
    const [dataSelecionada, setDataSelecionada] = useState(new Date().toISOString().split('T')[0]);
    // [NOVO] Estado para guardar as observações. Ex: { 'ID_DO_FUNCIONARIO': 'Texto da obs...' }
    const [observacoes, setObservacoes] = useState({});

    // [ALTERADO] Limpa as observações sempre que o usuário muda a data.
    useEffect(() => {
        setObservacoes({});
    }, [dataSelecionada]);

    const funcionariosDoDia = useMemo(() => {
        if (!dadosProgramacao || !dadosProgramacao.dias || !dataSelecionada) return [];
        const tarefasDoDia = dadosProgramacao.dias[dataSelecionada];
        if (!tarefasDoDia) return [];
        
        const funcionariosComTarefas = Object.keys(tarefasDoDia)
            .map(idFuncionario => {
                const funcionario = funcionarios.find(f => f.id === idFuncionario);
                const tarefas = tarefasDoDia[idFuncionario] || [];
                if (funcionario && tarefas.length > 0) return { ...funcionario, tarefas };
                return null;
            })
            .filter(Boolean);
        return funcionariosComTarefas.sort((a,b) => a.nome.localeCompare(b.nome));
    }, [dataSelecionada, dadosProgramacao, funcionarios]);

    // [NOVO] Função para atualizar o estado das observações quando o usuário digita.
    const handleObsChange = (funcionarioId, texto) => {
        setObservacoes(prevObs => ({
            ...prevObs,
            [funcionarioId]: texto,
        }));
    };
    
    // [ALTERADO] Função agora aceita e processa a observação.
    const abrirModalImpressao = (funcionario, data, tarefas, observacao) => {
        const dataFormatada = new Date(data + 'T12:00:00Z').toLocaleDateString('pt-BR');
        
        let tarefasHtml = '';
        tarefas.forEach(t => {
            tarefasHtml += `
                <div class="tarefa-item">
                    <div class="tarefa-header">
                        <span class="acao">${t.acao || 'N/A'}</span>
                        <span class="localizacao">${t.localizacao || 'N/A'}</span>
                    </div>
                    <div class="tarefa-body">
                        <p class="tarefa-titulo">${t.textoVisivel || 'N/A'}</p>
                        <p class="tarefa-orientacao">${t.orientacao || '-'}</p>
                    </div>
                </div>
            `;
        });

        // [ALTERADO] Gera o HTML das observações dinamicamente.
        const observacaoHtml = observacao
            ? `<p class="obs-texto">${observacao.replace(/\n/g, '<br>')}</p>`
            : `<div class="linha"></div><div class="linha"></div><div class="linha"></div>`;

        const htmlContent = `
            <html>
            <head>
                <title>Ordem de Serviço - ${funcionario.nome} - ${dataFormatada}</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin: 25px; color: #212529; }
                    .container { width: 100%; max-width: 750px; margin: auto; }
                    .header { text-align: center; margin-bottom: 20px; }
                    .header img { max-height: 45px; margin-bottom: 15px; }
                    .header h2 { margin: 0; font-size: 22px; font-weight: 600; }
                    .tarefa-item { border-top: 1px solid #dee2e6; padding: 15px 5px; }
                    .tarefa-item:last-of-type { border-bottom: 1px solid #dee2e6; }
                    .tarefa-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
                    .acao { font-size: 11px; font-weight: bold; color: #495057; background-color: #e9ecef; padding: 3px 8px; border-radius: 4px; }
                    .localizacao { font-size: 11px; font-style: italic; color: #6c757d; }
                    .tarefa-titulo { font-size: 16px; font-weight: 600; margin: 0 0 5px 0; }
                    .tarefa-orientacao { font-size: 14px; color: #495057; margin: 0; white-space: pre-wrap; }
                    .observacoes { margin-top: 30px; }
                    .observacoes h4 { font-size: 16px; margin-bottom: 10px; }
                    .obs-texto { font-size: 14px; white-space: pre-wrap; }
                    .observacoes .linha { border-bottom: 1px dotted #adb5bd; height: 20px; margin-bottom: 20px; }
                    @media print {
                        body { margin: 20px; font-size: 10pt; }
                        .tarefa-item { page-break-inside: avoid; }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        ${logoUrl ? `<img src="${logoUrl}" alt="Logo">` : ''}
                        <h2>Ordem de Serviço - ${funcionario.nome} - ${dataFormatada}</h2>
                    </div>
                    <div class="lista-tarefas">
                        ${tarefasHtml}
                    </div>
                    <div class="observacoes">
                        <h4>Observações:</h4>
                        ${observacaoHtml}
                    </div>
                </div>
            </body>
            </html>
        `;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    };

    // [ALTERADO] Função agora aceita e processa a observação.
    const copiarTextoWhatsApp = (funcionario, data, tarefas, observacao) => {
        let mensagem = `*Ordem de Serviço - ${new Date(data + 'T12:00:00Z').toLocaleDateString('pt-BR')}*\n`;
        mensagem += `*Responsável:* ${funcionario.nome}\n\n`;
        
        tarefas.forEach((t, index) => {
            mensagem += `*Tarefa ${index + 1}:* ${t.textoVisivel}\n`;
            if (t.orientacao) mensagem += `  - _Orientação:_ ${t.orientacao}\n`;
            if (t.localizacao) mensagem += `  - _Local:_ ${t.localizacao}\n`;
            mensagem += '\n';
        });

        // [ALTERADO] Adiciona a observação ao texto se ela existir.
        if (observacao && observacao.trim() !== '') {
            mensagem += `*Observações:*\n${observacao.trim()}\n\n`;
        }

        mensagem += `_Sistema de Gestão de Equipes_`;

        navigator.clipboard.writeText(mensagem).then(() => {
            toast.success('Texto da Ordem de Serviço copiado para a área de transferência!');
        }, (err) => {
            toast.error('Não foi possível copiar o texto.');
            console.error('Erro ao copiar: ', err);
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Gerar Ordens de Serviço do Dia" width="max-w-3xl">
            <div className="space-y-4">
                <div>
                    <label htmlFor="dataOS" className="block text-sm font-medium text-gray-700">
                        Selecione a data para gerar as ordens de serviço:
                    </label>
                    <input
                        type="date"
                        id="dataOS"
                        value={dataSelecionada}
                        onChange={(e) => setDataSelecionada(e.target.value)}
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm p-2"
                    />
                </div>
                <div className="mt-4 pt-4 border-t">
                    <h4 className="text-md font-semibold text-gray-800 mb-2">
                        Funcionários com tarefas em {new Date(dataSelecionada + 'T12:00:00Z').toLocaleDateString('pt-BR')}:
                    </h4>
                    {funcionariosDoDia.length > 0 ? (
                        <ul className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                            {funcionariosDoDia.map(func => (
                                <li key={func.id} className="p-3 bg-gray-100 rounded-md">
                                    <div className="flex justify-between items-center">
                                        <span className="font-medium text-gray-900">{func.nome}</span>
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={() => abrirModalImpressao(func, dataSelecionada, func.tarefas, observacoes[func.id] || '')}
                                                className="flex items-center gap-1.5 text-sm text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-md shadow-sm"
                                                title="Abrir para Impressão"
                                            >
                                                <LucidePrinter size={16} /> Imprimir
                                            </button>
                                            <button 
                                                onClick={() => copiarTextoWhatsApp(func, dataSelecionada, func.tarefas, observacoes[func.id] || '')}
                                                className="flex items-center gap-1.5 text-sm text-white bg-green-500 hover:bg-green-600 px-3 py-1.5 rounded-md shadow-sm"
                                                title="Copiar texto para compartilhar"
                                            >
                                                <LucideClipboardCopy size={16} /> Copiar Texto
                                            </button>
                                        </div>
                                    </div>
                                    {/* [NOVO] Textarea para as observações */}
                                    <div className="mt-2">
                                        <textarea
                                            value={observacoes[func.id] || ''}
                                            onChange={(e) => handleObsChange(func.id, e.target.value)}
                                            placeholder="Adicionar observações para este funcionário..."
                                            rows="2"
                                            className="w-full text-sm p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                                        ></textarea>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-center text-gray-500 py-4">Nenhum funcionário com tarefas programadas para esta data.</p>
                    )}
                </div>
            </div>
        </Modal>
    );
};


// ===================================================================================
// [NOVO COMPONENTE] Modal para Opções de Impressão do Planejamento
// ===================================================================================
const PrintOptionsModal = ({ isOpen, onClose, onPrintWeek, onPrintDay, semanaAtual }) => {
    const [diaSelecionado, setDiaSelecionado] = useState('');

    useEffect(() => {
        if (isOpen && semanaAtual?.dataInicioSemana) {
            const primeiroDia = semanaAtual.dataInicioSemana.toDate().toISOString().split('T')[0];
            setDiaSelecionado(primeiroDia);
        }
    }, [isOpen, semanaAtual]);

    if (!isOpen || !semanaAtual) return null;

    const diasDaSemana = Array.from({ length: 6 }).map((_, i) => {
        const data = new Date(semanaAtual.dataInicioSemana.toDate());
        data.setUTCDate(data.getUTCDate() + i);
        return {
            iso: data.toISOString().split('T')[0],
            label: data.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' })
        };
    });

    const handlePrintDayClick = () => {
        if (diaSelecionado) {
            onPrintDay(diaSelecionado);
            onClose();
        } else {
            toast.error("Por favor, selecione um dia.");
        }
    };

    const handlePrintWeekClick = () => {
        onPrintWeek();
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Opções de Impressão">
            <div className="space-y-6">
                <div className="text-center">
                    <button
                        onClick={handlePrintWeekClick}
                        className="w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Imprimir Semana Completa
                    </button>
                </div>

                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-300" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-white text-gray-500">OU</span>
                    </div>
                </div>

                <div className="space-y-3">
                    <div>
                        <label htmlFor="select-dia" className="block text-sm font-medium text-gray-700">
                            Selecione um dia específico:
                        </label>
                        <select
                            id="select-dia"
                            value={diaSelecionado}
                            onChange={(e) => setDiaSelecionado(e.target.value)}
                            className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm"
                        >
                            {diasDaSemana.map(dia => (
                                <option key={dia.iso} value={dia.iso}>
                                    {dia.label} ({formatDate(new Date(dia.iso + 'T12:00:00Z'))})
                                </option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={handlePrintDayClick}
                        className="w-full bg-gray-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                        Imprimir Dia Selecionado
                    </button>
                </div>
            </div>
        </Modal>
    );
};


// Versão: 21.6.7
// [ARQUITETURA] Removida a definição local duplicada do 'LegendaCoresPopover'.
// [UI/UX] Mantida a correção para ocultar o Domingo no DatePicker via CSS.
// [UI/UX] Mantido 'calendarStartDay={1}' no DatePicker.
const PlanejamentoSemanalCardViewComponent = () => {
    const { db, appId, funcionarios: contextFuncionarios, listasAuxiliares } = useContext(GlobalContext);
    const [semanas, setSemanas] = useState([]);
    const [semanaSelecionadaId, setSemanaSelecionadaId] = useState(null);
    const [dadosProgramacao, setDadosProgramacao] = useState(null);
    const [loading, setLoading] = useState(true);
    
    const [filtroFuncionario, setFiltroFuncionario] = useState('TODOS');
    const [filtroTarefa, setFiltroTarefa] = useState('');
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

    // [NOVO] Estado e ref para o popover da legenda
    const [isLegendOpen, setIsLegendOpen] = useState(false);
    const legendButtonRef = useRef(null);

    const basePath = `/artifacts/${appId}/public/data`;
    const programacaoCollectionRef = collection(db, `${basePath}/programacao_semanal`);

    const DIAS_DA_SEMANA = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

    useEffect(() => {
        setLoading(true);
        const q = query(programacaoCollectionRef, orderBy("criadoEm", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedSemanas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSemanas(fetchedSemanas);
            if (fetchedSemanas.length > 0 && !semanaSelecionadaId) {
                setSemanaSelecionadaId(fetchedSemanas[0].id);
            } else if (fetchedSemanas.length === 0) {
                setSemanaSelecionadaId(null);
            }
            setLoading(false);
        }, () => setLoading(false));
        return () => unsubscribe();
    }, [appId, db]);

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
            }
            setLoading(false);
        }, () => setLoading(false));
        return unsub;
    }, [semanaSelecionadaId, db, basePath]);

    const handleDateSelect = (date) => {
        const selectedTime = date.getTime();
        
        const semanaEncontrada = semanas.find(s => {
            if (s.dataInicioSemana && s.dataFimSemana) {
                const inicio = s.dataInicioSemana.toDate();
                inicio.setUTCHours(0,0,0,0);

                const fim = s.dataFimSemana.toDate();
                fim.setUTCHours(23,59,59,999);

                return selectedTime >= inicio.getTime() && selectedTime <= fim.getTime();
            }
            return false;
        });

        if (semanaEncontrada) {
            setSemanaSelecionadaId(semanaEncontrada.id);
        } else {
            toast.error("Nenhuma semana de programação criada para a data selecionada.");
        }
    };

    const CustomCalendarInput = React.forwardRef(({ value, onClick }, ref) => (
        <button 
            className="p-2 border rounded-md shadow-sm bg-white hover:bg-gray-50 flex items-center gap-2" 
            onClick={onClick} 
            ref={ref}
        >
            <LucideCalendarDays size={18} className="text-gray-600" />
            <span className="font-semibold text-gray-800">{value}</span>
        </button>
    ));

    const highlightedDates = useMemo(() => {
        const dates = [];
        semanas.forEach(s => {
            if (s.dataInicioSemana && s.dataFimSemana) {
                let current = new Date(s.dataInicioSemana.toDate());
                const end = s.dataFimSemana.toDate();
                while (current <= end) {
                    dates.push(new Date(current));
                    current.setDate(current.getDate() + 1);
                }
            }
        });
        return dates;
    }, [semanas]);

    const semanaAtual = semanas.find(s => s.id === semanaSelecionadaId);

    const getPrintStyles = () => `
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');
        body { font-family: 'Roboto', sans-serif; margin: 20px; font-size: 9pt; background-color: #fff; color: #000; }
        .header { text-align: center; margin-bottom: 20px; }
        .header h1 { margin: 0; font-size: 16pt; color: #000; }
        .header h2 { margin: 5px 0 0 0; font-size: 12pt; color: #333; font-weight: 400; }
        .task-card { background-color: #fff !important; border: 1px solid #ccc !important; border-radius: 4px; padding: 6px; margin-bottom: 6px; color: #000; page-break-inside: avoid; }
        .task-header { font-weight: 700; font-size: 8pt; padding-bottom: 3px; border-bottom: 1px solid #ddd; margin-bottom: 3px; }
        .task-body { font-weight: 500; font-size: 8pt; }
        .task-footer { font-style: italic; font-size: 7pt; color: #555; margin-top: 3px; }
        .no-tasks { text-align: center; font-style: italic; color: #888; font-size: 8pt; padding-top: 20px; }
    `;
    
    const getTasksForDay = (diaFormatado) => {
        let tarefasDoDia = [];
        if (dadosProgramacao?.dias?.[diaFormatado]) {
            const funcionariosDoDia = Object.keys(dadosProgramacao.dias[diaFormatado]);
            const funcionariosFiltrados = (filtroFuncionario === 'TODOS') ? funcionariosDoDia : funcionariosDoDia.filter(funcId => funcId === filtroFuncionario);
            
            funcionariosFiltrados.forEach(funcId => {
                const funcionario = contextFuncionarios.find(f => f.id === funcId);
                if (funcionario) {
                    const tarefasDoFuncionario = dadosProgramacao.dias[diaFormatado][funcId];
                    const tarefasFiltradasPorTexto = (filtroTarefa.trim() === '') ? tarefasDoFuncionario : tarefasDoFuncionario.filter(tarefa => tarefa.textoVisivel.toLowerCase().includes(filtroTarefa.toLowerCase()) || (tarefa.orientacao && tarefa.orientacao.toLowerCase().includes(filtroTarefa.toLowerCase())));
                    
                    tarefasFiltradasPorTexto.forEach((tarefa, index) => {
                        tarefasDoDia.push({ 
                            ...tarefa, 
                            funcionarioNome: funcionario.nome,
                            uniqueKey: `${funcId}-${tarefa.mapaTaskId || index}`
                        });
                    });
                }
            });
        }
        return tarefasDoDia.sort((a, b) => a.funcionarioNome.localeCompare(b.funcionarioNome));
    };

    const handlePrintWeek = () => {
        if (!dadosProgramacao || !semanaAtual) {
            toast.error("Não há dados carregados para imprimir.");
            return;
        }
    
        const headerHtml = `
            <div class="header">
                <h1>Planejamento Semanal (Visão por Colunas)</h1>
                <h2>${semanaAtual.nomeAba} (${formatDate(semanaAtual.dataInicioSemana)} - ${formatDate(semanaAtual.dataFimSemana)})</h2>
            </div>
        `;
    
        const dataInicio = dadosProgramacao.dataInicioSemana.toDate();
        let columnsHtml = '';
    
        for (let i = 0; i < 6; i++) {
            const dataDia = new Date(dataInicio);
            dataDia.setUTCDate(dataDia.getUTCDate() + i);
            const diaFormatado = dataDia.toISOString().split('T')[0];
            const diaDaSemanaNome = DIAS_DA_SEMANA[i];
            const dataLabel = dataDia.toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' });
    
            const todasAsTarefasDoDia = getTasksForDay(diaFormatado);
    
            let tasksHtml = '';
            if (todasAsTarefasDoDia.length > 0) {
                tasksHtml = todasAsTarefasDoDia.map(tarefa => `
                    <div class="task-card">
                        <div class="task-header">${tarefa.funcionarioNome}</div>
                        <div class="task-body">${tarefa.textoVisivel}</div>
                        ${tarefa.orientacao ? `<div class="task-footer">${tarefa.orientacao}</div>` : ''}
                    </div>
                `).join('');
            } else {
                tasksHtml = '<p class="no-tasks">Sem planejamento</p>';
            }
    
            columnsHtml += `
                <div class="column">
                    <h3>${diaDaSemanaNome} <span class="date-label">${dataLabel}</span></h3>
                    <div class="tasks-container">${tasksHtml}</div>
                </div>
            `;
        }
    
        const styles = `
            ${getPrintStyles()}
            @page { size: A4 landscape; margin: 15mm; }
            .grid-container { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
            .column { border: 1px solid #ccc; border-radius: 8px; padding: 10px; page-break-inside: avoid; }
            .column h3 { text-align: center; margin: 0 0 10px 0; font-size: 11pt; padding-bottom: 5px; border-bottom: 1px solid #ddd; }
            .column h3 .date-label { font-size: 9pt; color: #666; font-weight: 400; }
        `;
        
        const fullHtml = `<html><head><title>Planejamento Semanal - Impressão</title><style>${styles}</style></head><body>${headerHtml}<div class="grid-container">${columnsHtml}</div></body></html>`;
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(fullHtml);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); }, 500);
    };

    const handlePrintDay = (isoDate) => {
        if (!dadosProgramacao || !semanaAtual) {
            toast.error("Não há dados carregados para imprimir.");
            return;
        }

        const dataDia = new Date(isoDate + 'T12:00:00Z');
        const diaDaSemanaNome = dataDia.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' });
        const dataLabel = formatDate(dataDia);

        const todasAsTarefasDoDia = getTasksForDay(isoDate);

        const tasksHtml = todasAsTarefasDoDia.length > 0 ? todasAsTarefasDoDia.map(tarefa => `
            <div class="task-card">
                <div class="task-header">${tarefa.funcionarioNome}</div>
                <div class="task-body">${tarefa.textoVisivel}</div>
                ${tarefa.orientacao ? `<div class="task-footer">${tarefa.orientacao}</div>` : ''}
            </div>
        `).join('') : '<p class="no-tasks">Sem planejamento para este dia.</p>';
        
        const headerHtml = `
            <div class="header">
                <h1>Planejamento Diário - ${diaDaSemanaNome}</h1>
                <h2>${semanaAtual.nomeAba} - ${dataLabel}</h2>
            </div>
        `;

        const styles = `
            ${getPrintStyles()}
            @page { size: A4 portrait; margin: 20mm; }
            .tasks-container { border: 1px solid #ccc; border-radius: 8px; padding: 10px; }
        `;
        
        const fullHtml = `<html><head><title>Impressão - ${dataLabel}</title><style>${styles}</style></head><body>${headerHtml}<div class="tasks-container">${tasksHtml}</div></body></html>`;
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(fullHtml);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); }, 500);
    };

    const renderColunasDaSemana = () => {
        if (loading || !dadosProgramacao || !dadosProgramacao.dataInicioSemana) {
            return DIAS_DA_SEMANA.map(dia => (
                <div key={dia} className="bg-gray-100 rounded-lg p-3 flex-1">
                    <h3 className="font-bold text-gray-700 mb-3">{dia}</h3>
                    <div className="text-sm text-gray-500">Carregando...</div>
                </div>
            ));
        }

        const dataInicio = dadosProgramacao.dataInicioSemana.toDate();
        const colunas = [];

        for (let i = 0; i < 6; i++) {
            const dataDia = new Date(dataInicio);
            dataDia.setUTCDate(dataDia.getUTCDate() + i);
            const diaFormatado = dataDia.toISOString().split('T')[0];
            const diaDaSemanaNome = DIAS_DA_SEMANA[i];
            const dataLabel = dataDia.toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' });

            const todasAsTarefasDoDia = getTasksForDay(diaFormatado);

            colunas.push(
                <div key={diaFormatado} className="bg-gray-200 rounded-lg p-3 flex flex-col h-full">
                    <h3 className="font-bold text-gray-800 text-center mb-1">{diaDaSemanaNome}</h3>
                    <p className="text-xs text-gray-500 text-center mb-4">{dataLabel}</p>
                    <div className="space-y-3 overflow-y-auto flex-1">
                        {todasAsTarefasDoDia.length > 0 ? (
                            todasAsTarefasDoDia.map(tarefa => (
                                <div 
                                    key={tarefa.uniqueKey} 
                                    className={`p-2 rounded-md shadow-sm text-black text-[11px] leading-tight flex flex-col ${tarefa.statusLocal === 'CANCELADA' ? 'line-through' : ''}`} 
                                    style={{ backgroundColor: tarefa.statusLocal === 'CANCELADA' ? '#fca5a5' : getAcaoColor(tarefa.acao) }}
                                >
                                    <div className="mb-1 pb-1 border-b border-black border-opacity-20 text-left font-semibold">
                                        {tarefa.funcionarioNome}
                                    </div>
                                    <div className="font-semibold">{tarefa.textoVisivel}</div>
                                    {tarefa.orientacao && (
                                        <div className="font-normal italic opacity-90 mt-1">{tarefa.orientacao}</div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="text-center text-sm text-gray-500 pt-10">Sem planejamento</div>
                        )}
                    </div>
                </div>
            );
        }
        return colunas;
    };

    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-full flex flex-col">
            {/* [NOVO] Estilo global para o DatePicker */}
            <style>{`
                /* Oculta o cabeçalho "dom" (Domingo), que é o 7º item quando a semana começa na Segunda */
                .react-datepicker__day-name:nth-child(7) {
                    display: none;
                }

                /* Oculta o último dia (Domingo) de cada semana */
                .react-datepicker__week .react-datepicker__day:nth-child(7) {
                    display: none;
                }
            `}</style>

            <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4">
                <h2 className="text-2xl font-semibold text-gray-800">Planejamento Semanal (Visão por Colunas)</h2>
                <div className="flex flex-wrap items-center gap-4">
                    <div className="relative">
                        <DatePicker
                            selected={semanaAtual?.dataInicioSemana?.toDate()}
                            onChange={handleDateSelect}
                            locale="pt-BR"
                            dateFormat="dd/MM/yyyy"
                            showWeekNumbers
                            highlightDates={highlightedDates}
                            calendarStartDay={1} // <-- [CORRIGIDO]
                            customInput={ <CustomCalendarInput value={semanaAtual ? `${semanaAtual.nomeAba}` : "Selecione"} /> }
                            popperPlacement="bottom-start"
                        />
                    </div>
                    <button 
                        onClick={() => setIsPrintModalOpen(true)}
                        className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md flex items-center shadow-sm"
                        disabled={!dadosProgramacao}
                    >
                        <LucidePrinter size={18} className="mr-2"/> Imprimir Visão
                    </button>
                    {/* [NOVO] Botão e Popover da Legenda */}
                    <div className="relative">
                        <button
                            ref={legendButtonRef}
                            onClick={() => setIsLegendOpen(prev => !prev)}
                            title="Legenda de Cores"
                            className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2 px-4 rounded-md flex items-center shadow-sm"
                        >
                            <LucidePalette size={18} className="mr-2"/> Legenda
                        </button>
                        <LegendaCoresPopover
                            isOpen={isLegendOpen}
                            onClose={() => setIsLegendOpen(false)}
                            acoes={listasAuxiliares.acoes || []}
                            triggerRef={legendButtonRef}
                        />
                    </div>
                </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-md mb-6 flex flex-wrap items-end gap-4">
                <div className="flex-grow">
                    <label htmlFor="filtroFuncionario" className="block text-sm font-medium text-gray-700">Filtrar por Funcionário</label>
                    <select
                        id="filtroFuncionario"
                        value={filtroFuncionario}
                        onChange={(e) => setFiltroFuncionario(e.target.value)}
                        className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm"
                    >
                        <option value="TODOS">Todos os Funcionários</option>
                        {contextFuncionarios.map(f => (
                            <option key={f.id} value={f.id}>{f.nome}</option>
                        ))}
                    </select>
                </div>
                <div className="flex-grow">
                    <label htmlFor="filtroTarefa" className="block text-sm font-medium text-gray-700">Buscar por Tarefa / Orientação</label>
                    <input
                        id="filtroTarefa"
                        type="text"
                        value={filtroTarefa}
                        onChange={(e) => setFiltroTarefa(e.target.value)}
                        placeholder="Digite para buscar..."
                        className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm"
                    />
                </div>
                <button
                    onClick={() => { setFiltroFuncionario('TODOS'); setFiltroTarefa(''); }}
                    className="text-sm text-blue-600 hover:text-blue-800 font-semibold flex items-center p-2"
                >
                    <LucideXCircle size={16} className="mr-1"/> Limpar Filtros
                </button>
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 h-full">
                {renderColunasDaSemana()}
            </div>
            
            <PrintOptionsModal 
                isOpen={isPrintModalOpen}
                onClose={() => setIsPrintModalOpen(false)}
                onPrintWeek={handlePrintWeek}
                onPrintDay={handlePrintDay}
                semanaAtual={semanaAtual}
            />
        </div>
    );
};


// Versão: 25.5.6
// [ARQUITETURA] Removida a definição local duplicada do 'LegendaCoresPopover' que foi
// reintroduzida por engano e estava causando o erro 'Identifier has already been declared'.
// [UI/UX] Mantida a correção para ocultar o Domingo no DatePicker via CSS.
// [UI/UX] Mantido 'calendarStartDay={1}' no DatePicker.
const ProgramacaoSemanalComponent = ({ setCurrentPage }) => {
    const { userId, db, appId, listasAuxiliares, auth: authGlobal } = useContext(GlobalContext);
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
    const [isOrdemServicoModalOpen, setIsOrdemServicoModalOpen] = useState(false);
    const [todosFuncionarios, setTodosFuncionarios] = useState([]);
    const [funcionariosAtivos, setFuncionariosAtivos] = useState([]);
    const [loadingFuncionarios, setLoadingFuncionarios] = useState(true);
    
    // Estado e ref para o popover da legenda
    const [isLegendOpen, setIsLegendOpen] = useState(false);
    const legendButtonRef = useRef(null);


    const basePath = `/artifacts/${appId}/public/data`;
    const programacaoCollectionRef = collection(db, `${basePath}/programacao_semanal`);
    
    useEffect(() => {
        const funcionariosCollectionRef = collection(db, `${basePath}/funcionarios`);
        const q = query(funcionariosCollectionRef, orderBy("nome", "asc"));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedFuncionarios = snapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(),
                ativo: doc.data().ativo !== false
            }));
            
            setTodosFuncionarios(fetchedFuncionarios);
            setFuncionariosAtivos(fetchedFuncionarios.filter(func => func.ativo));
            setLoadingFuncionarios(false);
        }, (error) => {
            console.error("Erro ao carregar funcionários em tempo real na Programação:", error);
            toast.error("Não foi possível carregar a lista de funcionários.");
            setLoadingFuncionarios(false);
        });
        return () => unsubscribe();
    }, [db, appId, basePath]);

    useEffect(() => {
        setLoading(true);
        const q = query(programacaoCollectionRef, orderBy("criadoEm", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedSemanas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSemanas(fetchedSemanas);
            const currentSelectedExists = fetchedSemanas.some(s => s.id === semanaSelecionadaId);
            if (fetchedSemanas.length > 0 && (!semanaSelecionadaId || !currentSelectedExists)) {
                setSemanaSelecionadaId(fetchedSemanas[0].id);
            } else if (fetchedSemanas.length === 0) {
                setSemanaSelecionadaId(null);
            }
            setLoading(false);
        }, error => { console.error("Erro ao carregar semanas:", error); setLoading(false); });
        return () => unsubscribe();
    }, [userId, appId, db]);

    useEffect(() => {
        if (!semanaSelecionadaId) { setDadosProgramacao(null); setLoading(false); return; }
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
        }, error => { console.error("Erro ao carregar dados da programação:", error); setLoading(false); });
        return unsub;
    }, [semanaSelecionadaId, db, basePath]);

    const handleDateSelect = (date) => {
        const selectedTime = date.getTime();
        const semanaEncontrada = semanas.find(s => {
            if (s.dataInicioSemana && s.dataFimSemana) {
                const inicio = s.dataInicioSemana.toDate();
                inicio.setUTCHours(0,0,0,0);
                const fim = s.dataFimSemana.toDate();
                fim.setUTCHours(23,59,59,999);
                return selectedTime >= inicio.getTime() && selectedTime <= fim.getTime();
            }
            return false;
        });
        if (semanaEncontrada) {
            setSemanaSelecionadaId(semanaEncontrada.id);
        } else {
            toast.error("Nenhuma semana de programação criada para a data selecionada.");
        }
    };

    const CustomCalendarInput = React.forwardRef(({ value, onClick }, ref) => (
        <button 
            className="p-2 border rounded-md shadow-sm bg-white hover:bg-gray-50 flex items-center gap-2" 
            onClick={onClick} 
            ref={ref}
        >
            <LucideCalendarDays size={18} className="text-gray-600" />
            <span className="font-semibold text-gray-800">{value}</span>
        </button>
    ));

    const highlightedDates = useMemo(() => {
        const dates = [];
        semanas.forEach(s => {
            if (s.dataInicioSemana && s.dataFimSemana) {
                let current = new Date(s.dataInicioSemana.toDate());
                const end = s.dataFimSemana.toDate();
                while (current <= end) {
                    dates.push(new Date(current));
                    current.setDate(current.getDate() + 1);
                }
            }
        });
        return dates;
    }, [semanas]);

    const formatDateProg = (timestamp) => {
        if (timestamp && typeof timestamp.toDate === 'function') {
            return timestamp.toDate().toLocaleDateString('pt-BR', { timeZone: 'UTC' });
        }
        return 'N/A';
    };
    const DIAS_SEMANA_PROG = ["SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
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
         if (!novaSemanaDataInicio) { toast.error("Por favor, selecione uma data de início para a nova semana."); return; }
         const [year, month, day] = novaSemanaDataInicio.split('-').map(Number);
         const dataInicioUTC = new Date(Date.UTC(year, month - 1, day));
         if (dataInicioUTC.getUTCDay() !== 1) { toast.error("A semana deve começar em uma Segunda-feira."); return; }
         setLoadingAtualizacao(true);
         try {
             const dataFimUTC = new Date(dataInicioUTC);
             dataFimUTC.setUTCDate(dataInicioUTC.getUTCDate() + 5);
             const ano = dataInicioUTC.getUTCFullYear();
             const numeroDaSemana = getWeekOfYear(dataInicioUTC);
             const nomeNovaAba = `Programação ${ano}-S${numeroDaSemana.toString().padStart(2, '0')}`;
             const semanaExistente = semanas.find(s => s.nomeAba === nomeNovaAba);
             if (semanaExistente) { toast.error(`A semana "${nomeNovaAba}" já existe.`); setLoadingAtualizacao(false); return; }
             const novaSemanaDocId = `semana_${dataInicioUTC.toISOString().split('T')[0].replace(/-/g, '_')}`;
             const novaSemanaData = { nomeAba: nomeNovaAba, dataInicioSemana: Timestamp.fromDate(dataInicioUTC), dataFimSemana: Timestamp.fromDate(dataFimUTC), dias: {}, criadoEm: Timestamp.now(), criadoPor: authGlobal.currentUser?.uid || 'sistema' };
             for (let i = 0; i < 6; i++) {
                 const diaAtualLoop = new Date(dataInicioUTC);
                 diaAtualLoop.setUTCDate(diaAtualLoop.getUTCDate() + i);
                 const diaFormatado = diaAtualLoop.toISOString().split('T')[0];
                 novaSemanaData.dias[diaFormatado] = {};
                 todosFuncionarios.forEach(func => { if(func && func.id) novaSemanaData.dias[diaFormatado][func.id] = []; });
             }
             await setDoc(doc(db, `${basePath}/programacao_semanal`, novaSemanaDocId), novaSemanaData);
             toast.success(`Nova semana "${nomeNovaAba}" criada com sucesso!`);
             setIsNovaSemanaModalOpen(false);
             setNovaSemanaDataInicio('');
         } catch (error) { console.error("Erro ao criar nova semana:", error); toast.error("Erro ao criar nova semana: " + error.message); }
         setLoadingAtualizacao(false);
     };

    const handleExcluirSemana = async () => {
        if (!semanaSelecionadaId || !dadosProgramacao) { toast.error("Nenhuma semana selecionada para excluir."); return; }
        const dataInicioFormatada = formatDateProg(dadosProgramacao.dataInicioSemana);
        const dataFimFormatada = formatDateProg(dadosProgramacao.dataFimSemana);
        if (window.confirm(`Tem certeza que deseja excluir a semana "${dadosProgramacao.nomeAba}" (${dataInicioFormatada} - ${dataFimFormatada})?`)) {
            setLoadingAtualizacao(true);
            try {
                await deleteDoc(doc(db, `${basePath}/programacao_semanal`, semanaSelecionadaId));
                toast.success(`Semana "${dadosProgramacao.nomeAba}" excluída com sucesso.`);
                setIsGerenciarSemanaModalOpen(false);
            } catch (error) { console.error("Erro ao excluir semana:", error); toast.error("Erro ao excluir semana: " + error.message); }
            setLoadingAtualizacao(false);
        }
    };

    const handleAtualizarProgramacaoDaSemana = async () => {
        if (!semanaSelecionadaId) { toast.error("Nenhuma semana selecionada para atualizar."); return; }
        setLoadingAtualizacao(true);
        try {
            const semanaDocRef = doc(db, `${basePath}/programacao_semanal`, semanaSelecionadaId);
            const semanaDocSnap = await getDoc(semanaDocRef);
            if (!semanaDocSnap.exists()) throw new Error("Documento da semana não encontrado.");
            const semanaData = semanaDocSnap.data();
            const dataInicioSemanaDate = converterParaDate(semanaData.dataInicioSemana);
            const dataFimSemanaDate = converterParaDate(semanaData.dataFimSemana);
            if (!dataInicioSemanaDate || !dataFimSemanaDate) throw new Error("Datas da semana inválidas.");
    
            const novosDiasDaSemana = {};
            let diaCorrente = new Date(dataInicioSemanaDate);
            while (diaCorrente <= dataFimSemanaDate) {
                const diaFmt = diaCorrente.toISOString().split('T')[0];
                novosDiasDaSemana[diaFmt] = {};
                todosFuncionarios.forEach(func => { if (func && func.id) novosDiasDaSemana[diaFmt][func.id] = []; });
                diaCorrente.setUTCDate(diaCorrente.getUTCDate() + 1);
            }
    
            const tarefasMapaQuery = query(collection(db, `${basePath}/tarefas_mapa`));
            const tarefasMapaSnap = await getDocs(tarefasMapaQuery);
    
            tarefasMapaSnap.forEach(docTarefaMapa => {
                const tarefaMapa = { id: docTarefaMapa.id, ...docTarefaMapa.data() };
                const statusValidos = ["PROGRAMADA", "EM OPERAÇÃO", "CONCLUÍDA", "CANCELADA"];
                if (!statusValidos.includes(tarefaMapa.status) || !tarefaMapa.dataInicio || !tarefaMapa.dataProvavelTermino || !tarefaMapa.responsaveis?.length) return;
    
                let textoBaseTarefa = tarefaMapa.tarefa || "Tarefa s/ descrição";
                if (tarefaMapa.prioridade) textoBaseTarefa += ` - ${tarefaMapa.prioridade}`;
                let turnoParaTexto = (tarefaMapa.turno && tarefaMapa.turno.toUpperCase() !== TURNO_DIA_INTEIRO) ? `[${tarefaMapa.turno.toUpperCase()}] ` : "";
                
                const itemProg = {
                    mapaTaskId: tarefaMapa.id, textoVisivel: turnoParaTexto + textoBaseTarefa, statusLocal: tarefaMapa.status,
                    mapaStatus: tarefaMapa.status, turno: tarefaMapa.turno || TURNO_DIA_INTEIRO, orientacao: tarefaMapa.orientacao || '',
                    localizacao: tarefaMapa.area || '', acao: tarefaMapa.acao || '', conclusao: '',
                    ultimaAnotacaoTexto: tarefaMapa.ultimaAnotacaoTexto || '', ultimaAnotacaoTimestamp: tarefaMapa.ultimaAnotacaoTimestamp || null,
                };
    
                let dataAtualTarefa = converterParaDate(tarefaMapa.dataInicio);
                const dataFimTarefa = converterParaDate(tarefaMapa.dataProvavelTermino);
                if (!dataAtualTarefa || !dataFimTarefa) return;
    
                while (dataAtualTarefa <= dataFimTarefa) {
                    if (dataAtualTarefa >= dataInicioSemanaDate && dataAtualTarefa <= dataFimSemanaDate) {
                        const diaFormatadoTarefa = dataAtualTarefa.toISOString().split('T')[0];
                        if (novosDiasDaSemana[diaFormatadoTarefa]) {
                            tarefaMapa.responsaveis.forEach(respId => {
                                if (novosDiasDaSemana[diaFormatadoTarefa][respId]) {
                                    novosDiasDaSemana[diaFormatadoTarefa][respId].push({ ...itemProg });
                                }
                            });
                        }
                    }
                    dataAtualTarefa.setUTCDate(dataAtualTarefa.getUTCDate() + 1);
                }
            });
    
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
        if (!dadosProgramacao) { toast.error("Dados da semana não carregados."); return; }
        setDiaParaRegistro(dataParaRegistro);
        const inicioSemana = dadosProgramacao.dataInicioSemana.toDate();
        const fimSemana = dadosProgramacao.dataFimSemana.toDate();
        const dataSelecionada = new Date(dataParaRegistro + "T12:00:00Z");
        if (dataSelecionada < inicioSemana || dataSelecionada > fimSemana) {
            toast.error("A data selecionada não pertence à semana de programação atual.", { duration: 6000 });
            return;
        }
        const tarefasDoDia = dadosProgramacao.dias?.[dataParaRegistro];
        if (!tarefasDoDia) { setTarefasDoDiaParaRegistro([]); setIsRegistroDiarioModalOpen(true); return; }
        const todasAsTarefasDoDiaSelecionado = [];
        Object.entries(tarefasDoDia).forEach(([responsavelId, tarefas]) => {
            tarefas.forEach(tarefa => {
                todasAsTarefasDoDiaSelecionado.push({ ...tarefa, responsavelId: responsavelId, });
            });
        });
        setTarefasDoDiaParaRegistro(todasAsTarefasDoDiaSelecionado);
        setIsRegistroDiarioModalOpen(true);
    };

    const handleSalvarRegistroDiario = async (tarefasAtualizadas, tarefasOriginais) => {
        if (!semanaSelecionadaId || !dadosProgramacao) return;
        const semanaDocRef = doc(db, `${basePath}/programacao_semanal`, semanaSelecionadaId);
        const usuario = authGlobal.currentUser;
        const diaSendoAtualizado = diaParaRegistro;
        try {
            const semanaDocSnap = await getDoc(semanaDocRef);
            if (!semanaDocSnap.exists()) throw new Error("Documento da semana não encontrado.");
            const novosDias = JSON.parse(JSON.stringify(semanaDocSnap.data().dias));
            const affectedTaskIds = new Set();
            tarefasAtualizadas.forEach(tarefaAtualizada => {
                affectedTaskIds.add(tarefaAtualizada.mapaTaskId);
                const { responsavelId, mapaTaskId } = tarefaAtualizada;
                if (novosDias[diaSendoAtualizado]?.[responsavelId]) {
                    const indice = novosDias[diaSendoAtualizado][responsavelId].findIndex(t => t.mapaTaskId === mapaTaskId);
                    if (indice !== -1) {
                        novosDias[diaSendoAtualizado][responsavelId][indice].conclusao = tarefaAtualizada.conclusao;
                        novosDias[diaSendoAtualizado][responsavelId][indice].statusLocal = tarefaAtualizada.statusLocal;
                    }
                }
            });
            await updateDoc(semanaDocRef, { dias: novosDias });

            setDadosProgramacao(prev => ({ ...prev, dias: novosDias }));

            for (const tarefaAtualizada of tarefasAtualizadas) {
                const tarefaOriginal = tarefasOriginais.find(t => t.mapaTaskId === tarefaAtualizada.mapaTaskId && t.responsavelId === tarefaAtualizada.responsavelId);
                const conclusaoAntes = tarefaOriginal?.conclusao?.trim() || '';
                const conclusaoDepois = tarefaAtualizada.conclusao?.trim() || '';
                const taskId = tarefaAtualizada.mapaTaskId;
                if (!taskId) continue;
                if (conclusaoDepois && conclusaoDepois !== conclusaoAntes) {
                    await logAnotacaoTarefa(db, basePath, taskId, usuario?.email, conclusaoDepois, diaSendoAtualizado);
                } else if (!conclusaoDepois && conclusaoAntes) {
                    const anotacoesRef = collection(db, `${basePath}/tarefas_mapa/${taskId}/anotacoes`);
                    const q = query(anotacoesRef, where("texto", "==", conclusaoAntes), where("dataDoRegistro", "==", diaSendoAtualizado), orderBy("criadoEm", "desc"), limit(1));
                    const snapToDelete = await getDocs(q);
                    if (!snapToDelete.empty) {
                        await deleteDoc(snapToDelete.docs[0].ref);
                        const tarefaRef = doc(db, `${basePath}/tarefas_mapa`, taskId);
                        const backfillQuery = query(collection(db, `${basePath}/tarefas_mapa/${taskId}/anotacoes`), orderBy('criadoEm', 'desc'), limit(1));
                        const backfillSnap = await getDocs(backfillQuery);
                        if (backfillSnap.empty) {
                            await updateDoc(tarefaRef, { ultimaAnotacaoTexto: '', ultimaAnotacaoTimestamp: null });
                        } else {
                            const novaUltima = backfillSnap.docs[0].data();
                            await updateDoc(tarefaRef, { ultimaAnotacaoTexto: novaUltima.texto, ultimaAnotacaoTimestamp: novaUltima.criadoEm });
                        }
                    }
                }
            }
            for (const taskId of affectedTaskIds) {
                const tarefaDoDia = tarefasAtualizadas.find(t => t.mapaTaskId === taskId);
                if (tarefaDoDia) {
                    const tarefaMapaDocRef = doc(db, `${basePath}/tarefas_mapa`, taskId);
                    const tarefaMapaSnap = await getDoc(tarefaMapaDocRef);
                    if (tarefaMapaSnap.exists()) {
                        const statusPrincipalAtual = tarefaMapaSnap.data().status;
                        const statusDoDia = tarefaDoDia.statusLocal;
                        if (statusPrincipalAtual !== statusDoDia) {
                            await updateDoc(tarefaMapaDocRef, { status: statusDoDia });
                            await logAlteracaoTarefa(db, basePath, taskId, usuario?.uid, usuario?.email, "Status Sincronizado do Registro Diário", `Status principal alterado de "${statusPrincipalAtual}" para "${statusDoDia}".`);
                        }
                        const tarefaMaisRecenteSnap = await getDoc(tarefaMapaDocRef);
                        if (tarefaMaisRecenteSnap.exists()) {
                            await sincronizarTarefaComProgramacao(taskId, tarefaMaisRecenteSnap.data(), db, basePath, { forceStatus: true });
                        }
                    }
                }
                await verificarEAtualizarStatusConclusaoMapa(taskId, db, basePath);
            }
            toast.success("Registros salvos e sincronizados com sucesso!");
        } catch (error) {
            console.error("Erro ao salvar registros do dia:", error);
            toast.error("Falha ao salvar os registros do dia: " + error.message);
        }
    };
    
    const renderCabecalhoDias = () => {
        if (!dadosProgramacao || !dadosProgramacao.dataInicioSemana) {
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
            dias.push(<th key={`header-dia-${i}`} className={`px-3 py-2 border-y border-y-gray-300 border-l border-l-gray-300 border-r-2 border-r-gray-300 text-xs font-medium text-white whitespace-nowrap ${isHoje ? 'bg-amber-500' : 'bg-teal-600'}`}>{dataDia.toLocaleDateString('pt-BR', {timeZone: 'UTC'})} - {DIAS_SEMANA_PROG[i]}</th>);
        }
        return dias;
    };

    const renderCelulasTarefas = (funcionarioId) => {
        if (!dadosProgramacao || !dadosProgramacao.dataInicioSemana || !dadosProgramacao.dias) {
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
                <td key={`${funcionarioId}-${diaFormatado}`} className={`border-y border-y-gray-300 border-l border-l-gray-300 border-r-2 border-r-gray-300 p-1 min-h-[80px] h-20 align-top text-xs cursor-pointer transition-colors ${isHoje ? 'bg-amber-50' : ''}`} onClick={() => handleAbrirModalGerenciarTarefa(diaFormatado, funcionarioId, tarefasDoDiaParaFuncionario)}>
                    {tarefasDoDiaParaFuncionario.length === 0 
                        ? <span className="text-gray-400 italic text-xs">Vazio</span> 
                        : <div className="space-y-1">{tarefasDoDiaParaFuncionario.map((tarefaInst, idx) => {
                            let taskColor = getAcaoColor(tarefaInst.acao);
                            
                            if (tarefaInst.statusLocal === 'CANCELADA') {
                                taskColor = '#fca5a5';
                            }
                            
                            const temAnotacao = tarefaInst.ultimaAnotacaoTexto && tarefaInst.ultimaAnotacaoTexto.trim() !== '';
                            return (
                                <div key={tarefaInst.mapaTaskId || `task-${idx}`} className={`p-1 rounded text-black text-[10px] leading-tight ${tarefaInst.statusLocal === 'CONCLUÍDA' || tarefaInst.statusLocal === 'CANCELADA' ? 'line-through opacity-70' : ''}`} style={{ backgroundColor: taskColor }} title={`${tarefaInst.textoVisivel}${tarefaInst.orientacao ? `\n\nOrientação: ${tarefaInst.orientacao}` : ''}`}>
                                    <div className="font-semibold flex items-center justify-between">
                                        <span>{tarefaInst.textoVisivel?.substring(0,32) + (tarefaInst.textoVisivel?.length > 35 ? "..." : "")}</span>
                                        {temAnotacao && <LucideStickyNote size={12} className="ml-1 flex-shrink-0 text-gray-800 opacity-75" title={`Última Anotação: ${tarefaInst.ultimaAnotacaoTexto}`} />}
                                    </div>
                                    {tarefaInst.orientacao && (
                                        <div className="font-normal italic opacity-90 mt-1 border-t border-black border-opacity-20 pt-0.5">{tarefaInst.orientacao.substring(0, 35) + (tarefaInst.orientacao.length > 35 ? '...' : '')}</div>
                                    )}
                                </div>
                            )
                        })}</div>
                    }
                </td>
            );
        }
        return celulas;
    };

    const semanaAtual = semanas.find(s => s.id === semanaSelecionadaId);

    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-full">
            {/* [NOVO] Estilo global para o DatePicker */}
            <style>{`
                /* Oculta o cabeçalho "dom" (Domingo), que é o 7º item quando a semana começa na Segunda */
                .react-datepicker__day-name:nth-child(7) {
                    display: none;
                }

                /* Oculta o último dia (Domingo) de cada semana */
                .react-datepicker__week .react-datepicker__day:nth-child(7) {
                    display: none;
                }
            `}</style>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold text-gray-800">Programação Semanal</h2>
                
                <div className="flex items-center gap-4 bg-white p-2 rounded-lg shadow-md border border-gray-200">
                    
                    {/* Grupo 1: Navegação */}
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-semibold text-gray-600 whitespace-nowrap">Ver Semana:</label>
                        <DatePicker
                            selected={semanaAtual?.dataInicioSemana?.toDate()}
                            onChange={handleDateSelect}
                            locale="pt-BR"
                            dateFormat="dd/MM/yyyy"
                            showWeekNumbers
                            highlightDates={highlightedDates}
                            calendarStartDay={1} // <-- [CORRIGIDO]
                            customInput={
                                <CustomCalendarInput 
                                    value={semanaAtual ? `${semanaAtual.nomeAba}` : "Selecione"}
                                />
                            }
                            popperPlacement="bottom-end"
                        />
                    </div>

                    <div className="border-l border-gray-300 h-8"></div>

                    {/* Grupo 2: Ações do Dia */}
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-semibold text-gray-600">Registro:</label>
                        <input type="date" value={dataParaRegistro} onChange={(e) => setDataParaRegistro(e.target.value)} className="p-2 border border-gray-300 rounded-md shadow-sm"/>
                        <button onClick={handleAbrirRegistroDiario} disabled={!semanaSelecionadaId || loadingAtualizacao} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-3 rounded-md flex items-center disabled:bg-gray-400 flex-shrink-0">
                            <LucideClipboardEdit size={18} className="mr-2"/> Registrar
                        </button>
                    </div>

                    <div className="border-l border-gray-300 h-8"></div>

                    {/* Grupo 3: Ferramentas */}
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-semibold text-gray-600">Ferramentas:</label>
                        <button onClick={() => setCurrentPage('planejamento')} title="Visão Semanal" className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold p-2 rounded-md flex items-center shadow-sm">
                            <LucideKanbanSquare size={18}/>
                        </button>
                        <button onClick={() => setIsOrdemServicoModalOpen(true)} disabled={!semanaSelecionadaId || loadingAtualizacao} title="Ordem de Serviço" className="bg-gray-700 hover:bg-gray-800 text-white font-bold p-2 rounded-md flex items-center shadow-sm disabled:bg-gray-400">
                            <LucidePrinter size={18}/>
                        </button>
                        <button onClick={() => setIsGerenciarSemanaModalOpen(true)} disabled={!semanaSelecionadaId || loadingAtualizacao} title="Gerenciar Semana" className="bg-sky-500 hover:bg-sky-600 text-white font-bold p-2 rounded-md flex items-center shadow-sm disabled:bg-gray-400">
                            <LucideSettings size={18}/>
                        </button>
                        {/* [NOVO] Botão da Legenda com container relativo */}
                        <div className="relative">
                            <button
                                ref={legendButtonRef}
                                onClick={() => setIsLegendOpen(prev => !prev)}
                                title="Legenda de Cores"
                                className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold p-2 rounded-md flex items-center shadow-sm"
                            >
                                <LucidePalette size={18}/>
                            </button>
                            <LegendaCoresPopover
                                isOpen={isLegendOpen}
                                onClose={() => setIsLegendOpen(false)}
                                acoes={listasAuxiliares.acoes || []}
                                triggerRef={legendButtonRef}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {(loading || loadingFuncionarios) ? <p className="text-center py-4">Carregando...</p> : !semanaSelecionadaId || !dadosProgramacao ? <p className="text-center py-4 text-gray-500">Nenhuma semana de programação foi criada ainda ou não foi possível carregar os dados.</p> : (
                 <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-0.5">
                        <caption className="text-lg font-semibold p-2 bg-teal-700 text-white">PROGRAMAÇÃO DIÁRIA - Semana de: {formatDateProg(dadosProgramacao.dataInicioSemana)} a {formatDateProg(dadosProgramacao.dataFimSemana)}</caption>
                        <thead><tr key="header-row"><th className="border-y border-y-gray-300 border-l border-l-gray-300 px-3 py-2 bg-teal-600 text-white text-xs font-medium w-32 sticky left-0 z-10">Responsável</th>{renderCabecalhoDias()}</tr></thead>
                        <tbody>
                            {(!funcionariosAtivos || funcionariosAtivos.length === 0) ? (<tr><td colSpan={DIAS_SEMANA_PROG.length + 1} className="text-center p-4 text-gray-500">Nenhum funcionário ativo cadastrado.</td></tr>) : 
                                (funcionariosAtivos.map((func, index) => (
                                    <tr key={func.id}>
                                        <td className={`border-y border-y-gray-300 border-l border-l-gray-300 px-3 py-2 font-semibold text-teal-800 text-sm whitespace-nowrap sticky left-0 z-10 ${index % 2 === 0 ? 'bg-teal-50' : 'bg-teal-100'}`}>{func.nome}</td>
                                        {renderCelulasTarefas(func.id)}
                                    </tr>
                                )))}
                        </tbody>
                    </table>
                </div>
            )}
            <OrdemServicoModal isOpen={isOrdemServicoModalOpen} onClose={() => setIsOrdemServicoModalOpen(false)} dadosProgramacao={dadosProgramacao} funcionarios={todosFuncionarios} logoUrl={LOGO_URL} />
            <Modal isOpen={isNovaSemanaModalOpen} onClose={() => setIsNovaSemanaModalOpen(false)} title="Criar Nova Semana de Programação"><div className="space-y-4"><div><label htmlFor="novaSemanaData" className="block text-sm font-medium text-gray-700">Data de Início da Nova Semana (Segunda-feira):</label><input type="date" id="novaSemanaData" value={novaSemanaDataInicio} onChange={(e) => setNovaSemanaDataInicio(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"/></div><div className="flex justify-end space-x-2"><button onClick={() => setIsNovaSemanaModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md">Cancelar</button><button onClick={handleCriarNovaSemana} disabled={loadingAtualizacao} className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md">{loadingAtualizacao ? "Criando..." : "Criar Semana"}</button></div></div></Modal>
            {dadosProgramacao && (
                <Modal isOpen={isGerenciarSemanaModalOpen} onClose={() => setIsGerenciarSemanaModalOpen(false)} title={`Gerenciar Semana: ${dadosProgramacao?.nomeAba || ''}`}>
                    <div className="space-y-6">
                        <div>
                            <h4 className="text-md font-semibold text-gray-700 mb-3">Ações da Semana</h4>
                            <div className="space-y-2">
                                <button onClick={handleAtualizarProgramacaoDaSemana} disabled={loadingAtualizacao} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-md flex items-center justify-center shadow-sm disabled:bg-gray-400"><LucideRefreshCw size={18} className={`mr-2 ${loadingAtualizacao ? 'animate-spin' : ''}`}/>{loadingAtualizacao ? "Atualizando..." : "Atualizar com Mapa"}</button>
                                <button onClick={() => { setIsGerenciarSemanaModalOpen(false); setIsNovaSemanaModalOpen(true); }} disabled={loadingAtualizacao} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-md flex items-center justify-center shadow-sm disabled:bg-gray-400"><LucidePlusCircle size={20} className="mr-2"/> Criar Nova Semana</button>
                            </div>
                        </div>
                        <div className="pt-4 border-t">
                            <h4 className="text-md font-semibold text-red-700 mb-2">Zona de Perigo</h4>
                            <button onClick={handleExcluirSemana} disabled={loadingAtualizacao} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-md flex items-center justify-center"><LucideTrash2 size={18} className="mr-2"/> Excluir Semana</button>
                        </div>
                    </div>
                </Modal>
            )}
            {isGerenciarTarefaModalOpen && dadosCelulaParaGerenciar.diaFormatado && (<GerenciarTarefaProgramacaoModal isOpen={isGerenciarTarefaModalOpen} onClose={() => setIsGerenciarTarefaModalOpen(false)} diaFormatado={dadosCelulaParaGerenciar.diaFormatado} responsavelId={dadosCelulaParaGerenciar.responsavelId} tarefasDaCelula={dadosCelulaParaGerenciar.tarefas} semanaId={semanaSelecionadaId} onAlteracaoSalva={() => {}}/>)}
            <RegistroDiarioModal isOpen={isRegistroDiarioModalOpen} onClose={() => setIsRegistroDiarioModalOpen(false)} onSave={handleSalvarRegistroDiario} tarefasDoDia={tarefasDoDiaParaRegistro} funcionarios={todosFuncionarios} dia={diaParaRegistro} />
        </div>
    );
};

// Versão: 8.3.2
// [ARQUITETURA] Removida a aba "Histórico de Aplicações" e seu componente associado ('HistoricoFitossanitarioComponent').
// A funcionalidade de histórico já é completamente atendida pela aba "Aplicações", que lê os dados da coleção 'tarefas_mapa'.
// Isso elimina a redundância e corrige o bug da tela de histórico aparecer vazia, pois ela apontava para uma coleção obsoleta.
// [ALTERADO] Reordenadas as abas do Controle Fitossanitário para priorizar "Aplicações".
const ControleFitossanitarioComponent = () => {
    const [activeTab, setActiveTab] = useState('aplicacoes'); // A aba "Aplicações" agora é a padrão

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
                    {/* Ordem das abas alterada */}
                    <TabButton tabName="aplicacoes" currentTab={activeTab} setTab={setActiveTab}>Aplicações</TabButton>
                    <TabButton tabName="planos" currentTab={activeTab} setTab={setActiveTab}>Planos de Aplicação</TabButton>
                    <TabButton tabName="calendario" currentTab={activeTab} setTab={setActiveTab}>Calendário de Aplicações</TabButton>
                    {/* [REMOVIDO] A aba de Histórico foi removida por ser redundante. */}
                </nav>
            </div>
            <div>
                {activeTab === 'planos' && <PlanosFitossanitariosComponent />}
                {activeTab === 'aplicacoes' && <RegistroAplicacaoComponent />}
                {activeTab === 'calendario' && <CalendarioFitossanitarioComponent />}
                {/* [REMOVIDO] A renderização do componente de histórico foi removida. */}
            </div>
        </div>
    );
};

// Versão Atualizada: Suporte a Edição (tarefaExistente)
const TarefaPendenteFormModal = ({ isOpen, onClose, onSave, listasAuxiliares, titulo, tarefaFixa = null, acoesPermitidas = null, tarefaExistente = null }) => {
    const [loading, setLoading] = useState(false);
    // State do formulário
    const [tarefa, setTarefa] = useState('');
    const [prioridade, setPrioridade] = useState('');
    const [area, setArea] = useState('');
    const [orientacao, setOrientacao] = useState('');
    const [acao, setAcao] = useState('');
    const [dataInicio, setDataInicio] = useState('');
    const [novosAnexos, setNovosAnexos] = useState([]);

    useEffect(() => {
        if (isOpen) {
            if (tarefaExistente) {
                // Modo Edição: Preenche com os dados existentes
                setTarefa(tarefaExistente.tarefa || '');
                setPrioridade(tarefaExistente.prioridade || '');
                setArea(tarefaExistente.area || '');
                setOrientacao(tarefaExistente.orientacao || '');
                setAcao(tarefaExistente.acao || '');
                
                // Formata data do Firestore (Timestamp) para YYYY-MM-DD
                if (tarefaExistente.dataInicio && tarefaExistente.dataInicio.seconds) {
                    const date = new Date(tarefaExistente.dataInicio.seconds * 1000);
                    setDataInicio(date.toISOString().split('T')[0]);
                } else {
                    setDataInicio('');
                }
            } else {
                // Modo Criação: Reseta o formulário
                setTarefa(tarefaFixa || ''); 
                setPrioridade('');
                setArea('');
                setOrientacao('');
                setAcao('');
                const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).split('/').reverse().join('-');
                setDataInicio(hoje);
            }
            setNovosAnexos([]);
        }
    }, [isOpen, tarefaFixa, tarefaExistente]);

    const handleFileChange = (e) => {
        if (e.target.files) {
            setNovosAnexos(prev => [...prev, ...Array.from(e.target.files)]);
        }
    };

    const handleRemoveNovoAnexo = (fileNameToRemove) => {
        setNovosAnexos(novosAnexos.filter(file => file.name !== fileNameToRemove));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        // Se estiver editando, usa o nome que está no input, senão usa a tarefaFixa ou o input
        const tarefaFinal = (tarefaExistente ? tarefa : (tarefaFixa || tarefa)).trim().toUpperCase();
        
        if (!tarefaFinal || !acao || !dataInicio) {
            alert("Os campos Tarefa (Descrição), Ação e Data da inclusão são obrigatórios."); // Alterado para alert simples ou use toast se preferir
            return;
        }
        setLoading(true);

        const formData = {
            tarefa: tarefaFinal,
            prioridade,
            area,
            acao,
            dataInicio,
            orientacao: orientacao.trim()
        };
        
        // Passa o ID se for edição
        await onSave(formData, novosAnexos, tarefaExistente ? tarefaExistente.id : null);
        
        setLoading(false);
        onClose();
    };

    const acoesDisponiveis = acoesPermitidas 
        ? (listasAuxiliares.acoes || []).filter(a => acoesPermitidas.includes(a)) 
        : (listasAuxiliares.acoes || []);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={titulo || (tarefaExistente ? "Editar Tarefa Pendente" : "Criar Nova Tarefa Pendente")} width="max-w-3xl">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="tarefaDescricaoPendente" className="block text-sm font-medium text-gray-700">Tarefa (Descrição) <span className="text-red-500">*</span></label>
                    {/* Se tiver tarefaFixa E NÃO for edição, trava o campo. Se for edição, libera para corrigir se necessário */}
                    {tarefaFixa && !tarefaExistente ? (
                        <input
                            type="text"
                            value={tarefaFixa}
                            disabled
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm py-2 px-3 bg-gray-200 cursor-not-allowed"
                        />
                    ) : (
                        <select
                            id="tarefaDescricaoPendente"
                            value={tarefa}
                            onChange={(e) => setTarefa(e.target.value)}
                            required
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500"
                        >
                            <option value="">Selecione uma Tarefa...</option>
                            {(listasAuxiliares.tarefas || []).map(t => (<option key={t} value={t}>{t}</option>))}
                        </select>
                    )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="tarefaAcaoPendente" className="block text-sm font-medium text-gray-700">Ação <span className="text-red-500">*</span></label>
                        <select
                            id="tarefaAcaoPendente"
                            value={acao}
                            onChange={(e) => setAcao(e.target.value)}
                            required
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500"
                        >
                            <option value="">Selecione uma Ação...</option>
                            {acoesDisponiveis.map(ac => (<option key={ac} value={ac}>{ac}</option>))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="tarefaDataInicioPendente" className="block text-sm font-medium text-gray-700">Data da inclusão da tarefa <span className="text-red-500">*</span></label>
                        <input 
                            id="tarefaDataInicioPendente" 
                            type="date" 
                            value={dataInicio} 
                            onChange={(e) => setDataInicio(e.target.value)} // Agora permite edição da data
                            required 
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500"
                        />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="tarefaPrioridadePendente" className="block text-sm font-medium text-gray-700">Prioridade</label>
                        <select id="tarefaPrioridadePendente" value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500">
                            <option value="">Selecione se aplicável...</option>
                            {(listasAuxiliares.prioridades || []).map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="tarefaAreaPendente" className="block text-sm font-medium text-gray-700">Área</label>
                        <select id="tarefaAreaPendente" value={area} onChange={(e) => setArea(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500">
                            <option value="">Selecione se aplicável...</option>
                            {(listasAuxiliares.areas || []).map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
                </div>
                <div>
                    <label htmlFor="tarefaOrientacaoPendente" className="block text-sm font-medium text-gray-700">Observação/Orientação</label>
                    <textarea id="tarefaOrientacaoPendente" value={orientacao} onChange={(e) => setOrientacao(e.target.value)} rows="3" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500"></textarea>
                </div>
                <div className="pt-4 border-t">
                    <h4 className="text-md font-semibold text-gray-700 mb-2">Anexos</h4>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Adicionar Imagens</label>
                        <input type="file" multiple accept="image/*" onChange={handleFileChange} className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-yellow-50 file:text-yellow-700 hover:file:bg-yellow-100"/>
                    </div>
                    {novosAnexos.length > 0 && (
                        <div className="mt-2">
                            <p className="text-sm font-medium text-gray-600 mb-2">Imagens para Enviar:</p>
                            <div className="flex flex-wrap gap-2">
                                {novosAnexos.map((file, index) => (
                                    <div key={index} className="relative group">
                                        <img src={URL.createObjectURL(file)} alt={file.name} className="w-20 h-20 object-cover rounded-md"/>
                                        <button type="button" onClick={() => handleRemoveNovoAnexo(file.name)} className="absolute top-0 right-0 -mt-1 -mr-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity" title="Remover"><LucideX size={14} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="pt-4 flex justify-end space-x-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancelar</button>
                    <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-yellow-500 rounded-md hover:bg-yellow-600 disabled:bg-gray-400">
                        {loading ? 'Salvando...' : (tarefaExistente ? 'Atualizar Tarefa' : 'Criar Tarefa Pendente')}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

// Versão Atualizada: Com Edição e Exclusão
const TarefaPatioComponent = () => {
    const { userId, db, appId, listasAuxiliares, auth, storage } = useContext(GlobalContext);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTarefa, setEditingTarefa] = useState(null); // Estado para controlar edição
    
    const [tarefasPendentes, setTarefasPendentes] = useState([]);
    const [loadingList, setLoadingList] = useState(true);

    const basePath = `/artifacts/${appId}/public/data`;
    const tarefasMapaCollectionRef = collection(db, `${basePath}/tarefas_mapa`);

    useEffect(() => {
        setLoadingList(true);
        // Busca tarefas que estão aguardando alocação
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

    // Abre modal para criação (limpa estado de edição)
    const handleOpenModal = () => {
        setEditingTarefa(null);
        setIsModalOpen(true);
    };

    // Abre modal para edição
    const handleEditTarefa = (tarefa) => {
        setEditingTarefa(tarefa);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingTarefa(null);
    };

    const handlePrintTarefas = (tarefasParaImprimir) => {
        if (!tarefasParaImprimir || tarefasParaImprimir.length === 0) {
            toast.info("Não há tarefas pendentes para imprimir.");
            return;
        }

        const tarefasHtml = tarefasParaImprimir.map(tarefa => `
            <div class="quadro-tarefa">
                <div class="detalhes-grid">
                    <p><strong>Tarefa:</strong> ${tarefa.tarefa || 'N/A'}</p>
                    <p><strong>Prioridade:</strong> ${tarefa.prioridade || 'N/A'}</p>
                    <p><strong>Área:</strong> ${tarefa.area || 'N/A'}</p>
                    <p><strong>Ação:</strong> ${tarefa.acao || 'N/A'}</p>
                    <p><strong>Data de Criação:</strong> ${formatDate(tarefa.createdAt)}</p>
                    <p><strong>Criado por:</strong> ${tarefa.criadoPorEmail || 'N/A'}</p>
                </div>
                <div class="orientacao">
                    <strong>Orientação / Observação:</strong>
                    <p class="orientacao-texto">${tarefa.orientacao || 'Nenhuma'}</p>
                </div>
            </div>
        `).join('');

        const htmlContent = `
            <html>
            <head>
                <title>Lista de Tarefas Pendentes</title>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');
                    body {
                        font-family: 'Roboto', sans-serif;
                        margin: 20px;
                        color: #333;
                        font-size: 10pt;
                    }
                    .cabecalho {
                        text-align: center;
                        border-bottom: 1px solid #ccc;
                        padding-bottom: 10px;
                        margin-bottom: 25px;
                    }
                    .cabecalho img {
                        max-height: 45px;
                        margin-bottom: 10px;
                    }
                    .cabecalho h1 {
                        font-size: 1.4em;
                        margin: 0;
                        color: #000;
                        font-weight: 700;
                    }
                    .quadro-tarefa {
                        border: 1px solid #ccc;
                        border-radius: 8px;
                        padding: 15px;
                        margin-bottom: 15px;
                        page-break-inside: avoid;
                    }
                    .quadro-tarefa:last-child {
                        margin-bottom: 0;
                    }
                    .detalhes-grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 8px 20px;
                        margin-bottom: 15px;
                    }
                    .detalhes-grid p {
                        margin: 0;
                        line-height: 1.4;
                    }
                    .detalhes-grid p strong {
                        font-weight: 700;
                        color: #000;
                        margin-right: 8px;
                    }
                    .orientacao strong {
                        display: block;
                        font-weight: 700;
                        color: #000;
                        margin-bottom: 5px;
                    }
                    .orientacao-texto {
                        white-space: pre-wrap;
                        border-top: 1px solid #eee;
                        padding-top: 8px;
                        margin-top: 8px;
                        line-height: 1.4;
                    }
                    @media print {
                        body {
                            margin: 0;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="cabecalho">
                    ${LOGO_URL ? `<img src="${LOGO_URL}" alt="Logo">` : ''}
                    <h1>ORDENS DE SERVIÇO PENDENTES</h1>
                </div>
                ${tarefasHtml}
            </body>
            </html>
        `;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); }, 250);
    };

    // Função Unificada: Criar ou Editar
    const handleSaveTarefaPendente = async (formData, novosAnexos, tarefaId = null) => {
        const usuario = auth.currentUser;
        if (!usuario) {
            toast.error("Usuário não autenticado.");
            return;
        }

        // Determina ID: Se veio como argumento, usa ele. Se não, gera novo.
        const idParaSalvar = tarefaId || doc(tarefasMapaCollectionRef).id;
        const docRef = doc(db, `${basePath}/tarefas_mapa`, idParaSalvar);

        try {
            const urlsDosNovosAnexos = [];
            if (novosAnexos && novosAnexos.length > 0) {
                toast.loading('Enviando anexos...', { id: 'upload-toast-patio' });
                for (const anexo of novosAnexos) {
                    const caminhoStorage = `${basePath}/imagens_tarefas/${idParaSalvar}/${Date.now()}_${anexo.name}`;
                    const storageRef = ref(storage, caminhoStorage);
                    const uploadTask = await uploadBytesResumable(storageRef, anexo);
                    const downloadURL = await getDownloadURL(uploadTask.ref);
                    urlsDosNovosAnexos.push(downloadURL);
                }
                toast.dismiss('upload-toast-patio');
            }
            
            const dataInicioTimestamp = Timestamp.fromDate(new Date(formData.dataInicio + "T00:00:00Z"));

            // Prepara dados comuns
            const dadosBase = {
                tarefa: formData.tarefa,
                prioridade: formData.prioridade || "",
                area: formData.area || "",
                acao: formData.acao,
                dataInicio: dataInicioTimestamp,
                dataProvavelTermino: dataInicioTimestamp,
                orientacao: formData.orientacao,
                updatedAt: Timestamp.now(),
            };

            if (tarefaId) {
                // UPDATE: Mantém dados originais que não mudam e adiciona novos anexos aos existentes
                const tarefaOriginal = tarefasPendentes.find(t => t.id === tarefaId);
                const imagensExistentes = tarefaOriginal?.imagens || [];
                
                await updateDoc(docRef, {
                    ...dadosBase,
                    imagens: [...imagensExistentes, ...urlsDosNovosAnexos]
                });

                await logAlteracaoTarefa(
                    db,
                    basePath,
                    tarefaId,
                    usuario.uid,
                    usuario.email,
                    "Tarefa Editada (Pátio)",
                    `Tarefa "${formData.tarefa}" atualizada via Tarefa Pátio.`
                );
                toast.success("Tarefa atualizada com sucesso!");

            } else {
                // CREATE: Dados completos de criação
                const novaTarefaData = {
                    ...dadosBase,
                    status: "AGUARDANDO ALOCAÇÃO",
                    responsaveis: [],
                    turno: "",
                    criadoPor: usuario.uid,
                    criadoPorEmail: usuario.email,
                    createdAt: Timestamp.now(),
                    origem: "Tarefa Pátio",
                    imagens: urlsDosNovosAnexos,
                };
                
                await setDoc(docRef, novaTarefaData);

                await logAlteracaoTarefa(
                    db,
                    basePath,
                    idParaSalvar,
                    usuario.uid,
                    usuario.email,
                    "Tarefa Criada (Pátio)",
                    `Tarefa "${formData.tarefa}" criada via Tarefa Pátio.`
                );
                toast.success("Nova tarefa criada com sucesso!");
            }

            handleCloseModal();

        } catch (error) {
            console.error("Erro ao salvar tarefa do pátio: ", error);
            toast.error("Erro ao salvar tarefa do pátio: " + error.message);
            toast.dismiss('upload-toast-patio');
        }
    };

    const handleDeleteTarefa = async (tarefaId) => {
        if (!window.confirm("Tem certeza que deseja EXCLUIR esta tarefa? Esta ação não pode ser desfeita.")) {
            return;
        }

        const usuario = auth.currentUser;
        try {
            // Tenta excluir imagens do Storage se houver (opcional, mas boa prática)
            const tarefaParaExcluir = tarefasPendentes.find(t => t.id === tarefaId);
            if (tarefaParaExcluir?.imagens?.length > 0) {
                 for (const url of tarefaParaExcluir.imagens) {
                    try {
                        const imageRef = ref(storage, url);
                        await deleteObject(imageRef);
                    } catch (e) {
                        console.warn("Imagem já não existia ou erro ao excluir:", e);
                    }
                }
            }

            // Exclui do Firestore
            await deleteDoc(doc(db, `${basePath}/tarefas_mapa`, tarefaId));

             await logAlteracaoTarefa(
                db,
                basePath,
                tarefaId, // ID será apenas referência no log histórico global se existir, mas o doc da tarefa some
                usuario?.uid,
                usuario?.email,
                "Tarefa Excluída (Pátio)",
                `Tarefa Pátio excluída.`
            );

            toast.success("Tarefa excluída com sucesso!");

        } catch (error) {
            console.error("Erro ao excluir tarefa:", error);
            toast.error("Erro ao excluir a tarefa.");
        }
    };

    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-full">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold text-gray-800">Tarefa Pátio</h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => handlePrintTarefas(tarefasPendentes)}
                        disabled={tarefasPendentes.length === 0}
                        className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md flex items-center shadow-sm disabled:bg-gray-400 disabled:cursor-not-allowed"
                        title="Imprimir todas as tarefas pendentes"
                    >
                        <LucidePrinter size={20} className="mr-2"/> Imprimir Todas
                    </button>
                    <button
                        onClick={handleOpenModal}
                        className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-md flex items-center shadow-sm"
                    >
                        <LucidePlusCircle size={20} className="mr-2"/> Adicionar Tarefa do Pátio
                    </button>
                </div>
            </div>

            <div className="text-center p-5 bg-white shadow rounded-md">
                <p className="text-gray-600">
                    Utilize o botão "Adicionar Tarefa do Pátio" para registrar rapidamente uma nova demanda
                    que será incluída no Mapa de Atividades para posterior alocação e programação.
                </p>
            </div>

            <div className="mt-8">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">
                    <LucideListTodo size={22} className="inline-block mr-2 text-orange-500" />
                    Tarefas Atualmente Pendentes de Alocação
                </h3>
                <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100">
                            <tr>
                                {/* Adicionada coluna "Ações" e removida coluna exclusiva "Imprimir" que foi unificada */}
                                {["Tarefa", "Prioridade", "Área", "Ação", "Data Criação", "Orientação", "Ações"].map(header => (
                                    <th key={header} scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider whitespace-nowrap">{header}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loadingList ? (
                                <tr><td colSpan="7" className="text-center p-4">Carregando tarefas pendentes...</td></tr>
                            ) : tarefasPendentes.length === 0 ? (
                                <tr><td colSpan="7" className="text-center p-4 text-gray-500">Nenhuma tarefa pendente no momento.</td></tr>
                            ) : (
                                tarefasPendentes.map(tp => (
                                    <tr key={tp.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm text-gray-800 max-w-xs whitespace-normal break-words">{tp.tarefa}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{tp.prioridade || '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{tp.area || '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{tp.acao || '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{tp.createdAt ? formatDate(tp.createdAt) : '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700 max-w-xs whitespace-normal break-words">{tp.orientacao || '-'}</td>
                                        <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">
                                            <div className="flex items-center space-x-2">
                                                <button 
                                                    onClick={() => handlePrintTarefas([tp])}
                                                    className="text-gray-500 hover:text-blue-600 p-1 rounded-full hover:bg-blue-100"
                                                    title="Imprimir"
                                                >
                                                    <LucidePrinter size={18} />
                                                </button>
                                                <button 
                                                    onClick={() => handleEditTarefa(tp)}
                                                    className="text-blue-500 hover:text-blue-700 p-1 rounded-full hover:bg-blue-100"
                                                    title="Editar"
                                                >
                                                    <LucideEdit size={18} />
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteTarefa(tp.id)}
                                                    className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100"
                                                    title="Excluir"
                                                >
                                                    <LucideTrash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <TarefaPendenteFormModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                onSave={handleSaveTarefaPendente}
                listasAuxiliares={listasAuxiliares}
                titulo={editingTarefa ? "Editar Tarefa Pátio" : "Criar Nova Tarefa do Pátio"}
                tarefaExistente={editingTarefa} // Passa o objeto se estiver editando
            />
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


// Versão: 7.7.2
// [ALTERADO] O botão "Registrar Conclusão" (ícone de prancheta) foi temporariamente desabilitado (comentado) no modal de gerenciamento de tarefas da programação, conforme solicitado.
// [ALTERADO] O botão "Remover desta célula" (ícone de X) também foi temporariamente desabilitado (comentado), conforme solicitado.
const GerenciarTarefaProgramacaoModal = ({ isOpen, onClose, diaFormatado, responsavelId, tarefasDaCelula, semanaId, onAlteracaoSalva }) => {
    const { db, appId, funcionarios, listasAuxiliares, auth: authGlobal } = useContext(GlobalContext);
    const [tarefasEditaveis, setTarefasEditaveis] = useState([]);
    const [loading, setLoading] = useState(false);
    const [dadosCompletosTarefas, setDadosCompletosTarefas] = useState({});
    const [isConclusaoModalOpen, setIsConclusaoModalOpen] = useState(false);
    const [tarefaParaConcluir, setTarefaParaConcluir] = useState(null);
    const [tarefaIndexParaConcluir, setTarefaIndexParaConcluir] = useState(null);
    const [anotacoesPorTarefa, setAnotacoesPorTarefa] = useState({});

    useEffect(() => {
        if (isOpen && tarefasDaCelula && tarefasDaCelula.length > 0) {
            const tarefasCopiadas = JSON.parse(JSON.stringify(tarefasDaCelula.map(t => ({
                ...t,
                turno: t.turno || TURNO_DIA_INTEIRO,
                conclusao: t.conclusao || ''
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
    
    useEffect(() => {
        if (isOpen && tarefasDaCelula && tarefasDaCelula.length > 0) {
            const unsubscribers = [];
            setAnotacoesPorTarefa({}); 

            tarefasDaCelula.forEach(tarefa => {
                if (tarefa.mapaTaskId) {
                    const basePath = `/artifacts/${appId}/public/data`;
                    const anotacoesRef = collection(db, `${basePath}/tarefas_mapa/${tarefa.mapaTaskId}/anotacoes`);
                    const q = query(anotacoesRef, orderBy("criadoEm", "desc"));

                    const unsubscribe = onSnapshot(q, (snapshot) => {
                        const fetchedAnotacoes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        setAnotacoesPorTarefa(prev => ({
                            ...prev,
                            [tarefa.mapaTaskId]: fetchedAnotacoes
                        }));
                    }, (error) => {
                         console.error(`Erro ao carregar anotações para a tarefa ${tarefa.mapaTaskId}:`, error);
                    });
                    unsubscribers.push(unsubscribe);
                }
            });

            return () => {
                unsubscribers.forEach(unsub => unsub());
            };
        }
    }, [tarefasDaCelula, isOpen, db, appId]);

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
                        const notasDaTarefa = anotacoesPorTarefa[tarefa.mapaTaskId] || [];

                        return (
                            <div key={tarefa.mapaTaskId || index} className={`p-3 rounded-md shadow-sm border ${isConcluida ? 'border-green-300 bg-green-50' : 'border-blue-300 bg-blue-50'}`}>
                                <div className="flex justify-between items-start">
                                    <div className="flex-grow pr-2">
                                        <span className={`font-semibold text-sm ${isConcluida ? 'line-through text-gray-600' : 'text-gray-800'}`}>
                                            {tarefa.textoVisivel}
                                        </span>
                                        {tarefa.conclusao && (
                                            <p className="text-xs text-gray-600 mt-1 pl-1 border-l-2 border-gray-400">
                                                <strong>Conclusão do dia:</strong> {tarefa.conclusao}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex space-x-2 items-center">
                                        {/* Botão de Registrar Conclusão desabilitado temporariamente
                                         <button
                                            onClick={() => handleOpenConclusaoModal(tarefa, index)}
                                            title="Registrar Conclusão"
                                            className="p-1.5 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
                                        >
                                            <LucideClipboardEdit size={16} />
                                        </button>
                                        */}
                                        {/* Botão de Remover da Célula desabilitado temporariamente
                                        <button
                                            onClick={() => handleRemoverTarefaDaCelula(index)}
                                            title="Remover desta célula"
                                            className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                        >
                                            <LucideXCircle size={16} />
                                        </button>
                                        */}
                                    </div>
                                </div>
                                
                                <div className="mt-2 pt-2 border-t border-gray-300 grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        {tarefa.orientacao && (
                                            <div className="mb-2">
                                                <strong className="block font-medium text-gray-800 text-sm mb-1">Orientação:</strong>
                                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{tarefa.orientacao}</p>
                                            </div>
                                        )}
                                        <div className="pt-2 border-t border-gray-200">
                                            <strong className="block font-medium text-gray-800 text-sm mb-1">Anotações:</strong>
                                            {notasDaTarefa.length > 0 ? (
                                                <div className="space-y-1.5 max-h-24 overflow-y-auto bg-gray-50 p-2 rounded">
                                                    {notasDaTarefa.map(anotacao => (
                                                        <div key={anotacao.id} className="text-xs p-1.5 bg-white border-l-2 border-gray-400">
                                                            <p className="whitespace-pre-wrap">{anotacao.texto}</p>
                                                            <p className="text-right text-gray-500 mt-1">
                                                                - {anotacao.criadoPorEmail.split('@')[0]} em {formatDateTime(anotacao.criadoEm)}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-gray-500 italic">Nenhuma anotação.</p>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-2">
                                        <div>
                                            <label htmlFor={`turno-tarefa-${index}`} className="block text-xs font-medium text-gray-600 mb-0.5">Turno:</label>
                                            <select id={`turno-tarefa-${index}`} value={tarefa.turno || TURNO_DIA_INTEIRO} onChange={(e) => handleTurnoChange(index, e.target.value)} className="block w-full p-1.5 text-xs border-gray-300 rounded-md shadow-sm">
                                                {listasAuxiliares.turnos.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
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


// Versão: 8.0.1
// [CORRIGIDO] Corrigido o erro "forEach is not a function" que ocorria ao gerar o relatório por período.
const RelatorioSemanal = () => {
    const { db, appId, funcionarios: contextFuncionarios } = useContext(GlobalContext);
    const [dadosRelatorio, setDadosRelatorio] = useState(null);
    const [loadingReport, setLoadingReport] = useState(false);
    const [showReport, setShowReport] = useState(false);
    const [anotacoesDasTarefas, setAnotacoesDasTarefas] = useState({});
    
    const [filtroDataInicio, setFiltroDataInicio] = useState('');
    const [filtroDataFim, setFiltroDataFim] = useState('');

    const basePath = `/artifacts/${appId}/public/data`;

    const formatDateForDisplay = (isoDate) => {
        if (!isoDate) return 'N/A';
        const [year, month, day] = isoDate.split('-');
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    };
    
    const formatHeaderDate = (isoDate) => {
        if (!isoDate) return 'Data inválida';
        const [year, month, day] = isoDate.split('-');
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
    };

    const handleGerarRelatorio = async () => {
        if (!filtroDataInicio) {
            toast.error("Por favor, selecione pelo menos a data de início.");
            return;
        }
        setLoadingReport(true);
        setShowReport(false);
        setAnotacoesDasTarefas({});

        try {
            const programacaoCollectionRef = collection(db, `${basePath}/programacao_semanal`);
            const semanasSnap = await getDocs(programacaoCollectionRef);
            
            let todosOsDias = {};
            semanasSnap.forEach(doc => {
                const diasDaSemana = doc.data().dias || {};
                Object.assign(todosOsDias, diasDaSemana);
            });

            let dataCorrente = new Date(filtroDataInicio + "T12:00:00Z");
            const dataFinal = filtroDataFim ? new Date(filtroDataFim + "T12:00:00Z") : new Date(dataCorrente);

            if (dataFinal < dataCorrente) {
                 toast.error("A data final não pode ser anterior à data inicial.");
                 setLoadingReport(false);
                 return;
            }
            
            const diasFiltrados = {};
            const taskIds = new Set();
            
            while(dataCorrente <= dataFinal) {
                const isoDate = dataCorrente.toISOString().split('T')[0];
                if(todosOsDias[isoDate]) {
                    diasFiltrados[isoDate] = todosOsDias[isoDate];
                    // [CORRIGIDO] Lógica de iteração para coletar os IDs das tarefas.
                    Object.values(todosOsDias[isoDate]).forEach(tarefasDoResponsavel => {
                        tarefasDoResponsavel.forEach(tarefa => {
                            if (tarefa.mapaTaskId) {
                                taskIds.add(tarefa.mapaTaskId);
                            }
                        });
                    });
                }
                dataCorrente.setUTCDate(dataCorrente.getUTCDate() + 1);
            }

            const anotacoesMap = {};
            const promises = Array.from(taskIds).map(async (taskId) => {
                const anotacoesRef = collection(db, `${basePath}/tarefas_mapa/${taskId}/anotacoes`);
                const q = query(anotacoesRef, orderBy("criadoEm", "asc"));
                const anotacoesSnap = await getDocs(q);
                anotacoesMap[taskId] = anotacoesSnap.docs.map(doc => doc.data());
            });
            await Promise.all(promises);
            
            setAnotacoesDasTarefas(anotacoesMap);
            setDadosRelatorio(diasFiltrados);
            setShowReport(true);
            if(Object.keys(diasFiltrados).length === 0){
                toast.error("Nenhuma atividade programada encontrada para o período selecionado.");
            }

        } catch (error) {
            console.error("Erro ao gerar relatório:", error);
            toast.error("Falha ao gerar o relatório: " + error.message);
        }
        setLoadingReport(false);
    };

    const handlePrint = () => { /* ... (função de impressão permanece a mesma) ... */ };
    
    const getStatusClass = (status) => {
        if (status === "CONCLUÍDA") return 'font-bold text-green-700';
        if (status === "CANCELADA") return 'font-bold text-red-700';
        if (status === "EM OPERAÇÃO") return 'font-bold text-cyan-700';
        return 'font-bold text-gray-700';
    }

    return (
        <div>
            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">Relatório de Programação por Período</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 items-end">
                     <div>
                        <label htmlFor="filtroDataInicio" className="block text-sm font-medium text-gray-700">Início do Período</label>
                        <input type="date" id="filtroDataInicio" value={filtroDataInicio} onChange={e => setFiltroDataInicio(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm p-2" />
                    </div>
                    <div>
                        <label htmlFor="filtroDataFim" className="block text-sm font-medium text-gray-700">Fim do Período (Opcional)</label>
                        <input type="date" id="filtroDataFim" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm p-2" />
                    </div>
                     <div>
                        <button onClick={handleGerarRelatorio} disabled={loadingReport} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-md flex items-center justify-center disabled:bg-gray-400">
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
                            <h1 className="text-2xl font-semibold text-gray-800">Relatório de Programação</h1>
                            <p className="text-sm text-gray-600">
                                Período de {formatDateForDisplay(filtroDataInicio)} a {formatDateForDisplay(filtroDataFim || filtroDataInicio)}
                            </p>
                        </div>
                        <div className="overflow-x-auto mt-4">
                            {Object.keys(dadosRelatorio).sort().map(isoDate => {
                                const diaData = dadosRelatorio[isoDate];
                                const temTarefaNoDia = Object.values(diaData).some(resp => Object.values(resp).flat().length > 0);
                                if (!temTarefaNoDia) return null;

                                return (
                                    <div key={isoDate} className="mb-6">
                                        <h4 className="text-lg font-bold bg-gray-200 p-2 rounded-t-md">{formatHeaderDate(isoDate)}</h4>
                                        <table className="min-w-full divide-y divide-gray-200 border">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[15%]">Responsável</th>
                                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[15%]">Localização</th>
                                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[45%]">Atividade</th>
                                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[25%]">Conclusão do Dia</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {contextFuncionarios.flatMap(func => {
                                                    const tarefas = diaData[func.id] || [];
                                                    if (tarefas.length === 0) return [];

                                                    return tarefas.map((t, index) => (
                                                        <tr key={`${func.id}-${t.mapaTaskId || index}`}>
                                                            {index === 0 && (
                                                                <td className="px-3 py-2 align-top" rowSpan={tarefas.length}>
                                                                    {func.nome}
                                                                </td>
                                                            )}
                                                            <td className="px-3 py-2 align-top">{t.localizacao || '-'}</td>
                                                            <td className="px-3 py-2 align-top">
                                                                <div className="task-block">
                                                                    <strong>{t.textoVisivel}</strong>
                                                                    {t.orientacao && <p className="text-sm italic text-gray-600 mt-1">{t.orientacao}</p>}
                                                                </div>
                                                                <div className="notes-block">
                                                                    <strong className="text-xs">Anotações Históricas:</strong>
                                                                    {(anotacoesDasTarefas[t.mapaTaskId] && anotacoesDasTarefas[t.mapaTaskId].length > 0) ? (
                                                                        <ul className="text-xs text-gray-700 mt-1 list-disc pl-4">
                                                                            {anotacoesDasTarefas[t.mapaTaskId].map((nota, idx) => (
                                                                                <li key={idx} className="mb-1">
                                                                                   {nota.texto} <span className="text-gray-400">({formatDateTime(nota.criadoEm)})</span>
                                                                                </li>
                                                                            ))}
                                                                        </ul>
                                                                    ) : <p className="text-xs text-gray-500 italic">Nenhuma.</p>}
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-2 align-top">
                                                                <div className="conclusion-block">
                                                                    <strong className={getStatusClass(t.statusLocal)}>
                                                                        {`[${t.statusLocal || 'PENDENTE'}]`}
                                                                    </strong>
                                                                    <p className="text-sm text-gray-800 pt-1">
                                                                        {t.conclusao || <span className="italic-placeholder">Aguardando registro...</span>}
                                                                    </p>
                                                                </div>
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

// Versão: 13.3.0
// [MELHORIA] Rótulo da anotação alterado para "Última Anotação da Tarefa" para maior clareza.
// [ALTERADO] A função de salvar agora passa o estado original das tarefas para permitir a detecção de exclusões.
const RegistroDiarioModal = ({ isOpen, onClose, onSave, tarefasDoDia, funcionarios, dia }) => {
    const { listasAuxiliares } = useContext(GlobalContext);
    const [tarefasEditaveis, setTarefasEditaveis] = useState([]);
    const [loading, setLoading] = useState(false);

    const statusPermitidos = useMemo(() => {
        return (listasAuxiliares.status || []).filter(s => s !== 'AGUARDANDO ALOCAÇÃO');
    }, [listasAuxiliares.status]);

    useEffect(() => {
        if (isOpen && tarefasDoDia) {
            const tarefasComResponsavel = tarefasDoDia.map(tarefa => {
                const responsavel = funcionarios.find(f => f.id === tarefa.responsavelId);
                
                let statusLocalInicial = tarefa.statusLocal || 'PROGRAMADA';
                if (statusLocalInicial === 'PENDENTE') {
                    statusLocalInicial = 'PROGRAMADA';
                }

                return {
                    ...tarefa,
                    responsavelNome: responsavel ? responsavel.nome : 'Desconhecido',
                    statusLocal: statusLocalInicial,
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
            // Passa tanto o estado editado quanto o original (via prop 'tarefasDoDia')
            await onSave(tarefasEditaveis, tarefasDoDia);
            toast.success("Alterações salvas com sucesso!");
        } catch (error) {
            console.error("Erro ao salvar registros do dia:", error);
            toast.error("Falha ao salvar as alterações.");
        } finally {
            setLoading(false);
            onClose();
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
                                                {tarefa.orientacao && (
                                                    <p className="text-sm text-gray-600 italic mt-2 pl-2 border-l-2 border-gray-300">
                                                        {tarefa.orientacao}
                                                    </p>
                                                )}
                                            </div>
                                            {/* Bloco da última anotação */}
                                            {tarefa.ultimaAnotacaoTexto && (
                                                <div className="mt-3 p-2 bg-yellow-50 rounded-md border-l-2 border-yellow-400">
                                                    <label className="text-xs font-bold text-gray-500 uppercase">ÚLTIMA ANOTAÇÃO DA TAREFA</label>
                                                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{tarefa.ultimaAnotacaoTexto}</p>
                                                    <p className="text-xs text-right text-gray-500 mt-1">
                                                        {formatDateTime(tarefa.ultimaAnotacaoTimestamp)}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Coluna 2: Conclusão e Status */}
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-xs font-bold text-gray-500 uppercase">Conclusão / Justificativa (Anotação)</label>
                                                <input
                                                    type="text"
                                                    value={tarefa.conclusao || ''}
                                                    onChange={(e) => handleConclusaoChange(index, e.target.value)}
                                                    className="w-full border-gray-300 rounded-md shadow-sm text-sm p-2 mt-1"
                                                    placeholder="Ex: OK, Pendente, etc. (será salvo como anotação)"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-gray-500 uppercase">Status no Dia</label>
                                                <select
                                                    value={tarefa.statusLocal || 'PROGRAMADA'}
                                                    onChange={(e) => handleStatusChange(index, e.target.value)}
                                                    className="w-full border-gray-300 rounded-md shadow-sm text-sm p-2 mt-1"
                                                >
                                                    {statusPermitidos.map(s => (
                                                        <option key={s} value={s}>{s}</option>
                                                    ))}
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


// Versão: 3.2.1
// [ALTERADO] O nome da aba "Relatório Semanal" foi alterado para "Relatório por Período".
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
                        Relatório por Período
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


// Versão: 10.1.2
// [ALTERADO] A lista de seleção de responsáveis agora filtra e exibe apenas funcionários com status "ativo".
// [CORRIGIDO] O formulário de edição de um registro de aplicação agora é corretamente preenchido com os dados existentes.
// [MELHORIA] Ocultadas as opções de reagendamento e criação de tarefa no mapa ao editar um registro.
const RegistroAplicacaoModal = ({ isOpen, onClose, onSave, listasAuxiliares, funcionarios, planoParaRegistrar, registroExistente }) => {
    const [dataAplicacao, setDataAplicacao] = useState('');
    const [produto, setProduto] = useState('');
    const [dosagem, setDosagem] = useState('');
    const [areas, setAreas] = useState([]);
    const [responsavel, setResponsavel] = useState('');
    const [observacoes, setObservacoes] = useState('');
    const [plantaLocal, setPlantaLocal] = useState('');
    const [loading, setLoading] = useState(false);
    const [dadosOrigem, setDadosOrigem] = useState(null);
    const [criarTarefaNoMapa, setCriarTarefaNoMapa] = useState(true);
    const [reagendamento, setReagendamento] = useState('NENHUM');

    useEffect(() => {
        if (isOpen) {
            const hojeFormatado = new Date().toISOString().split('T')[0];

            if (registroExistente) {
                // [CORRIGIDO] Modo Edição agora preenche os campos do formulário
                setDataAplicacao(registroExistente.dataAplicacao ? new Date(registroExistente.dataAplicacao.seconds * 1000).toISOString().split('T')[0] : '');
                setProduto(registroExistente.produto || '');
                setDosagem(registroExistente.dosagem || '');
                setAreas(registroExistente.areas || []);
                setResponsavel(registroExistente.responsavel || '');
                setObservacoes(registroExistente.observacoes || '');
                setPlantaLocal(registroExistente.plantaLocal || '');
                setDadosOrigem({ planoId: registroExistente.planoId || null, planoNome: registroExistente.planoNome || null });
                setReagendamento('NENHUM'); // Reagendamento não é editável
                setCriarTarefaNoMapa(false); // Não cria nova tarefa ao editar
            } else if (planoParaRegistrar) {
                // Modo Baseado em Plano
                setCriarTarefaNoMapa(true);
                setDataAplicacao(hojeFormatado);
                setProduto(planoParaRegistrar.produto || '');
                setDadosOrigem({ planoId: planoParaRegistrar.id, planoNome: planoParaRegistrar.nome });
                const freqDoPlano = planoParaRegistrar.frequencia;
                setReagendamento(freqDoPlano === 'UNICA' ? 'NENHUM' : freqDoPlano || 'NENHUM');
                setDosagem(''); setAreas([]); setResponsavel(''); setObservacoes(''); setPlantaLocal('');
            } else {
                // Modo Manual
                setCriarTarefaNoMapa(true);
                setDataAplicacao(hojeFormatado);
                setProduto(''); setDosagem(''); setAreas([]); setResponsavel(''); setObservacoes('');
                setPlantaLocal(''); setDadosOrigem(null);
                setReagendamento('NENHUM');
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
            produto: produto.trim(), dosagem: dosagem.trim(), areas, responsavel,
            observacoes: observacoes.trim(), plantaLocal: plantaLocal.trim(),
            planoId: dadosOrigem?.planoId || null, planoNome: dadosOrigem?.planoNome || null,
        };
        
        await onSave(dadosRegistro, registroExistente, criarTarefaNoMapa, reagendamento);
        setLoading(false);
        onClose();
    };
    
    const getModalTitle = () => {
        if (registroExistente) return "Editar Registro de Aplicação";
        if (planoParaRegistrar) return `Registrar Aplicação: ${planoParaRegistrar.nome}`;
        return "Adicionar Registro Manual";
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={getModalTitle()}>
            <form onSubmit={handleSave} className="space-y-4">
                {/* Campos do formulário */}
                <div><label className="block text-sm font-medium text-gray-700">Data da Aplicação *</label><input type="date" value={dataAplicacao} onChange={e => setDataAplicacao(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"/></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium text-gray-700">Produto Aplicado *</label><input type="text" value={produto} onChange={e => setProduto(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3" /></div>
                    <div><label className="block text-sm font-medium text-gray-700">Dosagem</label><input type="text" value={dosagem} onChange={e => setDosagem(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3" /></div>
                </div>
                <div><label className="block text-sm font-medium text-gray-700">Planta / Local Específico</label><input type="text" value={plantaLocal} onChange={e => setPlantaLocal(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3" /></div>
                <div><label className="block text-sm font-medium text-gray-700">Área(s) Tratada(s) *</label><select multiple value={areas} onChange={e => setAreas(Array.from(e.target.selectedOptions, option => option.value))} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm h-32">{(listasAuxiliares.areas || []).map(a => <option key={a} value={a}>{a}</option>)}</select><p className="text-xs text-gray-500 mt-1">Segure Ctrl (ou Cmd) para selecionar múltiplos.</p></div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Responsável *</label>
                    <select value={responsavel} onChange={e => setResponsavel(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3">
                        <option value="">Selecione um funcionário...</option>
                        {/* [ALTERADO] Filtra a lista para exibir apenas funcionários com f.ativo === true */}
                        {funcionarios.filter(f => f.ativo).map(f => <option key={f.id} value={f.nome}>{f.nome}</option>)}
                    </select>
                </div>
                <div><label className="block text-sm font-medium text-gray-700">Observações</label><textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows="3" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm"></textarea></div>

                {/* Seção de Reagendamento e Criação de Tarefa (Oculta em modo de edição) */}
                {!registroExistente && (
                    <div className="pt-4 border-t grid grid-cols-1 md:grid-cols-2 gap-4">
                        {planoParaRegistrar && (
                            <div>
                                <label htmlFor="reagendamento" className="block text-sm font-medium text-gray-700">Agendar Próxima Aplicação</label>
                                <select id="reagendamento" value={reagendamento} disabled={true} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm py-2 px-3 bg-gray-100 cursor-not-allowed">
                                    <option value="NENHUM">Não reagendar</option>
                                    <option value="SEMANAL">Em 7 dias (Semanal)</option>
                                    <option value="QUINZENAL">Em 15 dias (Quinzenal)</option>
                                    <option value="MENSAL">Em 30 dias (Mensal)</option>
                                </select>
                            </div>
                        )}
                         <div className={!planoParaRegistrar ? 'md:col-span-2' : ''}>
                            <label className="block text-sm font-medium text-gray-700 opacity-0">Opção</label>
                            <label className="flex items-center cursor-pointer mt-1 bg-gray-50 p-2 rounded-md h-full">
                                <input type="checkbox" checked={criarTarefaNoMapa} onChange={(e) => setCriarTarefaNoMapa(e.target.checked)} className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                                <span className="ml-2 text-sm text-gray-700">Criar tarefa no Mapa</span>
                            </label>
                        </div>
                    </div>
                )}

                <div className="pt-4 flex justify-end space-x-2"><button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancelar</button><button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400">{loading ? 'Salvando...' : 'Salvar Registro'}</button></div>
            </form>
        </Modal>
    );
};

// Versão: 9.3.0
// [ALTERADO] A lista de "Ação da Tarefa" no modal de planos foi filtrada para exibir apenas as opções relevantes para o fitossanitário.
const PlanoAplicacaoModal = ({ isOpen, onClose, onSave, onRemove, planoExistente }) => {
    const { listasAuxiliares } = useContext(GlobalContext);
    const [nome, setNome] = useState('');
    const [produto, setProduto] = useState('');
    const [acao, setAcao] = useState('');
    const [frequencia, setFrequencia] = useState('UNICA');
    const [diasIntervalo, setDiasIntervalo] = useState(7);
    const [dataInicio, setDataInicio] = useState('');
    const [ativo, setAtivo] = useState(true);
    const [loading, setLoading] = useState(false);

    // Lista de ações permitidas para este modal específico
    const acoesPermitidas = ['MANUTENÇÃO | PREVENTIVA', 'MANUTENÇÃO | TRATAMENTO'];

    useEffect(() => {
        if (isOpen) {
            if (planoExistente) {
                setNome(planoExistente.nome || '');
                setProduto(planoExistente.produto || '');
                setAcao(planoExistente.acao || '');
                setFrequencia(planoExistente.frequencia || 'UNICA');
                setDiasIntervalo(planoExistente.diasIntervalo || 7);
                setDataInicio(planoExistente.dataInicio ? new Date(planoExistente.dataInicio.seconds * 1000).toISOString().split('T')[0] : '');
                setAtivo(planoExistente.ativo !== false);
            } else {
                setNome('');
                setProduto('');
                setAcao('');
                setFrequencia('UNICA');
                setDiasIntervalo(7);
                setDataInicio(new Date().toISOString().split('T')[0]);
                setAtivo(true);
            }
        }
    }, [planoExistente, isOpen]);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!nome || !produto || !dataInicio || !acao) {
            toast.error("Os campos Nome, Produto, Ação e Data de Início são obrigatórios.");
            return;
        }
        setLoading(true);
        const planoData = {
            ...(planoExistente && { id: planoExistente.id }),
            nome: nome.trim(),
            produto: produto.trim(),
            acao: acao,
            dosagemPadrao: '', 
            areas: [],       
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
        if (planoExistente && window.confirm(`Tem certeza que deseja excluir o plano "${planoExistente.nome}"?`)) {
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
                    <input type="text" value={nome} onChange={e => setNome(e.target.value)} required className="mt-1 block w-full border-gray-300 rounded-md" placeholder="Ex: Adubação de Crescimento" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Produto Principal *</label>
                        <input type="text" value={produto} onChange={e => setProduto(e.target.value)} required className="mt-1 block w-full border-gray-300 rounded-md" placeholder="Ex: Calda Bordalesa" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Ação da Tarefa *</label>
                        <select value={acao} onChange={(e) => setAcao(e.target.value)} required className="mt-1 block w-full border-gray-300 rounded-md">
                            <option value="">Selecione uma ação...</option>
                            {(listasAuxiliares.acoes || [])
                                .filter(a => acoesPermitidas.includes(a))
                                .map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
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

// Versão: 8.4.0
// [ALTERADO] O modal agora exibe todos os planos ativos disponíveis, em vez de apenas os pendentes.
const SelecionarPlanoModal = ({ isOpen, onClose, planosDisponiveis = [], onSelectPlano }) => {
    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Selecionar Plano de Aplicação" width="max-w-xl">
            <div className="space-y-3">
                <p className="text-sm text-gray-600">Selecione um plano base para registrar uma nova aplicação.</p>
                {planosDisponiveis.length === 0 ? (
                    <p className="text-center py-4 text-gray-500">Nenhum plano de aplicação ativo foi encontrado.</p>
                ) : (
                    <div className="max-h-80 overflow-y-auto space-y-2 pr-2">
                        {planosDisponiveis.map(plano => (
                            <button
                                key={plano.id}
                                onClick={() => onSelectPlano(plano)}
                                className="w-full text-left p-3 border rounded-md hover:bg-blue-50 hover:border-blue-300 transition-all"
                            >
                                <p className="font-semibold text-blue-800">{plano.nome}</p>
                                <p className="text-xs text-gray-700">Produto: {plano.produto}</p>
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

// Versão: 9.0.2
// [MELHORIA] Adicionado o tratamento para o novo status 'PREVISAO',
// para exibir corretamente as previsões futuras geradas pelo calendário.
const VisualizarAplicacaoModal = ({ isOpen, onClose, aplicacao }) => {
    if (!isOpen || !aplicacao) return null;

    const getStatusInfo = () => {
        switch (aplicacao.status) {
            case 'PREVISAO': // [NOVO]
                return { text: 'Previsão (Ainda não criada)', color: 'bg-yellow-100 text-yellow-800' };
            case 'Realizada':
                return { text: 'Realizada (Registro Histórico)', color: 'bg-green-100 text-green-800' };
            case 'PROGRAMADA':
                return { text: 'Programada', color: 'bg-blue-100 text-blue-800' };
            case 'EM OPERAÇÃO':
                return { text: 'Em Operação', color: 'bg-cyan-100 text-cyan-800' };
            case 'CONCLUÍDA':
                return { text: 'Concluída', color: 'bg-green-100 text-green-800' };
            case 'CANCELADA':
                 return { text: 'Cancelada', color: 'bg-red-100 text-red-800' };
            case 'PENDENTE_APROVACAO_FITO':
                return { text: 'Pendente de Aprovação', color: 'bg-yellow-100 text-yellow-800' };
            default:
                return { text: aplicacao.status, color: 'bg-gray-100 text-gray-800' };
        }
    };

    const statusInfo = getStatusInfo();

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Detalhes da Aplicação" width="max-w-2xl">
            <div className="space-y-4 p-2">
                <div className={`p-4 rounded-lg ${statusInfo.color}`}>
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-bold">{aplicacao.produto}</h3>
                        <span className={`px-3 py-1 text-sm font-semibold rounded-full ${statusInfo.color}`}>{statusInfo.text}</span>
                    </div>
                    <p className="text-sm mt-1">Data: <strong>{formatDate(aplicacao.data)}</strong></p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 pt-4">
                    <div>
                        <label className="text-sm font-semibold text-gray-600">Responsável</label>
                        <p className="text-base text-gray-900">{aplicacao.responsavel || 'Não definido'}</p>
                    </div>
                     <div>
                        <label className="text-sm font-semibold text-gray-600">Origem</label>
                        <p className="text-base text-gray-900">{aplicacao.origem || 'Não definida'}</p>
                    </div>
                    <div className="md:col-span-2">
                        <label className="text-sm font-semibold text-gray-600">Área(s)</label>
                        <p className="text-base text-gray-900">{aplicacao.areas ? aplicacao.areas.join(', ') : 'Não definida'}</p>
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-gray-600">Dosagem</label>
                        <p className="text-base text-gray-900">{aplicacao.dosagem || 'Não informada'}</p>
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-gray-600">Planta / Local Específico</label>
                        <p className="text-base text-gray-900">{aplicacao.plantaLocal || 'Não informado'}</p>
                    </div>
                    <div className="md:col-span-2">
                        <label className="text-sm font-semibold text-gray-600">Observações / Orientação</label>
                        <p className="text-base text-gray-900 whitespace-pre-wrap">{aplicacao.observacoes || 'Nenhuma'}</p>
                    </div>
                </div>

                <div className="pt-5 flex justify-end">
                    <button type="button" onClick={onClose} className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">
                        Fechar
                    </button>
                </div>
            </div>
        </Modal>
    );
};


// Versão: 9.1.0
// [NOVO] O componente agora busca os planos de aplicação ativos.
// [NOVO] Utiliza a função 'gerarProximasOcorrencias' para calcular e exibir previsões futuras (status 'PREVISAO') no calendário.
// [MELHORIA] Adicionado um helper de cor local ('getEventColor') para exibir visualmente o status 'PREVISAO'.
const CalendarioFitossanitarioComponent = () => {
    const { db, appId, funcionarios } = useContext(GlobalContext);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [registros, setRegistros] = useState([]);
    const [tarefasFito, setTarefasFito] = useState([]);
    const [planos, setPlanos] = useState([]); // [NOVO] Estado para os planos
    const [eventos, setEventos] = useState({});
    const [loading, setLoading] = useState(true);

    const [isVisualizarModalOpen, setIsVisualizarModalOpen] = useState(false);
    const [aplicacaoSelecionada, setAplicacaoSelecionada] = useState(null);
    
    const [viewMode, setViewMode] = useState('calendar');

    const basePath = `/artifacts/${appId}/public/data`;
    const registrosCollectionRef = collection(db, `${basePath}/controleFitossanitario`);
    const tarefasCollectionRef = collection(db, `${basePath}/tarefas_mapa`);
    const planosCollectionRef = collection(db, `${basePath}/planos_fitossanitarios`); // [NOVO]

    useEffect(() => {
        setLoading(true);
        const qRegistros = query(registrosCollectionRef);
        const unsubRegistros = onSnapshot(qRegistros, (snapshot) => {
            setRegistros(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, error => console.error("Erro ao carregar registros de aplicação:", error));

        const qTarefas = query(tarefasCollectionRef, 
            where("origem", "in", ["Controle Fitossanitário", "Registro Fito (App)", "Reagendamento Fito"]),
        );
        const unsubTarefas = onSnapshot(qTarefas, (snapshot) => {
            setTarefasFito(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, error => console.error("Erro ao carregar tarefas fito:", error));

        // [NOVO] Busca os planos ativos
        const qPlanos = query(planosCollectionRef, where("ativo", "==", true));
        const unsubPlanos = onSnapshot(qPlanos, (snapshot) => {
            setPlanos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, error => console.error("Erro ao carregar planos fito:", error));

        Promise.all([new Promise(res => setTimeout(res, 150)), new Promise(res => setTimeout(res, 150)), new Promise(res => setTimeout(res, 150))]).then(() => {
            setLoading(false);
        });

        return () => {
            unsubRegistros();
            unsubTarefas();
            unsubPlanos(); // [NOVO]
        };
    }, [db, appId]);

    useEffect(() => {
        if (loading) return;
        
        const todosOsEventos = {};
        const idsDeTarefasRenderizadas = new Set();
        const horizontePrevisaoEmDias = 90; // Horizonte de 90 dias para previsões

        // 1. Processa tarefas JÁ CRIADAS
        tarefasFito.forEach(tarefa => {
            if (!tarefa.dataInicio?.toDate) return;
            const dataString = tarefa.dataInicio.toDate().toISOString().split('T')[0];
            if (!todosOsEventos[dataString]) todosOsEventos[dataString] = [];
            todosOsEventos[dataString].push({
                id: tarefa.id, produto: tarefa.tarefa, data: tarefa.dataInicio, status: tarefa.status,
                origem: tarefa.origemPlanoId ? `Plano (${tarefa.origem})` : tarefa.origem,
                origemPlanoId: tarefa.origemPlanoId || null, // Guarda o ID do plano
                areas: [tarefa.area],
                responsavel: (tarefa.responsaveis || []).map(rId => funcionarios.find(f => f.id === rId)?.nome || rId).join(', '),
                observacoes: tarefa.orientacao,
             });
             idsDeTarefasRenderizadas.add(tarefa.id);
        });

        // 2. Processa registros históricos (que não viraram tarefas)
        registros.forEach(reg => {
            const tarefaCorrespondenteId = tarefasFito.find(t => t.origemRegistroId === reg.id)?.id;
            if (tarefaCorrespondenteId && idsDeTarefasRenderizadas.has(tarefaCorrespondenteId)) return;
            if (!reg.dataAplicacao?.toDate) return;
            const dataString = reg.dataAplicacao.toDate().toISOString().split('T')[0];
            if (!todosOsEventos[dataString]) todosOsEventos[dataString] = [];
            todosOsEventos[dataString].push({
                id: reg.id, produto: reg.produto, data: reg.dataAplicacao, status: 'Realizada',
                origem: reg.planoNome || 'Manual (Histórico)', origemPlanoId: reg.planoId || null,
                areas: reg.areas, responsavel: reg.responsavel,
                dosagem: reg.dosagem, plantaLocal: reg.plantaLocal, observacoes: reg.observacoes,
            });
        });

        // 3. [NOVO] Processa PREVISÕES FUTURAS
        planos.forEach(plano => {
            const ocorrencias = gerarProximasOcorrencias(plano, horizontePrevisaoEmDias, calcularProximaAplicacao);
            
            ocorrencias.forEach(ocorrencia => {
                const dataString = ocorrencia.dataPrevista.toISOString().split('T')[0];
                
                // Verifica se já não existe uma tarefa REAL para esta previsão
                const tarefaJaExiste = (todosOsEventos[dataString] || []).some(
                    evento => evento.origemPlanoId === ocorrencia.planoId && evento.status !== 'PREVISAO'
                );

                if (!tarefaJaExiste) {
                    if (!todosOsEventos[dataString]) todosOsEventos[dataString] = [];
                    
                    todosOsEventos[dataString].push({
                        id: `previsao-${ocorrencia.planoId}-${dataString}`,
                        produto: `PREVISÃO: ${ocorrencia.planoNome}`,
                        data: Timestamp.fromDate(ocorrencia.dataPrevista),
                        status: 'PREVISAO', // Status especial para diferenciar
                        origem: `Plano (${ocorrencia.planoNome})`,
                        origemPlanoId: ocorrencia.planoId,
                        areas: [],
                        responsavel: 'A definir',
                        observacoes: `Previsão gerada automaticamente do plano: ${ocorrencia.planoNome}.`,
                    });
                }
            });
        });

        setEventos(todosOsEventos);
    }, [registros, tarefasFito, planos, loading, funcionarios]); // Dependência 'planos' adicionada

    const handleOpenVisualizarModal = (aplicacao) => {
        setAplicacaoSelecionada(aplicacao);
        setIsVisualizarModalOpen(true);
    };
    
    const changePeriod = (offset) => {
        setCurrentDate(prevDate => {
            const newDate = new Date(prevDate);
            if (viewMode === 'calendar') {
                newDate.setMonth(newDate.getMonth() + offset);
            } else {
                newDate.setDate(newDate.getDate() + (7 * offset));
            }
            return newDate;
        });
    };
    
    const getWeekInfo = (date) => {
        const start = new Date(date);
        start.setUTCHours(0, 0, 0, 0);
        const day = start.getUTCDay();
        const diff = day === 0 ? -6 : 1 - day;
        start.setUTCDate(start.getUTCDate() + diff);
        const end = new Date(start);
        end.setUTCDate(start.getUTCDate() + 5);
        return { start, end };
    };

    const getPeriodLabel = () => {
        if (viewMode === 'kanban') {
            const { start, end } = getWeekInfo(currentDate);
            return `Semana de ${start.toLocaleDateString('pt-BR', {day: '2-digit', month: 'short', timeZone: 'UTC'})} a ${end.toLocaleDateString('pt-BR', {day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'})}`;
        }
        return currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
    };

    // [NOVO] Helper de cor local para incluir o status PREVISAO
    const getEventColor = (status) => {
        if (status === 'PREVISAO') return 'bg-yellow-200 text-yellow-900 border-yellow-400';
        if (status === 'Realizada' || status === 'CONCLUÍDA') return 'bg-green-200 text-green-900 border-green-400';
        if (status === 'CANCELADA') return 'bg-red-200 text-red-900 border-red-400';
        if (status === 'PROGRAMADA') return 'bg-blue-200 text-blue-900 border-blue-400';
        if (status === 'EM OPERAÇÃO') return 'bg-cyan-200 text-cyan-900 border-cyan-400';
        return 'bg-gray-200 text-gray-800 border-gray-400';
    };

    const renderCalendar = () => {
        const month = currentDate.getMonth();
        const year = currentDate.getFullYear();
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days = [];
        for (let i = 0; i < firstDayOfMonth; i++) {
            days.push(<div key={`empty-${i}`} className="border p-2 bg-gray-50"></div>);
        }
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayEvents = eventos[dateStr] || [];
            const isToday = new Date(year, month, day).toDateString() === new Date().toDateString();
            days.push(
                <div key={day} className={`border p-2 h-36 flex flex-col ${isToday ? 'bg-blue-50' : 'bg-white'}`}>
                    <strong className={`text-sm ${isToday ? 'text-blue-600 font-bold' : ''}`}>{day}</strong>
                    <div className="flex-grow overflow-y-auto mt-1 space-y-1 pr-1">
                        {dayEvents.map(event => (
                            <button
                                key={event.id}
                                onClick={() => handleOpenVisualizarModal(event)}
                                title={event.produto}
                                // [ALTERADO] Usa o helper de cor local
                                className={`w-full text-left text-xs p-1 rounded-md transition-all hover:ring-2 hover:ring-blue-400 border ${getEventColor(event.status)} ${event.status === 'CANCELADA' ? 'line-through opacity-70' : ''}`}
                            >
                                {event.produto}
                            </button>
                        ))}
                    </div>
                </div>
            );
        }
        return days;
    };
    
    const renderKanbanView = () => {
        const weekDaysColumns = [];
        const { start } = getWeekInfo(currentDate);
        const DIAS_DA_SEMANA = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
        for (let i = 0; i < 6; i++) {
            const dayDate = new Date(start);
            dayDate.setUTCDate(start.getUTCDate() + i);
            const dayString = dayDate.toISOString().split('T')[0];
            const dayEvents = eventos[dayString] || [];
            weekDaysColumns.push(
                <div key={i} className="bg-gray-200 rounded-lg p-3 flex flex-col h-full min-h-[60vh]">
                    <h3 className="font-bold text-gray-800 text-center mb-1">{DIAS_DA_SEMANA[i]}</h3>
                    <p className="text-xs text-gray-500 text-center mb-4">{dayDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })}</p>
                    <div className="space-y-3 overflow-y-auto flex-1">
                        {dayEvents.length > 0 ? (
                            dayEvents.map(event => (
                                <div 
                                    key={event.id}
                                    onClick={() => handleOpenVisualizarModal(event)}
                                    // [ALTERADO] Usa o helper de cor local
                                    className={`p-3 rounded-md shadow-sm text-black cursor-pointer hover:ring-2 hover:ring-blue-500 border ${getEventColor(event.status)} ${event.status === 'CANCELADA' ? 'line-through opacity-70' : ''}`}
                                >
                                    <div className="font-bold text-sm mb-1 pb-1 border-b border-black border-opacity-20">{event.produto}</div>
                                    <div className="text-xs space-y-1">
                                        <p><strong>Responsável:</strong> {event.responsavel || 'N/A'}</p>
                                        <p><strong>Status:</strong> {event.status || 'N/A'}</p>
                                        {event.observacoes && <p className="italic pt-1 mt-1 border-t border-black border-opacity-10">"{event.observacoes}"</p>}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center text-sm text-gray-500 pt-10">Nenhuma aplicação.</div>
                        )}
                    </div>
                </div>
            );
        }
        return weekDaysColumns;
    };

    const handlePrintKanban = () => {
        if (viewMode !== 'kanban') return;
        const { start } = getWeekInfo(currentDate);
        const DIAS_DA_SEMANA = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
        const headerHtml = `
            <div class="header">
                <h1>Relatório Semanal de Aplicações Fitossanitárias</h1>
                <h2>${getPeriodLabel()}</h2>
            </div>`;
        let columnsHtml = '';
        for (let i = 0; i < 6; i++) {
            const dataDia = new Date(start);
            dataDia.setUTCDate(dataDia.getUTCDate() + i);
            const diaFormatado = dataDia.toISOString().split('T')[0];
            const diaDaSemanaNome = DIAS_DA_SEMANA[i];
            const dataLabel = dataDia.toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' });
            const dayEvents = eventos[diaFormatado] || [];
            let tasksHtml = dayEvents.length > 0 ? dayEvents.map(event => `
                <div class="task-card">
                    <div class="task-header">${event.produto}</div>
                    <div class="task-body">
                        <p><strong>Responsável:</strong> ${event.responsavel || 'N/A'}</p>
                        <p><strong>Status:</strong> ${event.status || 'N/A'}</p>
                    </div>
                    ${event.observacoes ? `<div class="task-footer">${event.observacoes}</div>` : ''}
                </div>`).join('') : '<p class="no-tasks">Nenhuma aplicação.</p>';
            columnsHtml += `
                <div class="column">
                    <h3>${diaDaSemanaNome} <span class="date-label">${dataLabel}</span></h3>
                    <div class="tasks-container">${tasksHtml}</div>
                </div>`;
        }
        const styles = `
            @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');
            body { font-family: 'Roboto', sans-serif; margin: 20px; font-size: 9pt; background-color: #fff; color: #000; }
            @page { size: A4 landscape; margin: 15mm; }
            .header { text-align: center; margin-bottom: 20px; } .header h1 { margin: 0; font-size: 16pt; color: #000; }
            .header h2 { margin: 5px 0 0 0; font-size: 12pt; color: #333; font-weight: 400; }
            .grid-container { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
            .column { border: 1px solid #ccc; border-radius: 8px; padding: 10px; page-break-inside: avoid; }
            .column h3 { text-align: center; margin: 0 0 10px 0; font-size: 11pt; padding-bottom: 5px; border-bottom: 1px solid #ddd; }
            .column h3 .date-label { font-size: 9pt; color: #666; font-weight: 400; }
            .task-card { background-color: #fff !important; border: 1px solid #ccc !important; border-radius: 4px; padding: 8px; margin-bottom: 6px; color: #000; page-break-inside: avoid; }
            .task-header { font-weight: 700; font-size: 9pt; padding-bottom: 4px; border-bottom: 1px solid #eee; margin-bottom: 4px; }
            .task-body { font-size: 8pt; } .task-body p { margin: 2px 0; }
            .task-footer { font-style: italic; font-size: 8pt; color: #555; margin-top: 5px; padding-top: 5px; border-top: 1px dotted #ccc; }
            .no-tasks { text-align: center; font-style: italic; color: #888; font-size: 8pt; padding-top: 20px; }`;
        const fullHtml = `<html><head><title>Visão Semanal de Aplicações</title><style>${styles}</style></head><body>${headerHtml}<div class="grid-container">${columnsHtml}</div></body></html>`;
        const printWindow = window.open('', '_blank');
        printWindow.document.write(fullHtml);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); }, 500);
    };

    const handlePrintCalendar = () => {
        const month = currentDate.getMonth();
        const year = currentDate.getFullYear();
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const headerHtml = `
            <div class="header">
                <h1>Calendário de Aplicações Fitossanitárias</h1>
                <h2>${getPeriodLabel()}</h2>
            </div>`;
        let cellsHtml = '';
        for (let i = 0; i < firstDayOfMonth; i++) {
            cellsHtml += `<div class="day-cell empty"></div>`;
        }
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayEvents = eventos[dateStr] || [];
            let eventsHtml = dayEvents.length > 0 ? dayEvents.map(event => `
                <div class="event-item">${event.produto} (${event.status})</div>`).join('') : '';
            cellsHtml += `<div class="day-cell"><div class="day-number">${day}</div><div class="events-container">${eventsHtml}</div></div>`;
        }
        const styles = `
            @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');
            body { font-family: 'Roboto', sans-serif; margin: 20px; font-size: 8pt; }
            @page { size: A4 portrait; margin: 15mm; }
            .header { text-align: center; margin-bottom: 20px; } .header h1 { margin: 0; font-size: 16pt; }
            .header h2 { margin: 5px 0 0 0; font-size: 12pt; font-weight: 400; }
            .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); border-top: 1px solid #ccc; border-left: 1px solid #ccc; }
            .weekday-header { text-align: center; font-weight: bold; padding: 5px; background-color: #f2f2f2; border-bottom: 1px solid #ccc; border-right: 1px solid #ccc; }
            .day-cell { border-right: 1px solid #ccc; border-bottom: 1px solid #ccc; min-height: 100px; padding: 4px; display: flex; flex-direction: column; }
            .day-cell.empty { background-color: #f9f9f9; }
            .day-number { font-weight: bold; text-align: right; margin-bottom: 4px; }
            .events-container { flex-grow: 1; overflow: hidden; }
            .event-item { font-size: 7pt; background-color: #eef2ff; border-radius: 2px; padding: 2px 3px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`;
        const weekDaysHeader = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => `<div class="weekday-header">${day}</div>`).join('');
        const fullHtml = `<html><head><title>Calendário de Aplicações</title><style>${styles}</style></head><body>${headerHtml}<div class="calendar-grid">${weekDaysHeader}${cellsHtml}</div></body></html>`;
        const printWindow = window.open('', '_blank');
        printWindow.document.write(fullHtml);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); }, 500);
    };

    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-full">
            <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
                <h2 className="text-2xl font-semibold text-gray-800">Calendário de Aplicações</h2>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={viewMode === 'kanban' ? handlePrintKanban : handlePrintCalendar}
                        className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md flex items-center shadow-sm"
                    >
                        <LucidePrinter size={18} className="mr-2"/> Imprimir Visão
                    </button>
                    <div className="bg-gray-200 p-1 rounded-lg flex space-x-1">
                        <button onClick={() => setViewMode('calendar')} className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors flex items-center gap-2 ${viewMode === 'calendar' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:bg-gray-300'}`}>
                            <LucideCalendar size={16}/> Calendário
                        </button>
                        <button onClick={() => setViewMode('kanban')} className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors flex items-center gap-2 ${viewMode === 'kanban' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:bg-gray-300'}`}>
                            <LucideKanbanSquare size={16}/> Visão Semanal
                        </button>
                    </div>
                </div>
            </div>
            
            <VisualizarAplicacaoModal 
                isOpen={isVisualizarModalOpen}
                onClose={() => setIsVisualizarModalOpen(false)}
                aplicacao={aplicacaoSelecionada}
            />

            <div className="bg-white p-4 rounded-lg shadow-md">
                <div className="flex justify-between items-center mb-4">
                    <button onClick={() => changePeriod(-1)} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">&lt; Anterior</button>
                    <h3 className="text-xl font-bold text-center">
                        {getPeriodLabel()}
                    </h3>
                    <button onClick={() => changePeriod(1)} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">Próximo &gt;</button>
                </div>
                
                {loading ? (
                    <p className="text-center py-10">Carregando dados...</p>
                ) : (
                    <>
                        {viewMode === 'calendar' ? (
                            <>
                                <div className="grid grid-cols-7 text-center font-bold text-gray-600 border-b pb-2">
                                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => <div key={day}>{day}</div>)}
                                </div>
                                <div className="grid grid-cols-7">
                                    {renderCalendar()}
                                </div>
                            </>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                {renderKanbanView()}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};


// Versão: 16.0.1 (TarefasPendentesComponent)
// [REVISADO] Componente revisado para garantir que as props 'listasAuxiliares' e 'funcionarios' sejam
// corretamente passadas do Contexto Global para o AlocarTarefaModal.
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
                toast.error("Atenção: A tarefa foi alocada, mas não há uma semana criada na Programação Semanal para o período selecionado. Crie a semana para visualizar a tarefa na programação.");
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

            toast.success("Tarefa alocada com sucesso!");
            handleFecharModalAlocacao();
        } catch (error) {
            console.error("Erro ao alocar tarefa:", error);
            toast.error("Erro ao alocar tarefa: " + error.message);
        }
        setLoading(false);
    };

    const handleCancelarTarefa = async (tarefa) => {
        if (window.confirm(`Tem certeza que deseja CANCELAR a tarefa "${tarefa.tarefa}"? Esta ação não pode ser desfeita.`)) {
            const tarefaDocRef = doc(db, `${basePath}/tarefas_mapa`, tarefa.id);
            const usuario = auth.currentUser;

            try {
                await updateDoc(tarefaDocRef, {
                    status: "CANCELADA",
                    updatedAt: Timestamp.now(),
                    canceladoPor: usuario?.email || 'sistema'
                });

                await logAlteracaoTarefa(
                    db,
                    basePath,
                    tarefa.id,
                    usuario?.uid,
                    usuario?.email,
                    "Tarefa Cancelada (Pendente)",
                    `A tarefa "${tarefa.tarefa}" que estava pendente de alocação foi cancelada.`
                );

                toast.success("Tarefa cancelada com sucesso.");
            } catch (error) {
                console.error("Erro ao cancelar tarefa:", error);
                toast.error("Não foi possível cancelar a tarefa.");
            }
        }
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
                                        <div className="flex items-center space-x-2">
                                            <button 
                                                onClick={() => handleAbrirModalAlocacao(tp)}
                                                className="bg-green-500 hover:bg-green-600 text-white text-xs font-semibold py-1 px-3 rounded-md flex items-center transition-colors duration-150"
                                            >
                                               <LucideUserPlus size={14} className="mr-1"/> Alocar
                                            </button>
                                            <button
                                                onClick={() => handleCancelarTarefa(tp)}
                                                className="bg-red-500 hover:bg-red-600 text-white text-xs font-semibold py-1 px-3 rounded-md flex items-center transition-colors duration-150"
                                                title="Cancelar Tarefa"
                                            >
                                                <LucideXCircle size={14} className="mr-1"/> Cancelar
                                            </button>
                                        </div>
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
// [REVISADO E CORRIGIDO] Esta é a versão definitiva do modal, que recebe 'funcionarios'
// e 'listasAuxiliares' via props para garantir que os dados estejam sempre disponíveis.
const AlocarTarefaModal = ({ isOpen, onClose, tarefaPendente, onAlocar, listasAuxiliares, funcionarios }) => {
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
        setLoadingAloc(true); // Inicia o loading
        if (responsaveisAloc.length === 0) {
            alert("Selecione ao menos um responsável.");
            setLoadingAloc(false);
            return;
        }
        if (!turnoAloc) {
            alert("Selecione um turno.");
            setLoadingAloc(false);
            return;
        }
        if (!dataInicioAloc || !dataTerminoAloc) {
            alert("As datas de início e término são obrigatórias.");
            setLoadingAloc(false);
            return;
        }
        const inicio = new Date(dataInicioAloc + "T00:00:00Z");
        const fim = new Date(dataTerminoAloc + "T00:00:00Z");
        if (fim < inicio) {
            alert("A data de término não pode ser anterior à data de início.");
            setLoadingAloc(false);
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
        setLoadingAloc(false); // Finaliza o loading
    };
    
    const handleResponsavelAlocChange = (e) => {
        const selectedOptions = Array.from(e.target.selectedOptions, option => option.value);
        setResponsaveisAloc(selectedOptions);
    };

    if (!tarefaPendente) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Alocar Tarefa: ${tarefaPendente.tarefa}`} width="max-w-lg">
            <form onSubmit={handleAlocarSubmit} className="space-y-4">
                <p className="text-sm"><strong>Prioridade:</strong> {tarefaPendente.prioridade || 'N/A'}</p>
                <p className="text-sm"><strong>Área:</strong> {tarefaPendente.area || 'N/A'}</p>
                <p className="text-sm"><strong>Ação:</strong> {tarefaPendente.acao || 'N/A'}</p>
                
                <div>
                    <label className="block text-sm font-medium text-gray-700">Responsável(eis) <span className="text-red-500">*</span></label>
                    <select multiple value={responsaveisAloc} onChange={handleResponsavelAlocChange} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 h-28">
                    {(funcionarios || []).filter(f => f.ativo).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                     <p className="text-xs text-gray-500 mt-1">Segure Ctrl (ou Cmd) para selecionar múltiplos.</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Turno <span className="text-red-500">*</span></label>
                    <select value={turnoAloc} onChange={(e) => setTurnoAloc(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                        <option value="">Selecione...</option>
                        {(listasAuxiliares.turnos || []).map(t => <option key={t} value={t}>{t}</option>)}
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



// Versão: 15.3.1 (Ajuste solicitado)
// [REMOVIDO] Removido o card "Aplicações Pendentes de Aprovação" e sua lógica associada (estado 'aplicacoesPendentes' e função 'handleAprovarTarefa'),
// conforme solicitado, pois a funcionalidade não está em uso.
const RegistroAplicacaoComponent = () => {
    const { db, appId, listasAuxiliares, funcionarios, auth, storage } = useContext(GlobalContext);
    
    const [isRegistroModalOpen, setIsRegistroModalOpen] = useState(false);
    const [planoParaRegistrar, setPlanoParaRegistrar] = useState(null);
    const [isSelecionarPlanoModalOpen, setIsSelecionarPlanoModalOpen] = useState(false);
    const [todosPlanosAtivos, setTodosPlanosAtivos] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // const [aplicacoesPendentes, setAplicacoesPendentes] = useState([]); // REMOVIDO
    const [todasAsAplicacoes, setTodasAsAplicacoes] = useState([]);
    const [filtroPlanoId, setFiltroPlanoId] = useState('TODOS');

    // Estado para o novo modal de tarefa pendente
    const [isPendenteModalOpen, setIsPendenteModalOpen] = useState(false);

    const basePath = `/artifacts/${appId}/public/data`;
    const planosCollectionRef = collection(db, `${basePath}/planos_fitossanitarios`);
    const tarefasCollectionRef = collection(db, `${basePath}/tarefas_mapa`);

    useEffect(() => {
        const qPlanos = query(planosCollectionRef, where("ativo", "==", true), orderBy("nome"));
        const unsubPlanos = onSnapshot(qPlanos, (snapshot) => {
            setTodosPlanosAtivos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, error => console.error("Erro ao carregar planos:", error));

        const qTarefas = query(tarefasCollectionRef, 
            where("origem", "in", ["Controle Fitossanitário", "Registro Fito (App)", "Reagendamento Fito", "Controle Fitossanitário (Pendente)"]),
            orderBy("createdAt", "desc")
        );
        const unsubTarefas = onSnapshot(qTarefas, (snapshot) => {
            const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // setAplicacoesPendentes(tasks.filter(t => t.status === 'PENDENTE_APROVACAO_FITO')); // REMOVIDO
            setTodasAsAplicacoes(tasks.filter(t => t.status !== 'PENDENTE_APROVACAO_FITO'));
            setLoading(false);
        }, error => {
            console.error("Erro ao carregar tarefas de aplicação:", error);
            setLoading(false);
        });

        return () => {
            unsubPlanos();
            unsubTarefas();
        };
    }, [db, appId]);

    const aplicacoesExibidas = useMemo(() => {
        if (filtroPlanoId === 'TODOS') return todasAsAplicacoes;
        return todasAsAplicacoes.filter(app => app.origemPlanoId === filtroPlanoId);
    }, [filtroPlanoId, todasAsAplicacoes]);
    
    const getPlanoNome = (planoId) => {
        if (!planoId) return <span className="italic text-gray-500">Manual</span>;
        const plano = todosPlanosAtivos.find(p => p.id === planoId);
        return plano ? plano.nome : <span className="italic text-gray-500">Plano não encontrado</span>;
    };

    // Handlers para os modais existentes
    const handleOpenRegistroManual = () => { setPlanoParaRegistrar(null); setIsRegistroModalOpen(true); };
    const handleOpenSelecaoPlano = () => setIsSelecionarPlanoModalOpen(true);
    const handleSelecionarPlano = (plano) => { setPlanoParaRegistrar(plano); setIsSelecionarPlanoModalOpen(false); setIsRegistroModalOpen(true); };

    // Handlers para o novo modal
    const handleOpenPendenteModal = () => setIsPendenteModalOpen(true);
    const handleClosePendenteModal = () => setIsPendenteModalOpen(false);

    const handleSaveRegistro = async (dadosDoForm, registroOriginal, criarTarefa, reagendamento) => {
        if (registroOriginal) return;

        const usuario = auth.currentUser;
        const batch = writeBatch(db);
        
        try {
            if (criarTarefa) {
                let acaoDaTarefa = "APLICAÇÃO FITOSSANITÁRIA";
                if (dadosDoForm.planoId) {
                    const planoCorrespondente = todosPlanosAtivos.find(p => p.id === dadosDoForm.planoId);
                    if (planoCorrespondente && planoCorrespondente.acao) acaoDaTarefa = planoCorrespondente.acao;
                }
                const responsavelObj = funcionarios.find(f => f.nome === dadosDoForm.responsavel);
                const tarefaData = {
                    tarefa: `APLICAÇÃO FITO: ${dadosDoForm.produto}`,
                    orientacao: `Dosagem: ${dadosDoForm.dosagem || 'N/A'}. Planta/Local: ${dadosDoForm.plantaLocal || 'N/A'}. Observações: ${dadosDoForm.observacoes || 'N/A'}.`,
                    status: "PROGRAMADA", prioridade: "P2 - MEDIO PRAZO", acao: acaoDaTarefa, turno: "DIA INTEIRO",
                    dataInicio: dadosDoForm.dataAplicacao, dataProvavelTermino: dadosDoForm.dataAplicacao,
                    responsaveis: responsavelObj ? [responsavelObj.id] : [], area: dadosDoForm.areas.join(', '),
                    criadoPor: usuario?.uid, criadoPorEmail: usuario?.email, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
                    origem: "Registro Fito (App)", origemPlanoId: dadosDoForm.planoId,
                };
                const novaTarefaRef = doc(tarefasCollectionRef);
                batch.set(novaTarefaRef, tarefaData);

                if (dadosDoForm.planoId) {
                    batch.update(doc(db, `${basePath}/planos_fitossanitarios`, dadosDoForm.planoId), { ultimaAplicacao: dadosDoForm.dataAplicacao });
                }
            }

            if (reagendamento !== 'NENHUM') {
                // ... (lógica de reagendamento permanece a mesma)
            }
            
            await batch.commit();
            toast.success("Aplicação programada com sucesso!");

        } catch (error) { 
            toast.error("Falha ao programar a aplicação."); 
            console.error(error); 
        }
    };
    
    /*
    // REMOVIDO
    const handleAprovarTarefa = async (tarefaPendente) => {
        if (!window.confirm(`Deseja aprovar e programar a tarefa "${tarefaPendente.tarefa}"?`)) return;
        try {
            const tarefaRef = doc(db, `${basePath}/tarefas_mapa`, tarefaPendente.id);
            await updateDoc(tarefaRef, { status: 'PROGRAMADA', acao: tarefaPendente.acao, updatedAt: Timestamp.now() });
            toast.success("Tarefa aprovada e enviada para a programação!");
        } catch (error) {
            console.error("Erro ao aprovar tarefa:", error);
            toast.error("Falha ao aprovar a tarefa.");
        }
    };
    */

    const handleSaveTarefaPendente = async (formData, novosAnexos) => {
        const usuario = auth.currentUser;
        if (!usuario) {
            toast.error("Usuário não autenticado.");
            return;
        }

        const novoDocRef = doc(tarefasCollectionRef);
        const idDaNovaTarefa = novoDocRef.id;

        try {
            let urlsDosNovosAnexos = [];
            if (novosAnexos && novosAnexos.length > 0) {
                toast.loading('Enviando anexos...', { id: 'upload-toast-pendente-fito' });
                for (const anexo of novosAnexos) {
                    const caminhoStorage = `${basePath}/imagens_tarefas/${idDaNovaTarefa}/${Date.now()}_${anexo.name}`;
                    const storageRef = ref(storage, caminhoStorage);
                    const uploadTask = await uploadBytesResumable(storageRef, anexo);
                    const downloadURL = await getDownloadURL(uploadTask.ref);
                    urlsDosNovosAnexos.push(downloadURL);
                }
                toast.dismiss('upload-toast-pendente-fito');
            }
            
            const dataInicioTimestamp = Timestamp.fromDate(new Date(formData.dataInicio + "T00:00:00Z"));
            
            const novaTarefaData = {
                tarefa: formData.tarefa,
                prioridade: formData.prioridade || "",
                area: formData.area || "",
                acao: formData.acao,
                dataInicio: dataInicioTimestamp,
                dataProvavelTermino: dataInicioTimestamp,
                orientacao: formData.orientacao,
                status: "AGUARDANDO ALOCAÇÃO",
                responsaveis: [],
                turno: "",
                criadoPor: usuario.uid,
                criadoPorEmail: usuario.email,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                origem: "Controle Fitossanitário (Pendente)", // Origem específica
                imagens: urlsDosNovosAnexos,
            };

            await setDoc(novoDocRef, novaTarefaData);

            await logAlteracaoTarefa(
                db,
                basePath,
                idDaNovaTarefa,
                usuario.uid,
                usuario.email,
                "Tarefa Pendente Criada (Fito)",
                `Tarefa "${novaTarefaData.tarefa}" criada via Controle Fitossanitário.`
            );

            toast.success("Nova tarefa pendente criada com sucesso!");
        } catch (error) {
            console.error("Erro ao criar tarefa pendente (Fito):", error);
            toast.error("Erro ao criar tarefa: " + error.message);
            toast.dismiss('upload-toast-pendente-fito');
        }
    };

    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-full">
            <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
                <h2 className="text-2xl font-semibold text-gray-800">Aplicações</h2>
                <div className="flex items-center gap-2">
                    <button onClick={handleOpenPendenteModal} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-md flex items-center shadow-sm">
                        <LucideClipboardPlus size={20} className="mr-2"/> Adicionar Tarefa Pendente
                    </button>
                    <button onClick={handleOpenSelecaoPlano} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md flex items-center shadow-sm disabled:bg-gray-400">
                        <LucideCheckSquare size={20} className="mr-2"/> Registrar Aplicação (Baseado em Plano)
                    </button>
                    <button onClick={handleOpenRegistroManual} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md flex items-center shadow-sm">
                        <LucidePlusCircle size={20} className="mr-2"/> Adicionar Registro Manual
                    </button>
                </div>
            </div>

            <RegistroAplicacaoModal isOpen={isRegistroModalOpen} onClose={() => setIsRegistroModalOpen(false)} onSave={handleSaveRegistro} listasAuxiliares={listasAuxiliares} funcionarios={funcionarios} planoParaRegistrar={planoParaRegistrar} registroExistente={null} />
            <SelecionarPlanoModal isOpen={isSelecionarPlanoModalOpen} onClose={() => setIsSelecionarPlanoModalOpen(false)} planosDisponiveis={todosPlanosAtivos} onSelectPlano={handleSelecionarPlano} />
            <TarefaPendenteFormModal 
                isOpen={isPendenteModalOpen}
                onClose={handleClosePendenteModal}
                onSave={handleSaveTarefaPendente}
                listasAuxiliares={listasAuxiliares}
                titulo="Adicionar Tarefa Pendente (Fitossanitário)"
                tarefaFixa="APLICAÇÃO FITO"
                acoesPermitidas={['MANUTENÇÃO | PREVENTIVA', 'MANUTENÇÃO | TRATAMENTO']}
            />

            {/* [BLOCO REMOVIDO]
            <div className="my-8 bg-white p-6 rounded-lg shadow-md">
                ... Bloco de Aplicações Pendentes de Aprovação removido ...
            </div>
            */}

            <div className="mt-8 bg-white p-6 rounded-lg shadow-md">
                <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                    <h3 className="text-xl font-semibold text-gray-700">Acompanhamento de Aplicações</h3>
                    <div className="flex items-center gap-2">
                        <label htmlFor="planoFiltro" className="text-sm font-medium text-gray-700">Filtrar por Plano:</label>
                        <select id="planoFiltro" value={filtroPlanoId} onChange={e => setFiltroPlanoId(e.target.value)} disabled={loading} className="p-2 border border-gray-300 rounded-md shadow-sm">
                            <option value="TODOS">Todos os Planos</option>
                            {todosPlanosAtivos.map(plano => (<option key={plano.id} value={plano.id}>{plano.nome}</option>))}
                        </select>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                {/* Cabeçalho da tabela atualizado */}
                                {["Data", "Aplicação", "Origem (Plano)", "Área(s)", "Responsável", "Observação/Orientação", "Status"].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">{h}</th>)}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loading ? (
                                <tr><td colSpan="7" className="text-center p-4">Carregando aplicações...</td></tr>
                            ) : aplicacoesExibidas.length === 0 ? (
                                <tr><td colSpan="7" className="text-center p-4 text-gray-500">Nenhuma aplicação encontrada.</td></tr>
                            ) : (
                                aplicacoesExibidas.map(app => (
                                    <tr key={app.id}>
                                        <td className="px-4 py-3 text-sm text-gray-800 whitespace-nowrap">{formatDate(app.dataInicio)}</td>
                                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">{app.tarefa}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{getPlanoNome(app.origemPlanoId)}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700 max-w-xs whitespace-normal">{app.area}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{(app.responsaveis || []).map(rId => funcionarios.find(f => f.id === rId)?.nome || rId).join(', ') || 'N/A'}</td>
                                        {/* Nova célula para exibir a orientação */}
                                        <td className="px-4 py-3 text-sm text-gray-700 max-w-sm whitespace-normal break-words">{app.orientacao || '-'}</td>
                                        <td className="px-4 py-3 text-sm"><span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(app.status)}`}>{app.status}</span></td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// Versão: 8.5.2
// [NOVO] Adicionado um botão "Verificar/Gerar Tarefas" para permitir ao usuário
// disparar manualmente a função 'verificarEGerarTarefasFito'.
// [NOVO] Adicionado um estado 'loadingGerarTarefas' para dar feedback visual durante a verificação.
const PlanosFitossanitariosComponent = () => {
    const { db, appId, auth } = useContext(GlobalContext);
    const [planos, setPlanos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPlano, setEditingPlano] = useState(null);
    const [historicoCompleto, setHistoricoCompleto] = useState([]);
    const [isHistoricoModalOpen, setIsHistoricoModalOpen] = useState(false);
    const [planoParaVerHistorico, setPlanoParaVerHistorico] = useState(null);

    // [NOVO] Estado de loading para o novo botão
    const [loadingGerarTarefas, setLoadingGerarTarefas] = useState(false);

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
    
    // [NOVO] Handler para o botão de verificação manual
    const handleVerificarTarefas = async () => {
        setLoadingGerarTarefas(true);
        toast.loading("Verificando e gerando tarefas pendentes...", { id: 'gerar-tarefas-toast' });
        try {
            // Chama a função de gatilho manualmente
            await verificarEGerarTarefasFito(db, basePath);
            toast.dismiss('gerar-tarefas-toast');
            toast.success("Verificação concluída. Tarefas (se houver) foram geradas.");
        } catch (error) {
            toast.dismiss('gerar-tarefas-toast');
            toast.error("Erro ao verificar/gerar tarefas.");
            console.error("Erro no handleVerificarTarefas:", error);
        }
        setLoadingGerarTarefas(false);
    };

    const getContagemRegressivaInfo = (proximaAplicacao) => {
        if (!proximaAplicacao) {
            return { status: 'CONCLUIDO', texto: 'Plano Concluído', cor: 'bg-green-100 text-green-800' };
        }

        const hojeUTC = new Date();
        hojeUTC.setUTCHours(0, 0, 0, 0);

        const proximaUTC = new Date(proximaAplicacao);
        proximaUTC.setUTCHours(0, 0, 0, 0);

        const diffTime = proximaUTC.getTime() - hojeUTC.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

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

    const handleSavePlano = async (planoData) => { const usuario = auth.currentUser; const dadosParaSalvar = { ...planoData, updatedAt: Timestamp.now(), userEmail: usuario?.email || 'unknown', }; try { if (planoData.id) { const planoDocRef = doc(db, `${basePath}/planos_fitossanitarios`, planoData.id); await updateDoc(planoDocRef, dadosParaSalvar); toast.success("Plano atualizado com sucesso!"); } else { await addDoc(planosCollectionRef, { ...dadosParaSalvar, createdAt: Timestamp.now() }); toast.success("Plano criado com sucesso!"); } } catch (error) { console.error("Erro ao salvar plano:", error); toast.error("Falha ao salvar o plano."); } };
    const handleRemovePlano = async (planoId) => { try { await deleteDoc(doc(db, `${basePath}/planos_fitossanitarios`, planoId)); toast.success("Plano excluído com sucesso!"); } catch (error) { console.error("Erro ao excluir plano:", error); toast.error("Falha ao excluir o plano."); } };
    const handleOpenModal = (plano = null) => { setEditingPlano(plano); setIsModalOpen(true); };
    const handleOpenHistoricoModal = (plano) => { setPlanoParaVerHistorico(plano); setIsHistoricoModalOpen(true); };
    const handleCloseHistoricoModal = () => { setIsHistoricoModalOpen(false); setPlanoParaVerHistorico(null); };
    const getFrequenciaLabel = (plano) => { switch (plano.frequencia) { case 'UNICA': return 'Única'; case 'SEMANAL': return 'Semanal'; case 'QUINZENAL': return 'Quinzenal'; case 'MENSAL': return 'Mensal'; case 'INTERVALO_DIAS': return `A cada ${plano.diasIntervalo} dias`; default: return 'N/A'; } };
    
    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-full">
            <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
                <h2 className="text-2xl font-semibold text-gray-800">Planos de Aplicação</h2>
                
                {/* [ALTERADO] Grupo de botões adicionado */}
                <div className="flex items-center gap-2">
                    <button 
                        onClick={handleVerificarTarefas} 
                        disabled={loadingGerarTarefas}
                        className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-md flex items-center shadow-sm disabled:bg-gray-400"
                    >
                        <LucideRefreshCw size={20} className={`mr-2 ${loadingGerarTarefas ? 'animate-spin' : ''}`}/> 
                        {loadingGerarTarefas ? 'Verificando...' : 'Verificar/Gerar Tarefas'}
                    </button>
                    <button onClick={() => handleOpenModal()} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md flex items-center shadow-sm">
                        <LucidePlusCircle size={20} className="mr-2"/> Criar Novo Plano
                    </button>
                </div>
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
                        const contagemInfo = getContagemRegressivaInfo(proximaAplicacao);

                        return (
                        <div key={plano.id} className="bg-white rounded-lg shadow-md flex flex-col justify-between border-l-4" style={{borderColor: plano.ativo ? '#10B981' : '#6B7280'}}>
                            <div>
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

// Versão: 8.3.1
// [CORRIGIDO] Corrigido um erro de digitação no nome da coleção ('controleFitossanititario' para 'controleFitossanitario'),
// o que impedia o carregamento do histórico de aplicações.
// [ALTERADO] Componente simplificado para exibir apenas o histórico. A lógica de criação foi movida para o novo componente RegistroAplicacaoComponent.
const HistoricoFitossanitarioComponent = () => {
    const { db, appId, listasAuxiliares, funcionarios, auth } = useContext(GlobalContext);
    const [registros, setRegistros] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRegistroModalOpen, setIsRegistroModalOpen] = useState(false);
    const [editingRegistro, setEditingRegistro] = useState(null);
    const [isHistoricoModalOpen, setIsHistoricoModalOpen] = useState(false);
    const [selectedRegistroId, setSelectedRegistroId] = useState(null);
    
    const basePath = `/artifacts/${appId}/public/data`;
    // [CORRIGIDO] O nome da coleção foi corrigido de 'controleFitossanititario' para 'controleFitossanitario'.
    const registrosCollectionRef = collection(db, `${basePath}/controleFitossanitario`);

    useEffect(() => {
        const q = query(registrosCollectionRef, orderBy("dataAplicacao", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRegistros(data);
            setLoading(false);
        }, error => { console.error("Erro ao carregar registros: ", error); setLoading(false); });
        return () => unsubscribe();
    }, []);

    const handleOpenEditModal = (registro) => { setEditingRegistro(registro); setIsRegistroModalOpen(true); };
    const handleOpenHistoricoModal = (registroId) => { setSelectedRegistroId(registroId); setIsHistoricoModalOpen(true); };
    
    // Esta função agora lida apenas com a edição de um registro existente
    const handleSaveRegistro = async (dadosDoForm, registroOriginal) => {
        if (!registroOriginal) return; // Segurança para garantir que só edite

        const usuarioEmail = auth.currentUser?.email;
        const registroRef = doc(db, `${basePath}/controleFitossanitario`, registroOriginal.id);
        const detalhes = [];
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
            <h2 className="text-2xl font-semibold mb-6 text-gray-800">Histórico de Todas as Aplicações</h2>
            
            <RegistroAplicacaoModal 
                isOpen={isRegistroModalOpen} 
                onClose={() => setIsRegistroModalOpen(false)} 
                onSave={handleSaveRegistro} 
                listasAuxiliares={listasAuxiliares} 
                funcionarios={funcionarios} 
                planoParaRegistrar={null} 
                registroExistente={editingRegistro}
            />
            <HistoricoAplicacaoModal 
                isOpen={isHistoricoModalOpen} 
                onClose={() => setIsHistoricoModalOpen(false)} 
                registroId={selectedRegistroId} 
            />

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

// Versão: 1.0.1
// [ALTERADO] Texto ajustado para "Gestão de Equipes" e definido como parte da tela de boas-vindas.
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
                    GRAMOTERRA
                </h1>
                <p className="text-xl text-gray-600 mt-2">
                    Gestão de Equipes
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

// Versão: 17.0.0
// [NOVO] Card para o Dashboard que exibe o status dos planos de aplicação fitossanitários.
// Ele cruza informações dos planos com as tarefas já geradas para fornecer um status preciso.
const StatusPlanosFitoCard = ({ planos, tarefas }) => {

    const getStatusPlano = (proximaAplicacao) => {
        if (!proximaAplicacao) {
            return { texto: 'Concluído', cor: 'bg-green-100 text-green-800' };
        }
        const hojeUTC = new Date();
        hojeUTC.setUTCHours(0, 0, 0, 0);

        const proximaUTC = new Date(proximaAplicacao);
        proximaUTC.setUTCHours(0, 0, 0, 0);

        const diffTime = proximaUTC.getTime() - hojeUTC.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return { texto: `ATRASADO HÁ ${Math.abs(diffDays)} DIA(S)`, cor: 'bg-red-200 text-red-900' };
        }
        if (diffDays === 0) {
            return { texto: 'APLICAÇÃO HOJE', cor: 'bg-blue-200 text-blue-900' };
        }
        if (diffDays <= 3) {
            return { texto: `FALTAM ${diffDays} DIA(S)`, cor: 'bg-yellow-200 text-yellow-900' };
        }
        return { texto: `Próxima em ${diffDays} dias`, cor: 'bg-gray-100 text-gray-700' };
    };

    const planosComStatus = planos.map(plano => {
        const proximaDataTeorica = calcularProximaAplicacao(plano);
        if (!proximaDataTeorica) {
            return { ...plano, statusInfo: { texto: 'Concluído', cor: 'bg-green-100 text-green-800' }, dataExibicao: 'N/A' };
        }

        const dataStringBusca = proximaDataTeorica.toISOString().split('T')[0];
        
        const tarefaCorrespondente = tarefas.find(t =>
            t.origemPlanoId === plano.id &&
            t.origemPlanoDataString === dataStringBusca
        );

        if (tarefaCorrespondente) {
            return {
                ...plano,
                statusInfo: { texto: tarefaCorrespondente.status, cor: getStatusColor(tarefaCorrespondente.status) },
                dataExibicao: formatDate(tarefaCorrespondente.dataInicio)
            };
        } else {
            return {
                ...plano,
                statusInfo: getStatusPlano(proximaDataTeorica),
                dataExibicao: formatDate(proximaDataTeorica)
            };
        }
    }).sort((a, b) => {
        const order = { 'ATRASADO': 1, 'APLICAÇÃO HOJE': 2, 'FALTAM': 3 };
        const statusA = a.statusInfo.texto.split(' ')[0];
        const statusB = b.statusInfo.texto.split(' ')[0];
        return (order[statusA] || 99) - (order[statusB] || 99);
    });

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg">
            <h3 className="text-xl font-semibold text-gray-700 mb-4 flex items-center">
                <LucideSprayCan size={22} className="mr-2 text-green-600" />
                Status dos Planos de Aplicação
            </h3>
            {planosComStatus.length > 0 ? (
                <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {planosComStatus.map(plano => (
                        <li key={plano.id} className="p-3 border rounded-md bg-gray-50/50">
                            <p className="font-semibold text-sm text-gray-800">{plano.nome}</p>
                            <div className="flex justify-between items-center mt-1.5">
                                <p className="text-xs text-gray-600">Data Prevista: {plano.dataExibicao}</p>
                                <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${plano.statusInfo.cor}`}>
                                    {plano.statusInfo.texto}
                                </span>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-sm text-gray-500">Nenhum plano de aplicação ativo encontrado.</p>
            )}
        </div>
    );
};



// Versão: 19.1.0
// [MELHORIA] Adicionada a exibição da orientação/observação em cada item do card para fornecer mais contexto.
const AguardandoAlocacaoFitoCard = ({ aplicacoes }) => {
    return (
        <div className="bg-white p-6 rounded-lg shadow-lg">
            <h3 className="text-xl font-semibold text-gray-700 mb-4 flex items-center">
                <LucideAlertTriangle size={22} className="mr-2 text-red-600" />
                Aplicações Fito Aguardando Alocação
            </h3>
            {aplicacoes.length > 0 ? (
                <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {aplicacoes.map(app => (
                        <li key={app.id} className="p-3 border-l-4 border-red-400 rounded-r-md bg-red-50">
                            <p className="font-semibold text-sm text-red-800">{app.tarefa}</p>
                            {app.orientacao && (
                                <p className="text-xs text-gray-700 mt-1">{app.orientacao}</p>
                            )}
                            <p className="text-xs text-red-700 mt-2 pt-1 border-t border-red-200">
                                Área: {app.area || 'N/A'} | Data: {formatDate(app.dataInicio)}
                            </p>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-sm text-gray-500">Nenhuma aplicação fitossanitária aguardando alocação.</p>
            )}
        </div>
    );
};

// Versão: 19.0.2
// [ARQUITETURA] Removido o 'useEffect' que chamava 'verificarEGerarTarefasFito'.
// Essa lógica foi movida para o 'GlobalProvider' para garantir a execução no carregamento inicial do app.
// [REVERTIDO] O comportamento do card "Tarefas Atrasadas" foi revertido. Clicar em uma tarefa
// agora abre diretamente o modal de tratamento ('TratarAtrasoModal'), em vez de navegar para o mapa de atividades.
const DashboardComponent = ({ setCurrentPage }) => {
    const { db, appId, listasAuxiliares, funcionarios, auth, loading: loadingAuth } = useContext(GlobalContext);
    const [stats, setStats] = useState({
        porStatus: {}, porPrioridade: {}, proximoPrazo: [], atrasadas: [], pendentesAtrasadas: [], porFuncionario: {}
    });
    const [planosFito, setPlanosFito] = useState([]);
    const [todasTarefas, setTodasTarefas] = useState([]);
    const [loadingDashboard, setLoadingDashboard] = useState(true);
    const basePath = `/artifacts/${appId}/public/data`;

    const [isTratarAtrasoModalOpen, setIsTratarAtrasoModalOpen] = useState(false);
    const [tarefaSelecionada, setTarefaSelecionada] = useState(null);
    const [alertaAtrasoVisivel, setAlertaAtrasoVisivel] = useState(false);
    const [notificacaoAtrasoMostrada, setNotificacaoAtrasoMostrada] = useState(false);
    const [highlightAtrasadas, setHighlightAtrasadas] = useState(false);
    const atrasadasCardRef = useRef(null);

    const handleNavigateWithFilter = (page, filters) => {
        Object.entries(filters).forEach(([key, value]) => {
            sessionStorage.setItem(key, value);
        });
        setCurrentPage(page);
    };

    // Card de Status dos Planos
    const StatusPlanosFitoCard = ({ planos, tarefas }) => {
        const getStatusPlano = (proximaAplicacao) => {
            if (!proximaAplicacao) {
                return { texto: 'Concluído', cor: 'bg-green-100 text-green-800' };
            }
            const hojeUTC = new Date();
            hojeUTC.setUTCHours(0, 0, 0, 0);
    
            const proximaUTC = new Date(proximaAplicacao);
            proximaUTC.setUTCHours(0, 0, 0, 0);
    
            const diffTime = proximaUTC.getTime() - hojeUTC.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
            if (diffDays < 0) {
                return { texto: `ATRASADO HÁ ${Math.abs(diffDays)} DIA(S)`, cor: 'bg-red-200 text-red-900' };
            }
            if (diffDays === 0) {
                return { texto: 'APLICAÇÃO HOJE', cor: 'bg-blue-200 text-blue-900' };
            }
            if (diffDays <= 3) {
                return { texto: `FALTAM ${diffDays} DIA(S)`, cor: 'bg-yellow-200 text-yellow-900' };
            }
            return { texto: `Próxima em ${diffDays} dias`, cor: 'bg-gray-100 text-gray-700' };
        };
    
        const planosComStatus = planos.map(plano => {
            const proximaDataTeorica = calcularProximaAplicacao(plano);
            if (!proximaDataTeorica) {
                return { ...plano, statusInfo: { texto: 'Concluído', cor: 'bg-green-100 text-green-800' }, dataExibicao: 'N/A' };
            }
    
            const dataStringBusca = proximaDataTeorica.toISOString().split('T')[0];
            
            const tarefaCorrespondente = tarefas.find(t =>
                t.origemPlanoId === plano.id &&
                t.origemPlanoDataString === dataStringBusca
            );
    
            if (tarefaCorrespondente) {
                return {
                    ...plano,
                    statusInfo: { texto: tarefaCorrespondente.status, cor: getStatusColor(tarefaCorrespondente.status) },
                    dataExibicao: formatDate(tarefaCorrespondente.dataInicio)
                };
            } else {
                return {
                    ...plano,
                    statusInfo: getStatusPlano(proximaDataTeorica),
                    dataExibicao: formatDate(proximaDataTeorica)
                };
            }
        }).sort((a, b) => {
            const order = { 'ATRASADO': 1, 'APLICAÇÃO HOJE': 2, 'FALTAM': 3 };
            const statusA = a.statusInfo.texto.split(' ')[0];
            const statusB = b.statusInfo.texto.split(' ')[0];
            return (order[statusA] || 99) - (order[statusB] || 99);
        });
    
        return (
            <div className="bg-white p-6 rounded-lg shadow-lg">
                <h3 className="text-xl font-semibold text-gray-700 mb-4 flex items-center">
                    <LucideSprayCan size={22} className="mr-2 text-green-600" />
                    Status dos Planos de Aplicação
                </h3>
                {planosComStatus.length > 0 ? (
                    <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
                        {planosComStatus.map(plano => (
                            <li key={plano.id} className="p-3 border rounded-md bg-gray-50/50">
                                <p className="font-semibold text-sm text-gray-800">{plano.nome}</p>
                                <div className="flex justify-between items-center mt-1.5">
                                    <p className="text-xs text-gray-600">Data Prevista: {plano.dataExibicao}</p>
                                    <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${plano.statusInfo.cor}`}>
                                        {plano.statusInfo.texto}
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-gray-500">Nenhum plano de aplicação ativo encontrado.</p>
                )}
            </div>
        );
    };

    // Card de Alocação Fito
    const AguardandoAlocacaoFitoCard = ({ aplicacoes }) => {
        return (
            <div className="bg-white p-6 rounded-lg shadow-lg">
                <h3 className="text-xl font-semibold text-gray-700 mb-4 flex items-center">
                    <LucideAlertTriangle size={22} className="mr-2 text-red-600" />
                    Aplicações Fito Aguardando Alocação
                </h3>
                {aplicacoes.length > 0 ? (
                    <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
                        {aplicacoes.map(app => (
                            <li key={app.id} className="p-3 border-l-4 border-red-400 rounded-r-md bg-red-50">
                                <p className="font-semibold text-sm text-red-800">{app.tarefa}</p>
                                {app.orientacao && (
                                    <p className="text-xs text-gray-700 mt-1">{app.orientacao}</p>
                                )}
                                <p className="text-xs text-red-700 mt-2 pt-1 border-t border-red-200">
                                    Área: {app.area || 'N/A'} | Data: {formatDate(app.dataInicio)}
                                </p>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-gray-500">Nenhuma aplicação fitossanitária aguardando alocação.</p>
                )}
            </div>
        );
    };

    const aplicacoesFitoAguardandoAlocacao = useMemo(() => {
        const fitoOrigins = ["Controle Fitossanitário", "Registro Fito (App)", "Reagendamento Fito", "Controle Fitossanitário (Pendente)"];
        return todasTarefas.filter(t =>
            t.status === 'AGUARDANDO ALOCAÇÃO' &&
            fitoOrigins.includes(t.origem)
        ).sort((a,b) => (a.dataInicio?.toMillis() || 0) - (b.dataInicio?.toMillis() || 0));
    }, [todasTarefas]);

    // [REMOVIDO] O useEffect que chamava 'verificarEGerarTarefasFito' foi removido daqui.
    
    useEffect(() => {
        if (loadingAuth || !funcionarios?.length) {
            setLoadingDashboard(false);
            return;
        }
    
        const tarefasRef = collection(db, `${basePath}/tarefas_mapa`);
        const qTarefas = query(tarefasRef);
        const unsubscribeTarefas = onSnapshot(qTarefas, (snapshot) => {
            const tarefas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTodasTarefas(tarefas); 
    
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
    
            tarefas.forEach(tarefa => {
                if (tarefa.status && porStatus.hasOwnProperty(tarefa.status)) { porStatus[tarefa.status]++; }
                if (tarefa.status !== "CANCELADA" && tarefa.status !== "CONCLUÍDA") {
                    if (tarefa.responsaveis?.length > 0) {
                        tarefa.responsaveis.forEach(id => { if (porFuncionario[id]) porFuncionario[id].count++; });
                    } else { porFuncionario["SEM_RESPONSAVEL"].count++; }
                    if (tarefa.prioridade && porPrioridade.hasOwnProperty(tarefa.prioridade)) { porPrioridade[tarefa.prioridade]++; }
                }
                if (tarefa.dataProvavelTermino?.toDate && tarefa.status !== "CONCLUÍDA" && tarefa.status !== "CANCELADA") {
                    const dataTermino = tarefa.dataProvavelTermino.toDate();
                    dataTermino.setHours(0, 0, 0, 0);
                    if (dataTermino < hoje) {
                        if (tarefa.status === 'PROGRAMADA' || tarefa.status === 'EM OPERAÇÃO') { atrasadas.push(tarefa); }
                    } else if (dataTermino <= daqui7Dias) { proximoPrazo.push(tarefa); }
                }
                if (tarefa.status === 'AGUARDANDO ALOCAÇÃO') {
                    const fitoOrigins = ["Controle Fitossanitário", "Registro Fito (App)", "Reagendamento Fito", "Controle Fitossanitário (Pendente)"];
                    if (!fitoOrigins.includes(tarefa.origem)) {
                       pendentesAtrasadas.push(tarefa);
                    }
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
        }, (error) => { console.error("[Dashboard] Erro ao buscar tarefas:", error); setLoadingDashboard(false); });
    
        const planosRef = collection(db, `${basePath}/planos_fitossanitarios`);
        const qPlanos = query(planosRef, where("ativo", "==", true));
        const unsubscribePlanos = onSnapshot(qPlanos, (snapshot) => {
            const planos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPlanosFito(planos);
        }, (error) => { console.error("[Dashboard] Erro ao buscar planos fito:", error); });
    
        return () => {
            unsubscribeTarefas();
            unsubscribePlanos();
        };
    }, [loadingAuth, funcionarios, listasAuxiliares, appId, db, notificacaoAtrasoMostrada, basePath]);


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
                    <span>Clique em uma tarefa para tratar a pendência.</span>
                </div>
            ), { duration: 5000, position: 'bottom-center' });
        }, 1000);
    };
    
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
            
            {/* Linha 1 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
                <StatusPlanosFitoCard planos={planosFito} tarefas={todasTarefas} />
            </div>

            {/* Linha 2 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <button onClick={() => handleNavigateWithFilter('mapa', { 'mapa_filter_status': TODOS_EXCETO_CONCLUIDOS_VALUE, 'mapa_filter_prazo': 'PROXIMOS_7_DIAS' })} className="text-left bg-white p-6 rounded-lg shadow-lg hover:ring-2 hover:ring-yellow-400 transition-all">
                    <h3 className="text-xl font-semibold text-yellow-600 mb-4 flex items-center"><LucideClock size={22} className="mr-2"/> Tarefas com Prazo Próximo ({stats.proximoPrazo.length})</h3>
                    {stats.proximoPrazo.length > 0 ? (
                        <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
                            {stats.proximoPrazo.slice(0, 5).map(tarefa => (<li key={tarefa.id} className="p-3 border rounded-md bg-yellow-50 border-yellow-300">
                                <p className="font-semibold text-sm text-yellow-800">{tarefa.tarefa}</p>
                                {tarefa.orientacao && <p className="text-xs italic text-yellow-800 mt-1">{tarefa.orientacao.substring(0, 50)}...</p>}
                                <p className="text-xs text-yellow-700 mt-1">Término: {formatDateDash(tarefa.dataProvavelTermino)} - Status: <span className="font-bold">{tarefa.status}</span></p>
                                </li>))}
                        </ul>
                    ) : <p className="text-sm text-gray-500">Nenhuma tarefa com prazo próximo.</p>}
                </button>
                <button onClick={() => setCurrentPage('pendentes')} className="text-left bg-white p-6 rounded-lg shadow-lg hover:ring-2 hover:ring-orange-400 transition-all">
                    <h3 className="text-xl font-semibold text-orange-600 mb-4 flex items-center"><LucidePauseCircle size={22} className="mr-2"/> Tarefas Pendentes de Alocação ({stats.pendentesAtrasadas.length})</h3>
                    {stats.pendentesAtrasadas.length > 0 ? (
                        <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
                            {stats.pendentesAtrasadas.slice(0, 5).map(tarefa => (
                                <li key={tarefa.id} className="p-3 border rounded-md bg-orange-50 border-orange-300">
                                    <p className="font-semibold text-sm text-orange-800">{tarefa.tarefa}</p>
                                    {tarefa.orientacao && <p className="text-xs italic text-orange-800 mt-1">{tarefa.orientacao.substring(0, 50)}...</p>}
                                    <p className="text-xs text-orange-700 mt-1">Criada em: {formatDateDash(tarefa.createdAt)}</p>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="text-sm text-gray-500">Nenhuma tarefa aguardando alocação.</p>}
                </button>
                <AguardandoAlocacaoFitoCard aplicacoes={aplicacoesFitoAguardandoAlocacao} />
                {/* [REVERTIDO] O card de tarefas atrasadas agora é um container DIV normal */}
                <div ref={atrasadasCardRef} className={`bg-white p-6 rounded-lg shadow-lg scroll-mt-6 transition-all duration-300 ${highlightAtrasadas ? 'ring-4 ring-offset-4 ring-red-500' : 'ring-0'}`}>
                    <h3 className="text-xl font-semibold text-red-600 mb-4 flex items-center"><LucideAlertOctagon size={22} className="mr-2"/> Tarefas Atrasadas</h3>
                    {stats.atrasadas.length > 0 ? (
                        <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
                            {stats.atrasadas.map(tarefa => {
                                const diasAtraso = calculateDaysOverdue(tarefa.dataProvavelTermino);
                                return (
                                // [ALTERADO] Cada item da lista agora é um botão que abre o modal
                                <li key={tarefa.id}>
                                    <button onClick={() => handleOpenTratarAtrasoModal(tarefa)} className="w-full text-left p-3 border rounded-md bg-red-50 border-red-200 flex justify-between items-center hover:bg-red-100 transition-colors">
                                        <div>
                                            <p className="font-semibold text-sm text-red-800">{tarefa.tarefa}</p>
                                            <p className="text-xs text-red-700 mt-1">Atrasada há <strong>{diasAtraso}</strong> dia(s) - Status: <span className="font-semibold">{tarefa.status}</span></p>
                                            <p className="text-xs text-red-700 mt-1">Responsáveis: <span className="font-semibold">{getResponsavelNomes(tarefa.responsaveis)}</span></p>
                                        </div>
                                        <LucideArrowRightCircle size={18} className="text-red-600 flex-shrink-0 ml-2" />
                                    </button>
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

// Versão: 14.0.0
// [NOVO] Modal para edição de anotações.
const AnotacaoEditModal = ({ isOpen, onClose, onSave, anotacaoExistente }) => {
    const [texto, setTexto] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (anotacaoExistente) {
            setTexto(anotacaoExistente.texto || '');
        }
    }, [anotacaoExistente]);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!texto.trim()) {
            toast.error("O texto da anotação não pode ficar em branco.");
            return;
        }
        setLoading(true);
        await onSave(anotacaoExistente, texto.trim());
        setLoading(false);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Editar Anotação">
            <form onSubmit={handleSave} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Texto da Anotação</label>
                    <textarea
                        value={texto}
                        onChange={e => setTexto(e.target.value)}
                        required
                        rows="5"
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
                    />
                </div>
                <div className="pt-4 flex justify-end space-x-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancelar</button>
                    <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400">
                        {loading ? 'Salvando...' : 'Salvar Alteração'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

// Versão: 14.2.0
// [CORRIGIDO] Bug de Sincronização: As funções de editar e excluir anotação agora chamam 'sincronizarTarefaComProgramacao'.
// Isso garante que a 'programacao_semanal' e o 'RegistroDiarioModal' sempre exibam a última anotação atualizada,
// resolvendo o problema de dados obsoletos após edições ou exclusões.

const AnotacoesComponent = () => {
    const { db, appId, auth } = useContext(GlobalContext);
    const [anotacoes, setAnotacoes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const ANOTACOES_PER_PAGE = 50;

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingAnotacao, setEditingAnotacao] = useState(null);

    const basePath = `/artifacts/${appId}/public/data`;

    useEffect(() => {
        setLoading(true);
        const anotacoesGroupRef = collectionGroup(db, 'anotacoes');
        const q = query(anotacoesGroupRef, orderBy('criadoEm', 'desc'));

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const fetchedAnotacoesPromises = snapshot.docs.map(async (docSnap) => {
                const data = docSnap.data();
                const parentTaskRef = docSnap.ref.parent.parent;
                let tarefaContexto = 'Tarefa não encontrada ou excluída';

                if (parentTaskRef) {
                    try {
                        const taskSnap = await getDoc(parentTaskRef);
                        if (taskSnap.exists()) {
                            tarefaContexto = taskSnap.data().tarefa || `ID: ${taskSnap.id}`;
                        }
                    } catch (e) {
                        console.warn("Não foi possível buscar a tarefa pai da anotação", e);
                    }
                }

                return {
                    id: docSnap.id,
                    tarefaId: parentTaskRef ? parentTaskRef.id : null,
                    tarefaContexto,
                    ...data
                };
            });

            const resolvedAnotacoes = await Promise.all(fetchedAnotacoesPromises);
            setAnotacoes(resolvedAnotacoes);
            setLoading(false);
        }, (error) => {
            console.error("[ERRO CRÍTICO] Falha ao executar a busca por anotações:", error);
            toast.error("Falha ao carregar as anotações. Verifique o console para o erro de permissão.");
            setLoading(false);
        });

        return () => {
            unsubscribe();
        };
    }, [db, appId]);

    const handleOpenEditModal = (anotacao) => {
        setEditingAnotacao(anotacao);
        setIsEditModalOpen(true);
    };

    const handleCloseEditModal = () => {
        setEditingAnotacao(null);
        setIsEditModalOpen(false);
    };

    const handleSaveEdit = async (anotacao, novoTexto) => {
        if (!anotacao?.tarefaId || !anotacao?.id) {
            toast.error("Informações da anotação inválidas.");
            return;
        }

        const anotacaoRef = doc(db, `${basePath}/tarefas_mapa/${anotacao.tarefaId}/anotacoes`, anotacao.id);
        const tarefaRef = doc(db, `${basePath}/tarefas_mapa/${anotacao.tarefaId}`);
        const usuarioEmail = auth.currentUser?.email;

        try {
            // Atualiza a própria anotação
            await updateDoc(anotacaoRef, {
                texto: novoTexto,
                editadoEm: Timestamp.now(),
                editadoPorEmail: usuarioEmail || 'Desconhecido'
            });

            // Sincroniza a última anotação na tarefa principal
            const tarefaSnap = await getDoc(tarefaRef);
            if (tarefaSnap.exists()) {
                const anotacoesDaTarefaQuery = query(
                    collection(db, `${basePath}/tarefas_mapa/${anotacao.tarefaId}/anotacoes`),
                    orderBy('criadoEm', 'desc'),
                    limit(1)
                );
                const anotacoesSnap = await getDocs(anotacoesDaTarefaQuery);

                const ultimaAnotacao = anotacoesSnap.docs[0]?.data();
                if (ultimaAnotacao) {
                    await updateDoc(tarefaRef, {
                        ultimaAnotacaoTexto: ultimaAnotacao.texto,
                        ultimaAnotacaoTimestamp: ultimaAnotacao.criadoEm
                    });

                    // [CORREÇÃO] Sincroniza a tarefa atualizada com a programação semanal
                    const tarefaAtualizadaParaSync = { ...tarefaSnap.data(), ultimaAnotacaoTexto: ultimaAnotacao.texto, ultimaAnotacaoTimestamp: ultimaAnotacao.criadoEm };
                    await sincronizarTarefaComProgramacao(tarefaSnap.id, tarefaAtualizadaParaSync, db, basePath);
                }
            }

            toast.success("Anotação atualizada com sucesso!");
        } catch (error) {
            console.error("Erro ao salvar anotação:", error);
            toast.error("Falha ao atualizar a anotação.");
        }
    };

    const handleDelete = async (anotacao) => {
        if (!anotacao?.tarefaId || !anotacao?.id) {
            toast.error("Informações da anotação inválidas.");
            return;
        }

        if (window.confirm(`Tem certeza que deseja excluir esta anotação da tarefa "${anotacao.tarefaContexto}"?`)) {
            const anotacaoRef = doc(db, `${basePath}/tarefas_mapa/${anotacao.tarefaId}/anotacoes`, anotacao.id);
            const tarefaRef = doc(db, `${basePath}/tarefas_mapa/${anotacao.tarefaId}`);

            try {
                // 1. Exclui a anotação.
                await deleteDoc(anotacaoRef);

                // 2. Verifica se a tarefa pai ainda existe.
                const tarefaSnap = await getDoc(tarefaRef);
                if (tarefaSnap.exists()) {
                    // 3. Se existe, atualiza-a com a nova última anotação.
                    const anotacoesDaTarefaQuery = query(
                        collection(db, `${basePath}/tarefas_mapa/${anotacao.tarefaId}/anotacoes`),
                        orderBy('criadoEm', 'desc'),
                        limit(1)
                    );
                    const anotacoesSnap = await getDocs(anotacoesDaTarefaQuery);
                    
                    let ultimaAnotacaoTexto = '';
                    let ultimaAnotacaoTimestamp = null;

                    if (!anotacoesSnap.empty) {
                        const novaUltimaAnotacao = anotacoesSnap.docs[0].data();
                        ultimaAnotacaoTexto = novaUltimaAnotacao.texto;
                        ultimaAnotacaoTimestamp = novaUltimaAnotacao.criadoEm;
                    }
                    
                    await updateDoc(tarefaRef, {
                        ultimaAnotacaoTexto,
                        ultimaAnotacaoTimestamp
                    });

                    // [CORREÇÃO] Sincroniza a tarefa atualizada (com a anotação removida) com a programação semanal
                    const tarefaAtualizadaParaSync = { ...tarefaSnap.data(), ultimaAnotacaoTexto, ultimaAnotacaoTimestamp };
                    await sincronizarTarefaComProgramacao(tarefaSnap.id, tarefaAtualizadaParaSync, db, basePath);

                    toast.success("Anotação excluída e tarefa principal atualizada!");
                } else {
                    console.warn(`Anotação órfã (ID: ${anotacao.id}) foi excluída. A tarefa pai (ID: ${anotacao.tarefaId}) não foi encontrada.`);
                    toast.success("Anotação órfã removida com sucesso.");
                }
                
            } catch (error) {
                console.error("Erro ao excluir anotação:", error);
                toast.error("Falha ao excluir a anotação.");
            }
        }
    };
    
    // Lógica de Paginação
    const indexOfLastAnotacao = currentPage * ANOTACOES_PER_PAGE;
    const indexOfFirstAnotacao = indexOfLastAnotacao - ANOTACOES_PER_PAGE;
    const currentAnotacoes = anotacoes.slice(indexOfFirstAnotacao, indexOfLastAnotacao);
    const totalPages = Math.ceil(anotacoes.length / ANOTACOES_PER_PAGE);
    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    return (
        <div className="p-6 bg-gray-50 min-h-full">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800">Gerenciar Anotações</h2>
            
            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Data</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Tarefa Relacionada</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Anotação</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Autor</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr><td colSpan="5" className="text-center p-4">Carregando...</td></tr>
                        ) : currentAnotacoes.length === 0 ? (
                            <tr><td colSpan="5" className="text-center p-4 text-gray-500">Nenhuma anotação encontrada.</td></tr>
                        ) : (
                            currentAnotacoes.map(anotacao => (
                                <tr key={anotacao.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{formatDateTime(anotacao.criadoEm)}</td>
                                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{anotacao.tarefaContexto}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700 max-w-md whitespace-pre-wrap">{anotacao.texto}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{anotacao.criadoPorEmail}</td>
                                    <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">
                                        <div className="flex items-center space-x-3">
                                            <button onClick={() => handleOpenEditModal(anotacao)} title="Editar" className="text-blue-600 hover:text-blue-800"><LucideEdit size={16}/></button>
                                            <button onClick={() => handleDelete(anotacao)} title="Excluir" className="text-red-600 hover:text-red-800"><LucideTrash2 size={16}/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className="flex justify-center items-center mt-6 py-2">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(number => (
                        <button
                            key={number}
                            onClick={() => paginate(number)}
                            className={`mx-1 px-3 py-1 text-sm font-medium rounded-md ${
                                currentPage === number
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            {number}
                        </button>
                    ))}
                </div>
            )}

            {editingAnotacao && (
                <AnotacaoEditModal
                    isOpen={isEditModalOpen}
                    onClose={handleCloseEditModal}
                    onSave={handleSaveEdit}
                    anotacaoExistente={editingAnotacao}
                />
            )}
        </div>
    );
};

// Versão: 10.6.0
// [CORRIGIDO] O componente App agora usa um estado de carregamento unificado do GlobalProvider,
// aguardando permissões e dados antes de renderizar a aplicação principal.
function AppContent() { // <-- NOME ALTERADO AQUI
    const { currentUser, loading } = useContext(GlobalContext);
    
    // 1. Exibe uma tela de carregamento até que a autenticação e os dados essenciais estejam prontos.
    if (loading) {
         return (
            <div className="flex flex-col justify-center items-center h-screen bg-gray-100">
                <img src={LOGO_URL} alt="Logo" className="h-20 w-auto animate-pulse mb-4" />
                <div className="text-xl font-semibold text-gray-600">Carregando dados e permissões...</div>
            </div>
        );
    }

    // 2. Se não estiver carregando e o usuário for nulo, mostra a tela de login.
    if (currentUser === null) {
        return <AuthComponent />;
    }
    
    // 3. Se chegou aqui, o usuário está autenticado e os dados foram carregados. Renderiza a aplicação.
    return <MainApp />;
}

// Versão: 27.0.0 (MainApp)
// [ALTERADO] A verificação de permissão para o menu "Planejamento (Visão)" e sua página
// foi atualizada de `checkPermission('programacao')` para `checkPermission('planejamento')`.
// Isso conclui a separação das permissões, tornando o acesso a essa tela totalmente independente.
// [MELHORIA 2.1] Adicionada a passagem da prop 'setCurrentPage' para o DashboardComponent.
const MainApp = () => {
    const [currentPage, setCurrentPage] = useState('welcome');
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
        const permissionList = permissoes[pageKey];
        return Array.isArray(permissionList) && permissionList.includes(userEmail);
    };

    const PageContent = () => {
        if (currentPage !== 'welcome' && !checkPermission(currentPage)) {
            toast.error("Você não tem permissão para acessar esta página.");
            // Redireciona para o dashboard como uma página segura padrão.
            return <DashboardComponent setCurrentPage={setCurrentPage} />;
        }

        switch (currentPage) {
            case 'welcome': return <WelcomeComponent />;
            // [MELHORIA 2.1] A prop setCurrentPage agora é passada para o Dashboard.
            case 'dashboard': return <DashboardComponent setCurrentPage={setCurrentPage} />;
            case 'mapa': return <MapaAtividadesComponent />;
            case 'programacao': return <ProgramacaoSemanalComponent setCurrentPage={setCurrentPage} />;
            case 'planejamento': 
                if (!checkPermission('planejamento')) { 
                    toast.error("Você não tem permissão para acessar esta página.");
                    return <DashboardComponent setCurrentPage={setCurrentPage} />;
                }
                return <PlanejamentoSemanalCardViewComponent />;
            case 'fito': return <ControleFitossanitarioComponent />;
            case 'agenda': return <AgendaDiariaComponent />;
            case 'anotacoes': return <TarefaPatioComponent />;
            case 'pendentes': return <TarefasPendentesComponent />;
            case 'monitoramento': return <MonitoramentoComponent />;
            case 'gerenciar_anotacoes': return <AnotacoesComponent />;
            case 'config': return <ConfiguracoesComponent />;
            case 'relatorios': return <RelatoriosComponent />;
            default: return <WelcomeComponent />;
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
                    <div className="h-20 flex flex-col items-center justify-center border-b">
                        <button 
                            onClick={() => setCurrentPage('welcome')} 
                            className="flex flex-col items-center justify-center w-full h-full hover:bg-gray-50 transition-colors"
                            title="Ir para a tela inicial"
                        >
                            <img src={LOGO_URL} alt="Logo Gramoterra" className="h-10 w-auto"/>
                            <p className="text-sm font-semibold text-gray-600 mt-2">Gestão de Equipes</p>
                        </button>
                    </div>
                    
                    <nav className="flex-1 px-2 mt-4 space-y-1">
                        <div>
                            <NavGroupTitle title="Gestão" />
                            {checkPermission('dashboard') && <NavLink page="dashboard" icon={LucideLayoutDashboard} currentPage={currentPage} setCurrentPage={setCurrentPage}>Dashboard</NavLink>}
                            {checkPermission('programacao') && <NavLink page="programacao" icon={LucideCalendarDays} currentPage={currentPage} setCurrentPage={setCurrentPage}>Programação (Grade)</NavLink>}
                            {checkPermission('planejamento') && <NavLink page="planejamento" icon={LucideKanbanSquare} currentPage={currentPage} setCurrentPage={setCurrentPage}>Planejamento (Visão)</NavLink>}
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
                            {checkPermission('fito') && <NavLink page="fito" icon={LucideSprayCan} currentPage={currentPage} setCurrentPage={setCurrentPage}>Controle Fitossanitário</NavLink>}
                        </div>
                        <div>
                             <NavGroupTitle title="Análise e Sistema" />
                            {checkPermission('relatorios') && <NavLink page="relatorios" icon={LucideFileText} currentPage={currentPage} setCurrentPage={setCurrentPage}>Relatórios</NavLink>}
                            {checkPermission('gerenciar_anotacoes') && <NavLink page="gerenciar_anotacoes" icon={LucideNotebookText} currentPage={currentPage} setCurrentPage={setCurrentPage}>Gerenciar Anotações</NavLink>}
                            {checkPermission('monitoramento') && <NavLink page="monitoramento" icon={LucideActivity} currentPage={currentPage} setCurrentPage={setCurrentPage}>Monitoramento</NavLink>}
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

export default function App() { // <-- NOME ALTERADO AQUI (de WrappedApp para App)
    return (
        <GlobalProvider>
            <AppContent /> {/* <-- NOME ALTERADO AQUI (de App para AppContent) */}
        </GlobalProvider>
    );
}