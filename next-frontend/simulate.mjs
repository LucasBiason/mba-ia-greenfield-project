import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://localhost:3002';
const API_URL = 'http://localhost:3000';
const SCREENSHOTS_DIR = '/home/lucas-biason/.gemini/antigravity-cli/brain/fef96941-ee92-46f4-a996-87b0e71296b4/simulacao';
const VIDEO_PATH = '/home/lucas-biason/Projetos/Projetos/Estudos/desafios/fullcycle/mba-ia-greenfield-project/nestjs-project/streamtube-demo.mp4';

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function runSimulation() {
  console.log('🚀 Iniciando Simulação Real do StreamTube no Navegador...');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    deviceScaleFactor: 1.5,
  });

  const page = await context.newPage();

  try {
    // ----------------------------------------------------
    // PASSO 1: Acessar a Home / Feed de Vídeos
    // ----------------------------------------------------
    console.log('Passo 1: Acessando a Home do StreamTube...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const step1Path = path.join(SCREENSHOTS_DIR, '01_home_catalog.png');
    await page.screenshot({ path: step1Path, fullPage: false });
    console.log(`✓ Print salvo: ${step1Path}`);

    // ----------------------------------------------------
    // PASSO 2: Acessar o Creator Studio
    // ----------------------------------------------------
    console.log('Passo 2: Navegando para o Creator Studio...');
    await page.click('text=Studio');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    const step2Path = path.join(SCREENSHOTS_DIR, '02_studio_dashboard.png');
    await page.screenshot({ path: step2Path, fullPage: false });
    console.log(`✓ Print salvo: ${step2Path}`);

    // ----------------------------------------------------
    // PASSO 3: Abrir a tela de Upload de Vídeo
    // ----------------------------------------------------
    console.log('Passo 3: Acessando a tela de Upload...');
    await page.click('text=Enviar');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    const step3Path = path.join(SCREENSHOTS_DIR, '03_studio_upload_initial.png');
    await page.screenshot({ path: step3Path, fullPage: false });
    console.log(`✓ Print salvo: ${step3Path}`);

    // ----------------------------------------------------
    // PASSO 4: Selecionar o Arquivo e Preencher Metadados
    // ----------------------------------------------------
    console.log('Passo 4: Anexando arquivo de vídeo e configurando metadados...');
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.setInputFiles(VIDEO_PATH);
    }

    await page.fill(
      'input[placeholder*="Ex: Tutorial"]',
      'StreamTube FullCycle - Demonstração Oficial de Upload & FFmpeg',
    );
    await page.fill(
      'textarea[placeholder*="Descreva detalhes"]',
      'Demonstração da Fase 03 do StreamTube. Upload resiliente em chunks de até 10GB, worker isolado FFmpeg processando em segundo plano via BullMQ e Redis, geração de thumbnail 1280x720 aos 1s e streaming HTTP 206 RFC 7233.',
    );

    await page.waitForTimeout(1000);
    const step4Path = path.join(SCREENSHOTS_DIR, '04_studio_upload_configured.png');
    await page.screenshot({ path: step4Path, fullPage: false });
    console.log(`✓ Print salvo: ${step4Path}`);

    // ----------------------------------------------------
    // PASSO 5: Iniciar o Envio e Acompanhar o Progresso
    // ----------------------------------------------------
    console.log('Passo 5: Submetendo o formulário de upload...');
    await page.click('button:has-text("Enviar e Publicar")');
    await page.waitForTimeout(800);

    const step5Path = path.join(SCREENSHOTS_DIR, '05_studio_upload_progress.png');
    await page.screenshot({ path: step5Path, fullPage: false });
    console.log(`✓ Print salvo: ${step5Path}`);

    // ----------------------------------------------------
    // PASSO 6: Aguardar Processamento do Worker FFmpeg
    // ----------------------------------------------------
    console.log('Passo 6: Aguardando processamento do Worker FFmpeg...');
    // Aguarda o card de sucesso aparecer (ou até 30s)
    await page.waitForSelector('text=Vídeo Processado com Sucesso', { timeout: 35000 });
    await page.waitForTimeout(2000);

    const step6Path = path.join(SCREENSHOTS_DIR, '06_studio_upload_ready_thumbnail.png');
    await page.screenshot({ path: step6Path, fullPage: false });
    console.log(`✓ Print salvo: ${step6Path}`);

    // ----------------------------------------------------
    // PASSO 7: Visualizar o Vídeo Catalogado no Studio
    // ----------------------------------------------------
    console.log('Passo 7: Verificando o vídeo na lista do Studio...');
    await page.click('text=Ir para o Studio');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const step7Path = path.join(SCREENSHOTS_DIR, '07_studio_video_cataloged.png');
    await page.screenshot({ path: step7Path, fullPage: false });
    console.log(`✓ Print salvo: ${step7Path}`);

    // ----------------------------------------------------
    // PASSO 8: Abrir o Player de Vídeo (Watch Page)
    // ----------------------------------------------------
    console.log('Passo 8: Abrindo o Player de Vídeo no Watch...');
    await page.click('text=Assistir');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500);

    // Inicia a reprodução via DOM video element
    await page.evaluate(() => {
      const vid = document.querySelector('video');
      if (vid) {
        vid.muted = true;
        vid.play();
      }
    });
    await page.waitForTimeout(1500);

    const step8Path = path.join(SCREENSHOTS_DIR, '08_watch_player_streaming.png');
    await page.screenshot({ path: step8Path, fullPage: false });
    console.log(`✓ Print salvo: ${step8Path}`);

    // ----------------------------------------------------
    // PASSO 9: Realizar Seek na Timeline (Range HTTP 206)
    // ----------------------------------------------------
    console.log('Passo 9: Realizando Seek (HTTP 206 Range Request)...');
    await page.evaluate(() => {
      const vid = document.querySelector('video');
      if (vid) {
        vid.currentTime = 3.2; // seek para 3.2s
      }
    });
    await page.waitForTimeout(1500);

    const step9Path = path.join(SCREENSHOTS_DIR, '09_watch_player_seek_range_206.png');
    await page.screenshot({ path: step9Path, fullPage: false });
    console.log(`✓ Print salvo: ${step9Path}`);

    // ----------------------------------------------------
    // PASSO 10: Retornar ao Feed Inicial com o Vídeo em Destaque
    // ----------------------------------------------------
    console.log('Passo 10: Retornando ao Feed com o vídeo em destaque...');
    await page.click('text=Voltar para o Feed');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const step10Path = path.join(SCREENSHOTS_DIR, '10_home_feed_with_video.png');
    await page.screenshot({ path: step10Path, fullPage: false });
    console.log(`✓ Print salvo: ${step10Path}`);

    console.log('🎉 Simulação concluída com sucesso absoluto!');
  } catch (err) {
    console.error('❌ Erro na simulação:', err);
    const errPath = path.join(SCREENSHOTS_DIR, 'error_state.png');
    await page.screenshot({ path: errPath });
    throw err;
  } finally {
    await browser.close();
  }
}

runSimulation();
