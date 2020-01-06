/* global describe, it */

const expect = require('chai').expect
const path = require('path')
const fs = require('fs-extra')
const rewire = require('rewire')
const ldquery = require('ld-query')

const utils = require('../src/utils')
const dc = rewire('../src/data_collectors')

const FIXTURES_DIR = path.join(__dirname, 'fixtures')

function getDialectData () {
  return {
    name: 'WebAPI',
    id: 'file:///somewhere/fixtures/musicDialect.yaml',
    htmlName: 'webapi.html',
    nodeMappings: [{
      name: 'Scope',
      id: 'file:///somewhere/fixtures/musicDialect.yaml#/declarations/Scope',
      htmlName: 'node_scope.html',
      description: null,
      scalarProperties: [{
        name: 'name',
        id: 'http://a.ml/vocabularies/security#name',
        range: 'string',
        constraints: [{ name: 'mandatory', value: false }]
      }],
      linkProperties: [{
        name: 'scope',
        id: 'http://a.ml/vocabularies/security#scope',
        constraints: [{ name: 'mandatory', value: false }],
        range: 'list, Scope'
      }]
    }]
  }
}

function getPropertyGraph () {
  return {
    '@id': 'file://test_data/amf/dialects/validation.yaml#/declarations/profileNode',
    'http://www.w3.org/ns/shacl#path': [{ '@id': 'http://www.w3.org/ns/shacl#in' }],
    'http://schema.org/name': [{ '@value': 'in' }],
    'http://www.w3.org/ns/shacl#minCount': [{ '@value': 1 }],
    'http://www.w3.org/ns/shacl#pattern': [{ '@value': 'fooPattern' }],
    'http://www.w3.org/ns/shacl#minInclusive': [{ '@value': 2 }],
    'http://www.w3.org/ns/shacl#maxInclusive': [{ '@value': 3 }],
    'http://a.ml/vocabularies/meta#allowMultiple': [{ '@value': true }],
    'http://a.ml/vocabularies/meta#sorted': [{ '@value': true }],
    'http://a.ml/vocabularies/meta#mapProperty': [{ '@id': 'thisIsMapPropertyId' }],
    'http://a.ml/vocabularies/meta#typeDiscriminatorName': [
      { '@value': 'thisIsYypeDiscriminatorNameVal' }
    ],
    'http://www.w3.org/ns/shacl#in': {
      one: { '@value': 'foo' },
      two: { '@value': 'bar' }
    },
    'http://a.ml/vocabularies/meta#typeDiscriminatorMap': [{ '@value': 'hello,world' }]
  }
}

describe('data_collectors.processVocabulary', async function () {
  const processVocabulary = dc.__get__('processVocabulary')
  it('should collect vocabulary data and process it', function () {
    const graph = JSON.parse(fs.readFileSync(
      path.join(FIXTURES_DIR, 'musicVocabulary.jsonld')))
    const ctx = utils.getDefaultContext()
    const acc = {}
    processVocabulary(graph, ctx, acc)
    const id = 'file:///somewhere/fixtures/musicVocabulary.yaml'
    expect(acc).to.have.property(id)
    expect(acc[id]).to.include({
      name: 'Music Vocabulary',
      id: 'file:///somewhere/fixtures/musicVocabulary.yaml',
      version: null,
      label: 'Music Vocabulary',
      slug: 'musicvocabulary_vocab',
      htmlName: 'musicvocabulary_vocab.html'
    })
    expect(acc[id])
      .to.have.property('nodeMappings').and
      .be.an('array').and
      .be.lengthOf(2)
    expect(acc[id].nodeMappings[0]).to.include({
      type: 'class',
      name: 'Music Artist',
      label: 'Music Artist',
      description: 'A person or a group of people (or a computer :-) ), whose musical\n' +
        'creative work shows sensitivity and imagination\n',
      id: 'http://a.ml/vocabularies/music#MusicArtist',
      dialectName: 'Music Vocabulary',
      dialectLabel: 'Music Vocabulary',
      slug: 'musicartist_class',
      htmlName: 'schema_musicvocabulary_vocab_musicartist_class.html'
    })
  })
})

