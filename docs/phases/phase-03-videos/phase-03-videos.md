---
kind: phase
name: phase-03-videos
sources_mtime:
  docs/project-plan.md: "2026-09-28T17:25:00-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-09-28T17:27:00-03:00"
  docs/phases/phase-03-videos/context.md: "2026-09-28T17:27:00-03:00"
  docs/phases/phase-03-videos/validation.md: "2026-09-28T17:27:00-03:00"
  docs/phases/phase-03-videos/library-refs.md: "2026-09-28T17:27:00-03:00"
---

# Phase 03 — Upload e Processamento de Vídeos

## Objective

Entregar a infraestrutura e o módulo backend completo de ingestão e processamento de vídeos: upload retomável de arquivos pesados de até 10GB sem travar a API NestJS, pré-cadastro automático como rascunho, fila assíncrona com Redis + BullMQ, worker dedicado com FFmpeg para extração de metadados e geração de thumbnail, identificador público único nanoid, streaming por HTTP 206 Partial Content e download.

---

## Step Implementations

### SI-03.1 — Dependências, Namespaces de Configuração e Topologia Docker Compose

**Description:** Instalar as dependências de produção da Fase 03 em `nestjs-project/package.json`, criar os namespaces de configuração (`storage` e `queue`) seguindo o padrão `registerAs`, validar variáveis com Joi em `env.validation.ts` e adicionar os serviços `storage` (MinIO), `queue` (Redis) e `worker` no `nestjs-project/compose.yaml`.

**Technical actions:**
- Instalar dependências em `nestjs-project`: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `@tus/server`, `@tus/s3-store`, `@nestjs/bullmq`, `bullmq`, `fluent-ffmpeg`, `@types/fluent-ffmpeg`, `nanoid`.
- Criar `src/config/storage.config.ts`: `registerAs('storage', ...)` com `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_USE_SSL`, `STORAGE_REGION`, `STORAGE_BUCKET_VIDEOS`, `STORAGE_BUCKET_THUMBNAILS`.
- Criar `src/config/queue.config.ts`: `registerAs('queue', ...)` com `REDIS_HOST`, `REDIS_PORT`.
- Atualizar `src/config/env.validation.ts` e `.env.example`.
- Atualizar `compose.yaml`:
  - `storage`: imagem `minio/minio:RELEASE.2024-08-17T01-24-54Z`, portas 9000 (API) e 9001 (Console).
  - `queue`: imagem `redis:7-alpine`, porta 6379.
  - `worker`: container Node.js com binários `ffmpeg` e comando `npm run start:worker:dev`.

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| `src/config/env.validation.integration-spec.ts` | Integration | Validação de schema Joi das variáveis de ambiente de storage e queue |

**Dependencies:** Nenhuma.

**Acceptance criteria:**
- A aplicação inicia sem erros quando as variáveis de storage e queue estão presentes.
- Containers `storage` e `queue` respondem com sucesso no Docker Compose.

---

### SI-03.2 — Entidade Video, Enums de Ciclo de Vida e Migration TypeORM

**Description:** Definir a entidade `Video` ligada ao `Channel` (relação N:1), com campo `file_size` (bigint para suportar 10GB), enums `VideoStatus` e `VideoVisibility`, índices únicos em `public_id` e migration versionada.

**Technical actions:**
- Criar `src/videos/enums/video-status.enum.ts` (`DRAFT`, `UPLOADING`, `PROCESSING`, `READY`, `ERROR`).
- Criar `src/videos/enums/video-visibility.enum.ts` (`PUBLIC`, `UNLISTED`, `PRIVATE`).
- Criar `src/videos/entities/video.entity.ts`:
  - `id`: UUID (PK).
  - `public_id`: nanoid de 12 caracteres (Unique Index).
  - `title`: varchar(150), nullable no draft.
  - `description`: text, nullable.
  - `channel_id`: UUID (FK para `channels`).
  - `status`: enum `VideoStatus`.
  - `visibility`: enum `VideoVisibility`.
  - `file_size`: bigint (para até 10GB).
  - `original_filename`: varchar(255).
  - `video_key`: varchar(255) (chave no bucket do MinIO).
  - `thumbnail_key`: varchar(255), nullable.
  - `duration_in_seconds`: integer, nullable.
  - `metadata`: jsonb (resolução, bitrate, codec).
  - `idempotency_key`: varchar(255), nullable, unique condicional (`WHERE idempotency_key IS NOT NULL`).
  - `created_at` e `updated_at`.
