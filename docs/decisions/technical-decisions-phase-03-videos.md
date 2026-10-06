---
scope_type: phase
related_phases: [3]
status: decided
date: 2026-09-28
scope_description: "Decisões técnicas da Fase 03 (Upload e Processamento de Vídeos): tecnologia de mensageria assíncrona, estratégia de upload de 10GB sem sobrecarga de memória na API, execução do worker com FFmpeg isolado, identificador público único, streaming HTTP 206 com suporte a Range requests e ciclo de vida idempotente de status."
---

# Technical Decisions — Phase 03: Upload e Processamento de Vídeos

_Subprojetos no escopo:_

- `nestjs-project/` — backend que implementa object storage (MinIO/S3), fila assíncrona desacoplada (BullMQ/Redis), worker dedicado com processamento FFmpeg, upload de vídeos de até 10GB via protocolo tus com S3Store, pré-cadastro com garantia de idempotência, metadados e thumbnail automáticos, identificadores públicos opacos (nanoid), streaming em conformidade com RFC 7233 (HTTP 206) e download direto.
- `next-frontend/` — fora do escopo desta fase, conforme restrições estritas do enunciado oficial do desafio técnico.

---

## TD-01: Tecnologia de Mensageria e Fila de Processamento Assíncrono

**Scope:** Backend / Infraestrutura

**Capability:** Serviço de mensageria assíncrona e processamento em segundo plano

**Context:** O upload e o processamento de vídeos (extração de metadados de codecs/resolução e renderização de thumbnails via FFmpeg) são operações com consumo intensivo de CPU e I/O que não podem competir pelos recursos de execução do ciclo de vida HTTP da API NestJS. É mandatório adotar um sistema de mensageria com suporte a retries automáticos, backoff exponencial configurável, dead-letter queue (DLQ) para auditoria e isolamento operacional.

**Options:**

### Opção A: Apache Kafka
- Plataforma de streaming de eventos distribuída com logs de commit particionados.
- **Vantagens:** Escalabilidade horizontal extrema, retenção histórica durável de mensagens, replay de eventos.
- **Desvantagens:** Overhead operacional excessivo para a topologia da aplicação (exigência de ZooKeeper ou KRaft, alto consumo de memória basal em ambiente de desenvolvimento/avaliação), sem semântica nativa de fila de tarefas pontuais (delayed jobs, retry com backoff exponencial necessita de tópicos auxiliares complexos).

### Opção B: RabbitMQ via protocolo AMQP
- Message broker tradicional com suporte avançado a roteamento via exchanges e filas.
- **Vantagens:** Padrão aberto AMQP, desacoplamento completo de linguagem, suporte a dead-letter exchanges nativo.
- **Desvantagens:** Exige configuração de plugins de delay (`rabbitmq_delayed_message_exchange`) para retries com backoff exponencial; gerenciamento de concorrência e tipagem de payloads no ecossistema NestJS demanda boilerplate adicional comparado a soluções integradas.

### Opção C: Redis + BullMQ (`@nestjs/bullmq`)
- Fila de mensagens orientada a tarefas para Node.js construída sobre Redis, com integração oficial mantida pelo time do NestJS.
- **Vantagens:** Inicialização e consumo mínimo de memória (`redis:7-alpine`), suporte nativo a backoff exponencial (`delay: 5000, type: 'exponential'`), limitação de tentativas (`attempts: 3`), persistência de falhas para auditoria (`removeOnFail: false`), total integração tipada via decorators `@Processor` e `@InjectQueue`, e execução sem dependência de daemons pesados.
- **Desvantagens:** Dependência da estabilidade do Redis em memória (mitigada por políticas de persistência AOF/RDB e TTL configurados no Docker Compose).

**Decision:** **Opção C — Redis + BullMQ (`@nestjs/bullmq`)**. Proporciona a menor pegada de memória, inicialização instantânea em containers locais e integração nativa com o ciclo de vida do NestJS, atendendo com perfeição aos requisitos da Fase 03.

---

## TD-02: Estratégia de Ingestão de Vídeos de até 10GB sem Sobrecarga da API

**Scope:** Backend / Protocolo de Rede

**Capability:** Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance ou consumo excessivo de RAM

