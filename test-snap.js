import snapsave from 'snapsave-media-downloader';

async function testSnap() {
  try {
    console.log('Testing snapsave for reel...');
    const result = await snapsave('https://www.instagram.com/reel/DdJu3g0OAql/');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('Snap error:', e);
  }
}

testSnap();