- Criar migration versionada TypeORM `src/database/migrations/1790280000000-CreateVideos.ts` definindo PK com `uuid_generate_v4()`, índice `"UQ_videos_public_id"`, índice condicional `"UQ_videos_idempotency_key"`, foreign key cascade com canais e índices auxiliares.

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| `src/database/migrations.integration-spec.ts` | Integration | Execução reversível da migration de criação da tabela videos e constraints |

**Dependencies:** SI-03.1

**Acceptance criteria:**
- `npm run migration:run` cria a tabela `videos` com foreign keys, constraints e tipos corretos.
- Entidade suporta números de bytes até 10GB sem overflow de inteiros.

---

### SI-03.3 — Camada de Object Storage (MinIO / S3Client)

**Description:** Criar o módulo global `StorageModule` e serviço `StorageService` para encapsular operações com o MinIO local e S3 compatível: inicialização de buckets, streaming com suporte a Range requests e geração de URLs pré-assinadas.

**Technical actions:**
- Criar `src/storage/storage.service.ts`:
  - Inicialização do `S3Client` com `forcePathStyle: true`.
  - Método `onModuleInit` garantindo que os buckets `videos` e `thumbnails` existem (`ensureBucketsExist`).
  - `getSignedDownloadUrl(key, filename, expiresIn)`.
  - `getVideoStream(key, rangeHeader)`: retorna stream parcial e headers HTTP `206` ou stream integral `200`.
  - `uploadBuffer(bucket, key, buffer, mimeType)`.
- Criar `src/storage/storage.module.ts` (@Global).

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| `src/storage/storage.service.spec.ts` | Unit | Parse de range RFC 7233, chamadas de stream e geração de URLs assinadas |
| `src/storage/storage.service.integration-spec.ts` | Integration | Interação real com o MinIO via S3Client, verificação de buckets e upload |

**Dependencies:** SI-03.1

**Acceptance criteria:**
- Buckets são criados automaticamente no bootstrap.
- Leitura parcial com `Range: bytes=0-1024` retorna exatamente a fatia solicitada.

---

### SI-03.4 — Upload Retomável de 10GB com Protocolo tus e Pré-cadastro (Draft)

**Description:** Implementar o fluxo de ingestão resiliente via protocolo tus: endpoint para pré-cadastro de draft (`POST /videos/upload/init`), delegação de requisições tus (`ALL /videos/upload*`) usando `S3Store` e validações anti-IDOR para garantir que o usuário autenticado é proprietário do canal.

**Technical actions:**
- Criar `src/videos/dto/init-upload.dto.ts` com validação de cap de 10GB (`MAX_VIDEO_FILE_SIZE_BYTES = 10 * 1024 * 1024 * 1024`) e formatos MIME permitidos (`video/mp4`, `video/webm`, `video/quicktime`).
- Criar `src/videos/dto/complete-upload.dto.ts` com validação estrita anti-IDOR de chave de storage.
- Criar `src/videos/videos.service.ts`:
  - `initUpload(dto, userId)`: valida se o canal pertence ao usuário (Anti-IDOR), verifica idempotência, gera `public_id` via nanoid e persiste o rascunho com status `DRAFT`.
  - Integração do `Server` tus com `S3Store` apontando para o MinIO.
  - Validação de sessão tus em `onUploadCreate` (rejeita draft inexistente ou estado inválido).
  - Gancho `onUploadFinish`: marca o vídeo como `PROCESSING` e despacha para a fila BullMQ.