**Context:** A aplicação deve receber vídeos com tamanho de até 10GB (10.737.418.240 bytes). Mecanismos tradicionais de upload bloqueiam o event loop, consomem gigabytes de memória RAM por stream ativo (podendo incorrer em Out Of Memory) e reiniciam toda a transferência em caso de oscilações transitórias de rede, violando os critérios de estabilidade e tolerância a falhas.

**Options:**

### Opção A: Upload Multipart Tradicional via Controller HTTP (`multipart/form-data`)
- O cliente transmite o payload do arquivo diretamente em uma única requisição HTTP para a API.
- **Vantagens:** Implementação trivial utilizando interceptors (`FileInterceptor`).
- **Desvantagens:** Inviável para arquivos de 10GB. Buffering na memória ou disco temporário da API satura I/O e RAM do container, conexões lentas prendem workers do Node.js, e qualquer falha na conexão força o recomeço do zero, resultando em timeouts de gateway (HTTP 504).

### Opção B: Upload Direto ao S3 via URLs Pré-assinadas Multipart
- A API gera múltiplas URLs pré-assinadas para que o cliente envie partes de 5MB diretamente ao MinIO/S3 e chame um endpoint para fechar o multipart upload.
- **Vantagens:** O tráfego de dados não passa pela API backend.
- **Desvantagens:** Complexidade alta no cliente para orquestrar divisão de partes e controle de ETags; problema crítico de rede em ambientes Docker onde o MinIO responde em rede interna (`http://storage:9000`), exigindo mapeamentos complexos de DNS/NAT para clientes externos acessarem `http://localhost:9000`; perda de validação síncrona de metadados de domínio e quotas antes do envio de cada chunk.

### Opção C: Protocolo Aberto tus (`@tus/server` + `@tus/s3-store`)
- Padrão aberto IETF para upload retomável baseado em HTTP (métodos `POST`, `PATCH`, `HEAD`, `OPTIONS`).
- **Vantagens:** Suporta arquivos arbitrários (10GB+), permite retomar transferências exatamente a partir do último byte confirmado após quedas de rede via offset tracking (`Upload-Offset`), faz streaming direto para o Object Storage (MinIO) via `S3Store` sem alocar buffers gigantes na memória da API, encapsula regras de CORS e disponibiliza o gancho `onUploadFinish` para enfileirar o processamento no BullMQ de forma atômica.
- **Desvantagens:** Exige montagem de rotas específicas e suporte a headers do protocolo tus (`Tus-Resumable`, `Upload-Length`).

**Decision:** **Opção C — Protocolo tus com S3Store (`@tus/server` e `@tus/s3-store`)**. Garante compatibilidade estrita com os critérios de aceite de uploads de até 10GB, desacoplamento de I/O em memória e resiliência contra oscilações de rede.

---

## TD-03: Arquitetura e Execução do Worker de Processamento FFmpeg

**Scope:** Backend / Processamento Assíncrono

**Capability:** Processamento automático do vídeo após upload e extração de metadados e thumbnail

**Context:** Após o término do upload de um vídeo, é necessário validar o arquivo com `ffprobe`, extrair sua duração exata, resolução de vídeo (largura e altura) e gerar um thumbnail representativo em formato JPEG para exibição no catálogo. A execução do binário FFmpeg pode levar de segundos a minutos e consumir até 100% dos núcleos de CPU alocados.

**Options:**

### Opção A: Processamento Inline no Processo da API NestJS
- A API consome os jobs do BullMQ diretamente no mesmo processo que responde às rotas HTTP.
- **Vantagens:** Simplicidade de implantação com apenas um container de aplicação.
- **Desvantagens:** Violação grave de isolamento de falhas. Picos de CPU causados pelo FFmpeg congelam a execução do event loop do Node.js na API, provocando atrasos severos em rotas de autenticação, listagem e reprodução. Em caso de crash do processo por falha de memória do FFmpeg, toda a API cai simultaneamente.