describe('data_collectors.processDialect', async function () {
  const processDialect = dc.__get__('processDialect')
  it('should collect dialect data and process it', function () {
    const graph = JSON.parse(fs.readFileSync(
      path.join(FIXTURES_DIR, 'musicDialect.jsonld')))
    const ctx = utils.getDefaultContext()
    const acc = {}
    const ontologyTerms = {}
    processDialect(graph, ctx, acc, ontologyTerms)
    const id = 'file:///somewhere/fixtures/musicDialect.yaml'
    expect(acc).to.have.property(id)
    expect(acc[id]).to.include({
      name: 'Playlist',
      label: 'Playlist',
      id: 'file:///somewhere/fixtures/musicDialect.yaml',
      version: '1.0',
      slug: 'playlist',
      htmlName: 'playlist.html'
    })
    expect(acc[id])
      .to.have.property('nodeMappings')
      .and.be.an('array')
      .and.be.lengthOf(1)
    expect(acc[id].nodeMappings[0]).to.include({
      name: 'ArtistNode',
      label: 'ArtistNode',
      id: 'file:///somewhere/fixtures/musicDialect.yaml#/declarations/ArtistNode',
      dialectName: 'Playlist',
      dialectLabel: 'Playlist',
      slug: 'artistnode',
      htmlName: 'schema_playlist_artistnode.html',
      description: '',
      targetClassId: null
    })
    expect(acc[id].nodeMappings[0])
      .to.have.property('linkProperties').and
      .deep.equal([])
    expect(acc[id].nodeMappings[0])
      .to.have.property('linkedSchemas').and
      .deep.equal([])
    expect(acc[id].nodeMappings[0])
      .to.have.property('scalarProperties').and
      .deep.equal([
        {
          name: 'name',
          id: 'http://schema.org/name',
          constraints: [],
          range: 'string'
        }
      ])
  })
})

describe('data_collectors.collectNavData', async function () {
  const collectNavData = dc.__get__('collectNavData')
  it('should collect dialect-specific navigation data', function () {
    const dialectData = getDialectData()
    const commonNavData = {
      dialects: [
        { name: 'WebAPI', active: false },
        { name: 'Something', active: true }
      ]
    }
    const ctx = utils.getDefaultContext()
    const navData = collectNavData(dialectData, commonNavData, ctx)
    expect(navData).to.deep.equal({
      dialects: [
        { name: 'WebAPI', active: true },
        { name: 'Something', active: false }
      ],
      nodeMappings: [{
        name: 'Scope',
        label: 'Scope',
        htmlName: 'node_scope.html',
        active: false
      }]
    })
  })
})

describe('data_collectors.collectCommonNavData', async function () {
  const collectCommonNavData = dc.__get__('collectCommonNavData')
  it('should collect common navigation data', function () {
    const dialectsData = [getDialectData()]
    const ctx = utils.getDefaultContext()
    const navData = collectCommonNavData(dialectsData, ctx)
    expect(navData).to.deep.equal({
      dialects: [{
        name: 'WebAPI',
        label: 'WebAPI',
        htmlName: 'webapi.html',
        active: false
      }],
      nodeMappings: []
    })
  })
})

describe('data_collectors.collectPropertyConstraints', async function () {
  const collectPropertyConstraints = dc.__get__('collectPropertyConstraints')
  it('should collect common navigation data', function () {
    const graph = getPropertyGraph()
    const ctx = utils.getDefaultContext()
    const prop = ldquery(graph, ctx)
    const constraints = collectPropertyConstraints(prop)
    expect(constraints).to.deep.equal([
      { name: 'mandatory', value: true },
      { name: 'pattern', value: 'fooPattern' },
      { name: 'minimum', value: 2 },
      { name: 'maximum', value: 3 },
      { name: 'allowMultiple', value: true },
      { name: 'sorted', value: true },
      { name: 'mapKey', value: 'thisIsMapPropertyId' },
      { name: 'typeDiscriminatorName', value: 'thisIsYypeDiscriminatorNameVal' },
      { name: 'enum', value: ['foo', 'bar'] },
      { name: 'typeDiscriminator', value: 'hello\nworld' }
    ])
  })
})
