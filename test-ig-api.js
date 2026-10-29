const shortcode = 'DdJu3g0OAql';

async function testIG() {
  const endpoints = [
    `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`,
    `https://api.instagram.com/oembed/?url=https://www.instagram.com/p/${shortcode}/`
  ];

  for (let ep of endpoints) {
    try {
      console.log('Fetching', ep);
      const res = await fetch(ep, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      });
      console.log('Status:', res.status);
      const text = await res.text();
      console.log('Response preview:', text.slice(0, 300));
    } catch (e) {
      console.error(e.message);
    }
  }
}

testIG();
