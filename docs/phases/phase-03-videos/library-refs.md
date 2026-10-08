---
kind: phase
name: phase-03-videos
sources_mtime:
  docs/phases/phase-03-videos/context.md: "2026-09-28T17:27:00-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-09-28T17:27:00-03:00"
---

# phase-03-videos — Library References

Este documento fixa as versões oficiais, APIs e padrões de uso das bibliotecas externas introduzidas na Fase 03, garantindo conformidade com a documentação oficial.

---

## 1. Protocolo tus (`@tus/server` & `@tus/s3-store`)

- **Pacotes:** `@tus/server@^2.4.5`, `@tus/s3-store@^2.0.7`
- **Propósito:** Ingestão de vídeos de até 10GB via chunks retomáveis sem reter o arquivo na memória RAM do processo Node.js.
- **Padrão de Integração:**
  - Instanciação de `Server` configurado com `path: '/videos/upload'`, delegando o armazenamento para `S3Store`.
  - Configuração do `S3Store` apontando para o bucket `videos` no MinIO (`endpoint: http://storage:9000`, `forcePathStyle: true`).
  - Gancho `onUploadFinish`: invocado quando o último byte do chunk de 10GB for recebido e confirmado no MinIO, disparando a atualização do status para `PROCESSING` e publicando o job na fila do BullMQ.

---

## 2. Mensageria Assíncrona (`@nestjs/bullmq` & `bullmq`)

- **Pacotes:** `@nestjs/bullmq@^11.0.2`, `bullmq@^5.41.0`
- **Propósito:** Orquestração de tarefas de processamento de vídeo desacopladas do request path HTTP da API.
- **Padrão de Integração:**
  - `BullModule.forRootAsync` conectado ao host Redis `queue:6379`.
  - Fila registrada: `video-processing`.
  - Configuração de jobs:
    - `attempts: 3`
    - `backoff: { type: 'exponential', delay: 5000 }`
    - `removeOnComplete: true`, `removeOnFail: false` (para auditoria em caso de erro terminal).

---

## 3. Extração de Metadados e Thumbnail (`fluent-ffmpeg`)

- **Pacotes:** `fluent-ffmpeg@^2.1.3`, `@types/fluent-ffmpeg@^2.1.28`
- **Propósito:** Inspeção de metadados (`ffprobe`) e extração de thumbnail de frame do vídeo (`ffmpeg`).
- **Padrão de Integração:**
  - Binários `ffmpeg` e `ffprobe` instalados no container do worker via Debian package manager (`apt-get update && apt-get install -y ffmpeg`).
  - Extração de metadados: `ffmpeg.ffprobe(inputPath, (err, metadata) => { ... duration, width, height, codec })`.
  - Extração de thumbnail: `ffmpeg(inputPath).screenshots({ timestamps: ['00:00:01'], filename: 'thumb.jpg', size: '1280x720' })`.

---

## 4. Object Storage SDK (`@aws-sdk/client-s3` & `@aws-sdk/s3-request-presigner`)

- **Pacotes:** `@aws-sdk/client-s3@^3.1142.0`, `@aws-sdk/s3-request-presigner@^3.1142.0`
- **Propósito:** Operações com MinIO/S3 (criação idempotente de buckets `videos` e `thumbnails`, presigned URLs temporárias e streaming com cabeçalho RFC 7233 `Range`).
- **Padrão de Integração:**
  - `S3Client` com `forcePathStyle: true`, credenciais do ambiente e endpoint configurado via `STORAGE_ENDPOINT`.
  - Geração de URLs pré-assinadas com `getSignedUrl(s3Client, command, { expiresIn: 3600 })`.
  - Requisição de stream parcial: `GetObjectCommand({ Bucket, Key, Range: 'bytes=start-end' })`.

---

## 5. Identificador Único (`nanoid`)

- **Pacote:** `nanoid@^3.3.11` (versão CommonJS compatível com o runtime do NestJS).
- **Propósito:** Geração de identificadores alfanuméricos curtos e não-adivinháveis para URLs públicas dos vídeos.
- **Padrão:** `nanoid(12)` gerando 12 caracteres URL-friendly com índice único e retry em caso de colisão.
