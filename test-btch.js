import { igdl } from 'btch-downloader';

async function testBtch() {
  try {
    console.log('Testing btch-downloader igdl...');
    const result = await igdl('https://www.instagram.com/reel/DdJu3g0OAql/');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

testBtch();
