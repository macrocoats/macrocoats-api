import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pdfService } from '../src/modules/pdf/pdf.service.js'
import { DOCS, PRODUCTS } from '../src/seed/products.seed.js'

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const outputDir = path.resolve(here, '../../output/pdf')

  for (const product of PRODUCTS) {
    const tds = DOCS.find((doc) => doc.productKey === product.key && doc.docType === 'tds')
    if (!tds) throw new Error(`Missing TDS for ${product.key}`)

    const outputPath = path.join(outputDir, `${product.key}-brochure.pdf`)
    await pdfService.generatePDF('brochure', {
      productName: product.displayName,
      productCode: product.code,
      productLine: product.key,
      category: product.category,
      subtitle: product.subtitle,
      accentColor: product.accentColor,
      revision: tds.revision,
      description: String(tds.body.description ?? ''),
      sections: (tds.body.sections as Record<string, unknown> | undefined) ?? {},
    }, { format: 'file', outputPath })
    console.log(outputPath)
  }

  await pdfService.shutdown()
}

main().catch(async (error) => {
  console.error(error)
  await pdfService.shutdown()
  process.exitCode = 1
})
