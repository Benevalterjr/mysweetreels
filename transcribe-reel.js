import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('ERRO: GEMINI_API_KEY não encontrada no .env');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

async function processReelVideo() {
  console.log('1. Lendo arquivo de vídeo reel_test.mp4...');
  const videoBuffer = fs.readFileSync('reel_test.mp4');
  const base64Video = videoBuffer.toString('base64');
  console.log(`Vídeo carregado! Tamanho: ${(videoBuffer.length / (1024 * 1024)).toFixed(2)} MB`);

  console.log('2. Enviando para o Gemini Flash analisar o áudio e conteúdo...');
  
  const prompt = `Você é o curador especialista do "SweetReels", um Pinterest focado em Reels de alto valor.
Analise com atenção o áudio falado e o conteúdo visual deste Reels.

Tarefas:
1. Transcreva com precisão o que foi dito ou ensinado.
2. Identifique a categoria principal (ex: "Receitas & Confeitaria", "Treinos & Fitness", "Dicas & Tutoriais", "Viagem & Turismo", "Moda & Estilo", etc).
3. Crie um título altamente chamativo e otimizado para SEO no Google (ex: "Como Fazer Massa de Cookie Perfeita e Crocante").
4. Crie um resumo conciso e envolvente em 2 frases.
5. Extraia o checklist prático de acordo com a categoria:
   - Se for Receita: ingredientes com medidas e lista de passos de preparo.
   - Se for Treino: exercícios, repetições e dicas de execução.
   - Se for Dica/Tutorial: ferramentas necessárias e passos práticos.
   - Se for Viagem: locais mencionados, dicas de valores e recomendações.
6. Forneça tags relevantes (hashtags e palavras-chave para busca).`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'video/mp4',
                data: base64Video
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: 'Título atraente e otimizado para SEO' },
            category: { type: Type.STRING, description: 'Categoria principal do Reels' },
            tags: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: 'Tags e palavras-chave'
            },
            summary: { type: Type.STRING, description: 'Resumo em duas frases' },
            checklist_title: { 
              type: Type.STRING, 
              description: 'Título do checklist (ex: Ingredientes, Exercícios, Ferramentas, Locais)' 
            },
            checklist_items: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: 'Itens do checklist (ingredientes, exercícios ou itens necessários)' 
            },
            steps_or_tips: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: 'Passo a passo ou dicas práticas mencionadas' 
            },
            transcript: { 
              type: Type.STRING, 
              description: 'Transcrição fiel do que foi dito no áudio do vídeo' 
            }
          },
          required: ['title', 'category', 'tags', 'summary', 'checklist_title', 'checklist_items', 'steps_or_tips', 'transcript']
        }
      }
    });

    console.log('\n================ RESULTADO GERADO PELO GEMINI ================');
    const result = JSON.parse(response.text);
    console.log(JSON.stringify(result, null, 2));
    
    fs.writeFileSync('metadata_result.json', JSON.stringify(result, null, 2));
    console.log('\nSalvo em metadata_result.json com sucesso!');
  } catch (err) {
    console.error('Erro ao processar com Gemini:', err);
  }
}

processReelVideo();
