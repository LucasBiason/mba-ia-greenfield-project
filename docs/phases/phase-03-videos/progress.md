---
kind: phase
name: phase-03-videos
status: completed
sources_mtime:
  docs/phases/phase-03-videos/phase-03-videos.md: "2026-09-28T17:28:00-03:00"
---

# phase-03-videos — Progress

**Status:** completed
**SIs:** 8/8 completed

### SI-03.1 — Dependencies, Configuration Namespaces, and Docker Compose
- **Status:** completed
- **Tests:** env.validation.integration-spec.ts (6/6 passing)
- **Observations:** Configurados `storageConfig` (MinIO) e `queueConfig` (Redis) com validação estrita via Joi. `compose.yaml` atualizado com MinIO, Redis e worker standalone rodando com o comando `npm run start:worker:dev`.

### SI-03.2 — Video Entity, Enums, and TypeORM Migrations
- **Status:** completed
- **Tests:** migrations.integration-spec.ts (2/2 passing)
- **Observations:** Entidade `Video` alinhada com a migration `1790280000000-CreateVideos`. Índice único condicional `UQ_videos_idempotency_key` criado com `WHERE "idempotency_key" IS NOT NULL`. Removidos getters e setters redundantes camelCase da entidade.

### SI-03.3 — Object Storage Service (MinIO / S3Client)
- **Status:** completed
- **Tests:** storage.service.spec.ts (15/15 passing), storage.service.integration-spec.ts (6/6 passing)
- **Observations:** `StorageService` utiliza `@aws-sdk/client-s3` com `forcePathStyle: true`. Implementados `ensureBucketsExist`, `uploadBuffer`, `getVideoStream` e `getSignedDownloadUrl`. Limpos fallbacks de ambiente legados e removidos métodos não utilizados.

### SI-03.4 — Resumable Upload (tus protocol), Draft, and Security (anti-IDOR)
- **Status:** completed
- **Tests:** videos.service.spec.ts (15/15 passing), videos.controller.spec.ts (11/11 passing), videos.service.integration-spec.ts (11/11 passing)
- **Observations:** Protocolo tus integrado com `@tus/server` e `@tus/s3-store` apontando para o bucket `videos` no MinIO. Validação estrita de propriedade do canal no `initUpload` (rejeita não proprietários com 403 `CHANNEL_OWNERSHIP_ERROR`). Mascaramento de entidades internas via `VideoResponseDto`.

### SI-03.5 — BullMQ Queue and Processing Enqueue
- **Status:** completed
- **Tests:** videos.service.spec.ts, videos.service.integration-spec.ts
- **Observations:** Fila `video-processing` isolada. `VideosService.enqueueVideoProcessing` atualiza transacionalmente o status para `VideoStatus.ERROR` caso o enfileiramento no Redis falhe e relança a exceção.

### SI-03.6 — Standalone Video Worker with FFmpeg
- **Status:** completed
- **Tests:** ffmpeg.service.spec.ts (4/4 passing), video-processing.processor.spec.ts (4/4 passing), video-processing.integration-spec.ts (3/3 passing)
- **Observations:** `VideoProcessingProcessor` registrado exclusivamente no `WorkerModule`. Execução com FFmpeg e ffprobe com estratégia otimizada de I/O (stream remoto via presigned URL com fallback local em `/tmp` com garantia de cleanup no bloco `finally`).

### SI-03.7 — HTTP 206 Streaming and Direct Download
- **Status:** completed
- **Tests:** videos.e2e-spec.ts (17/17 passing)
- **Observations:** Endpoint `/videos/:publicId/stream` suporta RFC 7233 Range requests (`bytes=start-end`), respondendo HTTP 206 Partial Content e HTTP 200 para stream integral. Endpoint `/videos/:publicId/download` fornece o binário com cabeçalho `Content-Disposition: attachment; filename="<original_filename>"`. Controle de privacidade validado (`PRIVATE` só acessível pelo proprietário).

### SI-03.8 — Test Suite, End-to-End, and Verification
- **Status:** completed
- **Tests:** 32 suítes, 234 testes no backend (100% aprovados) e 22 suítes, 84 testes no frontend (100% aprovados)
- **Observations:** Cobertura de código dos serviços de domínio e controladores core acima de 95% de linhas (`src/users`: 100%, `src/channels`: 100%, `src/storage`: 100%, `src/mail`: 100%, `src/auth`: 99.37%, `src/videos`: 94.77%). `npx tsc --noEmit` exit 0, `eslint` exit 0.

### SI-03.9 — Thumbnail Endpoint, User Profile Enrichment, and Test DB Isolation
- **Status:** completed
- **Tests:** videos.service.spec.ts, videos.controller.spec.ts, users.service.integration-spec.ts, auth.service.spec.ts, auth.controller.spec.ts
- **Observations:** Endpoint `GET /videos/:publicId/thumbnail` implementado e coberto por testes unitários; `GET /auth/me` enriquecido com `channelId` e `channelSlug` com cobertura total; base `streamtube_test` isolada para prevenir perda de dados e `seed.ts` idempotente parametrizado via `SEED_DEMO_PASSWORD`.

### SI-03.10 — Frontend Creator Studio, tus Upload, and Authenticated BFF
- **Status:** completed
- **Tests:** 22 suítes, 84 testes aprovados (Vitest)
- **Observations:** Implementadas páginas `/studio`, `/studio/upload` e `/watch/[publicId]`. Rotas BFF (`/api/videos/**`, `/api/auth/**`) protegidas via `withAuthenticatedUpstream`, interceptando 401 para auto-renovação de tokens ou destruição de cookies de sessão obsoletos. Middleware redirecionando visitantes não autenticados.

---

## Deliverables Status

- [x] Upload de até 10GB funcional sem travar a API (tus protocol + MinIO)
- [x] Pré-cadastro automático como rascunho com suporte a idempotência
- [x] Processamento automático de vídeo (duração e metadados)
- [x] Geração automática de thumbnail via FFmpeg
- [x] Endpoint de thumbnail dedicado (`GET /videos/:publicId/thumbnail`)
- [x] Perfil de usuário em `GET /auth/me` enriquecido com dados do canal
- [x] Banco de dados de testes isolado (`streamtube_test`) e seed idempotente
- [x] Frontend Creator Studio (`/studio`, `/studio/upload`) com upload tus e página `/watch/[publicId]`
- [x] Camada BFF Next.js com sessão segura, auto-renovação de token em 401 e redirecionamento de login
- [x] URL única por vídeo via nanoid
- [x] Streaming HTTP 206 Partial Content funcional (RFC 7233)
- [x] Download do vídeo disponível com Content-Disposition attachment
- [x] Docker Compose atualizado com MinIO, Redis e Worker dedicado
- [x] Testes de integração (Postgres, MinIO, Redis + FFmpeg) e unitários completos
- [x] Definition of Done verde (32 suítes backend / 234 testes; 22 suítes frontend / 84 testes; tsc 0, lint 0)
