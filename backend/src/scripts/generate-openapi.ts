import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../app.js';

async function generateOpenApi(): Promise<void> {
  const { app } = await buildApp({
    forceLocalStore: true,
    logger: false,
  });

  await app.ready();
  const spec = app.swagger();

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const outputPath = path.resolve(currentDir, '../../openapi.json');

  await fs.writeFile(outputPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
  await app.close();

  console.log(
    `Generated OpenAPI ${(spec as { openapi?: string }).openapi ?? '3.1.0'} contract at ${outputPath}`
  );
}

generateOpenApi().catch((err) => {
  console.error('Failed to generate openapi.json:', err);
  process.exit(1);
});
