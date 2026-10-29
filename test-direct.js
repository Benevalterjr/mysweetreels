import pkg from 'instagram-url-direct';
const { instagramGetUrl } = pkg;

async function testDirect() {
  try {
    const links = await instagramGetUrl('https://www.instagram.com/reel/DdJu3g0OAql/');
    console.log('Result:', JSON.stringify(links, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

testDirect();