### Opção B: Worker Dedicado em Container Standalone (`compose.yaml`)
- A API apenas registra o rascunho e publica o job na fila do Redis. Um container separado `worker` (inicializado pelo script `start:worker:dev`) executa exclusivamente o `WorkerModule` e o processador `VideoProcessingProcessor`.
- **Vantagens:** Isolamento total de CPU, memória e limites de recursos. Se o worker processar um arquivo pesado ou falhar, a API continua totalmente responsiva. O worker possui os binários `ffmpeg` e `ffprobe` instalados no nível do sistema operacional. Implementa estratégia otimizada de I/O tentando primeiro a inspeção remota via URL pré-assinada do MinIO diretamente pelo FFmpeg antes de recorrer ao download em `/tmp`, com garantia de exclusão em bloco `finally`.
- **Desvantagens:** Requer definição explícita do serviço no Docker Compose e manutenção de dois entrypoints (`main.ts` e `worker.ts`).

**Decision:** **Opção B — Worker Standalone com FFmpeg e BullMQ**. Garante resiliência de produção, independência de escalabilidade e conformidade com os requisitos arquiteturais da Full Cycle.

---

## TD-04: Estratégia de Identificador Público Opaco (nanoid)

**Scope:** Backend / Modelagem de Dados

**Capability:** Identificador público único por vídeo, sem colisão e imune a IDOR por enumeração

**Context:** Vídeos necessitam de identificadores para roteamento de URLs públicas de visualização, streaming e download (`/videos/:publicId`). A exposição direta da chave primária interna (UUID v4 ou identificadores auto-incrementais) apresenta riscos de engenharia reversa, enumeração e URLs excessivamente longas para compartilhamento.

**Options:**

### Opção A: Exposição do UUID v4 Primário
- Utilizar a chave primária `id` (UUID v4 de 36 caracteres) diretamente nas rotas públicas.
- **Vantagens:** Elimina a necessidade de uma coluna adicional no banco de dados.
- **Desvantagens:** URLs excessivamente longas e deselegantes (ex.: `/videos/123e4567-e89b-12d3-a456-426614174000`), dificultando o compartilhamento e violando os padrões adotados por plataformas como YouTube.

### Opção B: Slug Derivado do Título do Vídeo
- Gerar strings legíveis a partir do título (ex.: `/videos/meu-primeiro-video`).
- **Vantagens:** Amigável para motores de busca (SEO).
- **Desvantagens:** Títulos são alteráveis pelo criador, acarretando quebra de links externos antigos ou exigência de tabelas complexas de redirecionamento histórico; alta probabilidade de colisões entre títulos idênticos de canais diferentes.

### Opção C: nanoid de 12 Caracteres Alfanuméricos
- Geração de identificadores com base no alfabeto base62 (`0-9a-zA-Z`), fixando o comprimento em 12 caracteres.
- **Vantagens:** URLs curtas e amigáveis (ex.: `/videos/HP8JZ2O3bROa`), espaço amostral de $62^{12} \approx 3,22 \times 10^{21}$ combinações (probabilidade de colisão matematicamente desprezível), imprevisibilidade contra varredura/scraping não autorizado de vídeos não listados e indexação B-Tree compacta e de alta performance no PostgreSQL com constraint `UNIQUE`.
- **Desvantagens:** Requer dependência externa (`nanoid@^3.3.11`).

**Decision:** **Opção C — nanoid (12 caracteres base62)**. Oferece padrão estético equivalente ao YouTube, separação estrita entre chave primária interna e identificador de roteamento público, e segurança contra enumeração.

---

## TD-05: Estratégia de Reprodução via Streaming e Download

**Scope:** Backend / Object Storage

**Capability:** Reprodução de vídeo sem retenção completa (streaming) e download direto de arquivos

**Context:** Os vídeos devem iniciar a reprodução instantaneamente no navegador do usuário, permitindo navegação arbitrária pela linha do tempo (seek) sem necessitar aguardar o download integral de arquivos de até 10GB. O download integral do arquivo original também deve ser disponibilizado através de um endpoint específico.

**Options:**

### Opção A: Transcoding Dinâmico para HLS / MPEG-DASH (Segmentação em pedaços `.ts` / `.m4s`)
- Processar o vídeo dividindo-o em playlists e segmentos curtos com múltiplos bitrates adaptativos.
- **Vantagens:** Qualidade adaptativa à largura de banda do usuário final.
- **Desvantagens:** Custo computacional excessivo no worker para transcodificar arquivos de 10GB antes de disponibilizar o primeiro frame, violando o tempo de resposta do aceite; o enunciado da Fase 03 especifica explicitamente suporte a streaming HTTP 206 e download direto do arquivo enviado.

