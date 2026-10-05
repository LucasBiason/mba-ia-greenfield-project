---
scope_type: phase
related_phases: [3]
status: decided
date: 2026-09-28
scope_description: "Decisões técnicas da Fase 03 (Upload e Processamento de Vídeos): tecnologia de mensageria assíncrona, estratégia de upload de 10GB sem travar a API, execução do worker com FFmpeg, identificador público único, streaming HTTP 206 e ciclo de status."
---

# Technical Decisions — Phase 03: Upload e Processamento de Vídeos

_Subprojects in scope:_

- `nestjs-project/` — backend que entrega os serviços de object storage, fila assíncrona, worker de vídeo, upload de até 10GB, pré-cadastro de rascunho, metadados/thumbnail, URLs únicas, streaming HTTP 206 e download.
- `next-frontend/` — fora do escopo desta fase, conforme especificado no enunciado oficial do desafio técnico.

---

## TD-01: Fila de Processamento em Segundo Plano (Mensageria)

**Scope:** Backend / Infraestrutura

**Capability:** Serviço de processamento em segundo plano (filas)

**Context:** O upload e o processamento de vídeos (extração de metadados, duração e geração de thumbnail via FFmpeg) são operações intensivas em CPU e I/O que não podem bloquear a thread HTTP da API NestJS. Uma fila persistente com suporte a retries, backoff exponencial e DLQ é mandatória.

**Options:**

### Option A: RabbitMQ com AMQP
- Broker tradicional com roteamento complexo (exchanges, routing keys).
- **Pros:** Robusto, independente de linguagem, protocolo aberto AMQP.
- **Cons:** Overhead operacional significativo para a topologia local, sem dashboard nativo tão leve e exige gerenciamento explícito de dead-letters e retries no código NestJS.

### Option B: Redis + BullMQ (`@nestjs/bullmq`)
- Fila moderna baseada em Redis para Node.js, com integração oficial em `@nestjs/bullmq`.
- **Pros:** Excelente desempenho, integração de primeira classe no NestJS, suporte nativo a backoff exponencial, eventos de ciclo de vida (`completed`, `failed`), retry budget e container leve no Docker Compose (`redis:7-alpine`).
- **Cons:** Dependência do Redis em memória (mitigado por persistência AOF/RDB).

**Recommendation:** **BullMQ com Redis** — Solução padrão recomendada pela Full Cycle para filas em ecossistemas NestJS, proporcionando inicialização instantânea, mínima pegada de memória em desenvolvimento e tipagem estrita com TypeScript.

**Decision:** B (BullMQ + Redis)

---

## TD-02: Estratégia de Upload de 10GB sem Travar a API

**Scope:** Backend

**Capability:** Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance

**Context:** Ingestão de arquivos de vídeo de até 10GB (10.737.418.240 bytes). O envio tradicional via `multipart/form-data` retendo o payload na memória RAM derrubaria a API por Out Of Memory (OOM) ou timeout de gateway. O upload precisa ser retomável (sobreviver a quedas de rede) e transmitido em streaming para o Object Storage.

**Options:**

### Option A: Upload Multipart convencional via API
- O cliente envia todo o arquivo de 10GB diretamente para o controller NestJS em uma requisição HTTP única.
- **Pros:** Simples de implementar no código inicial.
- **Cons:** Inviável para 10GB. Trava o event loop, causa esgotamento de memória (OOM), bloqueia conexões concorrentes e falhas de rede forçam reiniciar o upload do zero (violando os critérios de aceite).

### Option B: Protocolo tus (`@tus/server` + `@tus/s3-store`)
- Padrão aberto aberto (IETF) para uploads retomáveis em chunks via HTTP PATCH.
- **Pros:** Suporta arquivos arbitrários (até 10GB+), retoma exatamente do byte onde parou, envia chunks diretamente para o MinIO/S3 sem reter na memória da API e dispara evento de conclusão (`onUploadFinish`) para orquestrar o draft e a fila.
- **Cons:** Exige rota dedicada compatível com os headers tus (`Upload-Offset`, `Upload-Length`).

**Recommendation:** **Protocolo tus com S3Store** — Atende rigorosamente aos NFRs de performance, resiliência e não-bloqueio de threads estabelecidos no PRD e no desafio oficial da Full Cycle.

**Decision:** B (Protocolo tus com S3Store)

---

## TD-03: Execução do Worker e Processamento FFmpeg

**Scope:** Backend / Worker

**Capability:** Processamento automático do vídeo após upload e geração automática de thumbnail

**Context:** Após o término do upload, o vídeo precisa ter seus metadados inspecionados (largura, altura, codec, duração em segundos) e um thumbnail gerado a partir de um frame representativo. O binário FFmpeg/ffprobe precisa rodar de forma isolada sem onerar a API HTTP.

**Options:**

