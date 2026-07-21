import 'dotenv/config';

const base = process.env.LLM_BASE_URL;
const key = process.env.LLM_API_KEY;
const model = process.env.LLM_MODEL;

console.log(`Testing LLM Connection...`);
console.log(`Base URL: ${base}`);
console.log(`Model: ${model}`);

async function test() {
  // Most custom gateways expose /v1/chat/completions
  const url = `${base}/v1/chat/completions`; 
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: 'Hello! Please reply with "OK" if you can read this.' }],
        temperature: 0.7
      })
    });
    
    if (!res.ok) {
      const text = await res.text();
      console.error(`Error response (${res.status}):`, text);
      
      // If /v1/chat/completions fails, we can check if /chat/completions works
      console.log('Trying alternative endpoint without /v1...');
      const altUrl = `${base}/chat/completions`;
      const altRes = await fetch(altUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Hello!' }]
        })
      });
      if (altRes.ok) {
        const altData = await altRes.json();
        console.log('Success on alternative endpoint! Response:');
        console.log(JSON.stringify(altData, null, 2));
      } else {
        const altText = await altRes.text();
        console.error(`Alternative endpoint also failed (${altRes.status}):`, altText);
      }
      return;
    }
    
    const data = await res.json();
    console.log('Success! Response payload:');
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

test();