### Opção B: HTTP 206 Partial Content com Suporte a RFC 7233 Range Requests
- O endpoint `/videos/:publicId/stream` interpreta o cabeçalho HTTP `Range: bytes=start-end`, obtém o stream parcial diretamente do MinIO via comando `@aws-sdk/client-s3` com o parâmetro `Range`, e responde com status HTTP 206, cabeçalhos `Accept-Ranges: bytes`, `Content-Range: bytes start-end/total` e `Content-Length`.
- **Vantagens:** Suporte nativo em todas as tags `<video>` HTML5 e players modernos, seek instantâneo sem necessidade de pré-processamento pesado de transcoding, e eficiência extrema de I/O transmitindo apenas os bytes solicitados pelo player. O endpoint de download `/videos/:publicId/download` fornece o stream com o cabeçalho `Content-Disposition: attachment; filename="<original_filename>"`.
- **Desvantagens:** Não faz adaptação automática de resolução conforme a banda do cliente (escopo reservado para fases avançadas de CDN e HLS).

**Decision:** **Opção B — HTTP 206 Partial Content (RFC 7233) e Download com Content-Disposition**. Atende perfeitamente aos requisitos funcionais do desafio, sem introduzir complexidade de transcoding fora do escopo da Fase 03.

---

## TD-06: Máquina de Estados Finita e Garantia de Idempotência

**Scope:** Backend / Domínio

**Capability:** Ciclo de vida determinístico de status e prevenção de processamentos duplicados

**Context:** O ciclo de vida de um vídeo envolve múltiplas etapas assíncronas (criação do rascunho, recepção dos dados pelo protocolo tus, notificação de conclusão, enfileiramento no BullMQ e execução no worker). É imperativo assegurar consistência transacional, prevenir processamentos duplicados em caso de retentativas de rede e garantir isolamento de acesso (anti-IDOR e visibilidade pública/privada).

**Estados Definidos:**
1. `DRAFT`: Registro pré-criado via `POST /videos/upload/init`, associado ao canal autenticado e com chave de idempotência opcional.
2. `UPLOADING`: Upload em progresso via protocolo tus.
3. `PROCESSING`: Bytes confirmados no MinIO pelo gancho `onUploadFinish` ou endpoint `/complete`; tarefa enfileirada no BullMQ. Em caso de falha imediata no enfileiramento do Redis, o status é revertido transacionalmente para `ERROR`.
4. `READY`: Worker concluiu com sucesso a validação por `ffprobe`, extração de dimensões/duração e geração do thumbnail JPEG no MinIO. Apenas vídeos neste status são elegíveis para streaming e download por terceiros.
5. `ERROR`: Falha no processamento (ex.: arquivo corrompido, formato inválido ou esgotamento de retries).

**Garantias Arquiteturais:**
- **Idempotência no Pré-cadastro:** Suporte a cabeçalho/campo `idempotencyKey`, persistido no banco com índice único condicional no PostgreSQL (`CREATE UNIQUE INDEX "UQ_videos_idempotency_key" ON "videos" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL`). Requisições com a mesma chave retornam o registro existente sem criar duplicatas.
- **Segurança Anti-IDOR e Autorização:** A criação de rascunho exige que o usuário autenticado seja o legítimo proprietário do canal (`channel.user_id === user.sub`), respondendo `403 Forbidden` (`CHANNEL_OWNERSHIP_ERROR`) em tentativas cruzadas.
- **Mascaramento de Entidades:** Endpoints HTTP retornam DTOs estruturados (`VideoResponseDto`), garantindo que UUIDs internos, chaves de armazenamento de arquivos (`video_key`) e identificadores de usuários de outros canais nunca sejam expostos ao cliente.
- **Controle de Privacidade:** Vídeos com visibilidade `PRIVATE` só podem ser acessados (detalhes, stream, download) pelo próprio dono do canal; tentativas por outros usuários ou clientes anônimos são rejeitadas com `403 Forbidden`.

**Decision:** Máquina de estados determinística com enum `VideoStatus`, índice único condicional de idempotência e validação rigorosa de propriedade de canal e visibilidade em todas as camadas de serviço.
