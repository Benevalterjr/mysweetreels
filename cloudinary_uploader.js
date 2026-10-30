import dotenv from 'dotenv';
dotenv.config();
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

/**
 * Envia um vídeo MP4 local para o Cloudinary na pasta 'sweetreels'
 * e retorna a URL HTTPS direta para streaming.
 */
export async function uploadVideoToCloudinary(filePath, reelId) {
  try {
    console.log(`[Cloudinary] 🚀 Enviando vídeo (${reelId}) para o Cloudinary CDN...`);
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: 'video',
      folder: 'sweetreels',
      public_id: reelId,
      overwrite: true,
      format: 'mp4'
    });
    console.log(`[Cloudinary] ✅ Upload concluído com sucesso!`);
    console.log(`[Cloudinary] 🌐 URL: ${result.secure_url}`);
    return result.secure_url;
  } catch (err) {
    console.error(`[Cloudinary] ❌ Falha no upload do vídeo (${reelId}):`, err.message);
    throw err;
  }
}
