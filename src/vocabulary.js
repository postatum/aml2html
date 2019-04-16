const amf = require('amf-client-js')
const parseArgs = require('minimist')
const ldquery = require('ld-query')
const path = require('path')
const fs = require('fs-extra')
const utils = require('./utils')

/** Mustache vocabularies templates directory path. */
const TMPL_DIR = path.join(utils.TMPL_DIR, 'vocabulary')

/** Default context for querying JSON-LD vocabulary with ld-query. */
const CTX = {
  amldoc: 'http://a.ml/vocabularies/document#',
  meta: 'http://a.ml/vocabularies/meta#',
  owl: 'http://www.w3.org/2002/07/owl#',
  rdf: 'http://www.w3.org/2000/01/rdf-schema#',
  schema: 'http://schema.org/'
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
      name: utils.parseHashValue(vocJson['@id']),
      base: vocJson[`${CTX.meta}base`][0]['@value'],
    }
    const usage = vocJson[`${CTX.amldoc}usage`]
    if (usage) {
      data.usage = usage[0]['@value']
    }
    data.properties = collectVocabularyProperties(vocJson)
    data.classes = collectVocabularyClasses(vocJson)
    return data
  })
  return utils.removeDuplicatesById(vocsData)
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
        return utils.parseHashValue((decl['@id'] || ''))
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
        clsName: utils.parseHashValue(id),
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
 *        propId, propName, desc, range, rangeName,
 *        propExtends: [{extId, extName}]
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
        name: utils.parseHashValue(term.query('@id')),
        displayName: term.query('meta:displayName @value'),
        description: term.query('schema:description @value'),
        properties: term.queryAll('meta:properties @id').map((id) => {
          return propsMap[id] || {
            propName: utils.parseHashValue(id),
            range: id
          }
        }),
        extends: term.queryAll('rdf:subClassOf @id')
      }
    })
  return utils.removeDuplicatesById(classTerms)
}

/** Outputs map of propertyTerms ids to their data.
 *
 * @param doc Root Vocabulary object.
 * @return Map of propertyTerms ids to their data. Has format:
 *    {
 *       someId: {
 *         propId, propName, desc, range, rangeName,
 *         propExtends: [{extId, extName}]
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
      propExtends: term.queryAll('rdf:subPropertyOf @id').map((id) => {
        return {
          extId: id,
          extName: utils.parseHashValue(id)
        }
      })
    }
    data.propName = utils.parseHashValue(data.propId)
    data.rangeName = utils.parseHashValue(data.range)
    propsMap[term.query('@id')] = data
  })
  return propsMap
}

/** Makes class HTML page name.
 *
 * @param cls JSON-LD class object of format {id: someId}.
 */
function makeClassHtmlPageName (cls) {
  return `cls_${utils.parseHashValue(cls.id).toLowerCase()}.html`
}

/** Runs all the logic. */
async function main () {
  await amf.AMF.init()
  const argv = parseArgs(process.argv.slice(2))

  // Ensure output directory exists
  const outDir = path.resolve(argv.outdir)
  fs.emptyDirSync(outDir)

  const graph = await utils.getJsonLdGraph(argv.file)
  let doc = ldquery(graph, CTX)

  // Pick root vocabulary itself as a single doc
  doc = doc.query('[@type=meta:Vocabulary]')

  // Vocabularies
  console.log('Collecting vocabularies data')
  const vocsData = collectVocabulariesData(doc)
  utils.renderTemplate(
    {vocs: vocsData},
    path.join(TMPL_DIR, 'index.mustache'),
    path.join(outDir, 'index.html'))

  // Classes
  console.log('Collecting classes data')
  const classesData = collectClassesData(doc)
  classesData.forEach((cls) => {
    utils.renderTemplate(
      cls,
      path.join(TMPL_DIR, 'class.mustache'),
      path.join(outDir, makeClassHtmlPageName(cls)))
  })

  // Copy css
  utils.copyCss(outDir)
}

main()
