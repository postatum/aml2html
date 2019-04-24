const amf = require('amf-client-js')
const parseArgs = require('minimist')
const ldquery = require('ld-query')
const path = require('path')
const fs = require('fs-extra')
const utils = require('./utils')

/** Mustache dialects templates directory path. */
const TMPL_DIR = path.join(utils.TMPL_DIR)

/** Default context for querying JSON-LD dialect with ld-query. */
const CTX = {
  amldoc: 'http://a.ml/vocabularies/document#',
  meta: 'http://a.ml/vocabularies/meta#',
  owl: 'http://www.w3.org/2002/07/owl#',
  rdf: 'http://www.w3.org/2000/01/rdf-schema#',
  schema: 'http://schema.org/',
  shacl: 'http://www.w3.org/ns/shacl#'
}

// function collectVocabulariesData (doc) {
//   const vocabularies = doc.queryAll('amldoc:references')
//   vocabularies.push(doc)
//   const vocsData = vocabularies.map((voc) => {
//     // Works on JSON instead of using querying API because the latter
//     // picks first object in the order of definition instead of picking
//     // root elements first.
//     let vocJson = voc.json()
//     let data = {
//       id: vocJson['@id'],
//       name: utils.parseHashValue(vocJson['@id']),
//       base: vocJson[`${CTX.meta}base`][0]['@value'],
//     }
//     const usage = vocJson[`${CTX.amldoc}usage`]
//     if (usage) {
//       data.usage = usage[0]['@value']
//     }
//     data.properties = collectVocabularyProperties(vocJson)
//     data.classes = collectVocabularyClasses(vocJson)
//     return data
//   })
//   return utils.removeDuplicatesById(vocsData)
// }

// function collectVocabularyProperties (vocJson) {
//   return vocJson[`${CTX.amldoc}declares`]
//     .map((decl) => {
//       if (decl['@type'].indexOf(`${CTX.meta}Property`) > -1) {
//         return utils.parseHashValue((decl['@id'] || ''))
//       }
//     })
//     .filter((id) => { return !!id })
//     .join(', ')
// }

// function collectVocabularyClasses (vocJson) {
//   return vocJson[`${CTX.amldoc}declares`]
//     .map((decl) => {
//       if (decl['@type'].indexOf(`${CTX.owl}Class`) > -1) {
//         return decl['@id']
//       }
//     })
//     .filter((id) => { return !!id })
//     .map((id) => {
//       return {
//         clsId: id,
//         clsName: utils.parseHashValue(id),
//         page: makeClassHtmlPageName({id: id})
//       }
//     })
// }

// function collectClassesData (doc) {
//   const propsMap = collectPropertiesData(doc)
//   const classTerms = doc.queryAll('amldoc:declares[@type=owl:Class]')
//     .map((term) => {
//       return {
//         id: term.query('@id'),
//         name: utils.parseHashValue(term.query('@id')),
//         displayName: term.query('meta:displayName @value'),
//         description: term.query('schema:description @value'),
//         properties: term.queryAll('meta:properties @id').map((id) => {
//           return propsMap[id] || {
//             propName: utils.parseHashValue(id),
//             range: id
//           }
//         }),
//         extends: term.queryAll('rdf:subClassOf @id')
//       }
//     })
//   return utils.removeDuplicatesById(classTerms)
// }

// function collectPropertiesData (doc) {
//   let propsMap = {}
//   const propertyTerms = doc.queryAll(
//     'amldoc:declares[@type=meta:Property]')
//   propertyTerms.forEach((term) => {
//     let data = {
//       propId: term.query('@id'),
//       desc: term.query('schema:description @value'),
//       range: term.query('rdf:range @id'),
//       propExtends: term.queryAll('rdf:subPropertyOf @id').map((id) => {
//         return {
//           extId: id,
//           extName: utils.parseHashValue(id)
//         }
//       })
//     }
//     data.propName = utils.parseHashValue(data.propId)
//     data.rangeName = utils.parseHashValue(data.range)
//     propsMap[term.query('@id')] = data
//   })
//   return propsMap
// }

/** Runs all the logic. */
async function main () {
  await amf.AMF.init()
  const argv = parseArgs(process.argv.slice(2))

  // Ensure output directory exists
  const outDir = path.resolve(argv.outdir)
  fs.emptyDirSync(outDir)

  // Collects dialects data into an array
  const dialectsPaths = Array.isArray(argv._) ? argv._ : [argv._]
  const dialectsData = dialectsPaths.map(async (dpth) => {
    let graph = await utils.getJsonLdGraph(dpth)
    let doc = ldquery(graph, CTX).query('[@type=meta:Dialect]')
    console.log(`Collecting dialect data: ${dpth}`)
    return collectDialectData(doc)
  })

  const commonNavData = collectCommonNavData(dialectsData)

  // Collect navigation data and render dialect template
  dialectsData.forEach((dialectData) => {
    dialectData.navData = collectNavData(dialectData, commonNavData)

    console.log(JSON.stringify(dialectData, null, 2)) // DEBUG

    // utils.renderTemplate(
    //   dialectData,
    //   path.join(TMPL_DIR, 'dialect.mustache'),
    //   path.join(outDir, dialectData.html))

    // // Render nodeMappings item data
    // dialectData.nodeMappings.forEach((nodeData) => {
    //   utils.renderTemplate(
    //     nodeData,
    //     path.join(TMPL_DIR, 'node.mustache'),
    //     path.join(outDir, nodeData.htmlName))
    // })
  })

  // Copy css
  utils.copyCss(outDir)
}