### Option A: Processamento Inline na API NestJS
- A API executa `exec('ffmpeg ...')` diretamente após o upload.
- **Pros:** Não precisa de container adicional.
- **Cons:** Viola a separação de responsabilidades. Processamento concorrente de múltiplos vídeos satura a CPU da API, degradando requisições HTTP de leitura e autenticação.

### Option B: Worker Standalone em Container Separado (`compose.yaml`)
- A API apenas publica a mensagem no Redis; um container `worker` consome a fila com `@nestjs/bullmq`, baixa o arquivo de vídeo (ou processa por streaming) com `fluent-ffmpeg` / `ffprobe`, extrai os metadados, renderiza o thumbnail JPG, faz o upload do thumbnail para o MinIO e atualiza a entidade no banco de dados.
- **Pros:** Isolamento total de falhas e consumo de recursos. Se o worker cair ou estourar CPU, a API HTTP continua 100% responsiva.
- **Cons:** Requer configuração de entrypoint dedicado no Docker Compose.

**Recommendation:** **Worker Standalone com FFmpeg e BullMQ** — Garante arquitetura resiliente e alinhada com as boas práticas corporativas exigidas no MBA Full Cycle.

**Decision:** B (Worker Standalone com FFmpeg)

---

## TD-04: Estratégia de Identificador Público Único

**Scope:** Backend / Banco de Dados

**Capability:** URL única por vídeo, sem conflito com outros vídeos

**Context:** Cada vídeo precisa de uma URL pública curta, única e imprevisível para visualização e compartilhamento, sem expor chaves primárias sequenciais ou previsíveis.

**Options:**

### Option A: UUID v4
- **Pros:** Universal, sem risco prático de colisão.
- **Cons:** Muito longo (36 caracteres), feio para URLs de compartilhamento (`/v/123e4567-e89b-12d3-a456-426614174000`).

### Option B: nanoid (10-12 caracteres de alta entropia)
- Identificador curto, URL-friendly e seguro gerado com o alfabeto `A-Za-z0-9_-`.
- **Pros:** URLs elegantes e curtas (ex.: `/v/dQw4w9WgXcQ`), alta entropia contra adivinhação/força bruta (preservando vídeos não-listados) e índice B-Tree ultrarrápido no PostgreSQL.
- **Cons:** Exige checagem de colisão (probabilidade desprezível, tratada com retry).

**Recommendation:** **nanoid (10 a 12 caracteres)** — Padrão adotado pelas maiores plataformas de vídeo (YouTube) e compatível com as regras de design do projeto.

**Decision:** B (nanoid)

---

## TD-05: Estratégia de Streaming e Download

**Scope:** Backend / Storage

**Capability:** Reprodução via streaming (sem necessidade de download completo) e Download do vídeo

**Context:** Usuários devem reproduzir vídeos instantaneamente, sem aguardar o download de arquivos pesados (até 10GB). O player precisa de suporte a seek (navegação na timeline) via requisições com cabeçalho `Range`.

**Options:**

### Option A: Transcoding Completo para HLS (m3u8 / .ts)
- Segmentação do vídeo em múltiplos pedaços de alguns segundos.
- **Pros:** Streaming adaptativo por bitrate.
- **Cons:** Complexidade e tempo de processamento excessivos para a Fase 03; o enunciado da Full Cycle foca explicitamente em streaming HTTP com Range requests e download direto.

### Option B: HTTP 206 Partial Content com Range Requests
- Leitura em chunks do Object Storage (MinIO/S3) respondendo cabeçalhos `Accept-Ranges: bytes`, `Content-Range: bytes START-END/TOTAL` e status `206 Partial Content`.
- **Pros:** Suporte nativo em todos os navegadores modernos e tags HTML5 `<video>`, sem latência prévia de transcoding, permitindo seek imediato. Download direto via cabeçalho `Content-Disposition: attachment`.
- **Cons:** Não possui bitrate adaptativo (reservado para fases futuras de CDN/HLS).

**Recommendation:** **HTTP 206 Partial Content + URLs Pré-assinadas do MinIO** — Atende rigorosamente ao enunciado da Fase 03.

**Decision:** B (HTTP 206 Partial Content)

---

## TD-06: Ciclo de Vida e Tratamento de Falhas do Vídeo

**Scope:** Backend / Domínio

**Capability:** Ciclo de status do vídeo refletido no banco de dados

**Context:** Transições de estado devem ser determinísticas e idempotentes:
1. `DRAFT`: Pré-cadastro registrado antes ou no primeiro byte do upload.
2. `UPLOADING`: Upload em andamento via tus.
3. `PROCESSING`: Upload concluído, job na fila do worker.
4. `READY`: Metadados e thumbnail extraídos com sucesso, vídeo pronto para streaming.
5. `ERROR`: Falha fatal no processamento após esgotamento das tentativas com retry budget.

**Decision:** Máquina de estados estrita com Enum `VideoStatus` (`DRAFT`, `UPLOADING`, `PROCESSING`, `READY`, `ERROR`) persistida no PostgreSQL.
