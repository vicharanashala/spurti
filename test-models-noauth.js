async function testModelsNoAuth() {
  const url = 'https://api.vicharanashala.org/v1/models';
  console.log(`Querying ${url} with no auth...`);
  try {
    const res = await fetch(url, {
      method: 'GET'
    });
    const text = await res.text();
    console.log(`Status: ${res.status}`);
    console.log(`Response: ${text}`);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

testModelsNoAuth();
