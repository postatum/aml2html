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

/**
 * Process a file as a vocabulary
 */
async function processVocabulary (vocabPath, graph, ctx, acc) {
  try {
    console.log(`Collecting vocabulary data: ${vocabPath}`)
    const docs = ldquery(graph, ctx).queryAll('*[@type=meta:Vocabulary]')
    docs.forEach(doc => {
      console.log('FOUND A VOCABULARY')
      const id = doc.query('@id')
      if (!acc[id]) {
        console.log(`Adding vocabulary ${id}`)
        acc[id] = collect.vocabularyData(doc, ctx, acc)
      }
    })
  } catch (e) {
    console.error(`Error for vocabulary ${vocabPath}: ${e.message}`)
    console.error(e)
  }
}

/**
 * Process a file as a dialect
 */
async function processDialect (dialectPath, graph, ctx, acc, ontologyTerms) {
  try {
    const docs = ldquery(graph, ctx).queryAll('*[@type=meta:Dialect]')
    console.log(`Collecting dialect data: ${dialectPath}`)
    docs.forEach(doc => {
      const id = doc.query('@id')
      if (!acc[id]) {
        console.log(`Adding Dialect ${id}`)
        acc[id] = collect.dialectData(doc, ctx, acc, ontologyTerms)
      }
    })
  } catch (e) {
    console.error(`Error for dialect ${dialectPath}: ${e.message}`)
    console.error(e)
  }
}

/** Runs all the logic. */
async function main () {
  let ctx = utils.getDefaultContext()

  await amf.AMF.init()
  const argv = parseArgs(process.argv.slice(2))

  // Ensure output directory exists
  if (!argv.outdir) {
    console.error(`Missing mandatory output directory.
      Syntax: aml2html -- <dialect path> --outdir=<output path> [--indir=<input directory>] [--css=<css path>] [--cfg=<cfg file>]`)
    return
  }
  const outDir = path.resolve(argv.outdir)
  fs.emptyDirSync(outDir)

  // Add custom configuration elements
  if (argv.cfg) {
    ctx = utils.loadConfig(argv.cfg, ctx)
  }

  // Collects dialects data into an array
  var dialectsPaths = Array.isArray(argv._) ? argv._ : [argv._]
  if (argv.indir) {
    dialectsPaths = utils.walkSync(argv.indir)
  }

  const acc = {}
  const ontology = {}
  const jsonGraph = {}

  // Let's load the  JSON-LD
  for (var i = 0; i < dialectsPaths.length; i++) {
    const p = dialectsPaths[i]
    try {
      const defaultGraph = await utils.getJsonLdGraph(p)
      console.log('[ok] ' + p)
      const graph = await jsonld.expand(defaultGraph)
      jsonGraph[p] = graph
    } catch (e) {
      console.log('[error] ' + p)
    }
  }
  console.log('Processed all input files')

  // let's process the vocabularies
  for (var p in jsonGraph) {
    const graph = jsonGraph[p]
    processVocabulary(p, graph, ctx, ontology)
  }
  const ontologyTerms = {}
  Object.values(ontology).forEach(function (vocab) {
    vocab.nodeMappings.forEach(function (term) {
      ontologyTerms[term.id] = term
    })
  })

  // Let's process the dialects
  for (p in jsonGraph) {
    const graph = jsonGraph[p]
    processDialect(p, graph, ctx, acc, ontologyTerms)
  }

  console.log(`Got ${Object.values(acc).length} values`)
  const dialectsData = Object.values(acc).sort(utils.nameSorter)

  const commonNavData = collect.commonNavData(dialectsData)

  // Collect navigation data and render dialect template
  dialectsData.forEach(dialectData => {
    dialectData.navData = collect.navData(dialectData, commonNavData)
    dialectData.css = argv.css

    // Render dialect overview template
    utils.renderTemplate(
      { ...dialectData, ...ctx.config },
      path.join(TMPL_DIR, 'dialect.mustache'),
      path.join(outDir, dialectData.htmlName))

    // Render nodeMappings item data
    dialectData.nodeMappings.forEach(nodeData => {
      nodeData.navData = dialectData.navData
      nodeData.navData.nodeMappings = utils.markActive(
        nodeData.navData.nodeMappings, nodeData.name)

      nodeData.css = argv.css
      utils.renderTemplate(
        { ...nodeData, ...ctx.config },
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
      },
      ...ctx.config
    },
    path.join(TMPL_DIR, 'index.mustache'),
    path.join(outDir, 'index.html'))

  utils.copyStaticFiles(outDir)
}

main()
