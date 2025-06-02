# App React + Firebase - Gestor de Equipes (Refatorado)

Este projeto é uma versão refatorada e melhorada do script original fornecido, focado em boas práticas, segurança, performance e manutenibilidade.

## Estrutura de Pastas

```
/react-firebase-app
├── public/
├── src/
│   ├── App.js                 # Componente principal e roteamento de páginas
│   ├── components/            # Componentes React reutilizáveis e específicos de páginas
│   │   ├── Anotacoes/
│   │   ├── Auth/
│   │   ├── common/            # Componentes genéricos (Modal, LoadingSpinner, etc.)
│   │   ├── Configuracoes/
│   │   ├── Dashboard/
│   │   ├── Layout/            # Componentes de layout (Sidebar, etc.)
│   │   ├── MapaAtividades/
│   │   ├── Programacao/
│   │   ├── Relatorios/
│   │   └── TarefasPendentes/
│   ├── context/             # Contexto global da aplicação (GlobalContext)
│   ├── hooks/               # Hooks customizados (se necessário)
│   ├── services/            # Lógica de comunicação com APIs e Firebase
│   │   ├── firebase.js        # Configuração e inicialização do Firebase
│   │   ├── firestoreService.js # Funções CRUD e lógica do Firestore
│   │   └── logService.js      # Funções para registrar histórico
│   └── utils/               # Funções utilitárias e constantes
│       ├── constants.js     # Constantes globais
│       └── helpers.js       # Funções auxiliares (formatação, etc.)
├── .env.local             # Arquivo para variáveis de ambiente (NÃO ENVIAR PARA O GIT)
├── .gitignore             # Arquivo especificando o que ignorar no Git
├── package.json           # Dependências e scripts do projeto
├── README.md              # Este arquivo
└── guia_publicacao.md     # Guia detalhado para publicar o app
```

## Configuração Inicial

1.  **Instalar Dependências:**
    *   Navegue até a pasta raiz do projeto (`react-firebase-app`) no terminal.
    *   Rode `npm install` (ou `yarn install`).

2.  **Configurar Variáveis de Ambiente (MUITO IMPORTANTE):**
    *   Crie um arquivo chamado `.env.local` na pasta raiz do projeto (`react-firebase-app`).
    *   Copie e cole o conteúdo abaixo no arquivo, substituindo os valores `SUA_CHAVE_AQUI` pelas suas credenciais reais do Firebase:

    ```plaintext
    REACT_APP_FIREBASE_API_KEY=SUA_API_KEY_AQUI
    REACT_APP_FIREBASE_AUTH_DOMAIN=SEU_AUTH_DOMAIN_AQUI
    REACT_APP_FIREBASE_PROJECT_ID=SEU_PROJECT_ID_AQUI
    REACT_APP_FIREBASE_STORAGE_BUCKET=SEU_STORAGE_BUCKET_AQUI
    REACT_APP_FIREBASE_MESSAGING_SENDER_ID=SEU_MESSAGING_SENDER_ID_AQUI
    REACT_APP_FIREBASE_APP_ID=SEU_APP_ID_AQUI
    ```
    *   **NUNCA** compartilhe este arquivo ou envie para o GitHub. O arquivo `.gitignore` já está configurado para ignorá-lo.

## Rodando Localmente

1.  Após instalar as dependências e configurar o `.env.local`, rode no terminal:
    ```bash
    npm start
    ```
    (Ou `yarn start`)
2.  Isso iniciará o servidor de desenvolvimento e abrirá o aplicativo no seu navegador (geralmente em `http://localhost:3000`).

## Build para Produção

Para criar a versão otimizada para publicação:

```bash
npm run build
```

(Ou `yarn build`)

Isso criará uma pasta `build` com os arquivos estáticos prontos para serem publicados.

## Publicação (Deploy)

Consulte o arquivo `guia_publicacao.md` incluído neste projeto para um passo a passo detalhado sobre como publicar seu aplicativo usando Vercel, Netlify ou Firebase Hosting.

## Melhorias Realizadas

*   **Estrutura Modular:** Código organizado em componentes, serviços, utils e contexto.
*   **Segurança:** Variáveis de ambiente (`.env.local`) para credenciais do Firebase, evitando hardcoding.
*   **Firebase SDK v9:** Uso da API modular mais recente do Firebase.
*   **Context API:** Gerenciamento centralizado do estado global (usuário, configurações, etc.).
*   **Serviços Dedicados:** Lógica de interação com o Firestore separada em `firestoreService.js` e `logService.js`.
*   **Componentes Reutilizáveis:** Criação de componentes como `Modal`, `LoadingSpinner`, `LoadingButton`.
*   **Tratamento de Erros:** Melhorias no feedback ao usuário em caso de falhas.
*   **UX:** Indicadores de carregamento, botões com estado de loading, design mais consistente.
*   **Código Limpo:** Remoção de código comentado desnecessário e melhor formatação.
*   **Placeholders:** Componentes para funcionalidades futuras (Programação, Anotações, etc.) foram criados como placeholders para facilitar a expansão.

