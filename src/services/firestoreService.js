import { db } from './firebase';
import {
    collection, doc, addDoc, getDocs, getDoc, setDoc, deleteDoc, onSnapshot,
    query, where, Timestamp, writeBatch, updateDoc, orderBy
} from 'firebase/firestore';
import { logAlteracaoTarefa } from './logService'; // Assumindo que logAlteracaoTarefa será movida para logService.js
import { STATUS_TAREFA } from '../utils/constants';

// --- Funções de Sincronização (Refatoradas do original) ---

/**
 * Remove uma tarefa específica de todas as programações semanais.
 * @param {string} tarefaId ID da tarefa do mapa a ser removida.
 * @param {string} basePath Caminho base no Firestore.
 */
export const removerTarefaDaProgramacao = async (tarefaId, basePath) => {
    if (!db || !basePath) throw new Error("Firestore DB ou basePath não inicializado.");
    const programacaoCollectionRef = collection(db, `${basePath}/programacao_semanal`);
    const todasSemanasQuery = query(programacaoCollectionRef);
    const batch = writeBatch(db);
    let algumaSemanaModificada = false;

    try {
        const todasSemanasSnap = await getDocs(todasSemanasQuery);

        todasSemanasSnap.forEach(semanaDocSnap => {
            const semanaDataOriginal = semanaDocSnap.data();
            // Cria uma cópia profunda para evitar mutação direta do objeto original
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
            await batch.commit();
            console.log(`[FirestoreService] Tarefa ${tarefaId} removida das programações.`);
        }
    } catch (error) {
        console.error(`[FirestoreService] Erro ao remover tarefa ${tarefaId} das programações:`, error);
        // Considerar relançar o erro ou retornar um status de falha
        throw error;
    }
};

/**
 * Sincroniza (adiciona/atualiza) uma tarefa do mapa na programação semanal.
 * Remove a tarefa existente antes de adicionar as novas instâncias.
 * @param {string} tarefaId ID da tarefa do mapa.
 * @param {object} tarefaData Dados completos da tarefa do mapa.
 * @param {string} basePath Caminho base no Firestore.
 */
export const sincronizarTarefaComProgramacao = async (tarefaId, tarefaData, basePath) => {
    if (!db || !basePath) throw new Error("Firestore DB ou basePath não inicializado.");

    // 1. Remove todas as instâncias existentes da tarefa na programação
    await removerTarefaDaProgramacao(tarefaId, basePath);

    // 2. Verifica se a tarefa deve ser adicionada (status PROGRAMADA ou CONCLUÍDA)
    if (tarefaData.status !== STATUS_TAREFA.PROGRAMADA && tarefaData.status !== STATUS_TAREFA.CONCLUIDA) {
        console.log(`[FirestoreService] Tarefa ${tarefaId} não está PROGRAMADA ou CONCLUÍDA, não será adicionada à programação.`);
        return; // Não adiciona se não estiver programada ou concluída
    }

    // 3. Valida dados necessários para a programação
    if (!tarefaData.dataInicio || !(tarefaData.dataInicio instanceof Timestamp) ||
        !tarefaData.dataProvavelTermino || !(tarefaData.dataProvavelTermino instanceof Timestamp) ||
        !tarefaData.responsaveis || tarefaData.responsaveis.length === 0) {
        console.warn(`[FirestoreService] Dados insuficientes ou Timestamps inválidos para adicionar tarefa ${tarefaId} à programação.`);
        return; // Não adiciona se faltar dados essenciais
    }

    // 4. Prepara o item da tarefa para a programação
    let textoBaseTarefa = tarefaData.tarefa || "Tarefa sem descrição";
    if (tarefaData.prioridade) textoBaseTarefa += ` - ${tarefaData.prioridade}`;
    let turnoParaTexto = "";
    if (tarefaData.turno && tarefaData.turno.toUpperCase() !== "DIA INTEIRO") {
        turnoParaTexto = `[${tarefaData.turno.toUpperCase()}] `;
    }
    const textoVisivelFinal = turnoParaTexto + textoBaseTarefa;

    const itemTarefaProgramacao = {
        mapaTaskId: tarefaId,
        textoVisivel: textoVisivelFinal,
        statusLocal: tarefaData.status === STATUS_TAREFA.CONCLUIDA ? STATUS_TAREFA.CONCLUIDA : 'PENDENTE', // Status inicial na programação
        turno: tarefaData.turno || "DIA INTEIRO"
    };

    // 5. Itera sobre os dias da tarefa e adiciona às semanas correspondentes
    const programacaoCollectionRef = collection(db, `${basePath}/programacao_semanal`);
    const todasSemanasQuery = query(programacaoCollectionRef);
    const batch = writeBatch(db);
    let algumaSemanaModificadaNaAdicao = false;

    try {
        const todasSemanasSnap = await getDocs(todasSemanasQuery);
        const alteracoesPorSemana = new Map(); // Armazena modificações por semana para evitar múltiplas escritas

        todasSemanasSnap.forEach(semanaDocSnap => {
            alteracoesPorSemana.set(semanaDocSnap.id, {
                ref: semanaDocSnap.ref,
                data: JSON.parse(JSON.stringify(semanaDocSnap.data())) // Cópia profunda
            });
        });

        const dataInicioLoop = tarefaData.dataInicio.toDate();
        const dataFimLoop = tarefaData.dataProvavelTermino.toDate();

        let dataAtual = new Date(Date.UTC(dataInicioLoop.getUTCFullYear(), dataInicioLoop.getUTCMonth(), dataInicioLoop.getUTCDate()));
        const dataFimLoopUTC = new Date(Date.UTC(dataFimLoop.getUTCFullYear(), dataFimLoop.getUTCMonth(), dataFimLoop.getUTCDate()));
        dataFimLoopUTC.setUTCHours(23, 59, 59, 999); // Garante que o último dia seja incluído

        while (dataAtual.getTime() <= dataFimLoopUTC.getTime()) {
            const diaFormatado = dataAtual.toISOString().split('T')[0]; // YYYY-MM-DD

            for (const [semanaId, semanaInfo] of alteracoesPorSemana.entries()) {
                const semanaDataModificada = semanaInfo.data;
                let inicioSemana, fimSemana;

                // Validação robusta das datas da semana
                try {
                    if (semanaDataModificada.dataInicioSemana && typeof semanaDataModificada.dataInicioSemana.toDate === 'function') {
                        inicioSemana = semanaDataModificada.dataInicioSemana.toDate();
                    } else if (semanaDataModificada.dataInicioSemana && typeof semanaDataModificada.dataInicioSemana.seconds === 'number') {
                        inicioSemana = new Date(semanaDataModificada.dataInicioSemana.seconds * 1000 + (semanaDataModificada.dataInicioSemana.nanoseconds || 0) / 1000000);
                    } else continue;

                    if (semanaDataModificada.dataFimSemana && typeof semanaDataModificada.dataFimSemana.toDate === 'function') {
                        fimSemana = semanaDataModificada.dataFimSemana.toDate();
                    } else if (semanaDataModificada.dataFimSemana && typeof semanaDataModificada.dataFimSemana.seconds === 'number') {
                        fimSemana = new Date(semanaDataModificada.dataFimSemana.seconds * 1000 + (semanaDataModificada.dataFimSemana.nanoseconds || 0) / 1000000);
                    } else continue;
                } catch (e) {
                    console.error(`Erro ao processar datas da semana ${semanaId}:`, e);
                    continue;
                }

                const inicioSemanaUTC = new Date(Date.UTC(inicioSemana.getUTCFullYear(), inicioSemana.getUTCMonth(), inicioSemana.getUTCDate()));
                const fimSemanaUTCloop = new Date(Date.UTC(fimSemana.getUTCFullYear(), fimSemana.getUTCMonth(), fimSemana.getUTCDate()));
                fimSemanaUTCloop.setUTCHours(23, 59, 59, 999);

                // Verifica se o dia atual está dentro do intervalo da semana
                if (dataAtual.getTime() >= inicioSemanaUTC.getTime() && dataAtual.getTime() <= fimSemanaUTCloop.getTime()) {
                    if (!semanaDataModificada.dias) semanaDataModificada.dias = {};
                    if (!semanaDataModificada.dias[diaFormatado]) semanaDataModificada.dias[diaFormatado] = {};

                    tarefaData.responsaveis.forEach(responsavelId => {
                        if (!semanaDataModificada.dias[diaFormatado][responsavelId]) {
                            semanaDataModificada.dias[diaFormatado][responsavelId] = [];
                        }
                        // Adiciona apenas se não existir
                        if (!semanaDataModificada.dias[diaFormatado][responsavelId].find(t => t.mapaTaskId === tarefaId)) {
                            semanaDataModificada.dias[diaFormatado][responsavelId].push({ ...itemTarefaProgramacao });
                            algumaSemanaModificadaNaAdicao = true;
                            semanaInfo.modificada = true; // Marca a semana como modificada
                        }
                    });
                }
            }
            // Avança para o próximo dia (UTC)
            dataAtual.setUTCDate(dataAtual.getUTCDate() + 1);
        }

        // 6. Aplica as alterações em batch apenas nas semanas modificadas
        if (algumaSemanaModificadaNaAdicao) {
            alteracoesPorSemana.forEach((semanaInfo) => {
                if (semanaInfo.modificada) {
                    batch.set(semanaInfo.ref, semanaInfo.data);
                }
            });
            await batch.commit();
            console.log(`[FirestoreService] Tarefa ${tarefaId} sincronizada com a programação.`);
        }

    } catch (error) {
        console.error(`[FirestoreService] Erro ao sincronizar tarefa ${tarefaId} com programação:`, error);
        throw error;
    }
};

/**
 * Verifica se todas as instâncias de uma tarefa na programação estão concluídas
 * e atualiza o status da tarefa principal no mapa para CONCLUÍDA ou PROGRAMADA.
 * @param {string} mapaTaskId ID da tarefa no mapa.
 * @param {string} basePath Caminho base no Firestore.
 */
export const verificarEAtualizarStatusConclusaoMapa = async (mapaTaskId, basePath) => {
    if (!db || !basePath) throw new Error("Firestore DB ou basePath não inicializado.");
    const tarefaMapaDocRef = doc(db, `${basePath}/tarefas_mapa`, mapaTaskId);

    try {
        const tarefaMapaSnap = await getDoc(tarefaMapaDocRef);
        if (!tarefaMapaSnap.exists()) {
            console.warn(`[FirestoreService] Tarefa ${mapaTaskId} não encontrada no mapa para verificação de status.`);
            return;
        }

        const tarefaPrincipal = tarefaMapaSnap.data();

        // Não faz nada se cancelada
        if (tarefaPrincipal.status === STATUS_TAREFA.CANCELADA) return;

        // Valida dados necessários para a verificação
        if (!tarefaPrincipal.dataInicio || !(tarefaPrincipal.dataInicio instanceof Timestamp) ||
            !tarefaPrincipal.dataProvavelTermino || !(tarefaPrincipal.dataProvavelTermino instanceof Timestamp) ||
            !tarefaPrincipal.responsaveis || tarefaPrincipal.responsaveis.length === 0) {
            // Se não tem datas/responsáveis, não pode ser concluída pela programação.
            // Se já estava concluída, reverte para PROGRAMADA (ou outro status apropriado?)
            if (tarefaPrincipal.status === STATUS_TAREFA.CONCLUIDA) {
                console.log(`[FirestoreService] Tarefa ${mapaTaskId} estava CONCLUÍDA mas faltam dados. Revertendo para PROGRAMADA.`);
                await updateDoc(tarefaMapaDocRef, { status: STATUS_TAREFA.PROGRAMADA });
            }
            return;
        }

        const dataInicioPrincipal = tarefaPrincipal.dataInicio.toDate();
        const dataFimPrincipal = tarefaPrincipal.dataProvavelTermino.toDate();
        const responsaveisPrincipais = tarefaPrincipal.responsaveis;

        let todasInstanciasProgramadasConcluidas = true;
        let algumaInstanciaProgramadaRelevanteEncontrada = false;

        const programacaoCollectionRef = collection(db, `${basePath}/programacao_semanal`);
        const todasSemanasQuery = query(programacaoCollectionRef);
        const todasSemanasSnap = await getDocs(todasSemanasQuery);

        let diaAtualTarefaMapa = new Date(Date.UTC(dataInicioPrincipal.getUTCFullYear(), dataInicioPrincipal.getUTCMonth(), dataInicioPrincipal.getUTCDate()));
        const dataFimPrincipalUTC = new Date(Date.UTC(dataFimPrincipal.getUTCFullYear(), dataFimPrincipal.getUTCMonth(), dataFimPrincipal.getUTCDate()));
        dataFimPrincipalUTC.setUTCHours(23, 59, 59, 999);

        // Itera pelos dias da tarefa principal
        while (diaAtualTarefaMapa.getTime() <= dataFimPrincipalUTC.getTime()) {
            const diaFormatado = diaAtualTarefaMapa.toISOString().split('T')[0];
            let encontrouInstanciaParaEsteDia = false;
            let concluidasParaEsteDia = true;

            // Verifica em todas as semanas se o dia atual pertence a ela
            for (const semanaDocSnap of todasSemanasSnap.docs) {
                const semanaData = semanaDocSnap.data();
                let inicioSemana, fimSemana;

                // Validação robusta das datas da semana
                try {
                    if (semanaData.dataInicioSemana && typeof semanaData.dataInicioSemana.toDate === 'function') {
                        inicioSemana = semanaData.dataInicioSemana.toDate();
                    } else if (semanaData.dataInicioSemana && typeof semanaData.dataInicioSemana.seconds === 'number') {
                        inicioSemana = new Date(semanaData.dataInicioSemana.seconds * 1000 + (semanaData.dataInicioSemana.nanoseconds || 0) / 1000000);
                    } else continue;

                    if (semanaData.dataFimSemana && typeof semanaData.dataFimSemana.toDate === 'function') {
                        fimSemana = semanaData.dataFimSemana.toDate();
                    } else if (semanaData.dataFimSemana && typeof semanaData.dataFimSemana.seconds === 'number') {
                        fimSemana = new Date(semanaData.dataFimSemana.seconds * 1000 + (semanaData.dataFimSemana.nanoseconds || 0) / 1000000);
                    } else continue;
                } catch (e) {
                    console.error(`Erro ao processar datas da semana ${semanaDocSnap.id} para tarefa ${mapaTaskId}:`, e);
                    continue;
                }

                const inicioSemanaUTC = new Date(Date.UTC(inicioSemana.getUTCFullYear(), inicioSemana.getUTCMonth(), inicioSemana.getUTCDate()));
                const fimSemanaUTCloop = new Date(Date.UTC(fimSemana.getUTCFullYear(), fimSemana.getUTCMonth(), fimSemana.getUTCDate()));
                fimSemanaUTCloop.setUTCHours(23, 59, 59, 999);

                // Se o dia atual pertence a esta semana
                if (diaAtualTarefaMapa.getTime() >= inicioSemanaUTC.getTime() && diaAtualTarefaMapa.getTime() <= fimSemanaUTCloop.getTime()) {
                    // Verifica para cada responsável da tarefa principal
                    for (const respId of responsaveisPrincipais) {
                        const tarefasNaCelula = semanaData.dias?.[diaFormatado]?.[respId] || [];
                        const instanciaTarefaNaCelula = tarefasNaCelula.find(t => t.mapaTaskId === mapaTaskId);

                        if (instanciaTarefaNaCelula) {
                            algumaInstanciaProgramadaRelevanteEncontrada = true;
                            encontrouInstanciaParaEsteDia = true;
                            if (instanciaTarefaNaCelula.statusLocal !== STATUS_TAREFA.CONCLUIDA) {
                                concluidasParaEsteDia = false;
                                todasInstanciasProgramadasConcluidas = false;
                                break; // Sai do loop de responsáveis se encontrar uma não concluída
                            }
                        } else {
                            // Se a tarefa deveria estar aqui (dia/responsável) mas não está, algo está errado ou ela não foi programada corretamente.
                            // Consideramos como não concluída para segurança.
                            console.warn(`[FirestoreService] Instância esperada da tarefa ${mapaTaskId} não encontrada em ${diaFormatado} para ${respId}.`);
                            concluidasParaEsteDia = false;
                            todasInstanciasProgramadasConcluidas = false;
                            break; // Sai do loop de responsáveis
                        }
                    }
                }
                if (!concluidasParaEsteDia) break; // Sai do loop de semanas se encontrou não concluída neste dia
            }

            // Se para este dia específico, alguma instância foi encontrada mas nem todas estavam concluídas, OU
            // se nenhuma instância foi encontrada (o que não deveria acontecer se a sincronização funcionou),
            // então a tarefa principal não pode ser considerada concluída.
            if (!concluidasParaEsteDia) {
                break; // Sai do loop de dias
            }

            // Avança para o próximo dia
            diaAtualTarefaMapa.setUTCDate(diaAtualTarefaMapa.getUTCDate() + 1);
        }

        // Atualiza o status da tarefa principal com base na verificação
        const deveSerConcluida = algumaInstanciaProgramadaRelevanteEncontrada && todasInstanciasProgramadasConcluidas;

        if (deveSerConcluida && tarefaPrincipal.status !== STATUS_TAREFA.CONCLUIDA) {
            console.log(`[FirestoreService] Todas as instâncias de ${mapaTaskId} concluídas. Atualizando mapa para CONCLUÍDA.`);
            await updateDoc(tarefaMapaDocRef, { status: STATUS_TAREFA.CONCLUIDA });
        } else if (!deveSerConcluida && tarefaPrincipal.status === STATUS_TAREFA.CONCLUIDA) {
            // Se estava concluída mas agora não está mais (ex: reabriram uma tarefa na programação)
            console.log(`[FirestoreService] Instâncias de ${mapaTaskId} não estão todas concluídas. Revertendo mapa para PROGRAMADA.`);
            await updateDoc(tarefaMapaDocRef, { status: STATUS_TAREFA.PROGRAMADA });
        } else {
            // console.log(`[FirestoreService] Status da tarefa ${mapaTaskId} (${tarefaPrincipal.status}) consistente com a programação.`);
        }

    } catch (error) {
        console.error(`[FirestoreService] Erro ao verificar/atualizar status da tarefa ${mapaTaskId}:`, error);
        throw error;
    }
};

// --- Funções CRUD para Tarefas do Mapa ---

/**
 * Adiciona uma nova tarefa ao Mapa de Atividades.
 * @param {object} tarefaData Dados da nova tarefa.
 * @param {string} basePath Caminho base no Firestore.
 * @param {string} userId ID do usuário que está criando.
 * @param {string} userEmail Email do usuário.
 * @returns {Promise<string>} ID da nova tarefa criada.
 */
export const addTarefaMapa = async (tarefaData, basePath, userId, userEmail) => {
    if (!db || !basePath) throw new Error("Firestore DB ou basePath não inicializado.");
    const tarefasCollectionRef = collection(db, `${basePath}/tarefas_mapa`);
    try {
        const dadosParaSalvar = {
            ...tarefaData,
            criadoPor: userId || 'sistema',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            // Garante que status inicial seja válido, ex: AGUARDANDO ALOCAÇÃO
            status: tarefaData.status || STATUS_TAREFA.AGUARDANDO_ALOCACAO,
        };
        const docRef = await addDoc(tarefasCollectionRef, dadosParaSalvar);
        await logAlteracaoTarefa(db, basePath, docRef.id, userId, userEmail, "Tarefa Criada", `Tarefa "${tarefaData.tarefa}" adicionada.`);

        // Sincroniza com a programação se o status permitir
        if (dadosParaSalvar.status === STATUS_TAREFA.PROGRAMADA || dadosParaSalvar.status === STATUS_TAREFA.CONCLUIDA) {
             // Precisamos buscar os dados completos com Timestamps corretos antes de sincronizar
             const tarefaSalvaSnap = await getDoc(docRef);
             if(tarefaSalvaSnap.exists()) {
                 await sincronizarTarefaComProgramacao(docRef.id, tarefaSalvaSnap.data(), basePath);
             } else {
                 console.error(`[FirestoreService] Tarefa ${docRef.id} recém-criada não encontrada para sincronização inicial.`);
             }
        }

        return docRef.id;
    } catch (error) {
        console.error("[FirestoreService] Erro ao adicionar tarefa no mapa:", error);
        throw error;
    }
};

/**
 * Atualiza uma tarefa existente no Mapa de Atividades.
 * @param {string} tarefaId ID da tarefa a ser atualizada.
 * @param {object} tarefaData Novos dados da tarefa.
 * @param {object} dadosAntigos Dados antigos da tarefa para log.
 * @param {array} funcionarios Lista de funcionários para log (nomes).
 * @param {string} basePath Caminho base no Firestore.
 * @param {string} userId ID do usuário que está atualizando.
 * @param {string} userEmail Email do usuário.
 */
export const updateTarefaMapa = async (tarefaId, tarefaData, dadosAntigos, funcionarios, basePath, userId, userEmail) => {
    if (!db || !basePath) throw new Error("Firestore DB ou basePath não inicializado.");
    const tarefaDocRef = doc(db, `${basePath}/tarefas_mapa`, tarefaId);
    try {
        const dadosParaAtualizar = {
            ...tarefaData,
            updatedAt: Timestamp.now(),
        };
        await setDoc(tarefaDocRef, dadosParaAtualizar, { merge: true });

        // Log detalhado das alterações
        let detalhesMudanca = [];
        if (dadosAntigos) {
            // Compara campos relevantes e adiciona ao log
            if (dadosAntigos.tarefa !== tarefaData.tarefa) detalhesMudanca.push(`Descrição: '${dadosAntigos.tarefa || ''}' -> '${tarefaData.tarefa}'`);
            if (dadosAntigos.status !== tarefaData.status) detalhesMudanca.push(`Status: ${dadosAntigos.status || 'N/A'} -> ${tarefaData.status || 'N/A'}`);
            if (dadosAntigos.prioridade !== tarefaData.prioridade) detalhesMudanca.push(`Prioridade: ${dadosAntigos.prioridade || 'N/A'} -> ${tarefaData.prioridade || 'N/A'}`);
            if (dadosAntigos.area !== tarefaData.area) detalhesMudanca.push(`Área: ${dadosAntigos.area || 'N/A'} -> ${tarefaData.area || 'N/A'}`);
            if (dadosAntigos.acao !== tarefaData.acao) detalhesMudanca.push(`Ação: ${dadosAntigos.acao || 'N/A'} -> ${tarefaData.acao || 'N/A'}`);
            const respAntigosNomes = (dadosAntigos.responsaveis || []).map(id => funcionarios.find(f => f.id === id)?.nome || id).join(', ') || 'Nenhum';
            const respNovosNomes = (tarefaData.responsaveis || []).map(id => funcionarios.find(f => f.id === id)?.nome || id).join(', ') || 'Nenhum';
            if (JSON.stringify(dadosAntigos.responsaveis || []) !== JSON.stringify(tarefaData.responsaveis || [])) detalhesMudanca.push(`Responsáveis: ${respAntigosNomes} -> ${respNovosNomes}`);
            if (dadosAntigos.turno !== tarefaData.turno) detalhesMudanca.push(`Turno: ${dadosAntigos.turno || 'N/A'} -> ${tarefaData.turno || 'N/A'}`);
            // Comparação de datas (requer formatação consistente ou comparação de Timestamps)
            // const formatDateForCompare = (ts) => ts instanceof Timestamp ? ts.toMillis() : null;
            // if (formatDateForCompare(dadosAntigos.dataInicio) !== formatDateForCompare(tarefaData.dataInicio)) detalhesMudanca.push(`Data Início alterada.`);
            // if (formatDateForCompare(dadosAntigos.dataProvavelTermino) !== formatDateForCompare(tarefaData.dataProvavelTermino)) detalhesMudanca.push(`Data Término alterada.`);
            if (dadosAntigos.orientacao !== tarefaData.orientacao) detalhesMudanca.push(`Orientação alterada.`);
        }
        if (detalhesMudanca.length > 0) {
            await logAlteracaoTarefa(db, basePath, tarefaId, userId, userEmail, "Tarefa Atualizada", detalhesMudanca.join('; '));
        }

        // Sincroniza com a programação após a atualização
        // Busca os dados atualizados para garantir que Timestamps estão corretos
        const tarefaAtualizadaSnap = await getDoc(tarefaDocRef);
        if (tarefaAtualizadaSnap.exists()) {
            await sincronizarTarefaComProgramacao(tarefaId, tarefaAtualizadaSnap.data(), basePath);
        } else {
             console.error(`[FirestoreService] Tarefa ${tarefaId} atualizada não encontrada para sincronização.`);
        }

    } catch (error) {
        console.error(`[FirestoreService] Erro ao atualizar tarefa ${tarefaId} no mapa:`, error);
        throw error;
    }
};

/**
 * Exclui uma tarefa do Mapa de Atividades e remove da programação.
 * @param {string} tarefaId ID da tarefa a ser excluída.
 * @param {string} nomeTarefa Nome da tarefa para log.
 * @param {string} basePath Caminho base no Firestore.
 * @param {string} userId ID do usuário que está excluindo.
 * @param {string} userEmail Email do usuário.
 */
export const deleteTarefaMapa = async (tarefaId, nomeTarefa, basePath, userId, userEmail) => {
    if (!db || !basePath) throw new Error("Firestore DB ou basePath não inicializado.");
    const tarefaDocRef = doc(db, `${basePath}/tarefas_mapa`, tarefaId);
    try {
        // 1. Loga a exclusão ANTES de deletar
        await logAlteracaoTarefa(db, basePath, tarefaId, userId, userEmail, "Tarefa Excluída", `Tarefa "${nomeTarefa || `ID ${tarefaId}`}" foi removida.`);

        // 2. Remove da programação semanal
        await removerTarefaDaProgramacao(tarefaId, basePath);

        // 3. Exclui o documento da tarefa principal
        await deleteDoc(tarefaDocRef);

        console.log(`[FirestoreService] Tarefa ${tarefaId} excluída com sucesso.`);

        // Opcional: Excluir subcoleção de histórico? Depende da política de retenção.
        // const historicoCollectionRef = collection(db, `${basePath}/tarefas_mapa/${tarefaId}/historico_alteracoes`);
        // const historicoSnap = await getDocs(historicoCollectionRef);
        // const deleteBatch = writeBatch(db);
        // historicoSnap.docs.forEach(doc => deleteBatch.delete(doc.ref));
        // await deleteBatch.commit();

    } catch (error) {
        console.error(`[FirestoreService] Erro ao excluir tarefa ${tarefaId}:`, error);
        throw error;
    }
};

// --- Funções CRUD para Anotações do Pátio ---

export const addAnotacaoPatio = async (anotacaoData, basePath, userId) => {
    if (!db || !basePath) throw new Error("Firestore DB ou basePath não inicializado.");
    const anotacoesCollectionRef = collection(db, `${basePath}/anotacoes_patio`);
    try {
        const dadosParaSalvar = {
            ...anotacaoData,
            criadoPor: userId || 'sistema',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        };
        const docRef = await addDoc(anotacoesCollectionRef, dadosParaSalvar);
        return docRef.id;
    } catch (error) {
        console.error("[FirestoreService] Erro ao adicionar anotação:", error);
        throw error;
    }
};

export const updateAnotacaoPatio = async (anotacaoId, anotacaoData, basePath) => {
    if (!db || !basePath) throw new Error("Firestore DB ou basePath não inicializado.");
    const anotacaoDocRef = doc(db, `${basePath}/anotacoes_patio`, anotacaoId);
    try {
        await setDoc(anotacaoDocRef, {
            ...anotacaoData,
            updatedAt: Timestamp.now(),
        }, { merge: true });
    } catch (error) {
        console.error(`[FirestoreService] Erro ao atualizar anotação ${anotacaoId}:`, error);
        throw error;
    }
};

export const deleteAnotacaoPatio = async (anotacaoId, basePath) => {
    if (!db || !basePath) throw new Error("Firestore DB ou basePath não inicializado.");
    const anotacaoDocRef = doc(db, `${basePath}/anotacoes_patio`, anotacaoId);
    try {
        await deleteDoc(anotacaoDocRef);
    } catch (error) {
        console.error(`[FirestoreService] Erro ao excluir anotação ${anotacaoId}:`, error);
        throw error;
    }
};

// --- Funções para Programação Semanal ---

/**
 * Atualiza o status local de uma tarefa dentro da programação semanal.
 * @param {string} semanaId ID do documento da semana.
 * @param {string} diaKey Chave do dia (YYYY-MM-DD).
 * @param {string} responsavelId ID do responsável.
 * @param {string} mapaTaskId ID da tarefa do mapa.
 * @param {string} novoStatusLocal Novo status ('CONCLUÍDA' ou 'PENDENTE').
 * @param {string} basePath Caminho base no Firestore.
 */
export const updateStatusTarefaProgramacao = async (semanaId, diaKey, responsavelId, mapaTaskId, novoStatusLocal, basePath) => {
    if (!db || !basePath) throw new Error("Firestore DB ou basePath não inicializado.");
    const semanaDocRef = doc(db, `${basePath}/programacao_semanal`, semanaId);

    try {
        const semanaDocSnap = await getDoc(semanaDocRef);
        if (!semanaDocSnap.exists()) {
            throw new Error(`Documento da semana ${semanaId} não encontrado.`);
        }

        const semanaData = semanaDocSnap.data();
        // Cria uma cópia profunda para modificação segura
        const semanaDataModificada = JSON.parse(JSON.stringify(semanaData));

        let tarefaEncontrada = false;
        if (semanaDataModificada.dias?.[diaKey]?.[responsavelId]) {
            const tarefas = semanaDataModificada.dias[diaKey][responsavelId];
            const tarefaIndex = tarefas.findIndex(t => t.mapaTaskId === mapaTaskId);

            if (tarefaIndex !== -1) {
                tarefas[tarefaIndex].statusLocal = novoStatusLocal;
                tarefaEncontrada = true;
            } else {
                 console.warn(`[FirestoreService] Tarefa ${mapaTaskId} não encontrada para atualização de status em ${semanaId}/${diaKey}/${responsavelId}`);
                 return; // Tarefa não encontrada, não faz nada
            }
        } else {
             console.warn(`[FirestoreService] Caminho ${semanaId}/${diaKey}/${responsavelId} não encontrado para atualização de status da tarefa ${mapaTaskId}`);
             return; // Caminho não existe, não faz nada
        }

        if (tarefaEncontrada) {
            // Atualiza o documento inteiro no Firestore
            // ATENÇÃO: Isso pode causar problemas de concorrência se múltiplos usuários
            // editarem a mesma semana simultaneamente. Uma abordagem mais granular
            // usando updateDoc com caminhos de campo seria mais segura, mas mais complexa.
            // Ex: updateDoc(semanaDocRef, { [`dias.${diaKey}.${responsavelId}`]: semanaDataModificada.dias[diaKey][responsavelId] });
            // Por simplicidade, mantemos setDoc por enquanto.
            await setDoc(semanaDocRef, semanaDataModificada);
            console.log(`[FirestoreService] Status da tarefa ${mapaTaskId} atualizado para ${novoStatusLocal} em ${semanaId}/${diaKey}/${responsavelId}`);

            // Após atualizar a programação, verifica se a tarefa principal no mapa deve ser concluída
            await verificarEAtualizarStatusConclusaoMapa(mapaTaskId, basePath);
        }

    } catch (error) {
        console.error(`[FirestoreService] Erro ao atualizar status da tarefa ${mapaTaskId} na programação ${semanaId}:`, error);
        throw error;
    }
};

// --- Funções para Configurações e Funcionários (Exemplos) ---

export const saveConfiguracoes = async (configData, basePath) => {
    if (!db || !basePath) throw new Error("Firestore DB ou basePath não inicializado.");
    const configDocRef = doc(db, basePath, 'configuracoes');
    try {
        await setDoc(configDocRef, configData, { merge: true });
        console.log("[FirestoreService] Configurações salvas.");
    } catch (error) {
        console.error("[FirestoreService] Erro ao salvar configurações:", error);
        throw error;
    }
};

export const addFuncionario = async (funcionarioData, basePath) => {
    if (!db || !basePath) throw new Error("Firestore DB ou basePath não inicializado.");
    const funcionariosCollectionRef = collection(db, `${basePath}/funcionarios`);
    try {
        const docRef = await addDoc(funcionariosCollectionRef, funcionarioData);
        console.log(`[FirestoreService] Funcionário ${funcionarioData.nome} adicionado com ID: ${docRef.id}`);
        return docRef.id;
    } catch (error) {
        console.error("[FirestoreService] Erro ao adicionar funcionário:", error);
        throw error;
    }
};

export const updateFuncionario = async (funcionarioId, funcionarioData, basePath) => {
    if (!db || !basePath) throw new Error("Firestore DB ou basePath não inicializado.");
    const funcionarioDocRef = doc(db, `${basePath}/funcionarios`, funcionarioId);
    try {
        await setDoc(funcionarioDocRef, funcionarioData, { merge: true });
        console.log(`[FirestoreService] Funcionário ${funcionarioId} atualizado.`);
    } catch (error) {
        console.error(`[FirestoreService] Erro ao atualizar funcionário ${funcionarioId}:`, error);
        throw error;
    }
};

export const deleteFuncionario = async (funcionarioId, basePath) => {
    if (!db || !basePath) throw new Error("Firestore DB ou basePath não inicializado.");
    const funcionarioDocRef = doc(db, `${basePath}/funcionarios`, funcionarioId);
    try {
        await deleteDoc(funcionarioDocRef);
        console.log(`[FirestoreService] Funcionário ${funcionarioId} excluído.`);
        // TODO: Considerar o que fazer com tarefas associadas a este funcionário.
        // Poderia remover o ID das listas de responsáveis ou marcar as tarefas.
    } catch (error) {
        console.error(`[FirestoreService] Erro ao excluir funcionário ${funcionarioId}:`, error);
        throw error;
    }
};

// Adicionar outras funções conforme necessário (buscar semanas, buscar histórico, etc.)

