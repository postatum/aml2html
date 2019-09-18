const amf = require('amf-client-js')
const parseArgs = require('minimist')
const ldquery = require('ld-query')
const path = require('path')
const fs = require('fs-extra')

const utils = require('./utils')
const collect = require('./data_collectors')
const jsonld = require('jsonld')

/** Mustache dialects templates directory path. */
const TMPL_DIR = path.join(utils.TMPL_DIR)

/** Runs all the logic. */
async function main () {
  const ctx = utils.getDefaultContext()

  await amf.AMF.init()
  const argv = parseArgs(process.argv.slice(2))

  // Ensure output directory exists
  if (argv.outdir == null) {
    console.error(`Missing mandatory output directory.
      Syntax: aml2html -- <dialect path> --outdir=<output path> [--css=<css path>] [--cfg=<cfg file>]`)
  } else {
    const outDir = path.resolve(argv.outdir)
    fs.emptyDirSync(outDir)

    // let's add custom configuration elements
    if (argv.cfg) {
      const cfgPath = process.cwd() + '/' + argv.cfg
      console.log(`Loading custom configuration from ${cfgPath}`)
      const customConfig = require(cfgPath)
      if (customConfig.idMapping != null) {
        ctx.idMapping = customConfig.idMapping
      }
      if (customConfig.dialectsHeader != null) {
        ctx.dialectsHeader = customConfig.dialectsHeader
      }
      if (customConfig.schemasHeader != null) {
        ctx.schemasHeader = customConfig.schemasHeader
      }
    }

    // Collects dialects data into an array
    const dialectsPaths = Array.isArray(argv._) ? argv._ : [argv._]
    let acc = {}
    for (var i = 0; i < dialectsPaths.length; i++) {
      let dpth = dialectsPaths[i]
      try {
        let defaultGraph = await utils.getJsonLdGraph(dpth)
        let graph = await jsonld.expand(defaultGraph)
        let docs = ldquery(graph, ctx).queryAll('*[@type=meta:Dialect]')
        console.log(`Collecting dialect data: ${dpth}`)
        docs.forEach(doc => {
          const id = doc.query('@id')
          if (acc[id] == null) {
            console.log(`Adding Dialect ${id}`)
            acc[id] = collect.dialectData(doc, ctx, acc)
          }
        })
      } catch (e) {
        console.error(`Error for dialect ${dpth}: ${e.message}`)
        console.error(e)
      }
    }

    console.log(`Got ${Object.values(acc).length} values`)
    const dialectsData = Object.values(acc)

    const commonNavData = collect.commonNavData(dialectsData)

    // Collect navigation data and render dialect template
    dialectsData.forEach(dialectData => {
      dialectData.navData = collect.navData(dialectData, commonNavData)
      dialectData.css = argv.css

      // Render dialect overview template
      utils.renderTemplate(
        mergeTemplateData(dialectData, ctx),
        path.join(TMPL_DIR, 'dialect.mustache'),
        path.join(outDir, dialectData.htmlName))

      // Render nodeMappings item data
      dialectData.nodeMappings.forEach(nodeData => {
        nodeData.navData = dialectData.navData
        nodeData.navData.nodeMappings = utils.markActive(
          nodeData.navData.nodeMappings, nodeData.name)

        nodeData.css = argv.css
        utils.renderTemplate(
          mergeTemplateData(nodeData, ctx),
          path.join(TMPL_DIR, 'node.mustache'),
          path.join(outDir, nodeData.htmlName))
      })
    })

    // Render index page
    utils.renderTemplate(
      {
        dialects: dialectsData,
        navData: {
          dialects: utils.markActive(commonNavData.dialects)
        }
      },
      path.join(TMPL_DIR, 'index.mustache'),
      path.join(outDir, 'index.html'))

    utils.copyStaticFiles(outDir)
  }
}


function mergeTemplateData (data, ctx) {
  const acc = {}
  for (let p in data) {
    if (data.hasOwnProperty(p)) {
      acc[p] = data[p]
    }
  }
  acc['dialectsHeader'] = ctx.dialectsHeader
  acc['schemasHeader'] = ctx.schemasHeader

  return acc
}

main()