- Criar `src/videos/videos.controller.ts` com rotas protegidas pelo JWT Guard da Fase 02.

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| `src/videos/videos.controller.spec.ts` | Unit | Validação DTO, handlers de rotas de vídeo e respostas DTO |
| `src/videos/videos.service.spec.ts` | Unit | Regras de negócio de draft, anti-IDOR, idempotência e ganchos tus |
| `src/videos/videos.service.integration-spec.ts` | Integration | Persistência de drafts no PostgreSQL e validação de permissões |
| `test/videos.e2e-spec.ts` | E2E | Ingestão tus (OPTIONS, POST, PATCH) e fluxo completo de upload |

**Dependencies:** SI-03.2, SI-03.3

**Acceptance criteria:**
- Requisição com arquivo acima de 10GB é rejeitada com status 413 (`FileTooLargeException`).
- Tentativa de upload em canal de outro usuário é bloqueada com status 403 (`ChannelOwnershipException`).
- O rascunho é persistido no banco no início do upload com status `DRAFT`.

---

### SI-03.5 — Configuração da Fila BullMQ e Publicação de Jobs

**Description:** Configurar o `BullModule` no backend e implementar a publicação do evento assíncrono de processamento de vídeo quando o upload tus é finalizado.

**Technical actions:**
- Registrar `BullModule.forRootAsync` conectado ao host Redis `queue`.
- Registrar a fila `video-processing` no `VideosModule`.
- Publicar job `process-video` contendo `{ videoId, videoKey, channelId }` com 3 tentativas e backoff exponencial. Em caso de falha de publicação no Redis, atualizar deterministicamente o status para `ERROR` e relançar exceção.

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| `src/videos/videos.service.spec.ts` | Unit | Publicação resiliente de jobs com tratamento de falhas transacionais |
| `src/videos/videos.service.integration-spec.ts` | Integration | Conectividade da fila e enfileiramento de jobs no Redis |

**Dependencies:** SI-03.4

**Acceptance criteria:**
- Ao finalizar o upload, o job é adicionado na fila Redis sem bloquear a resposta HTTP.

---

### SI-03.6 — Worker Standalone de Vídeo com FFmpeg

**Description:** Criar o processador assíncrono e entrypoint standalone do worker (`src/worker.ts`) consumindo a fila `video-processing`. Executa `ffprobe` para extrair metadados e duração, gera o thumbnail JPG e atualiza o vídeo para `READY` ou `ERROR`.

**Technical actions:**
- Criar `src/videos/processors/video-processing.processor.ts` (@Processor('video-processing')):
  - Baixa chunk/arquivo ou executa pipeline FFmpeg via stream.
  - Extrai metadados: duração em segundos, largura, altura, codec de vídeo/áudio.
  - Renderiza frame de thumbnail em `1280x720` JPG na marca de 1 segundo e envia para o bucket `thumbnails` no MinIO.
  - Atualiza a entidade `Video` para `status = READY`, salvando `duration_in_seconds`, `thumbnail_key` e metadados.
  - Em caso de falha após 3 tentativas, transiciona deterministicamente para `status = ERROR`.
- Criar `src/worker.module.ts` isolando o processamento do bootstrap HTTP da API.
- Criar `src/worker.ts` utilizando `NestFactory.createApplicationContext` para executar fora do servidor HTTP com comando `npm run start:worker:dev`.

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| `src/videos/ffmpeg.service.spec.ts` | Unit | Chamadas a ffprobe e geração de screenshots de thumbnail |
| `src/videos/processors/video-processing.processor.spec.ts` | Unit | Processamento do job BullMQ, persistência de metadados e transições de status |
| `src/videos/processors/video-processing.integration-spec.ts` | Integration | Execução de job real com Redis, MinIO e PostgreSQL |

