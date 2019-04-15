const amf = require('amf-client-js')
const parseArgs = require('minimist')
const ldquery = require('ld-query')
const path = require('path')
const fs = require('fs-extra')
const utils = require('./utils')

/** Mustache dialects templates directory path. */
const TMPL_DIR = path.join(utils.TMPL_DIR, 'dialect')

/** Default context for querying JSON-LD vocabulary with ld-query. */
const CTX = {
  amldoc: 'http://a.ml/vocabularies/document#',
  meta: 'http://a.ml/vocabularies/meta#',
  owl: 'http://www.w3.org/2002/07/owl#',
  rdf: 'http://www.w3.org/2000/01/rdf-schema#',
  schema: 'http://schema.org/'
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

  // TODO other things here
  console.log(JSON.stringify(graph, null, 2))



  // Copy css
  utils.copyCss(outDir)
}

main()
