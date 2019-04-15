const amf = require('amf-client-js')
const path = require('path')
const fs = require('fs-extra')
const Mustache = require('mustache')

const TMPL_DIR = path.join(__dirname, '..', 'templates')

/** Converts AML Document to resolved JSON-LD AMF Graph.
 *
 * @param pathArg File url or path.
 * @return Object of resolved JSON-LD AMF Graph of the AML Document.
 */
async function getJsonLdGraph (pathArg) {
  const hasProtocol = pathArg.startsWith('http://') ||
    pathArg.startsWith('https://') ||
    pathArg.startsWith('file://')
  pathArg = hasProtocol ? pathArg : `file://${pathArg}`
  const model = await new amf.Aml10Parser().parseFileAsync(pathArg)
  const graphStr = await amf.AMF.amfGraphGenerator().generateString(model)
  const graphModel = await amf.AMF.amfGraphParser().parseStringAsync(graphStr)
  const graphResolved = await amf.AMF.resolveAmfGraph(graphModel)
  const graphStrResolved = await amf.AMF.amfGraphGenerator().generateString(graphResolved)
  return JSON.parse(graphStrResolved)
}

/** Copies CSS files needed for generated HTML page to look nice.
 *
 * @param outDir Generated HTML output directory.
 */
function copyCss (outDir) {
  const tmplCssDir = path.join(TMPL_DIR, 'css')
  const outCssDir = path.join(outDir, 'css')
  fs.emptyDirSync(outCssDir)
  fs.copySync(tmplCssDir, outCssDir)
}

/** Removes array items with duplicate ['id'] property.
 *
 * @param items Array of items with .id property.
 */
function removeDuplicatesById (items) {
  const addedIds = []
  const uniqueItems = []
  items.forEach((item) => {
    if (addedIds.indexOf(item.id) === -1) {
      addedIds.push(item.id)
      uniqueItems.push(item)
    }
  })
  return uniqueItems
}

/** Parses class name by splitting it by / and # and picking last part.
 *
 * @param id JSON-LD object @id.
 */
function parseHashValue (id) {
  const afterSlash = (id || '').split('/').slice(-1)[0]
  const afterHash = afterSlash.split('#').slice(-1)[0]
  return afterHash
}

/** Renders Mustache template with data and writes it to an HTML file.
 *
 * @param data Data to be renreder in a template.
 * @param tmplPath Mustache template path.
 * @param htmlPath Output HTML path.
 */
function renderTemplate (data, tmplPath, htmlPath) {
  console.log(
    `Rendering "${tmplPath}" template`,
    data.id ? `for ${data.id}` : '')
  const tmplStr = fs.readFileSync(tmplPath, 'utf-8')
  const htmlStr = Mustache.render(tmplStr, data)
  fs.writeFileSync(htmlPath, htmlStr)
}

module.exports = {
  getJsonLdGraph: getJsonLdGraph,
  copyCss: copyCss,
  removeDuplicatesById: removeDuplicatesById,
  parseHashValue: parseHashValue,
  renderTemplate: renderTemplate,
  TMPL_DIR: TMPL_DIR
}
