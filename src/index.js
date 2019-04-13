const amf = require('amf-client-js')
const parseArgs = require('minimist')
const ldquery = require('ld-query')
const path = require('path')
const fs = require('fs-extra')
const Mustache = require('mustache')

/** Mustache templates directory path. */
const TMPL_DIR = path.join(__dirname, '..', 'templates')

/** Default context for querying JSON-LD document with ld-query. */
const CTX = {
  amldoc: 'http://a.ml/vocabularies/document#',
  meta: 'http://a.ml/vocabularies/meta#',
  owl: 'http://www.w3.org/2002/07/owl#',
  rdf: 'http://www.w3.org/2000/01/rdf-schema#',
  schema: 'http://schema.org/'
}

/** Converts AML Vocabulary to resolved JSON-LD AMF Graph.
 *
 * @param pathArg File url or path.
 * @return Object containing resolved JSON-LD AMF Graph of the vocabulary.
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

/** Collects vocabularies data in an array.
 *
 * @param doc Root Vocabulary object.
 * @return Array containing vocabularies data. Has format:
 *    [
 *      {id, base, usage, properties, classes: [{clsId, clsName, page}, ...]},
 *      ...
 *    ]
 */
function collectVocabulariesData (doc) {
  const vocabularies = doc.queryAll('amldoc:references')
  vocabularies.push(doc)
  const vocsData = vocabularies.map((voc) => {
    // Works on JSON instead of using querying API because the latter
    // picks first object in the order of definition instead of picking
    // root elements first.
    let vocJson = voc.json()
    let data = {
      id: vocJson['@id'],
      name: parseHashValue(vocJson['@id']),
      base: vocJson[`${CTX.meta}base`][0]['@value'],
      usage: vocJson[`${CTX.amldoc}usage`][0]['@value']
    }
    data.properties = collectVocabularyProperties(vocJson)
    data.classes = collectVocabularyClasses(vocJson)
    return data
  })
  return removeDuplicatesById(vocsData)
}

/** For each vocabulary returns a list of it's properties names as a string.
 *
 * @param vocJson Vocabulary JSON data.
 * @return String of vocabulary properties names joined with comma.
 */
function collectVocabularyProperties (vocJson) {
  return vocJson[`${CTX.amldoc}declares`]
    .map((decl) => {
      if (decl['@type'].indexOf(`${CTX.meta}Property`) > -1) {
        return parseHashValue((decl['@id'] || ''))
      }
    })
    .filter((id) => { return !!id })
    .join(', ')
}

/** For each vocabulary returns an array of it's classes data.
 *
 * @param vocJson Vocabulary JSON data.
 * @return Array of vocabulary classes data. Has format:
 *    [{clsId, clsName, page}, ...]
 */
function collectVocabularyClasses (vocJson) {
  return vocJson[`${CTX.amldoc}declares`]
    .map((decl) => {
      if (decl['@type'].indexOf(`${CTX.owl}Class`) > -1) {
        return decl['@id']
      }
    })
    .filter((id) => { return !!id })
    .map((id) => {
      return {
        clsId: id,
        clsName: parseHashValue(id),
        page: makeClassHtmlPageName({id: id})
      }
    })
}

/** Outputs array of vocabulary classTerms data.
 *
 * @param doc Root Vocabulary object.
 * @return Array of vocabulary classTerms data. Has format:
 *   [{
 *      id, name, displayName, description,
 *      properties: [{
 *        propId, propName, desc, range, rangeName, propExtends,
 *        propExtendsName
 *      }, ...],
 *      extends: ['someId', ...]
 *   }, ...]
 */
function collectClassesData (doc) {
  const propsMap = collectPropertiesData(doc)
  const classTerms = doc.queryAll('amldoc:declares[@type=owl:Class]')
    .map((term) => {
      return {
        id: term.query('@id'),
        name: parseHashValue(term.query('@id')),
        displayName: term.query('meta:displayName @value'),
        description: term.query('schema:description @value'),
        properties: term.queryAll('meta:properties @id').map((id) => {
          return propsMap[id] || {
            propName: parseHashValue(id),
            range: id
          }
        }),
        extends: term.queryAll('rdf:subClassOf @id')
      }
    })
  return removeDuplicatesById(classTerms)
}

/** Outputs map of propertyTerms ids to their data.
 *
 * @param doc Root Vocabulary object.
 * @return Map of propertyTerms ids to their data. Has format:
 *    {
 *       someId: {
 *         propId, propName, desc, range, rangeName, propExtends,
 *         propExtendsName
 *       }
 *    }
 */
function collectPropertiesData (doc) {
  let propsMap = {}
  const propertyTerms = doc.queryAll(
    'amldoc:declares[@type=meta:Property]')
  propertyTerms.forEach((term) => {
    let data = {
      propId: term.query('@id'),
      desc: term.query('schema:description @value'),
      range: term.query('rdf:range @id'),
      propExtends: term.query('rdf:subPropertyOf @id')
    }
    data.propName = parseHashValue(data.propId)
    data.rangeName = parseHashValue(data.range)
    data.propExtendsName = parseHashValue(data.propExtends)
    propsMap[term.query('@id')] = data
  })
  return propsMap
}

/** Renders single Mustache template with data and writes it to html file.
 *
 * @param data Data to be renreder in a template.
 * @param tmplName Mustache template name.
 * @param htmlName Output HTML template name.
 * @param outDir Output directory path.
 */
function renderTemplate (data, tmplName, htmlName, outDir) {
  console.log(
    `Rendering "${tmplName}" template`,
    data.id ? `for ${data.id}` : '')
  const inPath = path.join(TMPL_DIR, tmplName)
  const tmplStr = fs.readFileSync(inPath, 'utf-8')
  const htmlStr = Mustache.render(tmplStr, data)
  const outPath = path.join(outDir, htmlName)
  fs.writeFileSync(outPath, htmlStr)
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

/** Makes class HTML page name.
 *
 * @param cls JSON-LD class object of format {id: someId}.
 */
function makeClassHtmlPageName (cls) {
  return `cls_${parseHashValue(cls.id).toLowerCase()}.html`
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

/** Runs all the logic. */
async function main () {
  await amf.AMF.init()
  const argv = parseArgs(process.argv.slice(2))

  // Ensure output directory exists
  const outDir = path.resolve(argv.outdir)
  fs.emptyDirSync(outDir)

  const graph = await getJsonLdGraph(argv.vocabulary)
  let doc = ldquery(graph, CTX)

  // Pick root vocabulary itself as a single doc
  doc = doc.query('[@type=meta:Vocabulary]')

  // Vocabularies
  console.log('Collecting vocabularies data')
  const vocsData = collectVocabulariesData(doc)
  renderTemplate(
    {vocs: vocsData}, 'index.mustache',
    'index.html', outDir)

  // Classes
  console.log('Collecting classes data')
  const classesData = collectClassesData(doc)
  classesData.forEach((cls) => {
    renderTemplate(
      cls, 'class.mustache',
      makeClassHtmlPageName(cls), outDir)
  })

  // Copy css
  copyCss(outDir)
}

main()
