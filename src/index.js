const amf = require('amf-client-js')
const parseArgs = require('minimist')
const ldquery = require('ld-query')
const path = require('path')
const fs = require('fs-extra')

const utils = require('./utils')
const collect = require('./data_collectors')

/** Mustache dialects templates directory path. */
const TMPL_DIR = path.join(utils.TMPL_DIR)

/** Runs all the logic. */
async function main () {
  const ctx = utils.getDefaultContext()

  await amf.AMF.init()
  const argv = parseArgs(process.argv.slice(2))

  // Ensure output directory exists
  const outDir = path.resolve(argv.outdir)
  fs.emptyDirSync(outDir)

  // Collects dialects data into an array
  const dialectsPaths = Array.isArray(argv._) ? argv._ : [argv._]
  const dialectsData = await Promise.all(dialectsPaths.map(async dpth => {
    let graph = await utils.getJsonLdGraph(dpth)
    let doc = ldquery(graph, ctx).query('[@type=meta:Dialect]')
    console.log(`Collecting dialect data: ${dpth}`)
    return collect.dialectData(doc, ctx)
  }))

  const commonNavData = collect.commonNavData(dialectsData)

  // Collect navigation data and render dialect template
  dialectsData.forEach(dialectData => {
    dialectData.navData = collect.navData(dialectData, commonNavData)
    dialectData.css = argv.css

    // Render dialect overview template
    utils.renderTemplate(
      dialectData,
      path.join(TMPL_DIR, 'dialect.mustache'),
      path.join(outDir, dialectData.htmlName))

    // Render nodeMappings item data
    dialectData.nodeMappings.forEach(nodeData => {
      nodeData.navData = dialectData.navData
      nodeData.navData.nodeMappings = utils.markActive(
        nodeData.navData.nodeMappings, nodeData.name)

      nodeData.css = argv.css
      utils.renderTemplate(
        nodeData,
        path.join(TMPL_DIR, 'node.mustache'),
        path.join(outDir, nodeData.htmlName))
    })
  })

  utils.copyStaticFiles(outDir)
}

main()
