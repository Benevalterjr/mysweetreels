import fs from 'fs';

const url = 'https://www.instagram.com/p/DdJu3g0OAql/embed/captioned/';

async function run() {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });
  const html = await res.text();
  
  // Save HTML to inspect
  fs.writeFileSync('embed.html', html);
  console.log('Saved embed.html');
  
  // Search for caption or text content
  const captionMatch = html.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/i);
  if (captionMatch) {
    console.log('Caption found:', captionMatch[1].replace(/<[^>]+>/g, ' ').trim().slice(0, 400));
  } else {
    console.log('No Caption class found');
  }

  // Search for author
  const authorMatch = html.match(/class="CaptionUsername"[^>]*>([\s\S]*?)<\/a>/i);
  if (authorMatch) {
    console.log('Author:', authorMatch[1].replace(/<[^>]+>/g, ' ').trim());
  }
  
  // Search for og:image or poster
  const ogImg = html.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/i) || html.match(/img[^>]*src="([^"]+)"/i);
  if (ogImg) {
    console.log('Thumbnail:', ogImg[1]);
  }
}

run();
