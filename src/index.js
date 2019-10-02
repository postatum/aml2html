const amf = require('amf-client-js')
const program = require('commander')
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

function defineAndParseArgv () {
  program
    .arguments('<outputDir>')
    .action((outputDir) => {
      program.outputDir = outputDir
    })
    .name('aml2html')
    .description('Convert AML Vocabularies & Dialects to HTML')
    .option('-d, --indir <path>', 'Path to input directory to convert. Takes precedence over --infile.')
    .option('-f, --infile <path>', 'Path to input file to convert', utils.collectOpt, [])
    .option('-c, --css <path>', 'Custom css file path', utils.collectOpt, [])
    .option('-g, --cfg <path>', 'Configuration file path')
    .parse(process.argv)

  if (!program.outputDir) {
    console.error('Missing output directory path (outputDir).\n')
    program.help()
  }
  if (!(program.infile.length > 0 || program.indir)) {
    console.error('Missing input (--infile or --indir).\n')
    program.help()
  }
}

/** Runs all the logic. */
async function main () {
  defineAndParseArgv()
  let ctx = utils.getDefaultContext()
  await amf.AMF.init()

  // Ensure output directory exists
  const outDir = path.resolve(program.outputDir)
  fs.emptyDirSync(outDir)

  // Add custom configuration elements
  if (program.cfg) {
    ctx = utils.loadConfig(program.cfg, ctx)
  }

  // Collects dialects data into an array
  const dialectsPaths = program.indir
    ? utils.walkSync(program.indir)
    : program.infile

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
    dialectData.css = program.css

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

      nodeData.css = program.css
      utils.renderTemplate(
        { ...nodeData, ...ctx.config },
        path.join(TMPL_DIR, 'node.mustache'),
        path.join(outDir, nodeData.htmlName))
    })
  })

  // Render index page
  utils.renderTemplate(
    {
      css: program.css,
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
