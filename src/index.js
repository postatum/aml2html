const amf = require('amf-client-js')
const ldquery = require('ld-query')

const CTX = {
  amldoc: 'http://a.ml/vocabularies/document#',
  meta: 'http://a.ml/vocabularies/meta#',
  owl: 'http://www.w3.org/2002/07/owl#',
  rdf: 'http://www.w3.org/2000/01/rdf-schema#',
  schema: 'http://schema.org/'
}

/* Converts AML Vocabulary to resolved JSON-LD AMF Graph. */
async function getJsonLdGraph (fpathArg) {
  const model = await new amf.Aml10Parser().parseFileAsync(`file://${fpathArg}`)
  const graphStr = await amf.AMF.amfGraphGenerator().generateString(model)
  const graphModel = await amf.AMF.amfGraphParser().parseStringAsync(graphStr)
  const graphResolved = await amf.AMF.resolveAmfGraph(graphModel)
  const graphStrResolved = await amf.AMF.amfGraphGenerator().generateString(graphResolved)
  return JSON.parse(graphStrResolved)
}

/*
  Outputs array of Vocabularies data which looks like:
    [
      ...
      { id: 'file://test_data/vocabularies/data_model.yaml',
        base: 'http://a.ml/vocabularies/data#',
        usage: 'Vocabulary ...',
        classes: [ 'http://a.ml/vocabularies/data#Node', ... ] }
      ...
    ]

  Works on JSON instead of using querying API because the latter picks
  first object in the order of definition instead of picking root
  elements first.
*/
function collectVocabulariesData (doc) {
  const vocabularies = doc.queryAll('amldoc:references')
  vocabularies.push(doc)
  return vocabularies.map((voc) => {
    let vocJson = voc.json()
    return {
      id: vocJson['@id'],
      base: vocJson[`${CTX.meta}base`][0]['@value'],
      usage: vocJson[`${CTX.amldoc}usage`][0]['@value'],
      classes: vocJson[`${CTX.amldoc}declares`]
        .map((decl) => {
          if (decl['@type'].indexOf(`${CTX.owl}Class`) > -1) {
            return decl['@id']
          }
        })
        .filter((id) => { return id !== undefined })
    }
  })
}

/*
  Outputs array of classTerms data which looks like:
    [
      ...
      { id: 'http://a.ml/vocabularies/document#DomainElement',
        name: 'Domain element',
        description: 'asd',
        properties:
         [ { name: 'extends',
             description: 'Target asdasd',
             range: 'http://www.w3.org/2001/XMLSchema#anyUri',
             parent: null } ],
        parents: [] },
      ...
    ]
*/
function collectClassesData (doc) {
  const propsMap = collectPropertiesData(doc)
  const classTerms = doc.queryAll('amldoc:declares[@type=owl:Class]')
    .map((term) => {
      return {
        id: term.query('@id'),
        name: term.query('meta:displayName @value'),
        description: term.query('schema:description @value'),
        properties: term.queryAll('meta:properties @id').map((id) => {
          return propsMap[id]
        }),
        parents: term.queryAll('rdf:subClassOf @id')
      }
    })
  return classTerms
}

/*
  Outputs map of propertyTerms ids to its data which looks like:
    {
       ...
      'http://a.ml/vocabularies/document#displayName': {
        'name': 'display name',
        'description': 'Human readable name for the example',
        'range': 'http://www.w3.org/2001/XMLSchema#string',
        'parent': 'http://schema.org/name'
      },
      ...
    }
*/
function collectPropertiesData (doc) {
  let propsMap = {}
  const propertyTerms = doc.queryAll(
    'amldoc:declares[@type=owl:DatatypeProperty]')
  propertyTerms.forEach((term) => {
    propsMap[term.query('@id')] = {
      name: term.query('meta:displayName @value'),
      description: term.query('schema:description @value'),
      range: term.query('rdf:range @id'),
      parent: term.query('rdf:subPropertyOf @id')
    }
  })
  return propsMap
}

async function main () {
  if (!process.argv[2]) {
    console.log('[usage] aml2html <vocabulary-file>')
    return
  }
  await amf.AMF.init()
  const graph = await getJsonLdGraph(process.argv[2])

  // Core context used in all the vocabularies
  let doc = ldquery(graph, CTX)
  // Pick root vocabulary itself as a single doc
  doc = doc.query('[@type=meta:Vocabulary]')
  const vocsData = collectVocabulariesData(doc)
  const classesData = collectClassesData(doc)
}

main()
