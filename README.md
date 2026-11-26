# FlowMind

Aplicação local para transformar anotações em tarefas, registrar eventos de execução e reproduzir a trilha.

## Requisitos
- Node.js 22 LTS
- npm 10+
- Docker Desktop com Docker Compose

## Instalação (PowerShell)
```powershell
cd D:\Projetos\FlowMind
Copy-Item .env.example .env
docker compose up -d
npm install
npm run db:push
npm run dev
```

Abra:
- Frontend: http://localhost:5173
- API: http://localhost:4000/api/health

## IA
Sem configuração de IA, o aplicativo usa um fallback local determinístico, identificado na trilha de execução. Para conectar um provedor compatível com a API Chat Completions, preencha `AI_BASE_URL`, `AI_API_KEY` e `AI_MODEL` no `.env` e reinicie o backend.

Exemplo para endpoint compatível:
- `AI_BASE_URL=https://api.openai.com/v1`
- `AI_API_KEY=sua-chave`
- `AI_MODEL=modelo-disponivel-na-sua-conta`

Nunca coloque a chave no frontend.

## Fluxo implementado
1. POST `/api/notes/process`: salva a anotação e cria uma execução.
2. O backend valida e processa a anotação.
3. Cada etapa gera um `ExecutionEvent` persistido no PostgreSQL.
4. GET `/api/executions/:id/events`: transmite eventos via SSE.
5. GET `/api/executions/:id`: recupera execução, eventos e tarefas para replay/histórico.

## Limitações desta primeira entrega
- O fallback local é heurístico; não substitui um modelo de linguagem.
- O replay reproduz a sequência e os eventos gravados, sem reexecutar integrações.
- O diagrama inicial representa as quatro camadas e a atividade registrada; a próxima etapa adicionará nós e arestas individuais com React Flow.
- Autenticação, autorização, rate limiting, retentativas com backoff e testes automatizados ainda precisam ser adicionados antes de exposição pública.

## Desenvolvimento
```powershell
npm run dev
npm run build
```
