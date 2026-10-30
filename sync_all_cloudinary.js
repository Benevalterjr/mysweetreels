process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { uploadVideoToCloudinary } from './cloudinary_uploader.js';
import { db } from './firebase_config.js';
import { doc, updateDoc } from 'firebase/firestore';

async function syncAll() {
  const reelsPath = path.resolve('public/data/reels.json');
  const reels = JSON.parse(fs.readFileSync(reelsPath, 'utf-8'));

  const pending = reels.filter(r => !r.video_file || !r.video_file.startsWith('http'));
  console.log(`\nEncontrados ${pending.length} reels pendentes de sincronização com o Cloudinary.`);

  const videosDir = path.join('public', 'videos');
  const thumbsDir = path.join('public', 'thumbnails');
  if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });
  if (!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir, { recursive: true });

  for (const reel of pending) {
    const shortcode = reel.id;
    console.log(`\n--- Sincronizando [${shortcode}]: "${reel.title.substring(0, 40)}..." ---`);
    const tempVideo = path.join(videosDir, `${shortcode}.mp4`);
    const tempThumb = path.join(thumbsDir, `${shortcode}.jpg`);
    const normalizedUrl = `https://www.instagram.com/reel/${shortcode}/`;

    try {
      console.log('1. Baixando vídeo com download_reel.py...');
      execSync(`py download_reel.py "${normalizedUrl}" "${tempVideo}" "${tempThumb}"`, {
        encoding: 'utf-8',
        env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' }
      });

      if (!fs.existsSync(tempVideo)) {
        console.error(`❌ Falha no download de ${shortcode}`);
        continue;
      }

      console.log('2. Enviando para Cloudinary...');
      const cloudUrl = await uploadVideoToCloudinary(tempVideo, shortcode);

      console.log('3. Limpando arquivo local e atualizando registros...');
      fs.unlinkSync(tempVideo);

      reel.video_file = cloudUrl;
      fs.writeFileSync(reelsPath, JSON.stringify(reels, null, 2));

      // Atualiza Firestore
      try {
        const docRef = doc(db, 'reels', shortcode);
        await updateDoc(docRef, { video_file: cloudUrl, updated_at: new Date().toISOString() });
        console.log('⚡ Firestore atualizado!');
      } catch (fErr) {
        console.warn('Aviso no Firestore:', fErr.message);
      }

      console.log(`✅ [${shortcode}] sincronizado com sucesso!`);
    } catch (err) {
      console.error(`❌ Erro no reel [${shortcode}]:`, err.message);
    }
  }

  console.log('\n🎉 Todos os reels foram processados!');
  process.exit(0);
}

syncAll();
