export async function handler(event) {
  const gtin = (event.queryStringParameters?.gtin || '').replace(/\D/g, '');
  if (!gtin) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/plain' },
      body: 'GTIN missing'
    };
  }

  const paddedGtin = gtin.padStart(14, '0');
  const targetUrl = `https://s3.amazonaws.com/infoprice-prd-imagens/gtin/${paddedGtin}.jpg`;

  try {
    const res = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!res.ok) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Image not found'
      };
    }

    const buffer = await res.arrayBuffer();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=2592000, immutable',
        'Access-Control-Allow-Origin': '*'
      },
      body: Buffer.from(buffer).toString('base64'),
      isBase64Encoded: true
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'text/plain' },
      body: 'Error fetching image'
    };
  }
}
