import 'dotenv/config';

const base = process.env.LLM_BASE_URL;

async function testRoot() {
  console.log(`Querying root ${base}...`);
  try {
    const res = await fetch(base, {
      method: 'GET'
    });
    const text = await res.text();
    console.log(`Status: ${res.status}`);
    console.log(`Headers:`);
    for (const [key, value] of res.headers.entries()) {
      console.log(`  ${key}: ${value}`);
    }
    console.log(`Body: ${text}`);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

testRoot();
