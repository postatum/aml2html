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

/** Runs all the logic. */
async function main () {
  await amf.AMF.init()
  const argv = parseArgs(process.argv.slice(2))

  // Ensure output directory exists
  const outDir = path.resolve(argv.outdir)
  fs.emptyDirSync(outDir)

  // Collects dialects data into an array
  const dialectsPaths = Array.isArray(argv._) ? argv._ : [argv._]
  const dialectsData = await Promise.all(dialectsPaths.map(async (dpth) => {
    let graph = await utils.getJsonLdGraph(dpth)
    let doc = ldquery(graph, CTX).query('[@type=meta:Dialect]')
    console.log(`Collecting dialect data: ${dpth}`)
    return collectDialectData(doc)
  }))

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
  const nodes = doc.queryAll('amldoc:declares[@type=shacl:Shape]')
    .map((node) => {
      // name, id
      let nodeData = {
        name: node.query('schema:name @value'),
        id: node.query('@id')
      }
      // htmlName
      let slug = nodeData.name.split(' ').join('').toLowerCase()
      nodeData.htmlName = `node_${slug}.html`

      let union = node.query('shacl:node[@type=rdf:Seq]')
      if (union) {
        let names = union.queryAll('@id').map(utils.parseHashValue)
        nodeData.description = `Union of: ${names.join(', ')}`
        nodeData.scalarProperties = []
        nodeData.linkProperties = []
      } else {
        // description
        let targetClassId = node.query('shacl:targetClass @id')
        let targetClass = doc.query(`amldoc:declares[@id=${targetClassId}]`)
        nodeData.description = targetClass.query('schema:description @value')
        // properties
        nodeData.scalarProperties = collectScalarPropsData(node)
        nodeData.linkProperties = collectLinkPropsData(node)
      }
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
function collectScalarPropsData (node) {
  const propsNodes = node.queryAll('shacl:property').filter((prop) => {
    return !!prop.query('shacl:datatype')
  })
  return propsNodes.map((prop) => {
    let propData = {
      name: prop.query('schema:name @value'),
      id: prop.query('shacl:path @id'),
      range: utils.parseHashValue(prop.query('shacl:datatype @id')),
      constraints: parsePropertyConstraints(prop)
    }
    return propData
  })
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
function collectLinkPropsData (node) {
  const propsNodes = node.queryAll('shacl:property').filter((prop) => {
    return !prop.query('shacl:datatype')
  })
  return propsNodes.map((prop) => {
    let propData = {
      name: prop.query('schema:name @value'),
      id: prop.query('shacl:path @id'),
      constraints: parsePropertyConstraints(prop)
    }
    propData.range = prop.queryAll('shacl:node @id')
      .map(utils.parseHashValue).join(', ')
    return propData
  })
}

function parsePropertyConstraints (prop) {
  const constraints = [
    {name: 'mandatory', value: prop.query('shacl:minCount @value') > 0},
    {name: 'pattern', value: prop.query('shacl:pattern @value')},
    {name: 'minimum', value: prop.query('shacl:minInclusive @value')},
    {name: 'maximum', value: prop.query('shacl:maxInclusive @value')},
    {name: 'enum', value: prop.query('shacl:in @value')},
    {name: 'allowMultiple', value: prop.query('meta:allowMultiple @value')},
    {name: 'sorted', value: prop.query('meta:sorted @value')},
    {name: 'mapKey', value: prop.query('meta:mapProperty @id')},
    {name: 'typeDiscriminatorName',
      value: prop.query('meta:typeDiscriminatorName @value')}
  ]
  const typeDiscr = prop.query('meta:typeDiscriminatorMap @value')
  if (typeDiscr) {
    constraints.push({
      name: 'typeDiscriminator',
      value: typeDiscr.split(',').join('\n')
    })
  }

  return constraints.filter((con) => {
    return !!con.value
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
    nodeMappings: dialectData.nodeMappings.map((data) => {
      return {name: data.name, htmlName: data.htmlName}
    })
  }
  return navData
}

main()
