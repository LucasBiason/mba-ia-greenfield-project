---
kind: phase
name: phase-03-videos
status: in_progress
sources_mtime:
  docs/phases/phase-03-videos/phase-03-videos.md: "2026-09-28T17:28:00-03:00"
---

# phase-03-videos — Progress

**Status:** in_progress
**SIs:** 0/8 completed

### SI-03.1 — Dependencies, Configuration Namespaces, and Docker Compose
- **Status:** planned
- **Tests:** env.validation.integration-spec.ts
- **Observations:** Configuração inicial de storageConfig e queueConfig, compose.yaml com MinIO e Redis.

### SI-03.2 — Video Entity, Enums, and TypeORM Migrations
- **Status:** planned
- **Tests:** migrations.integration-spec.ts
- **Observations:** Modelagem da entidade Video e migration CreateVideos com índice de idempotência.

### SI-03.3 — Object Storage Service (MinIO / S3Client)
- **Status:** planned
- **Tests:** storage.service.spec.ts, storage.service.integration-spec.ts
- **Observations:** Implementação do StorageService com @aws-sdk/client-s3 e inicialização de buckets.

### SI-03.4 — Resumable Upload (tus protocol), Draft, and Security (anti-IDOR)
- **Status:** planned
- **Tests:** videos.service.spec.ts, videos.controller.spec.ts, videos.service.integration-spec.ts
- **Observations:** Ingestão de vídeos até 10GB via protocolo tus e validação de canais.

### SI-03.5 — BullMQ Queue and Processing Enqueue
- **Status:** planned
- **Tests:** videos.service.spec.ts, videos.service.integration-spec.ts
- **Observations:** Enfileiramento de jobs de processamento assíncrono.

### SI-03.6 — Standalone Video Worker with FFmpeg
- **Status:** planned
- **Tests:** ffmpeg.service.spec.ts, video-processing.processor.spec.ts, video-processing.integration-spec.ts
- **Observations:** Processamento com FFmpeg/ffprobe, extração de metadados e thumbnail.

### SI-03.7 — HTTP 206 Streaming and Direct Download
- **Status:** planned
- **Tests:** videos.e2e-spec.ts
- **Observations:** Streaming com Range requests (RFC 7233) e download direto.

### SI-03.8 — Test Suite, End-to-End, and Verification
- **Status:** planned
- **Tests:** npm test, test:e2e
- **Observations:** Validação completa da Definition of Done.

---

## Deliverables Status

- [ ] Upload de até 10GB funcional sem travar a API (tus protocol + MinIO)
- [ ] Pré-cadastro automático como rascunho com suporte a idempotência
- [ ] Processamento automático de vídeo (duração e metadados)
- [ ] Geração automática de thumbnail via FFmpeg
- [ ] URL única por vídeo via nanoid
- [ ] Streaming HTTP 206 Partial Content funcional (RFC 7233)
- [ ] Download do vídeo disponível com Content-Disposition attachment
- [ ] Docker Compose atualizado com MinIO, Redis e Worker dedicado
- [ ] Definition of Done verde (testes, tsc, lint)
