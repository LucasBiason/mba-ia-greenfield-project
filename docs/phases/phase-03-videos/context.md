---
kind: phase
name: phase-03-videos
sources_mtime:
  docs/project-plan.md: "2026-09-28T17:25:00-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-09-28T17:27:00-03:00"
  docs/phases/phase-01-configuracao-base/phase-01-configuracao-base.md: "2026-04-08T14:58:57-03:00"
  docs/phases/phase-02-auth/phase-02-auth.md: "2026-05-12T13:36:17-03:00"
---

# phase-03-videos — Context

## Scope

**Phase name:** Fase 03 — Upload e Processamento de Vídeos

**Capabilities:**

- Serviço de armazenamento de arquivos (vídeos e thumbnails em Object Storage / MinIO)
- Serviço de processamento em segundo plano (filas com Redis + BullMQ)
- Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance (protocolo tus)
- Pré-cadastro automático do vídeo como rascunho ao iniciar o upload
- Processamento automático do vídeo após upload (extração de duração e metadados via FFmpeg)
- Geração automática de thumbnail a partir de um frame do vídeo
- URL única por vídeo, sem conflito com outros vídeos (nanoid)
- Reprodução via streaming (HTTP 206 Partial Content sem necessidade de download completo)
- Download do vídeo pelo usuário
- Endpoint de thumbnail (`GET /videos/:publicId/thumbnail`) servindo JPEG gerado pelo FFmpeg
- Interface frontend do Creator Studio (`/studio`, `/studio/upload`) com upload retomável via tus
- Página de reprodução de vídeo (`/watch/[publicId]`)
- Camada BFF autenticada com renovação automática de tokens via iron-session (`withAuthenticatedUpstream`)
- Ciclo de status e visibilidade persistidos em banco de dados

**Out of scope:**
- Comentários, likes, dislikes, inscrições, feeds sociais e painel analítico avançado (Fases 04 em diante).

**Deliverables:**
- Módulo `src/videos/` no backend NestJS incluindo endpoint dedicado de thumbnail.
- Migration TypeORM criando a tabela `videos` com relacionamento com `channels`.
- Infraestrutura Docker Compose atualizada com MinIO, Redis e Worker FFmpeg.
- Banco de testes isolado (`streamtube_test`) e seed idempotente (`seed.ts`).
- Frontend Creator Studio (`/studio`, `/studio/upload`), página `/watch/[publicId]` e rotas BFF (`/api/videos/**`).
- Suítes completas de testes unitários e de integração verdes (backend >90% de cobertura, frontend 100% verde).
- Documentação e regras do `CLAUDE.md` atualizadas.

**Affected subprojects:** `nestjs-project/`, `next-frontend/`

**Sequencing notes:** Depende diretamente da Fase 01 (Configuração Base) e Fase 02 (Cadastro, Login e Canais).

**Neighbors (for boundary detection):** Fase 02 (prior — fornece `User` e `Channel`), Fase 04 — Gerenciamento de Vídeos e Canal (next).

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries |
|-----|--------|-------|-------|--------|----------|-----------|
| phase-03-videos/TD-01 | technical-decisions-phase-03-videos.md | Backend / Infra | Fila de Mensageria Assíncrona | decided | C (BullMQ + Redis) | `@nestjs/bullmq@^11.0.2`, `bullmq@^5.41.0` |
| phase-03-videos/TD-02 | technical-decisions-phase-03-videos.md | Backend | Estratégia de Upload 10GB | decided | C (Protocolo tus com S3Store) | `@tus/server@^2.4.5`, `@tus/s3-store@^2.0.7` |
| phase-03-videos/TD-03 | technical-decisions-phase-03-videos.md | Backend / Worker | Worker Standalone e FFmpeg | decided | B (Worker isolado + FFmpeg/ffprobe) | `fluent-ffmpeg@^2.1.3`, `@types/fluent-ffmpeg@^2.1.28` |
| phase-03-videos/TD-04 | technical-decisions-phase-03-videos.md | Backend | Identificador Público Único | decided | C (nanoid 12 chars base62) | `nanoid@^3.3.11` |
| phase-03-videos/TD-05 | technical-decisions-phase-03-videos.md | Backend / Storage | Streaming e Download | decided | B (HTTP 206 Range + Presigned S3) | `@aws-sdk/client-s3@^3.1142.0`, `@aws-sdk/s3-request-presigner@^3.1142.0` |
| phase-03-videos/TD-06 | technical-decisions-phase-03-videos.md | Backend / Domínio | Ciclo de Vida e Estados | decided | Enum `VideoStatus`: DRAFT, UPLOADING, PROCESSING, READY, ERROR | TypeORM |

_Source files:_

- `docs/decisions/technical-decisions-phase-03-videos.md`

## Capability Coverage

Todas as 10 capacidades da Fase 03 estão rigorosamente cobertas pelas decisões técnicas registradas e pelo plano de implementação associado.