**Dependencies:** SI-03.5

**Acceptance criteria:**
- Vídeo processado com sucesso tem status alterado para `READY` e thumbnail visível no storage.
- Vídeo corrompido é marcado com status `ERROR` após tentativas sem derrubar a API.

---

### SI-03.7 — Streaming HTTP 206 Partial Content e Download

**Description:** Implementar os endpoints de entrega de vídeo no `VideosController`: streaming com suporte ao cabeçalho `Range` e download direto com `Content-Disposition`.

**Technical actions:**
- Rota `GET /videos/:publicId/stream`:
  - Valida se o vídeo está em status `READY` (ou 409 caso ainda esteja processando).
  - Trata o cabeçalho `Range` (ex.: `bytes=0-1048576`).
  - Retorna status `206 Partial Content` com cabeçalhos `Content-Range`, `Accept-Ranges: bytes`, `Content-Length` e o stream do MinIO.
- Rota `GET /videos/:publicId/download`:
  - Retorna stream com `Content-Disposition: attachment; filename="..."` e MIME type inferido dinamicamente.
- Validação de visibilidade privada (apenas o proprietário tem acesso a streams e downloads de vídeos `PRIVATE`).

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| `src/videos/videos.controller.spec.ts` | Unit | Headers de HTTP 206, Content-Disposition e controle de privacidade |
| `test/videos.e2e-spec.ts` | E2E | Streaming parcial HTTP 206 e download de vídeo contra servidor real |

**Dependencies:** SI-03.3, SI-03.4

**Acceptance criteria:**
- Player HTML5 consegue reproduzir o vídeo e navegar na timeline (seek) via Range requests 206.
- Download transfere o arquivo original íntegro.

---

### SI-03.8 — Suíte de Testes, Validação DoD e Atualização de Documentação

**Description:** Implementar a suíte completa de testes (unitários, integração e e2e), validar o checklist da Definition of Done (testes verdes, tsc código 0, lint verde) e atualizar o `CLAUDE.md`.

**Technical actions:**
- Testes unitários para `videos.service.spec.ts`, `storage.service.spec.ts`, `ffmpeg.service.spec.ts` e `video-processing.processor.spec.ts`.
- Testes de integração com PostgreSQL, MinIO e Redis reais.
- Testes E2E para fluxo completo de autenticação, upload tus, stream e download.
- Executar `npm test -- --runInBand`, `npm run test:e2e`, `npx tsc --noEmit` e `npm run lint`.
- Atualizar `CLAUDE.md` com os novos módulos, comandos e rotas da Fase 03.

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| `test/videos.e2e-spec.ts` | E2E | Fluxo ponta a ponta de upload tus, processamento, streaming e download |
| `test/auth.e2e-spec.ts` | E2E | Integração de autenticação e proteção de rotas privadas |

**Dependencies:** SI-03.1 até SI-03.7

**Acceptance criteria:**
- Suíte completa de testes passa com 100% de sucesso.
- Cobertura de testes >= 90% para o escopo da fase.
- `npx tsc --noEmit` finaliza com código 0.
- `CLAUDE.md` reflete fielmente a codebase implementada.

---

### SI-03.9 — Endpoint de Thumbnail, Enriquecimento de Perfil e Isolamento de Banco de Testes

**Description:** Adicionar endpoint dedicado para servir thumbnails diretamente pelo backend NestJS sem expor o MinIO, enriquecer o perfil do usuário em `GET /auth/me` com seu canal e isolar a base de dados de testes (`streamtube_test`) com seed idempotente.

