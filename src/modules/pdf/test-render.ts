import { db } from '../../db/index.js';
import { productDocuments, products } from '../../db/schema/index.js';
import { pdfService } from './pdf.service.js';
import { eq, and } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';

async function testRender() {
  console.log('🧪 Starting test render of CORROCUT PDFs...');

  // Fetch product master info
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.key, 'corrucut-500'));

  if (!product) {
    console.error('❌ Product not found in database.');
    process.exit(1);
  }

  const docTypes: Array<'tds' | 'msds'> = ['tds', 'msds'];

  for (const docType of docTypes) {
    console.log(`⏳ Fetching ${docType.toUpperCase()} document...`);
    const [doc] = await db
      .select()
      .from(productDocuments)
      .where(
        and(
          eq(productDocuments.productKey, 'corrucut-500'),
          eq(productDocuments.docType, docType)
        )
      );

    if (!doc) {
      console.error(`❌ ${docType.toUpperCase()} document not found in database.`);
      continue;
    }

    console.log(`⏳ Generating ${docType.toUpperCase()} PDF...`);
    const payload = {
      productName:  product.displayName,
      productCode:  doc.docNumber,
      productLine:  product.key,
      revisionDate: doc.revision,
      signalWord:   doc.body.signalWord ?? null,
      sections:     doc.body.sections,
    };

    const result = await pdfService.generatePDF(docType, payload);

    if (result.buffer) {
      const outDir = '/Users/kumaraswins/.gemini/antigravity/brain/b89a25cd-ccb6-4cbe-98a3-b6fa38c28a56/scratch';
      await fs.mkdir(outDir, { recursive: true });
      const outFile = path.join(outDir, `CORROCUT_Elite_${docType.toUpperCase()}.pdf`);
      await fs.writeFile(outFile, result.buffer);
      console.log(`✅ Generated: ${outFile}`);
    } else {
      console.error(`❌ Failed to generate buffer for ${docType.toUpperCase()}`);
    }
  }

  // Shutdown PDF Service browser pool
  await pdfService.shutdown();
  console.log('🏁 Render verification completed successfully.');
  process.exit(0);
}

testRender().catch((err) => {
  console.error('❌ Error during render verification:', err);
  process.exit(1);
});
