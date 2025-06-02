// Constantes de valores especiais para filtros e seletores
export const SEM_RESPONSAVEL_VALUE = "---SEM_RESPONSAVEL---";
export const TODOS_OS_STATUS_VALUE = "---TODOS_OS_STATUS---";
export const TODAS_AS_PRIORIDADES_VALUE = "---TODAS_AS_PRIORIDADES---";
export const TODAS_AS_AREAS_VALUE = "---TODAS_AS_AREAS---";

// Constantes relacionadas à programação e turnos
export const DIAS_SEMANA = ["SEGUNDA-FEIRA", "TERÇA-FEIRA", "QUARTA-FEIRA", "QUINTA-FEIRA", "SEXTA-FEIRA", "SÁBADO"];
export const TURNO_DIA_INTEIRO = "DIA INTEIRO";
export const TURNOS_POSSIVEIS = [TURNO_DIA_INTEIRO, "MANHÃ", "TARDE"]; // Adicionado para clareza

// Constantes de UI (Exemplo, pode ser expandido)
export const COR_STATUS_CONCLUIDA_FUNDO_MAPA = "bg-green-200"; // Usado no original, mas a lógica de cor parece estar mais distribuída
export const LOGO_URL = "https://gramoterra.com.br/assets/images/misc/Logo%20Gramoterra-02.png";

// Constantes para status de tarefas (Exemplo, idealmente viria do Firestore ou config)
// Estes são os status usados no código. Centralizar aqui ajuda na manutenção.
export const STATUS_TAREFA = {
  PREVISTA: "PREVISTA",
  AGUARDANDO_ALOCACAO: "AGUARDANDO ALOCAÇÃO",
  PROGRAMADA: "PROGRAMADA",
  CONCLUIDA: "CONCLUÍDA",
  CANCELADA: "CANCELADA",
};

