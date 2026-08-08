const { getSignedStreamUrl } = require('./dist/cloudfront/signer.js');
const https = require('https');

async function checkStream() {
  const hlsKey = 'hls/4fa15556-9e19-40c2-b65f-7a280e262e53/master.m3u8';
  const url = getSignedStreamUrl(hlsKey, 3600);
  console.log('Signed URL:', url);
  
  https.get(url, (res) => {
    console.log('Status Code:', res.statusCode);
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('Response body:', data));
  }).on('error', (err) => {
    console.error('Error:', err.message);
  });
}

checkStream();