/*
# dialectsData
  [
    # dialectData
    {
      name: 'WebAPI',
      htmlName: 'webapi.html',
      id: 'file://test_data/dialects/canonical_webapi.yaml',
      nodeMappings: [

        # nodeData
        {
          name: 'Request',
          htmlName: 'node_request.html',
          id: 'http://a.ml/vocabularies/http#Request',
          description: 'Request information for an operation',
          scalarProperties: [
            {
              name: 'description',
              id: 'http://schema.org/description',
              range: 'string',
              mandatory: false,
              otherProperty: 'value',
              ...
            }
          ],
          linkProperties: [
            {
              name: 'parameter',
              id: 'http://a.ml/vocabularies/http#parameter',
              range: 'Parameter',
              mandatory: true,
              otherProperty: 'value',
              ...
            }
          ]
        },
        ...
      ]
    },
    ...
  ]
*/
function collectDialectData (doc) {
  const dialectData = {
    name: doc.query('schema:name @value'),
    id: doc.query('@id')
  }
  const slug = dialectData.name.split(' ').join('').toLowerCase()
  dialectData.htmlName = `${slug}.html`
  dialectData.nodeMappings = collectNodesData(doc)
  return dialectData
}

function collectNodesData (doc) {
  const nodes = doc.queryAll('shacl:Shape').map((node) => {
    // name, id
    let nodeData = {
      name: node.query('schema:name @value'),
      id: node.query('@id')
    }
    // description
    let targetClassId = node.query('shacl:targetClass @id')
    let targetClass = doc.query(`[@id=${targetClassId}]`)
    nodeData.description = targetClass.query('schema:description @value')
    // htmlName
    const slug = nodeData.name.split(' ').join('').toLowerCase()
    nodeData.htmlName = `node_${slug}.html`
    nodeData.scalarProperties = collectScalarPropsData(doc, node)
    nodeData.linkProperties = collectLinkScalarPropsData(doc, node)
    return nodeData
  })
  return nodes
}

/*
Scalar properties DO contain 'shacl:datatype' node

  scalarProperties: [
    {
      name: 'description',
      id: 'http://schema.org/description',
      range: 'string',
      constraints: [{name: 'pattern', value: 'asdasd'}, ...]
    }
  ]
*/
function collectScalarPropsData (doc, node) {
  const propsNodes = node.query('shacl:property').filter((prop) => {
    return !!prop.query('shacl:datatype')
  })
  const props = propsNodes.map((prop) => {
    let propData = {
      name: prop.query('schema:name @value'),
      id: prop.query('shacl:path @id'),
      range: parseHashValue(prop.query('shacl:datatype @id')),
      constraints: [
        {name: 'mandatory', value: prop.query('shacl:minCount @value') > 0},
        {name: 'pattern', value: prop.query('shacl:pattern @value')},
        {name: 'minimum', value: prop.query('shacl:minInclusive @value')},
        {name: 'maximum', value: prop.query('shacl:maxInclusive @value')},
        {name: 'enum', value: prop.query('shacl:in @value')},
        {name: 'allowMultiple', value: prop.query('meta:allowMultiple @value')},
        {name: 'sorted', value: prop.query('meta:sorted @value')},
        {name: 'mapKey', value: prop.query('meta:mapProperty @id')},
        {name: 'typeDiscriminator',
         value: prop.query('meta:typeDiscriminatorMap @value')
                    .split(',').join('\n')},
        {name: 'typeDiscriminatorName',
         value: prop.query('meta:typeDiscriminatorName @value')}
      ]
    }
    propData.constraints = propData.constraints.filter((con) => {
      return !!con.value
    })
    return propData
  })
  return props
}

/*
Link properties DON'T contain 'shacl:datatype' node

  linkProperties: [
    {
      name: 'parameter',
      id: 'http://a.ml/vocabularies/http#parameter',
      range: 'Parameter',
      constraints: [{name: 'pattern', value: 'asdasd'}, ...]
    }
  ]
*/
function collectLinkPropsData (doc, node) {
  const propsNodes = node.query('shacl:property').filter((prop) => {
    return !prop.query('shacl:datatype')
  })

}

/*
  {
    dialects: [
      {name: 'WebAPI', htmlName: 'webapi.html'},
      ...
    ],
    nodeMappings: []
  }
*/
function collectCommonNavData (dialectsData) {
  const commonNavData = {
    dialects: dialectsData.map((data) => {
      return {name: data.name, htmlName: data.htmlName}
    }),
    nodeMappings: []
  }
  return commonNavData
}

/*
{
    dialects: [
      {name: 'WebAPI', htmlName: 'webapi.html'},
      ...
    ],
    nodeMappings: [
      {name: 'Request', htmlName: 'node_request.html'},
      {name: 'Parameter', htmlName: 'node_parameter.html'},
      ...
    ]
  }
*/
function collectNavData (dialectData, commonNavData) {
  const navData = {
    dialects: commonNavData.dialects,
    nodeMappings: dialectData.nodeMappings.map((nd) => {
      return {name: nd.name, htmlName: nd.htmlName}
    })
  }
  return navData
}

main()