**Technical actions:**
- Criar endpoint `GET /videos/:publicId/thumbnail` em `VideosController` e método `getThumbnailStream` em `VideosService` que busca a thumbnail gerada no MinIO e a transmite com cabeçalhos `Content-Type: image/jpeg` e `Cache-Control`.
- Atualizar arquivos originados na Fase 02 (`auth.controller.ts`, `auth.service.ts`, `users.service.ts`):
  - Adicionar `findByIdWithChannel` e `findByEmailWithChannel` em `UsersService` para carregar o relacionamento `channel`.
  - Adicionar `getUserProfile` em `AuthService` e atualizar `GET /auth/me` em `AuthController` para devolver os metadados do canal (`channelId`, `channelSlug`).
- Atualizar `src/test/create-test-data-source.ts` para conectar ao banco isolado `streamtube_test`, prevenindo concorrência e destruição de dados no banco `streamtube` de desenvolvimento.
- Implementar `src/database/seeds/seed.ts` idempotente criando usuário demo (`demo@streamtube.com`) e seu canal associado, lendo senha de `SEED_DEMO_PASSWORD`.

**Tests:**
- `src/videos/videos.service.spec.ts` (testes de thumbnail)
- `src/videos/videos.controller.spec.ts` (testes de endpoint de thumbnail)
- `src/users/users.service.integration-spec.ts` (testes de lookup com canal)
- `src/auth/auth.service.spec.ts` e `src/auth/auth.controller.spec.ts` (testes de `GET /auth/me` com canal)

---

### SI-03.10 — Frontend Creator Studio, Upload tus, Watch e Camada BFF Autenticada

**Description:** Implementar a interface do Creator Studio (`/studio`, `/studio/upload`), página de reprodução `/watch/[publicId]` e rotas BFF seguras em Next.js com auto-renovação de token JWT via iron-session.

**Technical actions:**
- Criar tela de upload com drag-and-drop, barra de progresso em tempo real e integração tus em `/studio/upload`.
- Criar dashboard do estúdio em `/studio` listando vídeos e status do criador.
- Criar página `/watch/[publicId]` com player de vídeo consumindo `/videos/:publicId/stream`.
- Criar rotas BFF (`app/api/videos/**`, `app/api/auth/**`) protegidas via `withAuthenticatedUpstream`, interceptando 401 para auto-renovação de tokens ou destruição de cookies de sessão obsoletos.
- Middleware Next.js protegendo `/studio/**` e redirecionando visitantes não autenticados para `/login?callbackUrl=...`.

---

## Technical Specifications

### Data Model (`videos` Table)

```sql
CREATE TABLE "videos" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "public_id" character varying(12) NOT NULL,
    "title" character varying(150),
    "description" text,
    "channel_id" uuid NOT NULL,
    "status" character varying(20) NOT NULL DEFAULT 'DRAFT',
    "visibility" character varying(20) NOT NULL DEFAULT 'PUBLIC',
    "file_size" bigint NOT NULL,
    "original_filename" character varying(255) NOT NULL,
    "video_key" character varying(255) NOT NULL,
    "thumbnail_key" character varying(255),
    "duration_in_seconds" integer,
    "metadata" jsonb,
    "idempotency_key" character varying(255),
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT "PK_videos_id" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UQ_videos_public_id" ON "videos" ("public_id");
CREATE UNIQUE INDEX "UQ_videos_idempotency_key" ON "videos" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;
CREATE INDEX "IDX_videos_channel_id" ON "videos" ("channel_id");
CREATE INDEX "IDX_videos_status" ON "videos" ("status");
ALTER TABLE "videos" ADD CONSTRAINT "FK_videos_channel_id" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
```

### API Contracts

