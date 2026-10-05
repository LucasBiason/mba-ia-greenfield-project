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
- Ciclo de status e visibilidade persistidos em banco de dados

**Out of scope:**
- Interface frontend de vídeo (player, componentes visuais — conforme enunciado oficial, a interface de vídeo não faz parte do escopo desta fase).
- Comentários, likes, dislikes, inscrições, feeds sociais e painel analítico (Fases 04 em diante).

**Deliverables:**
- Módulo `src/videos/` no backend NestJS.
- Migration TypeORM criando a tabela `videos` com relacionamento com `channels`.
- Infraestrutura Docker Compose atualizada com MinIO, Redis e Worker FFmpeg.
- Suíte de testes unitários e de integração verdes.
- Documentação e regras do `CLAUDE.md` atualizadas.

**Affected subprojects:** `nestjs-project/`

**Deferred subprojects:** `next-frontend/` (player de vídeo diferido para fases subsequentes).

**Sequencing notes:** Depende diretamente da Fase 01 (Configuração Base) e Fase 02 (Cadastro, Login e Canais).

**Neighbors (for boundary detection):** Fase 02 (prior — fornece `User` e `Channel`), Fase 04 — Gerenciamento de Vídeos e Canal (next).

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries |
|-----|--------|-------|-------|--------|----------|-----------|
| phase-03-videos/TD-01 | technical-decisions-phase-03-videos.md | Backend / Infra | Fila de Mensageria Assíncrona | decided | B (BullMQ + Redis) | `@nestjs/bullmq@^12.x`, `bullmq@^6.x` |
| phase-03-videos/TD-02 | technical-decisions-phase-03-videos.md | Backend | Estratégia de Upload 10GB | decided | B (Protocolo tus com S3Store) | `@tus/server@^2.x`, `@tus/s3-store@^2.x` |
| phase-03-videos/TD-03 | technical-decisions-phase-03-videos.md | Backend / Worker | Worker Standalone e FFmpeg | decided | B (Worker isolado + FFmpeg/ffprobe) | `fluent-ffmpeg@^2.x`, `@types/fluent-ffmpeg` |
| phase-03-videos/TD-04 | technical-decisions-phase-03-videos.md | Backend | Identificador Público Único | decided | B (nanoid de alta entropia) | `nanoid@^3.3.x` |
| phase-03-videos/TD-05 | technical-decisions-phase-03-videos.md | Backend / Storage | Streaming e Download | decided | B (HTTP 206 Range + Presigned S3) | `@aws-sdk/client-s3@^3.x`, `@aws-sdk/s3-request-presigner` |
| phase-03-videos/TD-06 | technical-decisions-phase-03-videos.md | Backend / Domínio | Ciclo de Vida e Estados | decided | B (Enum `VideoStatus`: DRAFT, UPLOADING, PROCESSING, READY, ERROR) | TypeORM |

_Source files:_

- `docs/decisions/technical-decisions-phase-03-videos.md`

## Capability Coverage

Todas as 10 capacidades da Fase 03 estão rigorosamente cobertas pelas decisões técnicas registradas e pelo plano de implementação associado.
