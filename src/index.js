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

    // Render dialect overview template
    utils.renderTemplate(
      dialectData,
      path.join(TMPL_DIR, 'dialect.mustache'),
      path.join(outDir, dialectData.htmlName))

    // Render nodeMappings item data
    dialectData.nodeMappings.forEach((nodeData) => {
      nodeData.navData = dialectData.navData
      utils.renderTemplate(
        nodeData,
        path.join(TMPL_DIR, 'node.mustache'),
        path.join(outDir, nodeData.htmlName))
    })
  })

  // Copy css
  utils.copyCss(outDir)
}

/* Collects complete dialect data. */
function collectDialectData (doc) {
  const dialectData = {
    name: doc.query('schema:name @value'),
    id: doc.query('@id')
  }
  dialectData.slug = utils.slugify(dialectData.name)
  dialectData.htmlName = `${dialectData.slug}.html`
  dialectData.nodeMappings = collectNodesData(doc, dialectData)
    .sort(utils.nameSorter)
  return dialectData
}

/* Collects dialect nodeMappings data. */
function collectNodesData (doc, dialectData) {
  const nodes = doc.queryAll('amldoc:declares[@type=shacl:Shape]')
    .map((node) => {
      // name, id
      let nodeData = {
        name: node.query('schema:name @value'),
        id: node.query('@id'),
        dialectName: dialectData.name
      }
      // htmlName
      nodeData.slug = utils.slugify(nodeData.name)
      nodeData.htmlName = utils.makeSchemaHtmlName(
        dialectData.slug, nodeData.slug)

      let isUnion = node.query('@type')
        .indexOf(`${CTX.meta}UnionNodeMapping`) > -1
      if (isUnion) {
        let seq = node.query('shacl:node[@type=rdf:Seq]')
        let names = seq.queryAll('@id').slice(1).map(utils.parseHashValue)
        // description
        nodeData.description = `Union of ${names.join(', ')}`
        // properties
        nodeData.scalarProperties = []
        nodeData.linkProperties = []
      } else {
        // description
        let targetClassId = node.query('shacl:targetClass @id')
        let targetClass = doc.query(`amldoc:declares[@id=${targetClassId}]`)
        nodeData.description = targetClass
          ? targetClass.query('schema:description @value')
          : ''
        // properties
        nodeData.scalarProperties = collectScalarPropsData(doc, node)
        nodeData.linkProperties = collectLinkPropsData(
          doc, node, dialectData.slug)
      }
      let linkedRanges = nodeData.linkProperties.map((data) => {
        return data.range
      })
      // Remove duplicates
      nodeData.linkedSchemasStr = linkedRanges.filter((v, i) => {
        return linkedRanges.indexOf(v) === i
      }).join(', ')
      return nodeData
    })
  return nodes
}

/* Collects nodeMappings item scalar properties data. */
function collectScalarPropsData (doc, node) {
  const propsNodes = node.queryAll('shacl:property').filter((prop) => {
    return !!prop.query('shacl:datatype')
  })
  return propsNodes.map((prop) => {
    let propData = collectCommonPropData(doc, prop)
    propData.range = utils.parseHashValue(prop.query('shacl:datatype @id'))
    return propData
  })
}

/* Collects nodeMappings item link properties data. */
function collectLinkPropsData (doc, node, dialectSlug) {
  const propsNodes = node.queryAll('shacl:property').filter((prop) => {
    return !prop.query('shacl:datatype')
  })
  return propsNodes.map((prop) => {
    let propData = collectCommonPropData(doc, prop)
    propData.range = prop.queryAll('shacl:node @id')
      .map(utils.parseHashValue).slice(1)
      .map(rng => {
        return {
          rangeName: rng,
          rangeHtmlName: utils.makeSchemaHtmlName(
            dialectSlug, utils.slugify(rng))
        }
      })
    return propData
  })
}

/* Collects property data common to scalar and link properties. */
function collectCommonPropData (doc, prop) {
  let propData = {
    name: prop.query('schema:name @value'),
    id: prop.query('shacl:path @id'),
    constraints: collectPropertyConstraints(prop)
  }
  let vocabProp = doc.query(`amldoc:declares[@id=${propData.id}]`)
  if (vocabProp) {
    propData.propDesc = vocabProp.query('schema:description @value')
  }
  return propData
}

/* Collects nodeMappings item property constraints data. */
function collectPropertyConstraints (prop) {
  const constraints = [
    {name: 'mandatory', value: prop.query('shacl:minCount @value') > 0},
    {name: 'pattern', value: prop.query('shacl:pattern @value')},
    {name: 'minimum', value: prop.query('shacl:minInclusive @value')},
    {name: 'maximum', value: prop.query('shacl:maxInclusive @value')},
    {name: 'allowMultiple', value: prop.query('meta:allowMultiple @value')},
    {name: 'sorted', value: prop.query('meta:sorted @value')},
    {name: 'mapKey', value: prop.query('meta:mapProperty @id')},
    {name: 'typeDiscriminatorName',
      value: prop.query('meta:typeDiscriminatorName @value')}
  ]

  const enumNode = prop.query('shacl:in')
  if (enumNode) {
    constraints.push({
      name: 'enum',
      value: enumNode.queryAll('@value')
    })
  }

  const discrValue = prop.query('meta:typeDiscriminatorMap @value')
  if (discrValue) {
    constraints.push({
      name: 'typeDiscriminator',
      value: discrValue.split(',').join('\n')
    })
  }

  // Drop empty and falsy values
  return constraints.filter((con) => { return !!con.value })
}

/* Collects common navigation data. */
function collectCommonNavData (dialectsData) {
  const commonNavData = {
    dialects: dialectsData.map((data) => {
      return {name: data.name, htmlName: data.htmlName}
    }),
    nodeMappings: []
  }
  return commonNavData
}

/* Collects dialect-specific navigation data. */
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
