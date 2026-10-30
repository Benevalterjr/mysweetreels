process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import fs from 'fs';
import path from 'path';
import { db } from './firebase_config.js';
import { doc, setDoc, getDocs, collection } from 'firebase/firestore';

async function migrate() {
  console.log('================ MIGRAÇÃO PARA O FIRESTORE ================');
  console.log('Lendo dados locais de public/data/reels.json...');
  
  const reelsPath = path.resolve('public/data/reels.json');
  if (!fs.existsSync(reelsPath)) {
    console.error('Arquivo public/data/reels.json não encontrado!');
    process.exit(1);
  }

  const rawData = fs.readFileSync(reelsPath, 'utf-8');
  const reels = JSON.parse(rawData);

  console.log(`Encontrados ${reels.length} Reels para migrar.\n`);

  let successCount = 0;
  let failCount = 0;

  for (const reel of reels) {
    try {
      console.log(`-> Enviando [${reel.id}]: "${reel.title.substring(0, 45)}..."`);
      
      // Monta o payload sem binários de vídeo (apenas metadados e URLs locais/relativas)
      const payload = {
        id: reel.id,
        url: reel.url,
        video_file: reel.video_file || null,
        author: {
          name: reel.author?.name || '',
          username: reel.author?.username || '',
          profile_url: reel.author?.profile_url || ''
        },
        thumbnail: reel.thumbnail || `/thumbnails/${reel.id}.jpg`,
        duration: Number(reel.duration) || 0,
        title: reel.title,
        category: reel.category || 'Receitas & Culinária',
        tags: Array.isArray(reel.tags) ? reel.tags : [],
        summary: reel.summary || '',
        checklist_title: reel.checklist_title || 'Ingredientes / Itens',
        checklist_items: Array.isArray(reel.checklist_items) ? reel.checklist_items : [],
        steps_or_tips: Array.isArray(reel.steps_or_tips) ? reel.steps_or_tips : [],
        transcript: reel.transcript || '',
        created_at: reel.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const docRef = doc(db, 'reels', reel.id);
      await setDoc(docRef, payload, { merge: true });
      console.log(`   ✅ Sincronizado com sucesso!`);
      successCount++;
    } catch (err) {
      console.error(`   ❌ Falha ao sincronizar [${reel.id}]:`, err.message);
      failCount++;
    }
  }

  console.log('\n================ RESUMO DA MIGRAÇÃO ================');
  console.log(`Sucesso: ${successCount}`);
  console.log(`Falhas:  ${failCount}`);

  if (failCount === 0) {
    console.log('🎉 Todos os dados foram migrados com sucesso para o Firestore!');
  } else {
    console.log('⚠️ Algumas gravações falharam. Verifique as regras de segurança do Firestore (firestore.rules).');
  }

  process.exit(failCount > 0 ? 1 : 0);
}

migrate();
