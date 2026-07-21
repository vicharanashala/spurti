async function getOpenApi() {
  const url = 'https://api.vicharanashala.org/openapi.json';
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log('OpenAPI Info:', JSON.stringify(data.info, null, 2));
    console.log('Paths:');
    for (const path of Object.keys(data.paths)) {
      console.log(`  ${path}`);
      const methods = Object.keys(data.paths[path]);
      for (const m of methods) {
        const route = data.paths[path][m];
        console.log(`    ${m.toUpperCase()} - ${route.summary || ''}`);
        if (route.requestBody) {
          console.log(`      Request Body:`, JSON.stringify(route.requestBody.content['application/json']?.schema, null, 2));
        }
      }
    }
    if (data.components?.securitySchemes) {
      console.log('Security Schemes:');
      console.log(JSON.stringify(data.components.securitySchemes, null, 2));
    }
  } catch (e) {
    console.error(e);
  }
}

getOpenApi();
