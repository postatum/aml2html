const utils = require('./utils')

/* Collects complete dialect data. */
function collectDialectData (doc, ctx, acc) {
  const id = doc.query('@id')
  const dialectData = {
    name: doc.query('> schema:name @value'),
    id: ctx.config.idMapping(id),
    version: doc.query('> schema:version @value')
  }
  if (!acc[id]) {
    console.log(`Collecting dialect data for id ${id}`)
    const usage = doc.json()[`${ctx.amldoc}usage`]
    if (usage) {
      dialectData.usage = usage[0]['@value']
    }
    dialectData.slug = utils.slugify(dialectData.name)
    dialectData.htmlName = `${dialectData.slug}.html`
    console.log(`Collecting nodes info for dialect ${id}`)
    dialectData.nodeMappings = collectNodesData(doc, dialectData, ctx)
      .sort(utils.nameSorter)
    return dialectData
  }
}

/* Collects dialect nodeMappings data. */
function collectNodesData (doc, dialectData, ctx) {
  const acc = {}
  doc.queryAll('> amldoc:declares[@type=shacl:Shape]')
    .map(node => {
      // name, id
      const nodeId = node.query('@id')
      if (!acc[nodeId]) {
        console.log(`\t- ${nodeId}`)
        const nodeData = {
          name: node.query('> schema:name @value'),
          id: ctx.config.idMapping(node.query('@id')),
          dialectName: dialectData.name
        }
        // htmlName
        nodeData.slug = utils.slugify(nodeData.name)
        nodeData.htmlName = utils.makeSchemaHtmlName(
          dialectData.slug, nodeData.slug)

        const isUnion = node.query('@type')
          .indexOf(`${ctx.meta}UnionNodeMapping`) > -1
        if (isUnion) {
          const seq = node.query('> shacl:node[@type=rdf:Seq]')
          const names = seq.queryAll('@id').slice(1).map(utils.parseHashValue)
          // description
          nodeData.description = `Union of ${names.join(', ')}`
          // properties
          nodeData.scalarProperties = []
          nodeData.linkProperties = []
        } else {
          // description
          const targetClassId = node.query('shacl:targetClass @id')
          const targetClass = doc.query(`amldoc:declares[@id=${targetClassId}]`)
          nodeData.description = targetClass
            ? targetClass.query('schema:description @value')
            : ''
          // properties
          nodeData.scalarProperties = collectScalarPropsData(doc, node)
          nodeData.linkProperties = collectLinkPropsData(
            doc, node, dialectData.slug)
        }
        nodeData.linkedSchemas = []
        nodeData.linkProperties.forEach(prop => {
          nodeData.linkedSchemas = nodeData.linkedSchemas.concat(...prop.range)
        })
        // Remove duplicates
        const rangesNames = nodeData.linkedSchemas.map(sch => sch.rangeName)
        nodeData.linkedSchemas = nodeData.linkedSchemas.filter((s, i) => {
          return rangesNames.indexOf(s.rangeName) === i
        })
        acc[nodeId] = nodeData
      }
    })
  return Object.values(acc)
}

/* Collects nodeMappings item scalar properties data. */
function collectScalarPropsData (doc, node) {
  const propsNodes = node.queryAll('shacl:property')
    .filter(prop => !!prop.query('shacl:datatype'))
  return propsNodes.map(prop => {
    const propData = collectCommonPropData(doc, prop)
    propData.range = utils.parseHashValue(prop.query('shacl:datatype @id'))
    return propData
  })
}

/* Collects nodeMappings item link properties data. */
function collectLinkPropsData (doc, node, dialectSlug) {
  const propsNodes = node.queryAll('shacl:property')
    .filter(prop => !prop.query('shacl:datatype'))
  return propsNodes.map(prop => {
    const propData = collectCommonPropData(doc, prop)
    propData.range = prop.queryAll('shacl:node @id').slice(1)
      .map(rangeId => {
        const data = {
          rangeName: utils.parseHashValue(rangeId)
        }
        const declaredLocally = doc.query(`amldoc:declares[@id=${rangeId}]`)
        if (declaredLocally) {
          data.rangeHtmlName = utils.makeSchemaHtmlName(
            dialectSlug, utils.slugify(data.rangeName))
        }
        return data
      })
    return propData
  })
}

/* Collects property data common to scalar and link properties. */
function collectCommonPropData (doc, prop) {
  const propData = {
    name: prop.query('schema:name @value'),
    id: prop.query('shacl:path @id'),
    constraints: collectPropertyConstraints(prop)
  }
  const vocabProp = doc.query(`amldoc:declares[@id=${propData.id}]`)
  if (vocabProp) {
    propData.propDesc = vocabProp.query('schema:description @value')
  }
  return propData
}

/* Collects nodeMappings item property constraints data. */
function collectPropertyConstraints (prop) {
  const constraints = [
    { name: 'mandatory', value: prop.query('shacl:minCount @value') > 0 },
    { name: 'pattern', value: prop.query('shacl:pattern @value') },
    { name: 'minimum', value: prop.query('shacl:minInclusive @value') },
    { name: 'maximum', value: prop.query('shacl:maxInclusive @value') },
    { name: 'allowMultiple', value: prop.query('meta:allowMultiple @value') },
    { name: 'sorted', value: prop.query('meta:sorted @value') },
    { name: 'mapKey', value: prop.query('meta:mapProperty @id') },
    {
      name: 'typeDiscriminatorName',
      value: prop.query('meta:typeDiscriminatorName @value')
    }
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
  return constraints.filter(con => !!con.value)
}

/* Collects common navigation data. */
function collectCommonNavData (dialectsData) {
  const commonNavData = {
    dialects: dialectsData.map(data => {
      return {
        name: data.name,
        htmlName: data.htmlName,
        active: false
      }
    }),
    nodeMappings: []
  }
  return commonNavData
}

/* Collects dialect-specific navigation data. */
function collectNavData (dialectData, commonNavData) {
  const navData = {
    dialects: utils.markActive(commonNavData.dialects, dialectData.name),
    nodeMappings: dialectData.nodeMappings.map(data => {
      return {
        name: data.name,
        htmlName: data.htmlName,
        active: false
      }
    })
  }
  return navData
}

module.exports = {
  dialectData: collectDialectData,
  nodesData: collectNodesData,
  scalarPropsData: collectScalarPropsData,
  linkPropsData: collectLinkPropsData,
  commonPropData: collectCommonPropData,
  propertyConstraints: collectPropertyConstraints,
  commonNavData: collectCommonNavData,
  navData: collectNavData
}
