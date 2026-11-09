process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import { monitor } from './lib/gemini_monitor.js';
import { db } from './lib/firebase.js';
import { doc, setDoc } from 'firebase/firestore';
import { uploadVideoToCloudinary } from './lib/cloudinary.js';
import dotenv from 'dotenv';
dotenv.config();

const apiKeys = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_BACKUP
].filter(Boolean);

if (apiKeys.length === 0) {
  console.error('ERRO: Nenhuma chave GEMINI_API_KEY ou GEMINI_API_KEY_BACKUP encontrada no .env');
  process.exit(1);
}

function extractShortcode(rawUrl) {
  if (!rawUrl) throw new Error('URL ou Shortcode não fornecido');
  const clean = rawUrl.replace(/["'\\]/g, '').trim();
  const match = clean.match(/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/);
  if (match) return match[1];
  if (/^[A-Za-z0-9_-]+$/.test(clean)) return clean;
  throw new Error('URL de Reels inválida: ' + rawUrl);
}

export function cleanAndDeduplicate(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const cleaned = [];

  for (const rawItem of items) {
    if (!rawItem || typeof rawItem !== 'string') continue;
    let clean = rawItem.trim();

    // Remove marcadores de cabeçalho (ex: '**Para a Geleia...:**' ou '### Recheio')
    if (/^\*{1,3}(Para|Massa|Recheio|Cobertura|Geleia)[^*]*\*{1,3}:?$/i.test(clean) || 
        clean.toLowerCase().startsWith('**para ') || 
        clean.endsWith(':**') || 
        clean.endsWith(':') && clean.length < 35) {
      continue;
    }

    // Remove negrito que envelopa o item inteiro
    clean = clean.replace(/^\*\*([^*]+)\*\*$/, '$1').trim();

    // Chave normalizada para deduplicação (sem pontuação e minúscula)
    const key = clean.toLowerCase().replace(/[.,;:()]/g, '').replace(/\s+/g, ' ').trim();

    if (!seen.has(key)) {
      seen.add(key);
      cleaned.push(clean);
    }
  }

  return cleaned;
}

async function ingestReel(rawUrl) {
  const shortcode = extractShortcode(rawUrl);
  const normalizedUrl = `https://www.instagram.com/reel/${shortcode}/`;
  console.log(`\n================ PROCESSANDO REELS: ${shortcode} ================`);
  console.log(`URL canônica: ${normalizedUrl}`);

  // Create videos dir if needed
  const videosDir = path.join('public', 'videos');
  const thumbsDir = path.join('public', 'thumbnails');
  if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });
  if (!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir, { recursive: true });
  
  const finalVideoPath = path.join(videosDir, `${shortcode}.mp4`);
  const finalThumbPath = path.join(thumbsDir, `${shortcode}.jpg`);

  console.log('\n[1/3] Baixando mídia, capa e metadados com cookies do navegador...');
  let basicMeta = {};
  try {
    const pyOutput = execSync(`py lib/downloader.py "${normalizedUrl}" "${finalVideoPath}" "${finalThumbPath}"`, {
      encoding: 'utf-8',
      env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' }
    });
    const match = pyOutput.match(/###META_START###(.*?)###META_END###/);
    if (match) {
      basicMeta = JSON.parse(match[1]);
    }
  } catch (err) {
    console.error('Erro no download:', err.message);
    throw err;
  }

  console.log(`[2/3] Verificando limites de API e enviando vídeo (${(fs.statSync(finalVideoPath).size / (1024 * 1024)).toFixed(2)} MB) para o Gemini Flash...`);
  
  // Rate-limiting proativo para prevenir bloqueios de 429
  await monitor.checkRateLimitsAndThrottle();

  const videoBuffer = fs.readFileSync(finalVideoPath);
  const base64Video = videoBuffer.toString('base64');

  const OFFICIAL_CATEGORIES = [
    "Receitas & Culinária",
    "Treinos & Fitness",
    "Dicas & Tutoriais",
    "Viagem & Lugares",
    "Moda & Beleza",
    "Casa & Decoração",
    "Finanças & Negócios"
  ];

  const prompt = `Você é o curador especialista e Master Chef de IA do "SweetReels", uma plataforma premium estilo Pinterest que transforma Reels do Instagram em guias práticos e receitas prontas para execução.
Analise com extrema atenção o áudio falado, o texto na tela e todo o conteúdo visual deste Reels.

Tarefas:
1. Transcreva com fidelidade o que foi falado no áudio (ou informe brevemente se não há áudio falado).
2. Identifique e selecione OBRIGATORIAMENTE uma das categorias oficiais: ${JSON.stringify(OFFICIAL_CATEGORIES)}. Detalhes específicos (ex: confeitaria, bolo, doce, treino de pernas, maquiagem) devem ir EXCLUSIVAMENTE nas tags, e NUNCA no nome da categoria.
3. Crie um título altamente atraente e otimizado para SEO no Google.
4. Crie um resumo conciso e envolvente em 2 frases.
5. ENGENHARIA REVERSA CULINÁRIA & INGREDIENTES DE SUPERMERCADO:
   - Se o vídeo for de gastronomia/confeitaria/culinária:
     * SE FOR UM VÍDEO DE PRODUTO PRONTO, DEGUSTAÇÃO OU VITRINE (onde o autor só exibe o doce/prato pronto, ex: barra de pudim recheada, bolo cortado, sobremesa artesanal): NUNCA gere passos de desembrulho (ex: "retire o papel") nem ingredientes compostos prontos (ex: "pudim cremoso"). Em vez disso, faça a ENGENHARIA REVERSA culinária inteligente da receita: deduza a lista de ingredientes reais de supermercado necessários para o usuário reproduzir a sobremesa em casa do zero (ex: "Chocolate branco em barra", "Leite condensado", "Leite integral", "Ovos", "Açúcar refinado").
     * Cada ingrediente DEVE ser um item único e isolado. NUNCA misture dois ingredientes na mesma linha (ex: NUNCA "morangos e mirtilos", separe em "Morango fresco" e "Mirtilo").
     * NUNCA repita o mesmo ingrediente mais de uma vez. Unifique itens repetidos somando as quantidades.
     * Use nomes canônicos e reconhecíveis em gôndolas de supermercado (ex: "Chocolate branco em barra", "Morango fresco", "Nata ou creme de leite fresco", "Leite condensado", "Leite integral", "Biscoito champagne", "Açúcar refinado", "Ovos").
     * NUNCA inclua títulos de seção (ex: "Para a calda", "Recheio:") como itens do checklist.
6. MODO DE PREPARO / DICAS PRÁTICAS:
   - Forneça passos claros, práticos e realizáveis para fazer a receita com perfeição.
   - SEMPRE que a receita tiver recheios elaborados, inclua no final de steps_or_tips uma "Dica Express" para quem quiser montar em poucos minutos com atalhos de produtos prontos (ex: "Dica Express: Para uma montagem rápida de 10 minutos, você pode usar mistura para pudim e cobertura de caramelo pronta").
7. Gere tags pertinentes (sem o caractere #).`;

  const startTime = Date.now();
  let response;
  const generatePayload = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'video/mp4', data: base64Video } }
        ]
      }
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          category: { 
            type: Type.STRING, 
            enum: OFFICIAL_CATEGORIES,
            description: 'Categoria oficial padronizada' 
          },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
          summary: { type: Type.STRING },
          checklist_title: { type: Type.STRING },
          checklist_items: { type: Type.ARRAY, items: { type: Type.STRING } },
          steps_or_tips: { type: Type.ARRAY, items: { type: Type.STRING } },
          transcript: { type: Type.STRING }
        },
        required: ['title', 'category', 'tags', 'summary', 'checklist_title', 'checklist_items', 'steps_or_tips', 'transcript']
      }
    }
  };

  try {
    const candidateModels = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
    let lastErr = null;

    for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
      const currentKey = apiKeys[keyIdx];
      const keyLabel = keyIdx === 0 ? 'Primária' : `Backup ${keyIdx}`;
      const genAI = new GoogleGenAI({ apiKey: currentKey });
      let shouldSwitchKey = false;

      for (const modelName of candidateModels) {
        if (shouldSwitchKey) break;

        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            console.log(`[Gemini IA] Usando Chave ${keyLabel} ➔ Modelo ${modelName} (tentativa ${attempt})...`);
            response = await genAI.models.generateContent({
              model: modelName,
              ...generatePayload
            });
            if (response && response.text) break;
          } catch (callErr) {
            lastErr = callErr;
            const msg = callErr.message || '';

            // 404: modelo não existe para esta chave (ex: 2.5 em chaves novas) -> pula imediatamente
            if (msg.includes('404') || msg.includes('no longer available') || msg.includes('NOT_FOUND')) {
              console.log(`[Gemini IA] Modelo ${modelName} indisponível para esta chave. Alternando modelo...`);
              break;
            }

            // 429 ou 403: cota esgotada ou erro de permissão -> alterna para a chave reserva
            if (msg.includes('429') || msg.includes('403') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('PERMISSION_DENIED')) {
              console.warn(`[Gemini IA] Chave ${keyLabel} atingiu limite/permissão (${msg}). Alternando para chave reserva...`);
              shouldSwitchKey = true;
              break;
            }

            console.warn(`[Gemini IA] Tentativa ${attempt} no modelo ${modelName} falhou: ${msg}`);
            if (attempt < 2) {
              await new Promise(r => setTimeout(r, 1500));
            }
          }
        }
        if (response && response.text) break;
      }
      if (response && response.text) break;
    }

    if (!response || !response.text) {
      throw lastErr || new Error('Não foi possível obter resposta de nenhuma das chaves Gemini.');
    }

    const latencyMs = Date.now() - startTime;
    const usage = response.usageMetadata || {};
    monitor.recordSuccess({
      reelId: shortcode,
      promptTokens: usage.promptTokenCount || 0,
      candidatesTokens: usage.candidatesTokenCount || 0,
      totalTokens: usage.totalTokenCount || 0,
      latencyMs
    });
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    monitor.recordFailure({ reelId: shortcode, error: err, latencyMs });
    throw err;
  }

  const aiData = JSON.parse(response.text);

  // [Novo] Envia o vídeo para a nuvem do Cloudinary CDN
  let cloudVideoUrl = null;
  try {
    if (fs.existsSync(finalVideoPath)) {
      console.log(`[Cloudinary] Subindo vídeo otimizado para o Cloudinary...`);
      cloudVideoUrl = await uploadVideoToCloudinary(finalVideoPath, shortcode);
    }
  } catch (cloudErr) {
    console.warn('⚠️ Falha no upload para o Cloudinary (fallback para embed):', cloudErr.message);
  }

  // Remove o vídeo temporário local após análise com Gemini e envio para nuvem (Zero armazenamento local)
  try {
    if (fs.existsSync(finalVideoPath)) {
      fs.unlinkSync(finalVideoPath);
      console.log('🧹 Arquivo de vídeo temporário removido do computador.');
    }
  } catch (cleanErr) {
    console.warn('Aviso ao remover vídeo temporário:', cleanErr.message);
  }

  console.log('[3/3] Atualizando public/data/reels.json com a nova publicação...');
  const reelsDataPath = path.join('public', 'data', 'reels.json');
  if (!fs.existsSync(path.join('public', 'data'))) {
    fs.mkdirSync(path.join('public', 'data'), { recursive: true });
  }
  let reels = [];
  if (fs.existsSync(reelsDataPath)) {
    reels = JSON.parse(fs.readFileSync(reelsDataPath, 'utf-8'));
  }

  // Remove existing if re-ingesting same reel
  reels = reels.filter(r => r.id !== shortcode);

  const rawUploader = basicMeta.uploader || '';
  const rawChannel = basicMeta.channel || '';
  const isUsername = (s) => /^[a-zA-Z0-9._]+$/.test(s);
  
  const handle = isUsername(rawChannel) ? rawChannel : (isUsername(rawUploader) ? rawUploader : rawChannel);
  const displayName = (!isUsername(rawUploader) && rawUploader) ? rawUploader : (basicMeta.channel || handle || 'Criador');

  const newReel = {
    id: shortcode,
    url: normalizedUrl,
    video_file: cloudVideoUrl,
    author: {
      name: displayName,
      username: handle,
      profile_url: `https://www.instagram.com/${handle}/`
    },
    thumbnail: basicMeta.thumbnail || null,
    duration: basicMeta.duration || null,
    title: aiData.title,
    category: aiData.category,
    tags: aiData.tags,
    summary: aiData.summary,
    checklist_title: aiData.checklist_title,
    checklist_items: cleanAndDeduplicate(aiData.checklist_items),
    steps_or_tips: aiData.steps_or_tips,
    transcript: aiData.transcript,
    created_at: new Date().toISOString()
  };

  reels.unshift(newReel);
  fs.writeFileSync(reelsDataPath, JSON.stringify(reels, null, 2));

  // Sincroniza metadados com o Cloud Firestore (sem uploads de vídeo)
  try {
    console.log('[Firestore] Sincronizando metadados com o Cloud Firestore...');
    const docRef = doc(db, 'reels', shortcode);
    await setDoc(docRef, {
      ...newReel,
      updated_at: new Date().toISOString()
    }, { merge: true });
    console.log('⚡ Sincronizado no Cloud Firestore com sucesso!');
  } catch (fsErr) {
    console.warn('⚠️ Nota: Não foi possível sincronizar imediatamente com Firestore:', fsErr.message);
  }

  console.log('✅ REELS PUBLICADO COM SUCESSO NO MYSWEETREELS!');
  return newReel;
}

// CLI usage (apenas se executado diretamente via terminal)
if (process.argv[1] && process.argv[1].endsWith('ingest.js')) {
  const targetUrl = process.argv[2];
  if (targetUrl) {
    ingestReel(targetUrl)
      .then(reel => {
        console.log('\nDados Finais do Post:');
        console.log(JSON.stringify(reel, null, 2));
        process.exit(0);
      })
      .catch(err => {
        console.error('Falha na ingestão:', err);
        process.exit(1);
      });
  }
}

export { ingestReel };