| Método | Rota | Autenticação | Descrição | Status Retorno |
|---|---|---|---|---|
| `POST` | `/videos/upload/init` | JWT Obrigatório | Inicia draft e valida canal (Anti-IDOR) | `201 Created` |
| `PATCH/HEAD/POST` | `/videos/upload/*` | Protocolo tus | Ingestão em chunks de até 10GB | `200 / 204` |
| `POST` | `/videos/:publicId/complete` | JWT Obrigatório | Finaliza upload e enfileira no BullMQ | `200 OK` |
| `GET` | `/videos/:publicId` | Opcional | Obtém detalhes públicos do vídeo | `200 OK` / `403` / `404` |
| `PATCH` | `/videos/:publicId` | JWT Obrigatório | Atualiza título, descrição e visibilidade | `200 OK` / `403` / `404` |
| `GET` | `/videos/:publicId/stream` | Opcional | Streaming HTTP 206 com Range headers | `206 Partial Content` |
| `GET` | `/videos/:publicId/thumbnail` | Opcional | Transmite binário JPEG da thumbnail | `200 OK` / `404 Not Found` |
| `GET` | `/videos/:publicId/download`| Opcional | Download do arquivo original com Content-Disposition | `200 OK` / `403` / `404` |
| `GET` | `/auth/me` | JWT Obrigatório | Obtém perfil do usuário enriquecido com canal | `200 OK` / `401 Unauthorized` |

### Authorization Matrix

- **Iniciação de Upload (`POST /videos/upload/init`):** Usuário deve estar autenticado e ser o dono legítimo do canal fornecido (`channel.user_id === user.id`). Violações disparam `ChannelOwnershipException` (403).
- **Visualização e Streaming:** Vídeos com visibilidade `PUBLIC` ou `UNLISTED` acessíveis por qualquer visitante anônimo pelo `public_id`. Vídeos `PRIVATE` acessíveis apenas pelo dono do canal.

### Error Catalog

| Código de Exceção | HTTP Status | Causa |
|---|---|---|
| `FILE_TOO_LARGE` | `413 Payload Too Large` | Arquivo informado excede o teto de 10GB. |
| `UNSUPPORTED_VIDEO_FORMAT` | `415 Unsupported Media Type` | Tipo MIME não suportado (permitidos: mp4, webm, quicktime). |
| `CHANNEL_NOT_FOUND` | `404 Not Found` | Canal de destino não existe. |
| `CHANNEL_OWNERSHIP_ERROR`| `403 Forbidden` | Usuário autenticado tentou publicar em canal alheio. |
| `VIDEO_NOT_FOUND` | `404 Not Found` | Vídeo não localizado pelo `public_id`. |
| `VIDEO_NOT_READY` | `409 Conflict` | Tentativa de streaming antes do término do processamento. |

### Events & Messages (BullMQ)

- **Fila:** `video-processing`
- **Job Name:** `process-video`
- **Payload Schema:**
  ```json
  {
    "videoId": "uuid",
    "videoKey": "videos/<publicId>/original.mp4",
    "channelId": "uuid"
  }
  ```
- **Políticas de Resiliência:** 3 tentativas com backoff exponencial (5000ms base).

---

## Dependency Map & Deliverables

```mermaid
flowchart TD
    SI1["SI-03.1: Infraestrutura Compose, Configs e Deps"] --> SI2["SI-03.2: Entidade Video e Migration"]
    SI1 --> SI3["SI-03.3: Storage Service MinIO"]
    SI2 --> SI4["SI-03.4: Upload tus 10GB e Draft"]
    SI3 --> SI4
    SI4 --> SI5["SI-03.5: Fila BullMQ e Dispatcher"]
    SI5 --> SI6["SI-03.6: Worker Standalone FFmpeg"]
    SI3 --> SI7["SI-03.7: Streaming 206 e Download"]
    SI4 --> SI7
    SI6 --> SI8["SI-03.8: Testes, DoD e CLAUDE.md"]
    SI7 --> SI8
```

**Deliverables da Fase 03:**
1. Ingestão de arquivos de até 10GB funcional com protocolo tus e MinIO.
2. Processamento assíncrono em fila com extração de duração e thumbnail.
3. Streaming por Range HTTP 206 e download do arquivo.
4. URLs curtas únicas geradas por nanoid.
5. Suíte de testes automatizados completa e verde.
