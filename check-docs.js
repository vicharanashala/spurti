async function checkDocs() {
  const paths = ['/docs', '/redoc', '/openapi.json'];
  for (const p of paths) {
    const url = `https://api.vicharanashala.org${p}`;
    console.log(`Checking ${url}...`);
    try {
      const res = await fetch(url);
      console.log(`  Status: ${res.status}`);
      if (res.status === 200) {
        const text = await res.text();
        console.log(`  Content snippet: ${text.slice(0, 200)}`);
      }
    } catch (e) {
      console.error(`  Error:`, e.message);
    }
  }
}

checkDocs();
